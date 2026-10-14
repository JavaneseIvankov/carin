import type { components } from '../../contracts/generated/ai-service.js';

type Ai = components['schemas'];
type AnalysisResult = Ai['AnalysisResult'];
type ProfileContext = Ai['ProfileContext'];
type ComponentInput = Ai['ComponentInput'];
type Source = Ai['Source'];
type Nutrients = Ai['Nutrients'];

export type AnalysisExpectation = {
  kind: 'photo_analysis' | 'correction';
  operationId: string;
  profile: ProfileContext;
  catalogVersion: string;
  ruleSetVersion: string;
  components?: ComponentInput[];
};

export type ValidationCatalog = {
  version: string;
  nutritionDatasetVersion: string;
  ruleSetVersion: string;
  dataMode: 'real' | 'synthetic';
  supportedPhotoFoodIds: string[];
  conditions: Ai['Condition'][];
  supportedRules: Array<Pick<Ai['SupportedRule'], 'ruleId' | 'conditionId' | 'sources'>>;
  foods: Array<{
    id: string;
    displayName: string;
    preparation: string | null;
    per100g: Nutrients;
    nutrientSourceIds: Ai['NutrientSources'];
    sourceRefs: Source[];
    servings: Array<{ id: string; grams: number; sourceId: string }>;
  }>;
};

export class InvalidAnalysisResult extends Error {
  constructor() {
    super('AI result failed application provenance or calculation validation');
  }
}

const nutrientKeys = [
  'energyKcal',
  'carbohydrateG',
  'proteinG',
  'fatG',
  'fiberG',
  'sugarsG',
  'sodiumMg',
] as const satisfies readonly (keyof Nutrients)[];
const coreNutrients = ['energyKcal', 'carbohydrateG', 'proteinG', 'fatG'] as const;
const tolerance = 0.000001;

function invalid(): never {
  throw new InvalidAnalysisResult();
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sameNumber(actual: number | null, expected: number | null): boolean {
  if (actual === null || expected === null) return actual === expected;
  return Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
}

function rounded(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function equalNutrients(left: Nutrients, right: Nutrients): boolean {
  return nutrientKeys.every((key) => sameNumber(left[key], right[key]));
}

function hasRequiredProfileFields(profile: ProfileContext, requiredFields: string[]): boolean {
  const values: Record<string, unknown> = {
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    sexForReference: profile.sexForReference,
    activity: profile.activity,
    smoking: profile.smoking,
    diagnoses: {
      state: profile.diagnosisState,
      entries: [
        ...profile.conditionIds.map((conditionId) => ({ conditionId, label: conditionId })),
        ...profile.unsupportedConditionLabels.map((label) => ({ conditionId: null, label })),
      ],
    },
    familyHistory: { state: 'not_provided', entries: [] },
    allergies: { state: profile.allergyState, entries: profile.allergies },
    clinicianNotes: null,
  };
  for (const path of requiredFields) {
    let value: unknown = values;
    const segments = path.split('.');
    for (const segment of segments) {
      if (!segment || value === null || typeof value !== 'object' || Array.isArray(value)) {
        value = undefined;
        break;
      }
      value = (value as Record<string, unknown>)[segment];
    }
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' && (!value.trim() ||
        (segments.at(-1) === 'state' && ['not_provided', 'unknown'].includes(value)))) return false;
    if (typeof value === 'number' && !Number.isFinite(value)) return false;
    if (Array.isArray(value) && value.length === 0) return false;
    if (typeof value === 'object' && !Array.isArray(value)) {
      const knowledge = value as { state?: unknown; entries?: unknown };
      if (typeof knowledge.state === 'string' &&
          (knowledge.state === 'not_provided' || knowledge.state === 'unknown' ||
            (knowledge.state === 'reported' && (!Array.isArray(knowledge.entries) || knowledge.entries.length === 0)))) {
        return false;
      }
      if (Object.keys(value).length === 0) return false;
    }
  }
  return true;
}

