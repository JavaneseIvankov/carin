import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { components } from '../../src/contracts/generated/ai-service.js';
import { createApp } from '../../src/app.js';
import { createDatabase } from '../../src/db/client.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { catalogVersion } from '../../src/db/schema/index.js';
import type { AiClient } from '../../src/integrations/ai/index.js';
import { importCatalog } from '../../src/catalog/importer.js';

type Schemas = components['schemas'];
type CatalogFood = Schemas['CatalogFood'];
const containerName = `carin-t14-test-${randomUUID()}`;
const userId = randomUUID();
const otherUserId = randomUUID();
let pool: Pool;
let app: ReturnType<typeof createApp>;
let containerStarted = false;

function food(version: string, id: string, displayName: string, preparation: string | null, alias: string, calories: number): CatalogFood {
  const nutritionId = `${id}-nutrition-source`;
  const portionId = `${id}-portion-source`;
  return {
    id,
    catalogVersion: version,
    displayName,
    aliases: [alias],
    preparation,
    per100g: { energyKcal: calories, carbohydrateG: null, proteinG: null, fatG: null, fiberG: null, sugarsG: null, sodiumMg: null },
    servings: [{ id: `${id}-serving`, label: 'synthetic test serving', grams: 25, sourceId: portionId }],
    sources: [
      { id: nutritionId, kind: 'synthetic', title: 'Synthetic test nutrient source', datasetVersion: `synthetic-nutrition-${version}`, itemRef: `${id} per 100 g`, url: 'https://fixtures.carin.invalid/nutrition/test' },
      { id: portionId, kind: 'synthetic', title: 'Synthetic test portion source', datasetVersion: `synthetic-nutrition-${version}`, itemRef: `${id} serving`, url: 'https://fixtures.carin.invalid/portion/test' },
    ],
    nutrientSourceIds: { energyKcal: nutritionId, carbohydrateG: null, proteinG: null, fatG: null, fiberG: null, sugarsG: null, sodiumMg: null },
  };
}

