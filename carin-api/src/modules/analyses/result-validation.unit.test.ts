import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { components } from '../../contracts/generated/ai-service.js';
import { validateAnalysisResult, type AnalysisExpectation, type ValidationCatalog } from './result-validation.js';

type AnalysisResult = components['schemas']['AnalysisResult'];
type Condition = components['schemas']['Condition'];
type ProfileContext = components['schemas']['ProfileContext'];

function resultFixture(name: string): AnalysisResult {
  return JSON.parse(readFileSync(new URL(`../../../fixtures/ai/${name}.json`, import.meta.url), 'utf8')) as AnalysisResult;
}

const profile: ProfileContext = {
  profileVersion: 1,
  ageYears: null,
  heightCm: null,
  weightKg: null,
  sexForReference: null,
  diagnosisState: 'not_provided' as const,
  conditionIds: ['fixture-condition'],
  unsupportedConditionLabels: [],
  allergyState: 'not_provided' as const,
  allergies: [],
  activity: null,
  smoking: null,
};

function catalogFor(result: AnalysisResult): ValidationCatalog {
  const conditions = [...new Set(result.attentions.map(({ conditionId }) => conditionId))]
    .map((id): Condition => ({
      id,
      displayName: id,
      personalizationSupported: true,
      requiredProfileFields: [],
      requiredNutrients: [],
      supportedAgeMinimum: null,
      supportedAgeMaximum: null,
    }));
  const supportedRules = result.attentions.map((attention) => ({
    ruleId: attention.ruleId,
    conditionId: attention.conditionId,
    sources: attention.sourceIds.flatMap((id) => {
      const source = result.sources.find((item) => item.id === id);
      return source ? [source] : [];
    }),
  }));
  const supportedPhotoFoodIds = result.inputKind === 'photo'
    ? [...new Set(result.components.flatMap(({ catalogFoodId }) => catalogFoodId ? [catalogFoodId] : []))]
    : [];
  const component = result.components.find((item) => item.catalogFoodId !== null);
  if (!component) return {
    version: result.catalogVersion,
    nutritionDatasetVersion: result.nutritionDatasetVersion,
    ruleSetVersion: result.ruleSetVersion,
    dataMode: result.dataMode,
    supportedPhotoFoodIds,
    conditions,
    supportedRules,
    foods: [],
  };
  const nutritionSourceIds = component.nutrientSourceIds;
  return {
    version: result.catalogVersion,
    nutritionDatasetVersion: result.nutritionDatasetVersion,
    ruleSetVersion: result.ruleSetVersion,
    dataMode: result.dataMode,
    supportedPhotoFoodIds,
    conditions,
    supportedRules,
    foods: [{
      id: component.catalogFoodId!,
      displayName: component.displayName,
      preparation: component.preparation,
      per100g: component.per100g,
      nutrientSourceIds: nutritionSourceIds,
      sourceRefs: result.sources.filter((source) => Object.values(nutritionSourceIds).includes(source.id)),
      servings: [{ id: 'fixture-serving-100g', grams: 100, sourceId: 'synthetic-nutrition' }],
    }],
  };
}

function photoExpectation(result: AnalysisResult, profileContext = profile): AnalysisExpectation {
  return {
    kind: 'photo_analysis',
    operationId: result.operationId,
    profile: profileContext,
    catalogVersion: result.catalogVersion,
    ruleSetVersion: result.ruleSetVersion,
  };
}

function conditionCatalog(result: AnalysisResult, condition: Partial<Condition>): ValidationCatalog {
  const catalog = catalogFor(result);
  catalog.conditions = [{
    id: 'fixture-condition',
    displayName: 'Fixture condition',
    personalizationSupported: true,
    requiredProfileFields: [],
    requiredNutrients: [],
    supportedAgeMinimum: null,
    supportedAgeMaximum: null,
    ...condition,
  }];
  return catalog;
}

function partialWithSupportedAttention(): AnalysisResult {
  const result = resultFixture('analysis-partial');
  const complete = resultFixture('analysis-complete');
  const attention = structuredClone(complete.attentions[0]!);
  attention.componentIds = [result.components[0]!.id];
  result.attentions = [attention];
  result.sources.push(structuredClone(complete.sources.find(({ id }) => id === 'synthetic-rule')!));
  return result;
}

