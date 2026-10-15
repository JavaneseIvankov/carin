import type { components } from '../../contracts/generated/ai-service.js';
import type { components as AppComponents } from '../../contracts/generated/app-api.js';
import { validateSchema } from '../../contracts/validation.js';

type Ai = components['schemas'];
type AnalysisResult = Ai['AnalysisResult'];
type ConsumptionSnapshot = AppComponents['schemas']['ConsumptionSnapshot'];
type ComponentInput = Ai['ComponentInput'];
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
};

export class ConsumptionCatalogInputError extends Error {
  constructor(readonly reason: 'food_unavailable' | 'selection_mismatch' | 'serving_unavailable' | 'serving_source_unavailable') {
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
): Ai['ComponentResult'] {
  const food = component.catalogFoodId ? foods.get(component.catalogFoodId) : undefined;
  if (component.catalogFoodId && !food) throw new ConsumptionCatalogInputError('food_unavailable');
  if (food && (food.displayName !== component.displayName || food.preparation !== component.preparation)) {
    throw new ConsumptionCatalogInputError('selection_mismatch');
  }

  const actual = actualPortion(component, food);
  const per100g = food ? food.per100g : emptyNutrients();
  const nutrientSourceIds = food ? food.nutrientSourceIds : emptyNutrientSources();
  const nutrients = emptyNutrients();
  if (!food) {
    addLimitation(limitations, 'unmatched_food', 'No catalog nutrition source is available for this component.', [component.id]);
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
    : [];
  for (const source of food?.sourceRefs ?? []) sources.set(source.id, source);

  return {
    id: component.id,
    displayName: component.displayName,
    catalogFoodId: food?.id ?? null,
    preparation: component.preparation,
    matchStatus: food ? 'matched' : 'unmatched',
    portion: actual.portion,
    nutrients,
    sourceIds,
    nutrientSourceIds,
    per100g,
  };
}

/** Build the immutable nutrition view from user-selected inputs and versioned catalog facts. */
export function buildConsumptionNutritionSnapshot(input: ConsumptionNutritionInput): ConsumptionSnapshot {
  const foods = new Map(input.catalogFoods.map((food) => [food.id, food]));
  const sources = new Map<string, Source>();
  const limitations: Ai['Limitation'][] = [];
  const resultComponents = input.components.map((component) =>
    componentResult(component, foods, sources, limitations));
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
  const knownNutrients = nutrientKeys.some((key) => totals[key] !== null);
  const complete = resultComponents.every((component) => nutrientKeys.every((key) => component.nutrients[key] !== null));
  const snapshot: ConsumptionSnapshot = {
    contractVersion: '2.0.0',
    operationId: input.operationId,
    inputKind: 'manual',
    supportStatus: complete ? 'complete' : knownNutrients ? 'partial' : 'unrecognized',
    overallAttention: 'insufficient_information',
    profileVersion: input.profileVersion,
    catalogVersion: input.catalogVersion,
    nutritionDatasetVersion: input.nutritionDatasetVersion,
    ruleSetVersion: input.ruleSetVersion,
    computedAt: input.computedAt,
    components: resultComponents,
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
