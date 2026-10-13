export const NUTRIENT_KEYS = [
  'energyKcal',
  'carbohydrateG',
  'proteinG',
  'fatG',
  'fiberG',
  'sugarsG',
  'sodiumMg',
] as const;

export type NutrientKey = (typeof NUTRIENT_KEYS)[number];
export type Nutrients = Record<NutrientKey, number | null>;
export type PortionInput = {
  quantity: number | null;
  unit: 'g' | 'serving' | null;
  servingGrams: number | null;
};
export type NutrientCoverage = Record<
  NutrientKey,
  { knownComponentCount: number; totalComponentCount: number }
>;

function roundToSixDecimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function requirePositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be finite and positive`);
}

function roundPositiveGrams(value: number): number {
  const grams = roundToSixDecimals(value);
  if (!Number.isFinite(grams) || grams <= 0) {
    throw new RangeError('Portion grams must be representable as a positive six-decimal value');
  }
  return grams;
}

export function calculatePortionGrams(portion: PortionInput): number | null {
  const { quantity, unit, servingGrams } = portion;
  if (quantity === null || unit === null) return null;
  requirePositiveFinite(quantity, 'Quantity');

  if (unit === 'g') return roundPositiveGrams(quantity);
  if (servingGrams === null) return null;
  requirePositiveFinite(servingGrams, 'Serving grams');
  return roundPositiveGrams(quantity * servingGrams);
}

export function scaleNutrients(per100g: Nutrients, edibleGrams: number | null): Nutrients {
  if (edibleGrams !== null) requirePositiveFinite(edibleGrams, 'Edible grams');
  const result = {} as Nutrients;
  for (const key of NUTRIENT_KEYS) {
    const source = per100g[key];
    if (source !== null && (!Number.isFinite(source) || source < 0)) {
      throw new RangeError(`${key} must be null or a finite non-negative number`);
    }
    result[key] = source === null || edibleGrams === null
      ? null
      : roundToSixDecimals(source * edibleGrams / 100);
  }
  return result;
}

export function aggregateNutrients(components: readonly Nutrients[]): {
  totals: Nutrients;
  coverage: NutrientCoverage;
} {
  const totals = {} as Nutrients;
  const coverage = {} as NutrientCoverage;

  for (const key of NUTRIENT_KEYS) {
    let knownComponentCount = 0;
    let sum = 0;
    for (const component of components) {
      const value = component[key];
      if (value === null) continue;
      if (!Number.isFinite(value) || value < 0) {
        throw new RangeError(`${key} must be null or a finite non-negative number`);
      }
      knownComponentCount += 1;
      sum += value;
    }
    totals[key] = knownComponentCount === 0 ? null : roundToSixDecimals(sum);
    coverage[key] = { knownComponentCount, totalComponentCount: components.length };
  }
  return { totals, coverage };
}