function conditionRequirementsMet(
  result: AnalysisResult,
  profile: ProfileContext,
  condition: Ai['Condition'],
): boolean {
  if (!condition.personalizationSupported || !hasRequiredProfileFields(profile, condition.requiredProfileFields)) return false;
  if ((condition.supportedAgeMinimum !== null || condition.supportedAgeMaximum !== null) && profile.ageYears === null) return false;
  if (condition.supportedAgeMinimum !== null && profile.ageYears! < condition.supportedAgeMinimum) return false;
  if (condition.supportedAgeMaximum !== null && profile.ageYears! > condition.supportedAgeMaximum) return false;
  return condition.requiredNutrients.every((nutrient) => result.components.length > 0 &&
    result.components.every((component) => component.nutrients[nutrient] !== null));
}

function hasPersonalizationSupportGap(
  result: AnalysisResult,
  profile: ProfileContext,
  catalog: ValidationCatalog,
): boolean {
  if (profile.unsupportedConditionLabels.length > 0) return true;
  return profile.conditionIds.some((conditionId) => {
    const conditions = catalog.conditions.filter(({ id }) => id === conditionId);
    return conditions.length !== 1 ||
      !conditionRequirementsMet(result, profile, conditions[0]!) ||
      !catalog.supportedRules.some((rule) => rule.conditionId === conditionId);
  });
}

function emptyProfile(profile: ProfileContext): boolean {
  return profile.profileVersion === 0 || (
    profile.heightCm === null && profile.weightKg === null && profile.sexForReference === null &&
    profile.diagnosisState === 'not_provided' && profile.conditionIds.length === 0 &&
    profile.unsupportedConditionLabels.length === 0 && profile.allergyState === 'not_provided' &&
    profile.allergies.length === 0 && profile.activity === null && profile.smoking === null
  );
}

function validateSources(result: AnalysisResult, catalog: ValidationCatalog): Map<string, Source> {
  const sources = new Map<string, Source>();
  const ruleSources = new Map<string, Source>();
  for (const rule of catalog.supportedRules) {
    for (const source of rule.sources) {
      if (source.datasetVersion !== catalog.ruleSetVersion ||
          (catalog.dataMode === 'real' ? source.kind !== 'health_rule' : source.kind !== 'synthetic')) invalid();
      const prior = ruleSources.get(source.id);
      if (prior && canonical(prior) !== canonical(source)) invalid();
      ruleSources.set(source.id, source);
    }
  }
  for (const source of result.sources) {
    if (sources.has(source.id)) invalid();
    if (source.kind === 'synthetic') {
      if (result.dataMode !== 'synthetic' || ![
        catalog.nutritionDatasetVersion,
        catalog.ruleSetVersion,
      ].includes(source.datasetVersion)) invalid();
    } else if (result.dataMode === 'synthetic') {
      invalid();
    } else if (source.kind === 'health_rule') {
      if (source.datasetVersion !== catalog.ruleSetVersion) invalid();
    } else if (source.datasetVersion !== catalog.nutritionDatasetVersion) {
      invalid();
    }
    if ((source.kind === 'health_rule' ||
        (source.kind === 'synthetic' && source.datasetVersion === catalog.ruleSetVersion)) &&
        canonical(ruleSources.get(source.id)) !== canonical(source)) invalid();
    sources.set(source.id, source);
  }

  const catalogSources = new Map<string, Source>();
  for (const food of catalog.foods) {
    for (const source of food.sourceRefs) {
      const prior = catalogSources.get(source.id);
      if (prior && canonical(prior) !== canonical(source)) invalid();
      catalogSources.set(source.id, source);
    }
  }
  for (const source of result.sources) {
    if (source.kind === 'nutrition' || source.kind === 'portion') {
      const canonicalSource = catalogSources.get(source.id);
      if (!canonicalSource || canonical(canonicalSource) !== canonical(source)) invalid();
    }
  }
  return sources;
}

function validateComponentSelection(
  result: AnalysisResult,
  expectation: AnalysisExpectation,
): void {
  if (expectation.kind === 'photo_analysis') {
    if (result.inputKind !== 'photo' || expectation.components !== undefined) invalid();
    return;
  }
  const requested = expectation.components;
  if (result.inputKind !== 'correction' || !requested || result.components.length !== requested.length) invalid();
  for (const [index, input] of requested.entries()) {
    const output = result.components[index];
    if (!output || output.id !== input.id || output.displayName !== input.displayName ||
        output.catalogFoodId !== input.catalogFoodId || output.preparation !== input.preparation ||
        output.portion.origin !== 'user_reported') invalid();
    const portion = input.portion;
    if (portion.kind === 'unknown') {
      if (output.portion.quantity !== null || output.portion.unit !== null ||
          output.portion.servingId !== null || output.portion.grams !== null ||
          output.portion.sourceId !== null || output.portion.basis !== null) invalid();
    } else if (output.portion.quantity !== portion.quantity || output.portion.unit !== portion.unit ||
        output.portion.servingId !== (portion.unit === 'serving' ? portion.servingId : null)) {
      invalid();
    }
  }
}

