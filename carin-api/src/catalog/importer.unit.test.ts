import type { components } from '../contracts/generated/ai-service.js';
import { AiAdapterError } from '../integrations/ai/index.js';
import { describe, expect, it } from 'vitest';
import { CatalogImportError, loadCatalogSnapshot } from './importer.js';

type Schemas = components['schemas'];
type CatalogFood = Schemas['CatalogFood'];

const manifest: Schemas['CapabilityManifest'] = {
  contractVersion: '1.0.0',
  catalogVersion: 'synthetic-catalog-test-1',
  nutritionDatasetVersion: 'synthetic-nutrition-test-1',
  ruleSetVersion: 'synthetic-rules-test-1',
  conditions: [],
  supportedPhotoFoodIds: [],
  nutrients: ['energyKcal'],
  dataMode: 'synthetic',
  publishedAt: '2026-10-14T00:00:00Z',
};

function food(id: string, displayName = id): CatalogFood {
  return {
    id,
    catalogVersion: manifest.catalogVersion,
    displayName,
    aliases: [],
    preparation: null,
    per100g: {
      energyKcal: 50,
      carbohydrateG: null,
      proteinG: null,
      fatG: null,
      fiberG: null,
      sugarsG: null,
      sodiumMg: null,
    },
    servings: [{ id: `${id}-serving`, label: 'synthetic test serving', grams: 25, sourceId: 'portion-source' }],
    sources: [
      { id: 'nutrition-source', kind: 'synthetic', title: 'Synthetic test nutrient', datasetVersion: manifest.nutritionDatasetVersion, itemRef: `${id} per 100 g`, url: null },
      { id: 'portion-source', kind: 'synthetic', title: 'Synthetic test serving', datasetVersion: manifest.nutritionDatasetVersion, itemRef: `${id} serving`, url: null },
    ],
    nutrientSourceIds: {
      energyKcal: 'nutrition-source',
      carbohydrateG: null,
      proteinG: null,
      fatG: null,
      fiberG: null,
      sugarsG: null,
      sodiumMg: null,
    },
  };
}

function client(pages: Schemas['CatalogPage'][]) {
  const calls: Array<{ version: string; cursor?: string; limit?: number }> = [];
  return {
    calls,
    api: {
      getCapabilities: async () => manifest,
      getCatalog: async (input: { version: string; cursor?: string; limit?: number }) => {
        calls.push(input);
        return pages[calls.length - 1] ?? { catalogVersion: input.version, items: [], nextCursor: null };
      },
    },
  };
}

describe('catalog snapshot import input', () => {
  it('preserves typed AI timeout failures while fetching the capability manifest', async () => {
    const failure = new AiAdapterError('TIMEOUT', 'AI request timed out.', true);
    const api = {
      getCapabilities: async () => { throw failure; },
      getCatalog: async () => ({ catalogVersion: manifest.catalogVersion, items: [], nextCursor: null }),
    };

    await expect(loadCatalogSnapshot(api)).rejects.toBe(failure);
  });

  it('preserves typed AI service failures while fetching catalog pages', async () => {
    const failure = new AiAdapterError('SERVICE_UNAVAILABLE', 'AI service unavailable.', true);
    const api = {
      getCapabilities: async () => manifest,
      getCatalog: async () => { throw failure; },
    };

    await expect(loadCatalogSnapshot(api)).rejects.toBe(failure);
  });

  it('maps response schema validation failures to INVALID_CATALOG', async () => {
    const api = {
      getCapabilities: async () => ({ ...manifest, catalogVersion: 42 }) as unknown as Schemas['CapabilityManifest'],
      getCatalog: async () => ({ catalogVersion: manifest.catalogVersion, items: [], nextCursor: null }),
    };

    await expect(loadCatalogSnapshot(api)).rejects.toMatchObject({ code: 'INVALID_CATALOG' });
  });

  it('fetches every page for the manifest version in order', async () => {
    const source = client([
      { catalogVersion: manifest.catalogVersion, items: [food('food-a', 'A')], nextCursor: 'page-2' },
      { catalogVersion: manifest.catalogVersion, items: [food('food-b', 'B')], nextCursor: null },
    ]);

    const snapshot = await loadCatalogSnapshot(source.api);

    expect(source.calls).toEqual([
      { version: manifest.catalogVersion, limit: 200 },
      { version: manifest.catalogVersion, cursor: 'page-2', limit: 200 },
    ]);
    expect(snapshot.foods.map((item) => item.id)).toEqual(['food-a', 'food-b']);
  });

  it('rejects a repeated pagination cursor instead of looping or activating partial data', async () => {
    const repeated = { catalogVersion: manifest.catalogVersion, items: [food('food-a')], nextCursor: 'same' };
    const source = client([
      { ...repeated, nextCursor: 'same' },
      repeated,
    ]);

    await expect(loadCatalogSnapshot(source.api)).rejects.toMatchObject<Partial<CatalogImportError>>({
      code: 'INVALID_CATALOG',
    });
  });

  it('rejects page and item catalog versions that differ from the manifest', async () => {
    const wrongVersion = { ...food('food-a'), catalogVersion: 'synthetic-catalog-other' };
    const source = client([
      { catalogVersion: manifest.catalogVersion, items: [wrongVersion], nextCursor: null },
    ]);

    await expect(loadCatalogSnapshot(source.api)).rejects.toMatchObject({ code: 'INVALID_CATALOG' });
  });

  it('rejects a serving whose source ID is absent from the food sources', async () => {
    const invalid = food('food-a');
    invalid.servings[0]!.sourceId = 'missing-source';
    const source = client([
      { catalogVersion: manifest.catalogVersion, items: [invalid], nextCursor: null },
    ]);

    await expect(loadCatalogSnapshot(source.api)).rejects.toMatchObject({ code: 'INVALID_CATALOG' });
  });

  it('rejects nutrient values without a source reference', async () => {
    const invalid = food('food-a');
    invalid.nutrientSourceIds.energyKcal = null;
    const source = client([
      { catalogVersion: manifest.catalogVersion, items: [invalid], nextCursor: null },
    ]);

    await expect(loadCatalogSnapshot(source.api)).rejects.toMatchObject({ code: 'INVALID_CATALOG' });
  });

  it('rejects synthetic manifests that contain a source not labeled synthetic', async () => {
    const invalid = food('food-a');
    invalid.sources[0]!.kind = 'nutrition';
    const source = client([
      { catalogVersion: manifest.catalogVersion, items: [invalid], nextCursor: null },
    ]);

    await expect(loadCatalogSnapshot(source.api)).rejects.toMatchObject({ code: 'INVALID_CATALOG' });
  });

  it('rejects duplicate food IDs across catalog pages', async () => {
    const source = client([
      { catalogVersion: manifest.catalogVersion, items: [food('food-a')], nextCursor: 'page-2' },
      { catalogVersion: manifest.catalogVersion, items: [food('food-a')], nextCursor: null },
    ]);

    await expect(loadCatalogSnapshot(source.api)).rejects.toMatchObject({ code: 'INVALID_CATALOG' });
  });
});
