import type { components } from '../../contracts/generated/ai-service.js';
import type { components as AppComponents } from '../../contracts/generated/app-api.js';
import { validateSchema } from '../../contracts/validation.js';

type Ai = components['schemas'];
type AnalysisResult = Ai['AnalysisResult'];
type ConsumptionSnapshot = AppComponents['schemas']['ConsumptionSnapshot'];
type ComponentInput = AppComponents['schemas']['ConsumptionComponentInput'];
type ComponentScale = NonNullable<ConsumptionSnapshot['photoPortionScales']>[number];
type Nutrients = Ai['Nutrients'];
type Source = Ai['Source'];
type NutrientSources = Ai['NutrientSources'];

const nutrientKeys = [
  'energyKcal',
  'carbohydrateG',
  'proteinG',
  'fatG',
  'fiberG',
  'sugarsG',
  'sodiumMg',
] as const satisfies readonly (keyof Nutrients)[];

export type ConsumptionCatalogFood = {
  id: string;
  displayName: string;
  preparation: string | null;
  per100g: Nutrients;
  nutrientSourceIds: NutrientSources;
  sourceRefs: Source[];
  servings: Array<{ id: string; grams: number; sourceId: string }>;
};

export type ConsumptionNutritionInput = {
  operationId: string;
  computedAt: string;
  profileVersion: number;
  catalogVersion: string;
  nutritionDatasetVersion: string;
  ruleSetVersion: string;
  dataMode: 'real' | 'synthetic' | 'unavailable';
  components: ComponentInput[];
  catalogFoods: ConsumptionCatalogFood[];
  sourceResult?: AnalysisResult | null;
};

export class ConsumptionCatalogInputError extends Error {
  constructor(readonly reason: 'food_unavailable' | 'selection_mismatch' | 'serving_unavailable' | 'serving_source_unavailable' | 'photo_portion_fraction_required') {
    super(reason);
  }
}

const emptyNutrients = (): Nutrients => ({
  energyKcal: null,
  carbohydrateG: null,
  proteinG: null,
  fatG: null,
  fiberG: null,
  sugarsG: null,
  sodiumMg: null,
});

const emptyNutrientSources = (): NutrientSources => ({
  energyKcal: null,
  carbohydrateG: null,
  proteinG: null,
  fatG: null,
  fiberG: null,
  sugarsG: null,
  sodiumMg: null,
});