function expectedGrams(
  resultPortion: Ai['PortionResult'],
  food: ValidationCatalog['foods'][number] | undefined,
): number | null {
  if (resultPortion.unit === null) {
    if (resultPortion.quantity !== null || resultPortion.servingId !== null || resultPortion.grams !== null ||
        resultPortion.sourceId !== null || resultPortion.basis !== null) invalid();
    return null;
  }
  if (resultPortion.quantity === null) invalid();
  if (resultPortion.unit === 'g') {
    if (resultPortion.servingId !== null || resultPortion.sourceId !== null) invalid();
    return rounded(resultPortion.quantity);
  }
  if (!food) invalid();
  if (!resultPortion.servingId) invalid();
  const serving = food.servings.find(({ id }) => id === resultPortion.servingId);
  if (!serving || resultPortion.sourceId !== serving.sourceId) invalid();
  return rounded(resultPortion.quantity * serving.grams);
}

function validateComponent(
  component: Ai['ComponentResult'],
  result: AnalysisResult,
  catalog: ValidationCatalog,
  sources: Map<string, Source>,
): void {
  let food: ValidationCatalog['foods'][number] | undefined;
  if (component.catalogFoodId === null) {
    if (component.matchStatus === 'matched' || nutrientKeys.some((key) =>
      component.per100g[key] !== null || component.nutrientSourceIds[key] !== null || component.nutrients[key] !== null,
    )) invalid();
  } else {
    food = catalog.foods.find(({ id }) => id === component.catalogFoodId);
    if (!food || component.matchStatus !== 'matched' || component.preparation !== food.preparation ||
        !equalNutrients(component.per100g, food.per100g) || nutrientKeys.some((key) =>
          component.nutrientSourceIds[key] !== food!.nutrientSourceIds[key],
        )) invalid();
    if (result.inputKind === 'photo' && !catalog.supportedPhotoFoodIds.includes(food.id)) invalid();
  }

  const grams = expectedGrams(component.portion, food);
  const expectedOrigin = result.inputKind === 'photo' ? 'photo_estimate' : 'user_reported';
  if (component.portion.origin !== expectedOrigin ||
      !sameNumber(component.portion.grams, grams)) invalid();

  for (const key of nutrientKeys) {
    const per100g = component.per100g[key];
    const sourceId = component.nutrientSourceIds[key];
    const expected = per100g === null || sourceId === null || grams === null
      ? null
      : rounded(per100g * grams / 100);
    if (!sameNumber(component.nutrients[key], expected)) invalid();
    if (sourceId !== null && !sources.has(sourceId)) invalid();
  }
  if (component.sourceIds.some((sourceId) => !sources.has(sourceId)) ||
      nutrientKeys.some((key) => {
        const sourceId = component.nutrientSourceIds[key];
        return sourceId !== null && !component.sourceIds.includes(sourceId);
      }) ||
      (component.portion.sourceId !== null &&
        (!sources.has(component.portion.sourceId) || !component.sourceIds.includes(component.portion.sourceId)))) {
    invalid();
  }
}

function validateTotalsAndStatus(result: AnalysisResult): void {
  const totals = {} as Nutrients;
  const knownCounts = {} as Record<keyof Nutrients, number>;
  for (const key of nutrientKeys) {
    const known = result.components.map((component) => component.nutrients[key])
      .filter((value): value is number => value !== null);
    knownCounts[key] = known.length;
    totals[key] = known.length === 0 ? null : rounded(known.reduce((sum, value) => sum + value, 0));
    const coverage = result.coverage[key];
    if (coverage.knownComponentCount !== known.length ||
        coverage.totalComponentCount !== result.components.length ||
        !sameNumber(result.totals[key], totals[key])) invalid();
  }

  const allUnrecognized = result.components.every((component) => component.matchStatus !== 'matched');
  if (result.supportStatus === 'unrecognized') {
    if (!allUnrecognized || nutrientKeys.some((key) => knownCounts[key] !== 0)) invalid();
  } else if (result.supportStatus === 'complete') {
    if (!result.components.every((component) => component.matchStatus === 'matched' && component.portion.grams !== null) ||
        coreNutrients.some((key) => knownCounts[key] !== result.components.length)) invalid();
  } else if (result.components.every((component) => component.matchStatus === 'matched' && component.portion.grams !== null) &&
      coreNutrients.every((key) => knownCounts[key] === result.components.length)) {
    invalid();
  }
}

