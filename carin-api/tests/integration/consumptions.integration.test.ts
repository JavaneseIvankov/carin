import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/db/client.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { createAiClient, AiAdapterError } from '../../src/integrations/ai/index.js';
import { claimNextJob, publishJobResult } from '../../src/jobs/repository.js';
import { runAnalysisWorkerOnce } from '../../src/jobs/worker.js';
import { getLegalRegistry } from '../../src/modules/legal/registry.js';
import type { components } from '../../src/contracts/generated/ai-service.js';
import type { components as AppComponents } from '../../src/contracts/generated/app-api.js';

const containerName = `carin-c21-consumptions-${randomUUID()}`;
const catalogVersion = 'synthetic-catalog-1';
const complete = fixture('complete');
const sample = complete.components[0]!;
let pool: Pool;
let database: ReturnType<typeof createDatabase>;
let containerStarted = false;

type Ai = components['schemas'];
type Owner = { userId: string; sessionId: string };
type ConsumptionCreate = AppComponents['schemas']['ConsumptionCreate'];
type ConsumptionUpdate = AppComponents['schemas']['ConsumptionUpdate'];

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
  pool = new Pool({ connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres`, connectionTimeoutMillis: 1_000 });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await pool.query('SELECT 1'); break; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  await applyMigrations(pool);
  await seedCatalog();
  database = createDatabase(pool);
}, 120_000);

afterAll(async () => {
  await pool?.end();
  if (containerStarted) execFileSync('docker', ['rm', '-f', containerName], { stdio: 'pipe' });
});

function fixture(name: 'complete' | 'correction'): Ai['AnalysisResult'] {
  return JSON.parse(readFileSync(new URL(`../../fixtures/ai/${name === 'complete' ? 'analysis-complete' : 'correction-complete'}.json`, import.meta.url), 'utf8')) as Ai['AnalysisResult'];
}

async function seedCatalog(): Promise<void> {
  const sources = complete.sources.filter((source) => sample.sourceIds.includes(source.id));
  const manifest: Ai['CapabilityManifest'] = {
    contractVersion: '1.0.0',
    catalogVersion,
    nutritionDatasetVersion: complete.nutritionDatasetVersion,
    ruleSetVersion: complete.ruleSetVersion,
    conditions: [{
      id: 'fixture-condition',
      displayName: 'Synthetic fixture condition',
      personalizationSupported: true,
      requiredProfileFields: [],
      requiredNutrients: [],
      supportedAgeMinimum: null,
      supportedAgeMaximum: null,
    }],
    supportedPhotoFoodIds: ['fixture-food-001'],
    supportedRules: [{
      ruleId: 'fixture-rule-001',
      conditionId: 'fixture-condition',
      sources: [complete.sources.find((source) => source.id === 'synthetic-rule')!],
    }],
    nutrients: ['energyKcal', 'carbohydrateG', 'proteinG', 'fatG', 'fiberG', 'sugarsG', 'sodiumMg'],
    dataMode: 'synthetic',
    publishedAt: complete.computedAt,
  };
  await pool.query(
    `INSERT INTO catalog_version (version,nutrition_dataset_version,rule_set_version,data_mode,published_at,digest,is_current)
     VALUES ($1,$2,$3,'synthetic',now(),'c21-test-digest',true)`,
    [catalogVersion, complete.nutritionDatasetVersion, complete.ruleSetVersion],
  );
  await pool.query(
    'INSERT INTO catalog_capability_manifest (catalog_version,manifest) VALUES ($1,$2)',
    [catalogVersion, JSON.stringify(manifest)],
  );
  for (const [foodId, displayName] of [
    ['fixture-food-001', sample.displayName],
    ['fixture-food-002', 'Makanan pengganti sintetis'],
    ['fixture-food-not-photo-supported', 'Makanan sintetis hanya untuk koreksi'],
  ] as const) {
    await pool.query(
      `INSERT INTO catalog_food
       (id,version,display_name,preparation,energy_kcal,carbohydrate_g,protein_g,fat_g,fiber_g,sugars_g,sodium_mg,source_refs,nutrient_source_ids)
       VALUES ($1,$2,$3,'Contoh uji',200,30,10,5,3,2,100,$4,$5)`,
      [foodId, catalogVersion, displayName, JSON.stringify(sources), JSON.stringify(sample.nutrientSourceIds)],
    );
    await pool.query(
      `INSERT INTO catalog_serving (id,catalog_version,food_id,label,grams,source_refs)
       VALUES ('fixture-serving-100g',$1,$2,'100 gram sintetis',100,'{"sourceId":"synthetic-nutrition"}')`,
      [catalogVersion, foodId],
    );
  }
}

async function createOwner(profile = true): Promise<Owner> {
  const userId = randomUUID();
  const sessionId = randomUUID();
  const legal = getLegalRegistry();
  await pool.query(
    `INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at,birth_date,accepted_terms_version,accepted_privacy_version,accepted_at)
     VALUES ($1,'C21 test',$2,true,now(),now(),'1995-01-01',$3,$4,now())`,
    [userId, `${userId}@example.invalid`, legal.terms.version, legal.privacy.version],
  );
  await pool.query(
    `INSERT INTO session (id,expires_at,token,created_at,updated_at,user_id)
     VALUES ($1,now()+interval '1 day',$2,now(),now(),$3)`,
    [sessionId, randomUUID(), userId],
  );
  await pool.query(
    `INSERT INTO consent_event (user_id,kind,version,granted) VALUES ($1,'ai_processing',$2,true)`,
    [userId, legal.aiProcessing.version],
  );
  if (profile) {
    await pool.query(
      `INSERT INTO health_profile (user_id,version,height_cm,weight_kg,diagnosis_state,conditions,family_history_state,family_history,allergy_state,allergies)
       VALUES ($1,1,'165','60','reported',$2,'not_provided','[]','not_provided','[]')`,
      [userId, JSON.stringify([{ conditionId: 'fixture-condition' }])],
    );
  }
  return { userId, sessionId };
}

function appFor(owner: Owner) {
  const resolveSession = async (request: Request) => request.headers.get('x-test-user') === owner.userId
    ? { userId: owner.userId, emailVerified: true, sessionId: owner.sessionId }
    : null;
  const resources = { db: database, resolveSession };
  return createApp({
    readiness: async () => true,
    analyses: resources,
    scans: resources,
    analysisJobs: resources,
    consumptions: resources,
  });
}

function headers(owner: Owner, key = randomUUID()): Headers {
  return new Headers({
    'content-type': 'application/json',
    'idempotency-key': key,
    'x-test-user': owner.userId,
  });
}

function component(overrides: Partial<Ai['ComponentInput']> = {}): Ai['ComponentInput'] {
  return {
    id: randomUUID(),
    displayName: sample.displayName,
    catalogFoodId: 'fixture-food-001',
    preparation: 'Contoh uji',
    portion: { kind: 'known', quantity: 0.5, unit: 'serving', servingId: 'fixture-serving-100g' },
    ...overrides,
  };
}

function manualBody(overrides: Partial<ConsumptionCreate> = {}): ConsumptionCreate {
  return {
    source: 'manual',
    scanId: null,
    sourceAnalysisResultId: null,
    occurrence: 'new_occurrence',
    consumedAt: new Date(Date.now() - 60_000).toISOString(),
    timezone: 'Asia/Jakarta',
    components: [component()],
    catalogVersion,
    ...overrides,
  };
}

async function postConsumption(owner: Owner, body: ConsumptionCreate, key = randomUUID(), app = appFor(owner)) {
  return app.request('/api/v1/consumptions', {
    method: 'POST',
    headers: headers(owner, key),
    body: JSON.stringify(body),
  });
}

async function runEvaluation(scenario: 'complete' | 'failure' = 'complete') {
  const config = loadConfig({ APP_ENV: 'dev', AI_MODE: 'fixture', DATABASE_URL: 'postgresql://postgres@localhost/carin' });
  const base = createAiClient(config, scenario === 'complete' ? 'correction' : 'service-failure');
  const client = scenario === 'failure'
    ? {
        ...base,
        async recalculateComponents(): Promise<Ai['AnalysisResult']> {
          throw new AiAdapterError('MODEL_FAILURE', 'Terminal fixture failure.', false);
        },
      }
    : base;
  return runAnalysisWorkerOnce(database, client);
}

async function createScanWithResult(owner: Owner, app = appFor(owner)) {
  const photoId = randomUUID();
  await pool.query(
    `INSERT INTO photo (id,user_id,object_key,checksum,mime_type,size_bytes)
     VALUES ($1,$2,$3,$4,'image/jpeg',100)`,
    [photoId, owner.userId, `photos/${photoId}`, 'a'.repeat(64)],
  );
  const jobResponse = await app.request('/api/v1/analysis-jobs', {
    method: 'POST',
    headers: headers(owner),
    body: JSON.stringify({ photoId }),
  });
  expect(jobResponse.status).toBe(202);
  const job = await jobResponse.json() as { id: string; scanId: string };
  const config = loadConfig({ APP_ENV: 'dev', AI_MODE: 'fixture', DATABASE_URL: 'postgresql://postgres@localhost/carin' });
  let scan: { latestResultId: string | null } = { latestResultId: null };
  let outcome: string = 'idle';
  for (let attempt = 0; attempt < 5 && !scan.latestResultId; attempt++) {
    outcome = await runAnalysisWorkerOnce(database, createAiClient(config, 'complete'), {
      photoUrlForJob: async (_userId, id) => `http://minio.internal.invalid/photos/${id}`,
    });
    const response = await app.request(`/api/v1/scans/${job.scanId}`, { headers: headers(owner) });
    scan = await response.json() as { latestResultId: string | null };
  }
  expect(outcome).toBe('completed');
  const resultId = scan.latestResultId;
  if (!resultId) throw new Error('Photo analysis completed without a current result');
  const resultResponse = await app.request(`/api/v1/analysis-results/${resultId}`, { headers: headers(owner) });
  expect(resultResponse.status).toBe(200);
  return { scanId: job.scanId, resultId, result: await resultResponse.json() as Ai['AnalysisResult'] };
}

