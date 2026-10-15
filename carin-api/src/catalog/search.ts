import { randomUUID } from 'node:crypto';
import { and, asc, eq, gt, inArray, lte, or, sql } from 'drizzle-orm';
import type { components } from '../contracts/generated/ai-service.js';
import type { Database } from '../db/client.js';
import { catalogCondition, catalogFood, catalogSearchCursor, catalogServing, catalogVersion } from '../db/schema/index.js';
import { CatalogImportError } from './errors.js';

type Schemas = components['schemas'];
export type FoodSearch = { userId: string; q?: string; version?: string; cursor?: string; limit?: number };

type CursorPosition = { displayName: string; foodId: string };

function normalizedQuery(query?: string): string {
  return query?.trim().toLocaleLowerCase('en-US') ?? '';
}

function numeric(value: string | null): number | null {
  if (value === null) return null;
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error('Catalog numeric value is invalid');
  return result;
}

function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, '\\$&')}%`;
}

function foodMatchesQuery(query: string) {
  const pattern = likePattern(query);
  return or(
    sql`${catalogFood.displayName} ILIKE ${pattern} ESCAPE E'\\\\'`,
    sql`EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(${catalogFood.aliases}) AS alias(value)
      WHERE alias.value ILIKE ${pattern} ESCAPE E'\\\\'
    )`,
  );
}

function toFood(row: typeof catalogFood.$inferSelect, servingRows: Array<typeof catalogServing.$inferSelect>): Schemas['CatalogFood'] {
  return {
    id: row.id,
    catalogVersion: row.version,
    displayName: row.displayName,
    aliases: row.aliases,
    preparation: row.preparation,
    per100g: {
      energyKcal: numeric(row.energyKcal),
      carbohydrateG: numeric(row.carbohydrateG),
      proteinG: numeric(row.proteinG),
      fatG: numeric(row.fatG),
      fiberG: numeric(row.fiberG),
      sugarsG: numeric(row.sugarsG),
      sodiumMg: numeric(row.sodiumMg),
    },
    servings: servingRows.map((serving) => {
      const refs = serving.sourceRefs as { sourceId?: unknown } | null;
      const grams = Number(serving.grams);
      if (!refs || typeof refs.sourceId !== 'string' || !Number.isFinite(grams) || grams <= 0) {
        throw new Error('Catalog serving provenance is invalid');
      }
      return { id: serving.id, label: serving.label, grams, sourceId: refs.sourceId };
    }),
    sources: row.sourceRefs as Schemas['Source'][],
    nutrientSourceIds: row.nutrientSourceIds as Schemas['NutrientSources'],
  };
}

async function findVersion(db: Database, requested?: string): Promise<string | null> {
  if (requested !== undefined) {
    if (requested === 'unavailable') throw new CatalogImportError('CATALOG_VERSION_UNAVAILABLE', 'Requested catalog version is unavailable.');
    const found = await db.select({ version: catalogVersion.version }).from(catalogVersion).where(eq(catalogVersion.version, requested)).limit(1);
    if (!found[0]) throw new CatalogImportError('CATALOG_VERSION_UNAVAILABLE', 'Requested catalog version is unavailable.');
    return requested;
  }
  const current = await db.select({ version: catalogVersion.version }).from(catalogVersion).where(eq(catalogVersion.isCurrent, true)).limit(1);
  return current[0]?.version ?? null;
}

async function findCursorPosition(
  db: Database,
  request: FoodSearch,
  query: string,
  limit: number,
): Promise<{ version: string; position: CursorPosition } | null> {
  if (!request.cursor) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.cursor)) {
    throw new Error('INVALID_CATALOG_CURSOR');
  }
  const found = await db.select().from(catalogSearchCursor).where(and(
    eq(catalogSearchCursor.id, request.cursor),
    eq(catalogSearchCursor.userId, request.userId),
    gt(catalogSearchCursor.expiresAt, new Date()),
  )).limit(1);
  const saved = found[0];
  if (
    !saved || saved.query !== query || saved.limit !== limit ||
    (request.version !== undefined && request.version !== saved.catalogVersion)
  ) {
    throw new Error('INVALID_CATALOG_CURSOR');
  }
  return { version: saved.catalogVersion, position: { displayName: saved.afterDisplayName, foodId: saved.afterFoodId } };
}

export async function searchFoods(db: Database, request: FoodSearch): Promise<Schemas['CatalogPage']> {
  const limit = request.limit ?? 30;
  const query = normalizedQuery(request.q);
  const cursor = await findCursorPosition(db, request, query, limit);
  const version = cursor?.version ?? await findVersion(db, request.version);
  if (version === null) return { catalogVersion: 'unavailable', items: [], nextCursor: null };

  const conditions = [eq(catalogFood.version, version)];
  if (query) conditions.push(foodMatchesQuery(query)!);
  if (cursor) {
    conditions.push(or(
      gt(catalogFood.displayName, cursor.position.displayName),
      and(eq(catalogFood.displayName, cursor.position.displayName), gt(catalogFood.id, cursor.position.foodId)),
    )!);
  }
  const rows = await db.select().from(catalogFood).where(and(...conditions))
    .orderBy(asc(catalogFood.displayName), asc(catalogFood.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const servingRows = pageRows.length === 0
    ? []
    : await db.select().from(catalogServing).where(and(
        eq(catalogServing.catalogVersion, version),
        inArray(catalogServing.foodId, pageRows.map((row) => row.id)),
      ));
  const servingsByFood = new Map<string, Array<typeof catalogServing.$inferSelect>>();
  for (const serving of servingRows) {
    const list = servingsByFood.get(serving.foodId) ?? [];
    list.push(serving);
    servingsByFood.set(serving.foodId, list);
  }

  let nextCursor: string | null = null;
  if (hasMore) {
    const last = pageRows.at(-1);
    if (!last) throw new Error('Catalog pagination boundary is missing');
    const now = new Date();
    await db.delete(catalogSearchCursor).where(lte(catalogSearchCursor.expiresAt, now));
    nextCursor = randomUUID();
    await db.insert(catalogSearchCursor).values({
      id: nextCursor,
      userId: request.userId,
      catalogVersion: version,
      query,
      limit,
      afterDisplayName: last.displayName,
      afterFoodId: last.id,
      expiresAt: new Date(now.getTime() + 15 * 60_000),
    });
  }
  return {
    catalogVersion: version,
    items: pageRows.map((row) => toFood(row, servingsByFood.get(row.id) ?? [])),
    nextCursor,
  };
}

export async function searchConditions(db: Database, query?: string): Promise<Schemas['Condition'][]> {
  const version = await findVersion(db);
  if (version === null) return [];
  const normalized = normalizedQuery(query);
  const rows = await db.select({ condition: catalogCondition.condition }).from(catalogCondition)
    .where(normalized
      ? and(eq(catalogCondition.catalogVersion, version), sql`${catalogCondition.displayName} ILIKE ${likePattern(normalized)} ESCAPE E'\\\\'`)
      : eq(catalogCondition.catalogVersion, version))
    .orderBy(asc(catalogCondition.displayName), asc(catalogCondition.conditionId));
  return rows.map((row) => row.condition as Schemas['Condition']);
}