function rounded(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sumKnown(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? rounded(known.reduce((sum, value) => sum + value, 0)) : null;
}

function addLimitation(
  limitations: Ai['Limitation'][],
  code: string,
  message: string,
  componentIds: string[],
): void {
  limitations.push({ code, message, componentIds: [ ...new Set(componentIds) ], critical: false });
}

function actualPortion(component: ComponentInput, food: ConsumptionCatalogFood | undefined) {
  const portion = component.portion;
  if (portion.kind === 'unknown') {
    return {
      grams: null,
      sourceId: null,
      portion: {
        quantity: null,
        unit: null,
        servingId: null,
        grams: null,
        origin: 'user_reported' as const,
        basis: null,
        sourceId: null,
      },
    };
  }

  if (portion.unit === 'g') {
    return {
      grams: portion.quantity,
      sourceId: null,
      portion: {
        quantity: portion.quantity,
        unit: 'g' as const,
        servingId: null,
        grams: portion.quantity,
        origin: 'user_reported' as const,
        basis: 'edible_grams',
        sourceId: null,
      },
    };
  }

  if (!food) {
    return {
      grams: null,
      sourceId: null,
      portion: {
        quantity: portion.quantity,
        unit: 'serving' as const,
        servingId: portion.servingId,
        grams: null,
        origin: 'user_reported' as const,
        basis: null,
        sourceId: null,
      },
    };
  }

  if (portion.kind !== 'known' || portion.unit !== 'serving') {
    throw new ConsumptionCatalogInputError('serving_unavailable');
  }
  const serving = food?.servings.find(({ id }) => id === portion.servingId);
  if (!serving || !Number.isFinite(serving.grams) || serving.grams <= 0) {
    throw new ConsumptionCatalogInputError('serving_unavailable');
  }
  const source = food?.sourceRefs.find(({ id }) => id === serving.sourceId);
  if (!source) throw new ConsumptionCatalogInputError('serving_source_unavailable');
  const grams = portion.quantity * serving.grams;
  return {
    grams,
    sourceId: serving.sourceId,
    portion: {
      quantity: portion.quantity,
      unit: 'serving' as const,
      servingId: serving.id,
      grams: rounded(grams),
      origin: 'user_reported' as const,
      basis: 'catalog_serving',
      sourceId: serving.sourceId,
    },
  };
}

function componentResult(
  component: ComponentInput,
  foods: Map<string, ConsumptionCatalogFood>,
  sources: Map<string, Source>,
  limitations: Ai['Limitation'][],
  sourceResult?: AnalysisResult | null,
): { result: Ai['ComponentResult']; scale: ComponentScale | null } {
  const food = component.catalogFoodId ? foods.get(component.catalogFoodId) : undefined;
  if (component.catalogFoodId && !food) throw new ConsumptionCatalogInputError('food_unavailable');
  if (food && (food.displayName !== component.displayName || food.preparation !== component.preparation)) {
    throw new ConsumptionCatalogInputError('selection_mismatch');
  }

  const actual = actualPortion(component, food);
  const visualComponent = sourceResult?.inputKind === 'photo'
    ? sourceResult.components.find(({ id }) => id === component.id)
    : undefined;
  const modelSourceIds = new Set((sourceResult?.sources ?? [])
    .filter(({ kind }) => kind === 'model_estimate').map(({ id }) => id));
  const visualIdentityMatches = Boolean(visualComponent &&
    (visualComponent.matchStatus === 'unmatched' || visualComponent.matchStatus === 'unrecognized') &&
    visualComponent.displayName === component.displayName &&
    visualComponent.catalogFoodId === component.catalogFoodId &&
    visualComponent.preparation === component.preparation);
  const visualNutrientSourceIds = emptyNutrientSources();
  if (visualIdentityMatches && visualComponent) {
    for (const key of nutrientKeys) {
      const id = visualComponent.nutrientSourceIds[key];
      if (id && modelSourceIds.has(id)) visualNutrientSourceIds[key] = id;
    }
  }
  const hasVisualNutrients = nutrientKeys.some((key) => visualNutrientSourceIds[key] !== null);
  let scale: ComponentScale | null = null;
  const per100g = food ? food.per100g : emptyNutrients();
  const nutrientSourceIds = food ? food.nutrientSourceIds : emptyNutrientSources();
  const nutrients = emptyNutrients();
  if (!food) {
    addLimitation(limitations, 'unmatched_food', 'No catalog nutrition source is available for this component.', [component.id]);
    if (hasVisualNutrients && visualComponent) {
      const sourceGrams = visualComponent.portion.grams;
      const actualGrams = actual.grams;
      const ratio = sourceGrams !== null && actualGrams !== null && Number.isFinite(sourceGrams) && sourceGrams > 0
        ? actualGrams / sourceGrams
        : null;
      const fraction = component.photoPortionFraction;
      const factor = ratio ?? fraction;
      if (factor === undefined || !Number.isFinite(factor) || factor <= 0 || factor > 100) {
        throw new ConsumptionCatalogInputError('photo_portion_fraction_required');
      }
      for (const key of nutrientKeys) {
        const sourceId = visualNutrientSourceIds[key];
        const estimate = visualComponent.nutrients[key];
        if (sourceId) {
          nutrients[key] = estimate === null ? null : rounded(estimate * factor);
          nutrientSourceIds[key] = sourceId;
          const source = sourceResult?.sources.find(({ id }) => id === sourceId);
          if (source) sources.set(source.id, source);
        }
      }
      scale = { componentId: component.id, factor: rounded(factor), sourceGrams };
    }
    if (component.portion.kind === 'known' && component.portion.unit === 'serving') {
      addLimitation(limitations, 'serving_size_unavailable', 'The serving size cannot be converted without matching catalog data.', [component.id]);
    }
  } else if (actual.grams === null) {
    addLimitation(limitations, 'unknown_portion', 'Nutrition cannot be calculated until the actual portion is known.', [component.id]);
  } else {
    for (const key of nutrientKeys) {
      const amount = per100g[key];
      nutrients[key] = amount === null ? null : rounded(amount * actual.grams / 100);
    }
    const missing = nutrientKeys.filter((key) => nutrients[key] === null);
    if (missing.length) {
      addLimitation(
        limitations,
        'nutrient_unavailable',
        `Catalog data is unavailable for: ${missing.join(', ')}.`,
        [component.id],
      );
    }
  }

  const sourceIds = food
    ? [ ...new Set([ ...food.sourceRefs.map(({ id }) => id), ...(actual.sourceId ? [actual.sourceId] : []) ]) ].sort()
    : [...new Set(Object.values(nutrientSourceIds).filter((id): id is string => id !== null))].sort();
  for (const source of food?.sourceRefs ?? []) sources.set(source.id, source);

  return { result: {
    id: component.id,
    displayName: component.displayName,
    catalogFoodId: food?.id ?? null,
    preparation: component.preparation,
    matchStatus: food ? 'matched' : visualIdentityMatches && visualComponent
      ? visualComponent.matchStatus
      : 'unmatched',
    portion: actual.portion,
    nutrients,
    sourceIds,
    nutrientSourceIds,
    per100g: food ? per100g : emptyNutrients(),
  }, scale };
}

/** Build the immutable nutrition view from user-selected inputs and versioned catalog facts. */
export function buildConsumptionNutritionSnapshot(input: ConsumptionNutritionInput): ConsumptionSnapshot {
  const foods = new Map(input.catalogFoods.map((food) => [food.id, food]));
  const sources = new Map<string, Source>();
  const limitations: Ai['Limitation'][] = [];
  const componentResults = input.components.map((component) =>
    componentResult(component, foods, sources, limitations, input.sourceResult));
  const resultComponents = componentResults.map(({ result }) => result);
  const photoPortionScales = componentResults.flatMap(({ scale }) => scale ? [scale] : []);
  const totals = Object.fromEntries(nutrientKeys.map((key) => [
    key,
    sumKnown(resultComponents.map((component) => component.nutrients[key])),
  ])) as Nutrients;
  const coverage = Object.fromEntries(nutrientKeys.map((key) => [
    key,
    {
      knownComponentCount: resultComponents.filter((component) => component.nutrients[key] !== null).length,
      totalComponentCount: resultComponents.length,
    },
  ])) as Ai['NutrientCoverage'];
  const complete = resultComponents.length > 0 && resultComponents.every((component) => component.matchStatus === 'matched' && nutrientKeys.every((key) => component.nutrients[key] !== null));
  const anyMatched = resultComponents.some((component) => component.matchStatus === 'matched');
  const snapshot: ConsumptionSnapshot = {
    contractVersion: '2.0.0',
    operationId: input.operationId,
    inputKind: input.sourceResult?.inputKind === 'photo' ? 'photo' : 'manual',
    supportStatus: complete ? 'complete' : anyMatched ? 'partial' : 'unrecognized',
    overallAttention: 'insufficient_information',
    profileVersion: input.profileVersion,
    catalogVersion: input.catalogVersion,
    nutritionDatasetVersion: input.nutritionDatasetVersion,
    ruleSetVersion: input.ruleSetVersion,
    computedAt: input.computedAt,
    components: resultComponents,
    photoPortionScales,
    totals,
    coverage,
    attentions: [],
    limitations,
    sources: [...sources.values()].sort((left, right) => left.id.localeCompare(right.id)),
    dataMode: input.dataMode,
  };
  validateSchema('app.ConsumptionSnapshot', snapshot);
  return snapshot;
}

/** Freeze reusable photo evaluation output into this consumption's own snapshot. */
export function preservePhotoEvaluation(
  snapshot: ConsumptionSnapshot,
  sourceResult: AnalysisResult,
): ConsumptionSnapshot {
  const limitations = [...snapshot.limitations];
  const limitationKeys = new Set(limitations.map(canonical));
  for (const item of sourceResult.limitations) {
    const key = canonical(item);
    if (!limitationKeys.has(key)) {
      limitations.push(item);
      limitationKeys.add(key);
    }
  }

  const sources = new Map(snapshot.sources.map((source) => [source.id, source]));
  for (const source of sourceResult.sources) {
    if (!sources.has(source.id)) sources.set(source.id, source);
  }

  const preserved: ConsumptionSnapshot = {
    ...snapshot,
    overallAttention: sourceResult.overallAttention,
    attentions: sourceResult.attentions,
    limitations,
    sources: [...sources.values()].sort((left, right) => left.id.localeCompare(right.id)),
  };
  validateSchema('app.ConsumptionSnapshot', preserved);
  return preserved;
}