function photoBody(
  source: { scanId: string; resultId: string },
  result: Ai['AnalysisResult'],
  portion = componentFromResult(result.components[0]!),
  overrides: Partial<ConsumptionCreate> = {},
): ConsumptionCreate {
  return {
    source: 'photo_confirmation',
    scanId: source.scanId,
    sourceAnalysisResultId: source.resultId,
    occurrence: 'default_confirmation',
    consumedAt: new Date(Date.now() - 60_000).toISOString(),
    timezone: 'Asia/Jakarta',
    components: [portion],
    catalogVersion,
    ...overrides,
  };
}

function componentFromResult(result: Ai['ComponentResult']): Ai['ComponentInput'] {
  return {
    id: result.id,
    displayName: result.displayName,
    catalogFoodId: result.catalogFoodId,
    preparation: result.preparation,
    portion: result.portion.quantity === null || result.portion.unit === null
      ? { kind: 'unknown' }
      : result.portion.unit === 'serving'
        ? { kind: 'known', quantity: result.portion.quantity, unit: 'serving', servingId: result.portion.servingId! }
        : { kind: 'known', quantity: result.portion.quantity, unit: 'g' },
  };
}

async function updateBody(owner: Owner, id: string, body: ConsumptionUpdate, key = randomUUID()) {
  return appFor(owner).request(`/api/v1/consumptions/${id}`, {
    method: 'PATCH',
    headers: headers(owner, key),
    body: JSON.stringify(body),
  });
}

