import { describe, expect, it } from 'vitest';
import type { components } from '../../contracts/generated/ai-service.js';
import { buildConsumptionNutritionSnapshot, type ConsumptionCatalogFood } from './nutrition.js';

type Ai = components['schemas'];

const source: Ai['Source'] = {
  id: 'fixture-nutrition',
  kind: 'synthetic',
  title: 'Synthetic nutrition fixture',
  datasetVersion: 'fixture-nutrition-v1',
  itemRef: 'food-1/100g',
  url: null,
};

const component = (overrides: Partial<Ai['ComponentInput']> = {}): Ai['ComponentInput'] => ({
  id: '00000000-0000-4000-8000-000000000001',
  displayName: 'Rice',
  catalogFoodId: 'food-1',
  preparation: 'cooked',
  portion: { kind: 'known', quantity: 50, unit: 'g' },
  ...overrides,
});

const catalogFood: ConsumptionCatalogFood = {
  id: 'food-1',
  displayName: 'Rice',
  preparation: 'cooked',
  per100g: {
    energyKcal: 200,
    carbohydrateG: 30,
    proteinG: 10,
    fatG: 5,
    fiberG: 3,
    sugarsG: 2,
    sodiumMg: 100,
  },
  nutrientSourceIds: {
    energyKcal: 'fixture-nutrition',
    carbohydrateG: 'fixture-nutrition',
    proteinG: 'fixture-nutrition',
    fatG: 'fixture-nutrition',
    fiberG: 'fixture-nutrition',
    sugarsG: 'fixture-nutrition',
    sodiumMg: 'fixture-nutrition',
  },
  sourceRefs: [source],
  servings: [{ id: 'bowl-100g', grams: 100, sourceId: 'fixture-nutrition' }],
};

function build(components: Ai['ComponentInput'][], catalogFoods: ConsumptionCatalogFood[] = [catalogFood]) {
  return buildConsumptionNutritionSnapshot({
    operationId: '00000000-0000-4000-8000-000000000099',
    computedAt: '2026-10-14T00:00:00.000Z',
    profileVersion: 3,
    catalogVersion: 'fixture-catalog-v1',
    nutritionDatasetVersion: 'fixture-nutrition-v1',
    ruleSetVersion: 'fixture-rules-v1',
    dataMode: 'synthetic',
    components,
    catalogFoods,
  });
}

describe('deterministic consumption nutrition snapshot', () => {
  it('recomputes a half portion from exact catalog values and keeps per-nutrient coverage', () => {
    const result = build([component()]);

    expect(result.components[0]?.nutrients).toEqual({
      energyKcal: 100,
      carbohydrateG: 15,
      proteinG: 5,
      fatG: 2.5,
      fiberG: 1.5,
      sugarsG: 1,
      sodiumMg: 50,
    });
    expect(result.components[0]?.portion).toMatchObject({
      quantity: 50,
      unit: 'g',
      grams: 50,
      origin: 'user_reported',
    });
    expect(result.totals.energyKcal).toBe(100);
    expect(result.coverage.energyKcal).toEqual({ knownComponentCount: 1, totalComponentCount: 1 });
    expect(result.components[0]?.sourceIds).toEqual(['fixture-nutrition']);
  });

  it('scales a known serving by its versioned gram weight', () => {
    const result = build([component({ portion: { kind: 'known', quantity: 2, unit: 'serving', servingId: 'bowl-100g' } })]);

    expect(result.components[0]?.portion.grams).toBe(200);
    expect(result.components[0]?.portion.sourceId).toBe('fixture-nutrition');
    expect(result.components[0]?.nutrients.energyKcal).toBe(400);
  });

  it('preserves unmatched foods and unknown portions with null nutrition instead of zero', () => {
    const unknown = component({
      id: '00000000-0000-4000-8000-000000000002',
      portion: { kind: 'unknown' },
    });
    const unmatched = component({
      id: '00000000-0000-4000-8000-000000000003',
      displayName: 'Unmatched greens',
      catalogFoodId: null,
      preparation: null,
      portion: { kind: 'known', quantity: 10, unit: 'g' },
    });
    const result = build([unknown, unmatched]);

    expect(result.components.map(({ matchStatus }) => matchStatus)).toEqual(['matched', 'unmatched']);
    expect(result.components[0]?.nutrients.energyKcal).toBeNull();
    expect(result.components[1]?.nutrients.energyKcal).toBeNull();
    expect(result.totals.energyKcal).toBeNull();
    expect(result.coverage.energyKcal).toEqual({ knownComponentCount: 0, totalComponentCount: 2 });
    expect(result.limitations.map(({ code }) => code)).toContain('unknown_portion');
    expect(result.limitations.map(({ code }) => code)).toContain('unmatched_food');
  });

  it('leaves a missing nutrient null while retaining the known nutrients', () => {
    const catalogWithMissingSodium = {
      ...catalogFood,
      per100g: { ...catalogFood.per100g, sodiumMg: null },
    };
    const result = build([component()], [catalogWithMissingSodium]);

    expect(result.components[0]?.nutrients.energyKcal).toBe(100);
    expect(result.components[0]?.nutrients.sodiumMg).toBeNull();
    expect(result.totals.sodiumMg).toBeNull();
    expect(result.coverage.sodiumMg).toEqual({ knownComponentCount: 0, totalComponentCount: 1 });
  });

  it('uses the app-only unavailable mode for unmatched manual input with no catalog', () => {
    const result = buildConsumptionNutritionSnapshot({
      operationId: '00000000-0000-4000-8000-000000000099',
      computedAt: '2026-10-14T00:00:00.000Z',
      profileVersion: 0,
      catalogVersion: 'unavailable',
      nutritionDatasetVersion: 'unavailable',
      ruleSetVersion: 'unavailable',
      dataMode: 'unavailable',
      components: [component({ catalogFoodId: null, displayName: 'Unmatched greens', preparation: null })],
      catalogFoods: [],
    });

    expect(result.dataMode).toBe('unavailable');
    expect(result.components[0]?.matchStatus).toBe('unmatched');
    expect(result.components[0]?.nutrients.energyKcal).toBeNull();
    expect(result.totals.energyKcal).toBeNull();
    expect(result.limitations.map(({ code }) => code)).toContain('unmatched_food');
  });
});