function validateRuleClaims(
  result: AnalysisResult,
  profile: ProfileContext,
  catalog: ValidationCatalog,
  sources: Map<string, Source>,
): void {
  const citedRuleSourceIds = new Set<string>();
  if (result.attentions.length > 0 && profile.profileVersion === 0) invalid();
  for (const attention of result.attentions) {
    if (!profile.conditionIds.includes(attention.conditionId)) invalid();
    const conditions = catalog.conditions.filter(({ id }) => id === attention.conditionId);
    const rules = catalog.supportedRules.filter(({ ruleId, conditionId }) =>
      ruleId === attention.ruleId && conditionId === attention.conditionId,
    );
    if (conditions.length !== 1 || !conditionRequirementsMet(result, profile, conditions[0]!) || rules.length !== 1) invalid();
    const supportedSources = rules[0]!.sources;
    if (attention.sourceIds.length === 0 || attention.sourceIds.some((sourceId) => {
      const returned = sources.get(sourceId);
      const authority = supportedSources.find((source) => source.id === sourceId);
      if (!returned || !authority || canonical(returned) !== canonical(authority)) return true;
      citedRuleSourceIds.add(sourceId);
      return false;
    })) invalid();
  }
  for (const source of result.sources) {
    if ((source.kind === 'health_rule' ||
        (source.kind === 'synthetic' && source.datasetVersion === catalog.ruleSetVersion)) &&
        !citedRuleSourceIds.has(source.id)) invalid();
  }
}

function validateOverallAttention(
  result: AnalysisResult,
  profile: ProfileContext,
  catalog: ValidationCatalog,
): void {
  const requiresInsufficient = result.limitations.some(({ critical }) => critical) || result.supportStatus === 'unrecognized';
  const hasSupportGap = hasPersonalizationSupportGap(result, profile, catalog);
  if ((requiresInsufficient || hasSupportGap || emptyProfile(profile)) && result.overallAttention !== 'insufficient_information') {
    invalid();
  }
  if (result.overallAttention === 'needs_attention' && result.attentions.length === 0) invalid();
  if (result.overallAttention === 'considerable' && result.attentions.length > 0) invalid();
}

export function validateAnalysisResult(
  result: AnalysisResult,
  expectation: AnalysisExpectation,
  catalog: ValidationCatalog,
): void {
  if (result.contractVersion !== '1.0.0' || result.operationId !== expectation.operationId ||
      result.profileVersion !== expectation.profile.profileVersion ||
      result.catalogVersion !== expectation.catalogVersion || result.catalogVersion !== catalog.version ||
      result.nutritionDatasetVersion !== catalog.nutritionDatasetVersion ||
      result.ruleSetVersion !== expectation.ruleSetVersion || result.ruleSetVersion !== catalog.ruleSetVersion ||
      result.dataMode !== catalog.dataMode) invalid();

  validateComponentSelection(result, expectation);
  const sources = validateSources(result, catalog);
  const componentIds = new Set<string>();
  for (const component of result.components) {
    if (componentIds.has(component.id)) invalid();
    componentIds.add(component.id);
    validateComponent(component, result, catalog, sources);
  }
  for (const attention of result.attentions) {
    if (attention.componentIds.some((id) => !componentIds.has(id)) ||
        attention.sourceIds.some((id) => !sources.has(id))) invalid();
  }
  validateRuleClaims(result, expectation.profile, catalog, sources);
  for (const limitation of result.limitations) {
    if (limitation.componentIds.some((id) => !componentIds.has(id))) invalid();
  }
  validateTotalsAndStatus(result);
  validateOverallAttention(result, expectation.profile, catalog);
}