describe('C21 consumption API and evaluation lifecycle', () => {
  it('replays a committed manual save by idempotency key, preserves actual math and keeps unmatched nutrition null', async () => {
    const owner = await createOwner();
    const body = manualBody();
    const key = randomUUID();
    const first = await postConsumption(owner, body, key);
    expect(first.status).toBe(201);
    const firstValue = await first.json() as AppComponents['schemas']['Consumption'];
    expect(firstValue).toMatchObject({ source: 'manual', scanId: null, sourceAnalysisResultId: null });
    expect(firstValue.snapshot.totals.energyKcal).toBe(100);
    expect(firstValue.snapshot.components[0]?.nutrients).toMatchObject({ energyKcal: 100, sodiumMg: 50 });
    expect(firstValue.attentionState).toBe('pending');
    const replay = await postConsumption(owner, body, key);
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(firstValue);
    expect(await runEvaluation('failure')).toBe('failed');
    const failed = await (await appFor(owner).request(`/api/v1/consumptions/${firstValue.id}`, { headers: headers(owner) })).json() as AppComponents['schemas']['Consumption'];
    expect(failed.attentionState).toBe('failed');
    expect(failed.snapshot.totals.energyKcal).toBe(100);
    expect(failed.snapshot.limitations.map(({ code }) => code)).toContain('analysis_failed');

    const unmatchedBody = manualBody({
      components: [component({ catalogFoodId: null, displayName: 'Unknown greens', preparation: null })],
      catalogVersion: 'unavailable',
    });
    const unmatched = await postConsumption(owner, unmatchedBody);
    expect(unmatched.status).toBe(201);
    const unmatchedValue = await unmatched.json() as AppComponents['schemas']['Consumption'];
    expect(unmatchedValue.snapshot.dataMode).toBe('unavailable');
    expect(unmatchedValue.snapshot.totals.energyKcal).toBeNull();
    expect(unmatchedValue.snapshot.components[0]?.matchStatus).toBe('unmatched');
    expect(unmatchedValue.attentionState).toBe('not_requested');
    expect(unmatchedValue.snapshot.limitations.map(({ code }) => code)).toContain('capability_unavailable');
  });

  it('serializes concurrent retries and keeps manual entries separate without fuzzy deduplication', async () => {
    const owner = await createOwner(false);
    const body = manualBody();
    const key = randomUUID();
    const [left, right] = await Promise.all([
      postConsumption(owner, body, key),
      postConsumption(owner, body, key),
    ]);
    expect([left.status, right.status]).toEqual([201, 201]);
    const leftValue = await left.json() as AppComponents['schemas']['Consumption'];
    const rightValue = await right.json() as AppComponents['schemas']['Consumption'];
    expect(leftValue.id).toBe(rightValue.id);

    const separate = await postConsumption(owner, body, randomUUID());
    expect(separate.status).toBe(201);
    expect((await separate.json() as AppComponents['schemas']['Consumption']).id).not.toBe(leftValue.id);
  });

  it('publishes a validated manual evaluation against the frozen consumption snapshot', async () => {
    const owner = await createOwner();
    const response = await postConsumption(owner, manualBody());
    const created = await response.json() as AppComponents['schemas']['Consumption'];
    expect(created.attentionState).toBe('pending');

    expect(await runEvaluation('complete')).toBe('completed');
    const current = await (await appFor(owner).request(`/api/v1/consumptions/${created.id}`, { headers: headers(owner) })).json() as AppComponents['schemas']['Consumption'];
    expect(current.attentionState).toBe('available');
    expect(current.attentionJobId).toBe(created.attentionJobId);
    expect(current.snapshot.overallAttention).toBe('needs_attention');
    expect(current.snapshot.attentions[0]?.conditionId).toBe('fixture-condition');
    expect(current.snapshot.totals.energyKcal).toBe(100);
  });

  it('rejects future and invalid-timezone records and isolates reads by owner', async () => {
    const owner = await createOwner(false);
    const other = await createOwner(false);
    const future = await postConsumption(owner, manualBody({ consumedAt: new Date(Date.now() + 10 * 60_000).toISOString() }));
    expect(future.status).toBe(422);
    const timezone = await postConsumption(owner, manualBody({ timezone: 'Mars/Olympus' }));
    expect(timezone.status).toBe(422);
    const created = await postConsumption(owner, manualBody());
    const value = await created.json() as AppComponents['schemas']['Consumption'];
    const forbidden = await appFor(other).request(`/api/v1/consumptions/${value.id}`, { headers: headers(other) });
    expect(forbidden.status).toBe(404);
  });

  it('returns the same default photo confirmation, rejects changed defaults, allows new occurrences and re-confirms after delete', async () => {
    const owner = await createOwner();
    const app = appFor(owner);
    const source = await createScanWithResult(owner, app);
    const body = photoBody(source, source.result);
    const created = await postConsumption(owner, body, randomUUID(), app);
    expect(created.status).toBe(201);
    const original = await created.json() as AppComponents['schemas']['Consumption'];
    expect(original.sourceAnalysisResultId).toBe(source.resultId);
    expect(original.attentionState).toBe('available');

    const duplicate = await postConsumption(owner, body, randomUUID(), app);
    expect(duplicate.status).toBe(200);
    expect((await duplicate.json() as AppComponents['schemas']['Consumption']).id).toBe(original.id);
    const changed = await postConsumption(owner, photoBody(source, source.result, componentFromResult(source.result.components[0]!), {
      consumedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
    }), randomUUID(), app);
    expect(changed.status).toBe(409);
    expect((await changed.json() as { error: { code: string } }).error.code).toBe('CONSUMPTION_ALREADY_CONFIRMED');

    const occurrence = await postConsumption(owner, photoBody(source, source.result, componentFromResult(source.result.components[0]!), {
      occurrence: 'new_occurrence',
    }), randomUUID(), app);
    expect(occurrence.status).toBe(201);
    expect((await occurrence.json() as AppComponents['schemas']['Consumption']).id).not.toBe(original.id);

    const deleted = await app.request(`/api/v1/consumptions/${original.id}`, {
      method: 'DELETE',
      headers: headers(owner),
    });
    expect(deleted.status).toBe(204);
    const reconfirmed = await postConsumption(owner, body, randomUUID(), app);
    expect(reconfirmed.status).toBe(201);
    expect((await reconfirmed.json() as AppComponents['schemas']['Consumption']).id).not.toBe(original.id);

    const concurrentSource = await createScanWithResult(owner, app);
    const concurrentBody = photoBody(concurrentSource, concurrentSource.result);
    const [left, right] = await Promise.all([
      postConsumption(owner, concurrentBody, randomUUID(), app),
      postConsumption(owner, concurrentBody, randomUUID(), app),
    ]);
    expect([left.status, right.status].sort()).toEqual([200, 201]);
    const leftValue = await left.json() as AppComponents['schemas']['Consumption'];
    const rightValue = await right.json() as AppComponents['schemas']['Consumption'];
    expect(leftValue.id).toBe(rightValue.id);
  });

  it('checks scan ownership, current source revision and pending analysis before saving a photo confirmation', async () => {
    const owner = await createOwner();
    const other = await createOwner();
    const app = appFor(owner);
    const pendingPhotoId = randomUUID();
    await pool.query(
      `INSERT INTO photo (id,user_id,object_key,checksum,mime_type,size_bytes)
       VALUES ($1,$2,$3,$4,'image/jpeg',100)`,
      [pendingPhotoId, owner.userId, `photos/${pendingPhotoId}`, 'b'.repeat(64)],
    );
    const pendingJob = await app.request('/api/v1/analysis-jobs', {
      method: 'POST', headers: headers(owner), body: JSON.stringify({ photoId: pendingPhotoId }),
    });
    const pending = await pendingJob.json() as { scanId: string };
    const pendingConfirmation = await postConsumption(owner, photoBody({ scanId: pending.scanId, resultId: randomUUID() }, complete), randomUUID(), app);
    expect(pendingConfirmation.status).toBe(409);
    expect((await pendingConfirmation.json() as { error: { code: string } }).error.code).toBe('ANALYSIS_PENDING');

    const source = await createScanWithResult(owner, app);
    const notOwned = await postConsumption(other, photoBody(source, source.result), randomUUID(), appFor(other));
    expect(notOwned.status).toBe(404);
    const stale = await postConsumption(owner, photoBody(source, source.result, undefined, {
      sourceAnalysisResultId: randomUUID(),
    }), randomUUID(), app);
    expect(stale.status).toBe(409);
  });

  it('re-evaluates changed photo portions and prevents an old worker from publishing over a new revision or deletion', async () => {
    const owner = await createOwner();
    const app = appFor(owner);
    const source = await createScanWithResult(owner, app);
    const selected = componentFromResult(source.result.components[0]!);
    selected.portion = { kind: 'known', quantity: 0.5, unit: 'serving', servingId: 'fixture-serving-100g' };
    const create = await postConsumption(owner, photoBody(source, source.result, selected), randomUUID(), app);
    expect(create.status).toBe(201);
    const consumption = await create.json() as AppComponents['schemas']['Consumption'];
    expect(consumption.attentionState).toBe('pending');
    expect(consumption.snapshot.totals.energyKcal).toBe(100);
    const [before] = await pool.query(
      'SELECT snapshot FROM consumption_snapshot WHERE consumption_id=$1 AND revision=1',
      [consumption.id],
    ).then(({ rows }) => rows);

    const claimed = await claimNextJob(database);
    expect(claimed?.consumptionId).toBe(consumption.id);
    const patch = await updateBody(owner, consumption.id, {
      expectedRevision: 1,
      consumedAt: consumption.consumedAt,
      timezone: consumption.timezone,
      components: [component({ ...selected, portion: { kind: 'known', quantity: 1, unit: 'serving', servingId: 'fixture-serving-100g' } })],
      catalogVersion,
    });
    expect(patch.status).toBe(200);
    const updated = await patch.json() as AppComponents['schemas']['Consumption'];
    expect(updated.revision).toBe(2);
    expect(updated.snapshot.totals.energyKcal).toBe(200);
    const [after] = await pool.query(
      'SELECT snapshot FROM consumption_snapshot WHERE consumption_id=$1 AND revision=1',
      [consumption.id],
    ).then(({ rows }) => rows);
    expect(after.snapshot).toEqual(before.snapshot);

    const staleResult = fixture('correction');
    staleResult.operationId = claimed!.operationId;
    staleResult.inputKind = 'manual';
    staleResult.profileVersion = updated.snapshot.profileVersion;
    expect(await publishJobResult(database, {
      jobId: claimed!.id,
      userId: owner.userId,
      leaseToken: claimed!.leaseToken,
      result: staleResult,
    })).toBe(false);
    const current = await (await app.request(`/api/v1/consumptions/${consumption.id}`, { headers: headers(owner) })).json() as AppComponents['schemas']['Consumption'];
    expect(current.revision).toBe(2);
    expect(current.snapshot.totals.energyKcal).toBe(200);

    expect(updated.attentionState).toBe('available');

    const secondPatch = await updateBody(owner, consumption.id, {
      expectedRevision: 2,
      consumedAt: consumption.consumedAt,
      timezone: consumption.timezone,
      components: [component({ ...selected, portion: { kind: 'known', quantity: 0.75, unit: 'serving', servingId: 'fixture-serving-100g' } })],
      catalogVersion,
    });
    expect(secondPatch.status).toBe(200);
    expect((await secondPatch.json() as AppComponents['schemas']['Consumption']).attentionState).toBe('pending');
    const deletingClaim = await claimNextJob(database);
    expect(deletingClaim?.consumptionId).toBe(consumption.id);
    const deleted = await app.request(`/api/v1/consumptions/${consumption.id}`, {
      method: 'DELETE',
      headers: headers(owner),
    });
    expect(deleted.status).toBe(204);
    const deleteResult = fixture('correction');
    deleteResult.operationId = deletingClaim!.operationId;
    deleteResult.inputKind = 'manual';
    expect(await publishJobResult(database, {
      jobId: deletingClaim!.id,
      userId: owner.userId,
      leaseToken: deletingClaim!.leaseToken,
      result: deleteResult,
    })).toBe(false);
    expect((await app.request(`/api/v1/consumptions/${consumption.id}`, { headers: headers(owner) })).status).toBe(404);
  });

  it('rejects a stale photo result even when its scan belongs to the caller', async () => {
    const owner = await createOwner();
    const app = appFor(owner);
    const source = await createScanWithResult(owner, app);
    const stale = await postConsumption(owner, photoBody(source, source.result, undefined, {
      sourceAnalysisResultId: randomUUID(),
    }), randomUUID(), app);
    expect(stale.status).toBe(409);
  });
});
