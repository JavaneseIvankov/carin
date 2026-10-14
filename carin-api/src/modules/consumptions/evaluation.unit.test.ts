import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { components } from '../../contracts/generated/ai-service.js';
import {
  canReusePhotoAttention,
  evaluatePersonalizationEligibility,
} from './evaluation.js';

type Ai = components['schemas'];
type AnalysisResult = Ai['AnalysisResult'];
type ProfileContext = Ai['ProfileContext'];

const photoResult = JSON.parse(readFileSync(
  new URL('../../../../specs/fixtures/ai/analysis-complete.json', import.meta.url),
  'utf8',
)) as AnalysisResult;

function sourceComponent(): Ai['ComponentInput'] {
  const component = photoResult.components[0]!;
  return {
    id: component.id,
    displayName: component.displayName,
    catalogFoodId: component.catalogFoodId,
    preparation: component.preparation,
    portion: component.portion.quantity === null || component.portion.unit === null
      ? { kind: 'unknown' }
      : component.portion.unit === 'serving'
        ? { kind: 'known', quantity: component.portion.quantity, unit: 'serving', servingId: component.portion.servingId! }
        : { kind: 'known', quantity: component.portion.quantity, unit: 'g' },
  };
}

const profile: ProfileContext = {
  profileVersion: photoResult.profileVersion,
  ageYears: 31,
  heightCm: null,
  weightKg: null,
  sexForReference: null,
  diagnosisState: 'reported',
  conditionIds: ['fixture-condition'],
  unsupportedConditionLabels: [],
  allergyState: 'not_provided',
  allergies: [],
  activity: null,
  smoking: null,
};

function manifest(requiredProfileFields: string[] = [], requiredNutrients: string[] = []): Ai['CapabilityManifest'] {
  return {
    contractVersion: '1.0.0',
    catalogVersion: photoResult.catalogVersion,
    nutritionDatasetVersion: photoResult.nutritionDatasetVersion,
    ruleSetVersion: photoResult.ruleSetVersion,
    conditions: [{
      id: 'fixture-condition',
      displayName: 'Fixture condition',
      personalizationSupported: true,
      requiredProfileFields,
      requiredNutrients: requiredNutrients as Ai['Condition']['requiredNutrients'],
      supportedAgeMinimum: null,
      supportedAgeMaximum: null,
    }],
    supportedPhotoFoodIds: ['fixture-food-001'],
    supportedRules: [],
    nutrients: ['energyKcal', 'carbohydrateG', 'proteinG', 'fatG', 'fiberG', 'sugarsG', 'sodiumMg'],
    dataMode: photoResult.dataMode,
    publishedAt: photoResult.computedAt,
  };
}

describe('consumption personal evaluation eligibility', () => {
  it('explains missing consent without preventing nutrition storage', () => {
    const result = evaluatePersonalizationEligibility({
      profile,
      snapshot: photoResult,
      manifest: manifest(),
      consentGranted: false,
      catalogReady: true,
    });

    expect(result.eligible).toBe(false);
    expect(result.limitations.map(({ code }) => code)).toContain('ai_consent_required');
  });

  it('requires an explicitly supported condition and all required profile/nutrient inputs', () => {
    const unsupported = evaluatePersonalizationEligibility({
      profile: { ...profile, conditionIds: ['outside-manifest'] },
      snapshot: photoResult,
      manifest: manifest(),
      consentGranted: true,
      catalogReady: true,
    });
    expect(unsupported.eligible).toBe(false);
    expect(unsupported.limitations.map(({ code }) => code)).toContain('unsupported_condition');

    const missingData = evaluatePersonalizationEligibility({
      profile: { ...profile, heightCm: null },
      snapshot: photoResult,
      manifest: manifest(['heightCm', 'weightKg'], ['sodiumMg']),
      consentGranted: true,
      catalogReady: true,
    });
    expect(missingData.eligible).toBe(false);
    expect(missingData.limitations.map(({ code }) => code)).toContain('missing_evaluation_data');
  });

  it('allows reuse only when source result, actual portion, catalog, and frozen profile agree', () => {
    const components: Ai['ComponentInput'][] = [sourceComponent()];
    const input = {
      sourceResult: photoResult,
      sourceProfile: profile,
      currentProfile: profile,
      catalogVersion: photoResult.catalogVersion,
      ruleSetVersion: photoResult.ruleSetVersion,
      components,
    };
    expect(canReusePhotoAttention(input)).toBe(true);
    expect(canReusePhotoAttention({
      ...input,
      components: [{
        ...components[0]!,
        portion: { kind: 'known', quantity: 0.5, unit: 'serving', servingId: 'fixture-serving-100g' },
      }],
    })).toBe(false);
    expect(canReusePhotoAttention({ ...input, currentProfile: { ...profile, profileVersion: profile.profileVersion + 1 } })).toBe(false);
  });
});