describe('validateAnalysisResult', () => {
  it.each(['analysis-complete', 'analysis-partial', 'analysis-unrecognized'])('accepts the valid %s photo result', (name) => {
    const result = resultFixture(name);
    expect(() => validateAnalysisResult(result, photoExpectation(result), catalogFor(result))).not.toThrow();
  });

  it('rejects a photo food match outside the imported supported-photo allowlist', () => {
    const result = resultFixture('analysis-complete');
    const catalog = catalogFor(result);
    catalog.supportedPhotoFoodIds = [];

    expect(() => validateAnalysisResult(result, photoExpectation(result), catalog)).toThrow();
  });

  it('rejects an attention without imported rule and supported-condition authority', () => {
    const result = resultFixture('analysis-complete');
    const catalog = catalogFor(result);
    catalog.conditions = conditionCatalog(result, {}).conditions;
    catalog.supportedRules = [];

    expect(() => validateAnalysisResult(result, photoExpectation(result), catalog)).toThrow();
  });

  it('rejects attention when the frozen profile has no eligible condition or profile version', () => {
    const result = resultFixture('analysis-complete');
    const emptyProfile = { ...profile, profileVersion: 0, conditionIds: [] };

    expect(() => validateAnalysisResult(result, photoExpectation(result, emptyProfile), catalogFor(result))).toThrow();
  });

  it('rejects a supported rule claim for a condition absent from the frozen profile', () => {
    const result = resultFixture('analysis-complete');
    const noMatchingCondition = { ...profile, conditionIds: [] };

    expect(() => validateAnalysisResult(result, photoExpectation(result, noMatchingCondition), catalogFor(result))).toThrow();
  });

  const unmetRequirements: Array<[string, Partial<Condition>, ProfileContext]> = [
    ['required profile field', { requiredProfileFields: ['weightKg'] }, { ...profile, weightKg: null }],
    ['age minimum', { supportedAgeMinimum: 31 }, { ...profile, ageYears: 30 }],
    ['age maximum', { supportedAgeMaximum: 29 }, { ...profile, ageYears: 30 }],
  ];

  it.each(unmetRequirements)('rejects a supported rule claim when its %s requirement is not met', (_name, condition, profileContext) => {
    const result = resultFixture('analysis-complete');

    expect(() => validateAnalysisResult(
      result,
      photoExpectation(result, profileContext),
      conditionCatalog(result, condition),
    )).toThrow();
  });

  it('rejects a supported rule claim when a required nutrient is only partially covered', () => {
    const result = partialWithSupportedAttention();
    const catalog = conditionCatalog(result, { requiredNutrients: ['sodiumMg'] });

    expect(() => validateAnalysisResult(result, photoExpectation(result), catalog)).toThrow();
  });

  it('accepts a supported rule claim when required profile fields, nutrients, and age are available', () => {
    const result = resultFixture('analysis-complete');
    const completeProfile = { ...profile, weightKg: 65, ageYears: 30 };
    const catalog = conditionCatalog(result, {
      requiredProfileFields: ['weightKg'],
      requiredNutrients: ['energyKcal', 'sodiumMg'],
      supportedAgeMinimum: 30,
      supportedAgeMaximum: 30,
    });

    expect(() => validateAnalysisResult(result, photoExpectation(result, completeProfile), catalog)).not.toThrow();
  });

  it('rejects a health-rule source whose exact imported source authority differs', () => {
    const result = resultFixture('analysis-complete');
    const ruleSource = result.sources.find((source) => source.id === 'synthetic-rule')!;
    const catalog = catalogFor(result);
    catalog.conditions = conditionCatalog(result, {}).conditions;
    catalog.supportedRules = [{
      ruleId: 'fixture-rule-001',
      conditionId: 'fixture-condition',
      sources: [{ ...ruleSource, itemRef: 'different imported rule citation' }],
    }];

    expect(() => validateAnalysisResult(result, photoExpectation(result), catalog)).toThrow();
  });

  it('rejects needs_attention when a critical limitation is present', () => {
    const result = partialWithSupportedAttention();
    result.overallAttention = 'needs_attention';

    expect(() => validateAnalysisResult(result, photoExpectation(result), catalogFor(result))).toThrow();
  });

  it('rejects positive overall attention for an empty frozen profile', () => {
    const result = resultFixture('analysis-complete');
    result.attentions = [];
    result.sources = result.sources.filter(({ id }) => id !== 'synthetic-rule');
    result.overallAttention = 'considerable';
    result.profileVersion = 0;
    const emptyProfile = { ...profile, profileVersion: 0, conditionIds: [] };

    expect(() => validateAnalysisResult(result, photoExpectation(result, emptyProfile), catalogFor(result))).toThrow();
  });

  it('rejects positive overall attention when the result has no recognized nutrition support', () => {
    const result = resultFixture('analysis-unrecognized');
    result.limitations = result.limitations.map((limitation) => ({ ...limitation, critical: false }));
    result.overallAttention = 'considerable';
    const noConditionProfile = { ...profile, conditionIds: [], weightKg: 65 };

    expect(() => validateAnalysisResult(result, photoExpectation(result, noConditionProfile), catalogFor(result))).toThrow();
  });

  it('rejects considerable status when a supported condition lacks a required profile field', () => {
    const result = resultFixture('analysis-complete');
    const catalog = conditionCatalog(result, { requiredProfileFields: ['weightKg'] });
    result.attentions = [];
    result.sources = result.sources.filter(({ id }) => id !== 'synthetic-rule');
    result.overallAttention = 'considerable';

    expect(() => validateAnalysisResult(
      result,
      photoExpectation(result, { ...profile, weightKg: null }),
      catalog,
    )).toThrow();
  });

  it('accepts a correction whose half serving math and selected component match', () => {
    const result = resultFixture('correction-complete');
    const expectation: AnalysisExpectation = {
      kind: 'correction',
      operationId: result.operationId,
      profile,
      catalogVersion: result.catalogVersion,
      ruleSetVersion: result.ruleSetVersion,
      components: [{
        id: result.components[0]!.id,
        displayName: result.components[0]!.displayName,
        catalogFoodId: result.components[0]!.catalogFoodId,
        preparation: result.components[0]!.preparation,
        portion: { kind: 'known', quantity: 0.5, unit: 'serving', servingId: 'fixture-serving-100g' },
      }],
    };
    expect(() => validateAnalysisResult(result, expectation, catalogFor(result))).not.toThrow();
  });

  it('accepts a replacement food correction when the new selection has the same frozen catalog math', () => {
    const result = resultFixture('correction-complete');
    result.components[0]!.catalogFoodId = 'fixture-food-002';
    result.components[0]!.displayName = 'Replacement food';
    const expectation: AnalysisExpectation = {
      kind: 'correction',
      operationId: result.operationId,
      profile,
      catalogVersion: result.catalogVersion,
      ruleSetVersion: result.ruleSetVersion,
      components: [{
        id: result.components[0]!.id,
        displayName: 'Replacement food',
        catalogFoodId: 'fixture-food-002',
        preparation: result.components[0]!.preparation,
        portion: { kind: 'known', quantity: 0.5, unit: 'serving', servingId: 'fixture-serving-100g' },
      }],
    };
    expect(() => validateAnalysisResult(result, expectation, catalogFor(result))).not.toThrow();
  });

  it('accepts an explicit unknown portion correction without turning nutrients into zero', () => {
    const result = resultFixture('correction-complete');
    const component = result.components[0]!;
    component.portion = {
      quantity: null, unit: null, servingId: null, grams: null,
      origin: 'user_reported', basis: null, sourceId: null,
    };
    component.nutrients = {
      energyKcal: null, carbohydrateG: null, proteinG: null, fatG: null,
      fiberG: null, sugarsG: null, sodiumMg: null,
    };
    result.totals = structuredClone(component.nutrients);
    for (const key of Object.keys(result.coverage) as Array<keyof typeof result.coverage>) {
      result.coverage[key].knownComponentCount = 0;
    }
    result.supportStatus = 'partial';
    expect(() => validateAnalysisResult(result, {
      kind: 'correction',
      operationId: result.operationId,
      profile,
      catalogVersion: result.catalogVersion,
      ruleSetVersion: result.ruleSetVersion,
      components: [{
        id: component.id,
        displayName: component.displayName,
        catalogFoodId: component.catalogFoodId,
        preparation: component.preparation,
        portion: { kind: 'unknown' },
      }],
    }, catalogFor(result))).not.toThrow();
  });

  it('accepts an unmatched free-form correction as unrecognized with null nutrient coverage', () => {
    const result = resultFixture('correction-complete');
    const component = result.components[0]!;
    component.catalogFoodId = null;
    component.matchStatus = 'unrecognized';
    component.per100g = {
      energyKcal: null, carbohydrateG: null, proteinG: null, fatG: null,
      fiberG: null, sugarsG: null, sodiumMg: null,
    };
    component.nutrientSourceIds = {
      energyKcal: null, carbohydrateG: null, proteinG: null, fatG: null,
      fiberG: null, sugarsG: null, sodiumMg: null,
    };
    component.nutrients = structuredClone(component.per100g);
    component.sourceIds = [];
    component.portion = {
      quantity: null, unit: null, servingId: null, grams: null,
      origin: 'user_reported', basis: null, sourceId: null,
    };
    result.sources = [];
    result.attentions = [];
    result.overallAttention = 'insufficient_information';
    result.totals = structuredClone(component.nutrients);
    for (const key of Object.keys(result.coverage) as Array<keyof typeof result.coverage>) {
      result.coverage[key].knownComponentCount = 0;
    }
    result.supportStatus = 'unrecognized';
    expect(() => validateAnalysisResult(result, {
      kind: 'correction',
      operationId: result.operationId,
      profile,
      catalogVersion: result.catalogVersion,
      ruleSetVersion: result.ruleSetVersion,
      components: [{
        id: component.id,
        displayName: component.displayName,
        catalogFoodId: null,
        preparation: component.preparation,
        portion: { kind: 'unknown' },
      }],
    }, catalogFor(result))).not.toThrow();
  });

  it('accepts a known gram portion for an unmatched component without inventing nutrients', () => {
    const result = resultFixture('correction-complete');
    const component = result.components[0]!;
    component.catalogFoodId = null;
    component.matchStatus = 'unmatched';
    component.per100g = {
      energyKcal: null, carbohydrateG: null, proteinG: null, fatG: null,
      fiberG: null, sugarsG: null, sodiumMg: null,
    };
    component.nutrientSourceIds = {
      energyKcal: null, carbohydrateG: null, proteinG: null, fatG: null,
      fiberG: null, sugarsG: null, sodiumMg: null,
    };
    component.nutrients = structuredClone(component.per100g);
    component.sourceIds = [];
    component.portion = {
      quantity: 75, unit: 'g', servingId: null, grams: 75,
      origin: 'user_reported', basis: null, sourceId: null,
    };
    result.sources = [];
    result.attentions = [];
    result.overallAttention = 'insufficient_information';
    result.totals = structuredClone(component.nutrients);
    for (const key of Object.keys(result.coverage) as Array<keyof typeof result.coverage>) {
      result.coverage[key].knownComponentCount = 0;
    }
    result.supportStatus = 'partial';
    expect(() => validateAnalysisResult(result, {
      kind: 'correction',
      operationId: result.operationId,
      profile,
      catalogVersion: result.catalogVersion,
      ruleSetVersion: result.ruleSetVersion,
      components: [{
        id: component.id,
        displayName: component.displayName,
        catalogFoodId: null,
        preparation: component.preparation,
        portion: { kind: 'known', quantity: 75, unit: 'g' },
      }],
    }, catalogFor(result))).not.toThrow();
  });

  it.each([
    ['operation ID', { operationId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }],
    ['profile version', { profileVersion: 2 }],
    ['catalog version', { catalogVersion: 'different-catalog' }],
    ['rule version', { ruleSetVersion: 'different-rules' }],
  ])('rejects a result with a mismatched %s', (_label, change) => {
    const result = resultFixture('analysis-complete');
    const invalid = { ...result, ...change } as AnalysisResult;
    expect(() => validateAnalysisResult(invalid, photoExpectation(result), catalogFor(result))).toThrow();
  });

  it('rejects nutrient values that do not scale from the catalog source and portion', () => {
    const result = resultFixture('correction-complete');
    const invalid = structuredClone(result);
    invalid.components[0]!.nutrients.energyKcal = 99;
    expect(() => validateAnalysisResult(invalid, {
      kind: 'correction',
      operationId: result.operationId,
      profile,
      catalogVersion: result.catalogVersion,
      ruleSetVersion: result.ruleSetVersion,
      components: [{
        id: result.components[0]!.id,
        displayName: result.components[0]!.displayName,
        catalogFoodId: result.components[0]!.catalogFoodId,
        preparation: result.components[0]!.preparation,
        portion: { kind: 'known', quantity: 0.5, unit: 'serving', servingId: 'fixture-serving-100g' },
      }],
    }, catalogFor(result))).toThrow();
  });

  it('rejects a correction that changes the selected food or portion', () => {
    const result = resultFixture('correction-complete');
    const expectation = {
      kind: 'correction' as const,
      operationId: result.operationId,
      profile,
      catalogVersion: result.catalogVersion,
      ruleSetVersion: result.ruleSetVersion,
      components: [{
        id: result.components[0]!.id,
        displayName: result.components[0]!.displayName,
        catalogFoodId: 'replacement-food',
        preparation: result.components[0]!.preparation,
        portion: { kind: 'known' as const, quantity: 1, unit: 'serving' as const, servingId: 'fixture-serving-100g' },
      }],
    };
    expect(() => validateAnalysisResult(result, expectation, catalogFor(result))).toThrow();
  });

  it('rejects nutrient source IDs that are not present in the returned provenance', () => {
    const result = resultFixture('analysis-complete');
    const invalid = structuredClone(result);
    invalid.components[0]!.nutrientSourceIds.energyKcal = 'unlisted-source';
    expect(() => validateAnalysisResult(invalid, photoExpectation(result), catalogFor(result))).toThrow();
  });
});
