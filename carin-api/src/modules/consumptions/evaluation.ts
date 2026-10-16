import type { components } from '../../contracts/generated/ai-service.js';
import type { components as AppComponents } from '../../contracts/generated/app-api.js';
import { hasRequiredProfileFields } from '../analyses/result-validation.js';

type Ai = components['schemas'];
type AnalysisResult = Ai['AnalysisResult'];
type ConsumptionSnapshot = AppComponents['schemas']['ConsumptionSnapshot'];
type ComponentInput = Ai['ComponentInput'];
type ProfileContext = Ai['ProfileContext'];
type CapabilityManifest = Ai['CapabilityManifest'];

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function limitation(code: string, message: string, componentIds: string[] = []): Ai['Limitation'] {
  return { code, message, componentIds: [...new Set(componentIds)], critical: false };
}

export type PersonalizationEligibilityInput = {
  profile: ProfileContext;
  snapshot: ConsumptionSnapshot;
  manifest: CapabilityManifest | null;
  consentGranted: boolean;
  catalogReady: boolean;
};

export type PersonalizationEligibility = {
  eligible: boolean;
  limitations: Ai['Limitation'][];
};

/** Return explicit reasons when frozen data cannot support a personal evaluation. */
export function evaluatePersonalizationEligibility(
  input: PersonalizationEligibilityInput,
): PersonalizationEligibility {
  const limitations: Ai['Limitation'][] = [];
  if (!input.consentGranted) {
    return {
      eligible: false,
      limitations: [limitation('ai_consent_required', 'Current AI processing consent is not active.')],
    };
  }
  if (!input.catalogReady || !input.manifest ||
      input.manifest.catalogVersion !== input.snapshot.catalogVersion ||
      input.manifest.nutritionDatasetVersion !== input.snapshot.nutritionDatasetVersion ||
      input.manifest.ruleSetVersion !== input.snapshot.ruleSetVersion ||
      input.manifest.dataMode !== input.snapshot.dataMode) {
    return {
      eligible: false,
      limitations: [limitation('capability_unavailable', 'Catalog capability data is unavailable or does not match this snapshot.')],
    };
  }
  if (input.profile.profileVersion === 0 || input.profile.conditionIds.length === 0 ||
      input.snapshot.profileVersion !== input.profile.profileVersion) {
    return {
      eligible: false,
      limitations: [limitation('profile_incomplete', 'A supported health condition and matching profile snapshot are required.')],
    };
  }

  let supported = false;
  const manifestConditions = new Map(input.manifest.conditions.map((condition) => [condition.id, condition]));
  const sourceKinds = new Map(input.snapshot.sources.map((source) => [source.id, source.kind]));
  for (const conditionId of input.profile.conditionIds) {
    const condition = manifestConditions.get(conditionId);
    if (!condition?.personalizationSupported) {
      limitations.push(limitation(
        'unsupported_condition',
        `Personal evaluation is not supported for condition ${conditionId}.`,
      ));
      continue;
    }
    if (!(input.manifest.supportedRules ?? []).some((rule) => rule.conditionId === conditionId)) {
      limitations.push(limitation(
        'unsupported_condition',
        `No published personal evaluation rule supports condition ${conditionId}.`,
      ));
      continue;
    }
    if ((condition.supportedAgeMinimum !== null &&
          (input.profile.ageYears === null || input.profile.ageYears < condition.supportedAgeMinimum)) ||
        (condition.supportedAgeMaximum !== null &&
          (input.profile.ageYears === null || input.profile.ageYears > condition.supportedAgeMaximum))) {
      limitations.push(limitation(
        'unsupported_condition',
        `Personal evaluation is outside the supported age range for condition ${conditionId}.`,
      ));
      continue;
    }

    const hasRequiredFields = hasRequiredProfileFields(input.profile, condition.requiredProfileFields);
    const missingNutrients = condition.requiredNutrients.filter((nutrient) => {
      return input.snapshot.components.length === 0 || input.snapshot.components.some((component) => {
        const sourceId = component.nutrientSourceIds[nutrient];
        const sourceKind = sourceId ? sourceKinds.get(sourceId) : undefined;
        return component.nutrients[nutrient] === null || (sourceKind !== 'nutrition' && sourceKind !== 'synthetic');
      });
    });
    if (!hasRequiredFields || missingNutrients.length) {
      const missingComponents = missingNutrients.length
        ? input.snapshot.components.filter((component) =>
            missingNutrients.some((nutrient) => {
              const sourceId = component.nutrientSourceIds[nutrient];
              const sourceKind = sourceId ? sourceKinds.get(sourceId) : undefined;
              return component.nutrients[nutrient] === null || (sourceKind !== 'nutrition' && sourceKind !== 'synthetic');
            }),
          ).map(({ id }) => id)
        : [];
      limitations.push(limitation(
        'missing_evaluation_data',
        `Condition ${conditionId} needs ${[
          ...(!hasRequiredFields ? ['required profile fields'] : []),
          ...missingNutrients,
        ].join(', ')} before personal evaluation is supported.`,
        missingComponents,
      ));
      continue;
    }
    supported = true;
  }
  if (!supported && limitations.length === 0) {
    limitations.push(limitation('unsupported_condition', 'No personal evaluation rule supports this profile.'));
  }
  return { eligible: supported, limitations };
}

function portionMatches(input: ComponentInput['portion'], result: Ai['PortionResult']): boolean {
  if (input.kind === 'unknown') {
    return result.quantity === null && result.unit === null && result.servingId === null &&
      result.grams === null && result.sourceId === null && result.basis === null;
  }
  return result.quantity === input.quantity && result.unit === input.unit &&
    result.servingId === (input.unit === 'serving' ? input.servingId : null);
}

/** A confirmed photo can reuse attention only when the entire frozen evaluation input is unchanged. */
export function canReusePhotoAttention(input: {
  sourceResult: AnalysisResult;
  sourceProfile: ProfileContext;
  currentProfile: ProfileContext;
  catalogVersion: string;
  ruleSetVersion: string;
  components: ComponentInput[];
}): boolean {
  const { sourceResult } = input;
  if (sourceResult.inputKind !== 'photo' || sourceResult.catalogVersion !== input.catalogVersion ||
      sourceResult.ruleSetVersion !== input.ruleSetVersion ||
      sourceResult.profileVersion !== input.sourceProfile.profileVersion ||
      sourceResult.profileVersion !== input.currentProfile.profileVersion ||
      canonical(input.sourceProfile) !== canonical(input.currentProfile) ||
      sourceResult.components.length !== input.components.length) return false;
  return sourceResult.components.every((result, index) => {
    const component = input.components[index];
    return Boolean(component) && result.id === component!.id && result.displayName === component!.displayName &&
      result.catalogFoodId === component!.catalogFoodId && result.preparation === component!.preparation &&
      portionMatches(component!.portion, result.portion);
  });
}
