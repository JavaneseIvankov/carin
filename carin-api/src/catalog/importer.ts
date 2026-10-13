import { createHash } from 'node:crypto';
import type { components } from '../contracts/generated/ai-service.js';
import { validateSchema } from '../contracts/validation.js';
import type { AiClient } from '../integrations/ai/index.js';
import { CatalogImportError } from './errors.js';
import { persistCatalogSnapshot } from './repository.js';

export { CatalogImportError } from './errors.js';

type Schemas = components['schemas'];
export type CatalogSnapshot = {
  manifest: Schemas['CapabilityManifest'];
  foods: Schemas['CatalogFood'][];
  digest: string;
};
const nutrientKeys: Array<keyof Schemas['NutrientSources']> = [
  'energyKcal',
  'carbohydrateG',
  'proteinG',
  'fatG',
  'fiberG',
  'sugarsG',
  'sodiumMg',
];
const maximumCatalogPages = 10_000;

function invalidCatalog(): never {
  throw new CatalogImportError('INVALID_CATALOG', 'AI catalog snapshot failed validation.');
}

function validateFood(food: Schemas['CatalogFood'], version: string, dataMode: Schemas['CapabilityManifest']['dataMode']): void {
  if (food.catalogVersion !== version || food.id.trim() !== food.id || !food.id || !food.displayName.trim()) {
    invalidCatalog();
  }
  const sourceById = new Map(food.sources.map((source) => [source.id, source]));
  if (
    sourceById.size !== food.sources.length || food.sources.some((source) =>
      !source.id.trim() || (dataMode === 'synthetic' ? source.kind !== 'synthetic' : source.kind === 'synthetic'),
    )
  ) {
    invalidCatalog();
  }
  const servingIds = new Set<string>();
  for (const serving of food.servings) {
    const source = sourceById.get(serving.sourceId);
    if (
      servingIds.has(serving.id) || !serving.id.trim() || !serving.label.trim() ||
      !Number.isFinite(serving.grams) || serving.grams <= 0 ||
      !source || (source.kind !== 'portion' && source.kind !== 'synthetic')
    ) {
      invalidCatalog();
    }
    servingIds.add(serving.id);
  }
  for (const key of nutrientKeys) {
    const sourceId = food.nutrientSourceIds[key];
    const value = food.per100g[key];
    if ((value === null) !== (sourceId === null)) invalidCatalog();
    if (sourceId !== null) {
      const source = sourceById.get(sourceId);
      if (!source || (source.kind !== 'nutrition' && source.kind !== 'synthetic')) {
        invalidCatalog();
      }
    }
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function loadCatalogSnapshot(
  ai: Pick<AiClient, 'getCapabilities' | 'getCatalog'>,
): Promise<CatalogSnapshot> {
  let manifest: Schemas['CapabilityManifest'];
  try {
    manifest = await ai.getCapabilities();
    validateSchema('ai.CapabilityManifest', manifest);
  } catch {
    invalidCatalog();
  }
  const conditionIds = new Set<string>();
  for (const condition of manifest.conditions) {
    if (conditionIds.has(condition.id)) invalidCatalog();
    conditionIds.add(condition.id);
  }

  const foods: Schemas['CatalogFood'][] = [];
  const foodIds = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  for (let pageNumber = 0; pageNumber < maximumCatalogPages; pageNumber++) {
    if (cursor !== undefined) {
      if (cursors.has(cursor)) invalidCatalog();
      cursors.add(cursor);
    }
    let page: Schemas['CatalogPage'];
    try {
      page = await ai.getCatalog({ version: manifest.catalogVersion, ...(cursor === undefined ? {} : { cursor }), limit: 200 });
      validateSchema('ai.CatalogPage', page);
    } catch {
      invalidCatalog();
    }
    if (page.catalogVersion !== manifest.catalogVersion) invalidCatalog();
    for (const item of page.items) {
      try {
        validateSchema('ai.CatalogFood', item);
      } catch {
        invalidCatalog();
      }
      validateFood(item, manifest.catalogVersion, manifest.dataMode);
      if (foodIds.has(item.id)) invalidCatalog();
      foodIds.add(item.id);
      foods.push(item);
    }
    if (page.nextCursor === null) {
      const canonical = canonicalJson({
        manifest,
        foods: [...foods].sort((a, b) => a.id.localeCompare(b.id)),
      });
      const digest = createHash('sha256').update(canonical).digest('hex');
      return { manifest, foods, digest };
    }
    if (cursors.has(page.nextCursor)) invalidCatalog();
    cursor = page.nextCursor;
  }
  invalidCatalog();
}

export async function importCatalog(
  db: import('../db/client.js').Database,
  ai: Pick<AiClient, 'getCapabilities' | 'getCatalog'>,
): Promise<{ version: string; foodCount: number; digest: string }> {
  const snapshot = await loadCatalogSnapshot(ai);
  await persistCatalogSnapshot(db, snapshot);
  return {
    version: snapshot.manifest.catalogVersion,
    foodCount: snapshot.foods.length,
    digest: snapshot.digest,
  };
}