function ai(version: string, foods: CatalogFood[], supported = false): Pick<AiClient, 'getCapabilities' | 'getCatalog'> {
  const manifest: Schemas['CapabilityManifest'] = {
    contractVersion: '1.0.0',
    catalogVersion: version,
    nutritionDatasetVersion: `synthetic-nutrition-${version}`,
    ruleSetVersion: `synthetic-rules-${version}`,
    conditions: [{
      id: 'condition-candidate-test',
      displayName: 'Synthetic condition candidate',
      personalizationSupported: supported,
      requiredProfileFields: [],
      requiredNutrients: [],
      supportedAgeMinimum: null,
      supportedAgeMaximum: null,
    }],
    supportedPhotoFoodIds: [],
    nutrients: ['energyKcal'],
    dataMode: 'synthetic',
    publishedAt: '2026-10-14T00:00:00Z',
  };
  return {
    getCapabilities: async () => manifest,
    getCatalog: async (input) => ({
      catalogVersion: version,
      items: input.cursor ? foods.slice(2) : foods.slice(0, 2),
      nextCursor: input.cursor || foods.length <= 2 ? null : 'page-2',
    }),
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

const versionOne = 'synthetic-catalog-test-1';
const versionOneFoods = [
  food(versionOne, 'food-ayam-goreng', 'Ayam', 'Goreng', 'ayam goreng', 100),
  food(versionOne, 'food-ayam-rebus', 'Ayam', 'Rebus', 'ayam rebus', 120),
  food(versionOne, 'food-nasi', 'Nasi', null, 'nasi putih', 80),
];

beforeAll(async () => {
  execFileSync('docker', [
    'run', '-d', '--rm', '--name', containerName,
    '-e', `POSTGRES_PASSWORD=${randomUUID()}`,
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
    '-p', '127.0.0.1::5432',
    'postgres:18.3-alpine@sha256:54451ecb8ab38c24c3ec123f2fd501303a3a1856a5c66e98cecf2460d5e1e9d7',
  ], { stdio: 'pipe' });
  containerStarted = true;
  const port = execFileSync('docker', ['port', containerName, '5432/tcp'], { encoding: 'utf8' }).trim().split(':').at(-1);
  pool = new Pool({ connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres`, connectionTimeoutMillis: 1000 });
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  await applyMigrations(pool);
  for (const id of [userId, otherUserId]) {
    await pool.query(
      `INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at,birth_date,accepted_terms_version,accepted_privacy_version,accepted_at)
       VALUES ($1,'Synthetic catalog tester',$2,true,now(),now(),'1995-01-01','test-v1','test-v1',now())`,
      [id, `${id}@example.invalid`],
    );
  }
  const db = createDatabase(pool);
  app = createApp({
    readiness: async () => true,
    catalog: {
      db,
      resolveSession: async (request) => request.headers.get('x-test-session') === 'allowed'
        ? { userId: request.headers.get('x-test-user') ?? userId, sessionId: randomUUID(), emailVerified: true }
        : null,
    },
  });
}, 120_000);

afterAll(async () => {
  await pool?.end();
  if (containerStarted) execFileSync('docker', ['rm', '-f', containerName], { stdio: 'pipe' });
});

describe('versioned catalog persistence and search', () => {
  it('returns an explicit empty unavailable catalog before the first import', async () => {
    const response = await app.request('/api/v1/catalog/foods', { headers: { 'x-test-session': 'allowed' } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ catalogVersion: 'unavailable', items: [], nextCursor: null });
    expect(await (await app.request('/api/v1/catalog/conditions', { headers: { 'x-test-session': 'allowed' } })).json()).toEqual([]);
  });

  it('requires a verified session for food and condition search', async () => {
    expect((await app.request('/api/v1/catalog/foods')).status).toBe(401);
    expect((await app.request('/api/v1/catalog/conditions')).status).toBe(401);
  });

  it('imports every page atomically and preserves source-backed serving and nutrient data', async () => {
    const db = createDatabase(pool);
    const imported = await importCatalog(db, ai(versionOne, versionOneFoods));
    expect(imported).toMatchObject({ version: versionOne, foodCount: 3 });
    expect(await importCatalog(db, ai(versionOne, versionOneFoods))).toEqual(imported);
    await expect(pool.query('UPDATE catalog_version SET digest=$2 WHERE version=$1', [versionOne, 'changed-digest']))
      .rejects.toMatchObject({ code: '23514' });
    await expect(pool.query('DELETE FROM catalog_version WHERE version=$1', [versionOne]))
      .rejects.toMatchObject({ code: '23514' });
    await expect(pool.query('UPDATE catalog_version SET activation_generation=99 WHERE version=$1', [versionOne]))
      .rejects.toMatchObject({ code: '23514' });
    await expect(pool.query('UPDATE catalog_condition SET display_name=$2 WHERE catalog_version=$1', [versionOne, 'Changed candidate']))
      .rejects.toMatchObject({ code: '23514' });
    await expect(pool.query('DELETE FROM catalog_condition WHERE catalog_version=$1', [versionOne]))
      .rejects.toMatchObject({ code: '23514' });
    const response = await app.request('/api/v1/catalog/foods?q=ayam&limit=10', { headers: { 'x-test-session': 'allowed' } });
    const page = await response.json() as Schemas['CatalogPage'];
    expect(response.status).toBe(200);
    expect(page.catalogVersion).toBe(versionOne);
    expect(page.items).toHaveLength(2);
    for (const item of page.items) {
      const serving = item.servings[0]!;
      expect(item.sources.some((source) => source.id === serving.sourceId)).toBe(true);
      expect(item.sources.some((source) => source.id === item.nutrientSourceIds.energyKcal)).toBe(true);
      expect(item.preparation).toMatch(/Goreng|Rebus/);
    }
  });

  it('paginates stable food order and binds cursors to query and catalog version', async () => {
    const headers = { 'x-test-session': 'allowed' };
    const firstResponse = await app.request('/api/v1/catalog/foods?q=ayam&limit=1', { headers });
    const first = await firstResponse.json() as Schemas['CatalogPage'];
    expect(first.items.map((item) => item.id)).toEqual(['food-ayam-goreng']);
    expect(first.nextCursor).toBeTruthy();
    expect(first.nextCursor).toMatch(/^[0-9a-f-]{36}$/i);
    const nextResponse = await app.request(`/api/v1/catalog/foods?q=ayam&limit=1&cursor=${encodeURIComponent(first.nextCursor!)}`, { headers });
    const next = await nextResponse.json() as Schemas['CatalogPage'];
    expect(next.items.map((item) => item.id)).toEqual(['food-ayam-rebus']);
    expect(next.nextCursor).toBeNull();
    const wrongFilter = await app.request(`/api/v1/catalog/foods?q=nasi&cursor=${encodeURIComponent(first.nextCursor!)}`, { headers });
    expect(wrongFilter.status).toBe(400);
    const wrongOwner = await app.request(`/api/v1/catalog/foods?q=ayam&limit=1&cursor=${encodeURIComponent(first.nextCursor!)}`, {
      headers: { ...headers, 'x-test-user': otherUserId },
    });
    expect(wrongOwner.status).toBe(400);
  });

  it('searches food aliases while retaining the canonical display name', async () => {
    const response = await app.request('/api/v1/catalog/foods?q=nasi putih', { headers: { 'x-test-session': 'allowed' } });
    const page = await response.json() as Schemas['CatalogPage'];
    expect(response.status).toBe(200);
    expect(page.items.map((item) => [item.id, item.displayName, item.aliases])).toEqual([
      ['food-nasi', 'Nasi', ['nasi putih']],
    ]);
  });

  it('returns candidate conditions with their declared support flag and no derived rules', async () => {
    const response = await app.request('/api/v1/catalog/conditions?q=candidate', { headers: { 'x-test-session': 'allowed' } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{
      id: 'condition-candidate-test',
      displayName: 'Synthetic condition candidate',
      personalizationSupported: false,
      requiredProfileFields: [],
      requiredNutrients: [],
      supportedAgeMinimum: null,
      supportedAgeMaximum: null,
    }]);
  });

  it('keeps old versions addressable and refuses an unavailable explicit version', async () => {
    const initial = await app.request('/api/v1/catalog/foods?q=ayam&limit=1', { headers: { 'x-test-session': 'allowed' } });
    const firstPage = await initial.json() as Schemas['CatalogPage'];
    const versionTwo = 'synthetic-catalog-test-2';
    await importCatalog(createDatabase(pool), ai(versionTwo, [food(versionTwo, 'food-ayam-bakar', 'Ayam', 'Bakar', 'ayam bakar', 90)]));
    const cursorPage = await app.request(`/api/v1/catalog/foods?q=ayam&limit=1&cursor=${encodeURIComponent(firstPage.nextCursor!)}`, { headers: { 'x-test-session': 'allowed' } });
    const cursorResult = await cursorPage.json() as Schemas['CatalogPage'];
    expect(cursorResult.catalogVersion).toBe(versionOne);
    expect(cursorResult.items[0]?.id).toBe('food-ayam-rebus');
    const oldResponse = await app.request(`/api/v1/catalog/foods?version=${versionOne}&q=ayam`, { headers: { 'x-test-session': 'allowed' } });
    expect((await oldResponse.json() as Schemas['CatalogPage']).items.map((item) => item.id)).toEqual(['food-ayam-goreng', 'food-ayam-rebus']);
    await expect(pool.query('UPDATE catalog_version SET is_current=true WHERE version=$1', [versionOne]))
      .rejects.toMatchObject({ code: '23514' });
    const missing = await app.request('/api/v1/catalog/foods?version=synthetic-catalog-missing', { headers: { 'x-test-session': 'allowed' } });
    expect(missing.status).toBe(409);
    expect(await missing.json()).toMatchObject({ error: { code: 'CATALOG_VERSION_UNAVAILABLE' } });
    const versions = await createDatabase(pool).select().from(catalogVersion);
    expect(versions).toHaveLength(2);
    expect(versions.filter((version) => version.isCurrent).map((version) => version.version)).toEqual([versionTwo]);
    expect(Object.fromEntries(versions.map((version) => [version.version, version.activationGeneration]))).toEqual({
      [versionOne]: 1,
      [versionTwo]: 2,
    });
  });

  it('does not let an older overlapping sync replace a catalog activated while it was fetching', async () => {
    const stalePageStarted = deferred();
    const releaseStalePage = deferred();
    const staleAi = ai(versionOne, versionOneFoods);
    const delayedStaleAi: Pick<AiClient, 'getCapabilities' | 'getCatalog'> = {
      getCapabilities: staleAi.getCapabilities,
      getCatalog: async (input) => {
        if (!input.cursor) {
          stalePageStarted.resolve();
          await releaseStalePage.promise;
        }
        return staleAi.getCatalog(input);
      },
    };
    const staleImport = importCatalog(createDatabase(pool), delayedStaleAi);
    await stalePageStarted.promise;

    const newerVersion = 'synthetic-catalog-test-3';
    await importCatalog(createDatabase(pool), ai(newerVersion, [
      food(newerVersion, 'food-ayam-tumis', 'Ayam', 'Tumis', 'ayam tumis', 110),
    ]));

    releaseStalePage.resolve();
    await expect(staleImport).rejects.toMatchObject({ code: 'CATALOG_ACTIVATION_CONFLICT' });
    const current = await pool.query('SELECT version FROM catalog_version WHERE is_current=true');
    expect(current.rows).toEqual([{ version: newerVersion }]);
    const staleVersion = await pool.query('SELECT activation_generation FROM catalog_version WHERE version=$1', [versionOne]);
    expect(staleVersion.rows).toEqual([{ activation_generation: 1 }]);
  });

  it('rejects a bad import without changing the active snapshot', async () => {
    const invalid = food('synthetic-catalog-invalid', 'bad-food', 'Bad food', null, 'bad', 50);
    invalid.servings[0]!.sourceId = 'absent-source';
    await expect(importCatalog(createDatabase(pool), ai('synthetic-catalog-invalid', [invalid]))).rejects.toMatchObject({ code: 'INVALID_CATALOG' });
    const current = await pool.query('SELECT version FROM catalog_version WHERE is_current=true');
    expect(current.rows).toEqual([{ version: 'synthetic-catalog-test-3' }]);
  });

  it('does not replace rows when an imported version is replayed with different contents', async () => {
    const conflicting = [food(versionOne, 'food-ayam-goreng', 'Changed name', 'Goreng', 'changed', 999)];
    await expect(importCatalog(createDatabase(pool), ai(versionOne, conflicting))).rejects.toMatchObject({ code: 'CATALOG_VERSION_CONFLICT' });
    const response = await app.request(`/api/v1/catalog/foods?version=${versionOne}&q=ayam goreng`, { headers: { 'x-test-session': 'allowed' } });
    expect((await response.json() as Schemas['CatalogPage']).items[0]?.displayName).toBe('Ayam');
  });
});
