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
import { lockScanForConfirmation, ScanAnalysisPendingError } from '../../src/modules/scans/repository.js';
import { getLegalRegistry } from '../../src/modules/legal/registry.js';
import type { components } from '../../src/contracts/generated/ai-service.js';

const containerName = `carin-c18-analysis-${randomUUID()}`;
const catalogVersion = 'synthetic-catalog-1';
const aiFixtures: Record<'complete' | 'partial' | 'unrecognized' | 'correction', string> = {
  complete: 'analysis-complete.json',
  partial: 'analysis-partial.json',
  unrecognized: 'analysis-unrecognized.json',
  correction: 'correction-complete.json',
};
let pool: Pool;
let database: ReturnType<typeof createDatabase>;
let containerStarted = false;

type Owner = { userId: string; sessionId: string };

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

async function seedCatalog(): Promise<void> {
  const complete = fixture('complete');
  const sample = complete.components[0]!;
  const sources = complete.sources.filter((source) => sample.sourceIds.includes(source.id));
  const manifest: components['schemas']['CapabilityManifest'] = {
    contractVersion: '1.0.0',
    catalogVersion,
    nutritionDatasetVersion: complete.nutritionDatasetVersion,
    ruleSetVersion: complete.ruleSetVersion,
    conditions: [{
      id: 'fixture-condition',
      displayName: 'Synthetic fixture condition',
      personalizationSupported: true,
      requiredProfileFields: ['weightKg'],
      requiredNutrients: ['energyKcal'],
      supportedAgeMinimum: 18,
      supportedAgeMaximum: 80,
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
     VALUES ($1,$2,$3,'synthetic',now(),'c18-test-digest',true)`,
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

function fixture(name: keyof typeof aiFixtures): components['schemas']['AnalysisResult'] {
  return JSON.parse(readFileSync(new URL(`../../fixtures/ai/${aiFixtures[name]}`, import.meta.url), 'utf8')) as components['schemas']['AnalysisResult'];
}

async function createOwner(profile?: { version: number; heightCm: number | null; weightKg: number | null; conditionIds?: string[] }): Promise<Owner> {
  const userId = randomUUID();
  const sessionId = randomUUID();
  const legal = getLegalRegistry();
  await pool.query(
    `INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at,birth_date,accepted_terms_version,accepted_privacy_version,accepted_at)
     VALUES ($1,'C18 test',$2,true,now(),now(),'1995-01-01',$3,$4,now())`,
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
    const conditionIds = profile.conditionIds ?? [];
    await pool.query(
      `INSERT INTO health_profile (user_id,version,height_cm,weight_kg,diagnosis_state,conditions,family_history_state,family_history,allergy_state,allergies)
       VALUES ($1,$2,$3,$4,$5,$6,'not_provided','[]','not_provided','[]')`,
      [userId, profile.version,
        profile.heightCm === null ? null : String(profile.heightCm),
        profile.weightKg === null ? null : String(profile.weightKg),
        conditionIds.length > 0 ? 'reported' : 'not_provided',
        JSON.stringify(conditionIds.map((conditionId) => ({ conditionId })))],
    );
  }
  return { userId, sessionId };
}

async function createPhoto(owner: Owner): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO photo (id,user_id,object_key,checksum,mime_type,size_bytes)
     VALUES ($1,$2,$3,$4,'image/jpeg',100)`,
    [id, owner.userId, `photos/${id}`, 'a'.repeat(64)],
  );
  return id;
}

function appFor(owner: Owner) {
  const resolveSession = async (request: Request) => request.headers.get('x-test-user') === owner.userId
    ? { userId: owner.userId, emailVerified: true, sessionId: owner.sessionId }
    : null;
  return createApp({
    readiness: async () => true,
    analyses: { db: database, resolveSession },
    scans: { db: database, resolveSession },
    analysisJobs: { db: database, resolveSession },
  });
}

function headers(owner: Owner, key = randomUUID()): Headers {
  return new Headers({
    'content-type': 'application/json',
    'idempotency-key': key,
    'x-test-user': owner.userId,
  });
}

async function createScan(owner: Owner, photoId: string, app = appFor(owner), key = randomUUID()) {
  return app.request('/api/v1/analysis-jobs', {
    method: 'POST',
    headers: headers(owner, key),
    body: JSON.stringify({ photoId }),
  });
}

async function analyzeOnce(scenario: 'complete' | 'partial' | 'unrecognized' | 'correction' | 'failure' = 'complete') {
  const config = loadConfig({ APP_ENV: 'dev', AI_MODE: 'fixture', DATABASE_URL: 'postgresql://postgres@localhost/carin' });
  const client = scenario === 'failure'
    ? {
        ...createAiClient(config),
        async analyzePhoto(): Promise<components['schemas']['AnalysisResult']> {
          throw new AiAdapterError('MODEL_FAILURE', 'Synthetic terminal failure.', false);
        },
        async recalculateComponents(): Promise<components['schemas']['AnalysisResult']> {
          throw new AiAdapterError('MODEL_FAILURE', 'Synthetic terminal failure.', false);
        },
      }
    : createAiClient(config, scenario);
  return runAnalysisWorkerOnce(database, client, {
    photoUrlForJob: async (_userId, photoId) => `http://minio.internal.invalid/photos/${photoId}`,
  });
}

async function analyzeMutatedResult(mutate: (result: components['schemas']['AnalysisResult']) => void) {
  const config = loadConfig({ APP_ENV: 'dev', AI_MODE: 'fixture', DATABASE_URL: 'postgresql://postgres@localhost/carin' });
  const client = createAiClient(config, 'complete');
  return runAnalysisWorkerOnce(database, {
    ...client,
    async analyzePhoto(request) {
      const result = fixture('complete');
      result.operationId = request.operationId;
      result.profileVersion = request.profile.profileVersion;
      result.catalogVersion = request.catalogVersion;
      result.ruleSetVersion = request.ruleSetVersion;
      mutate(result);
      return result;
    },
  }, {
    photoUrlForJob: async (_userId, photoId) => `http://minio.internal.invalid/photos/${photoId}`,
  });
}

async function cancelOpenJobs(userId: string): Promise<void> {
  await pool.query(
    `UPDATE analysis_job SET status='cancelled',lease_token=NULL,lease_expires_at=NULL,finished_at=clock_timestamp(),updated_at=clock_timestamp()
     WHERE user_id=$1 AND status IN ('queued','processing')`,
    [userId],
  );
}

describe('C18 scan and analysis API', () => {
  it('binds one owned photo to an automatic scan and publishes a partial result without creating consumption', async () => {
    const owner = await createOwner();
    const photoId = await createPhoto(owner);
    const app = appFor(owner);
    const createKey = randomUUID();
    const created = await createScan(owner, photoId, app, createKey);
    expect(created.status).toBe(202);
    const job = await created.json() as { id: string; scanId: string; status: string };
    expect(job.status).toBe('queued');
    const before = await app.request(`/api/v1/scans/${job.scanId}`, { headers: headers(owner) });
    const beforeScan = await before.json() as { revision: number; latestResultId: string | null; latestJobId: string };
    expect(beforeScan).toMatchObject({ revision: 1, latestResultId: null, latestJobId: job.id });
    const snapshot = await pool.query(
      `SELECT j.input_snapshot,ps.profile_version,p.lifecycle AS photo_lifecycle,s.current_result_id
       FROM analysis_job j JOIN profile_snapshot ps ON ps.id=j.profile_snapshot_id
       JOIN photo p ON p.id=$1 JOIN scan s ON s.id=j.scan_id WHERE j.id=$2`,
      [photoId, job.id],
    );
    expect(snapshot.rows[0].profile_version).toBe(0);
    expect(snapshot.rows[0].photo_lifecycle).toBe('attached');
    expect(snapshot.rows[0].current_result_id).toBeNull();
    expect(snapshot.rows[0].input_snapshot).not.toHaveProperty('image.downloadUrl');

    expect(await analyzeOnce('partial')).toBe('completed');
    const resultId = await (await app.request(`/api/v1/scans/${job.scanId}`, { headers: headers(owner) })).json() as {
      revision: number; latestResultId: string; latestJobId: string;
    };
    expect(resultId.revision).toBe(1);
    expect(resultId.latestJobId).toBe(job.id);
    const page = await app.request('/api/v1/scans', { headers: headers(owner) });
    expect(page.status).toBe(200);
    expect(await page.json()).toMatchObject({
      items: [{ id: job.scanId, revision: 1, latestJobId: job.id, latestResultId: resultId.latestResultId, defaultConsumptionId: null }],
      nextCursor: null,
    });
    const resultResponse = await app.request(`/api/v1/analysis-results/${resultId.latestResultId}`, { headers: headers(owner) });
    expect(resultResponse.status).toBe(200);
    expect((await resultResponse.json()).supportStatus).toBe('partial');
    const consumptionCount = await pool.query('SELECT count(*)::int AS count FROM consumption WHERE user_id=$1', [owner.userId]);
    expect(consumptionCount.rows[0].count).toBe(0);

    const replay = await createScan(owner, photoId, app, createKey);
    expect(replay.status).toBe(202);
    expect((await replay.json() as { id: string }).id).toBe(job.id);
    const duplicate = await createScan(owner, photoId, app);
    expect(duplicate.status).toBe(409);
    await cancelOpenJobs(owner.userId);
  });

  it('rejects a matched photo food outside the imported supported-photo ID set', async () => {
    const owner = await createOwner({ version: 1, heightCm: 170, weightKg: 65, conditionIds: ['fixture-condition'] });
    const created = await createScan(owner, await createPhoto(owner));
    const job = await created.json() as { id: string; scanId: string };

    expect(await analyzeMutatedResult((result) => {
      result.components[0]!.catalogFoodId = 'fixture-food-not-photo-supported';
      result.components[0]!.displayName = 'Makanan sintetis hanya untuk koreksi';
    })).toBe('failed');
    const current = await pool.query('SELECT revision,current_result_id FROM scan WHERE id=$1', [job.scanId]);
    expect(current.rows[0]).toMatchObject({ revision: 1, current_result_id: null });
    const failed = await pool.query('SELECT status FROM analysis_job WHERE id=$1', [job.id]);
    expect(failed.rows[0].status).toBe('failed');
  });

  it('rejects health-rule outputs whose claimed citation differs from the imported rule source', async () => {
    const owner = await createOwner({ version: 1, heightCm: 170, weightKg: 65, conditionIds: ['fixture-condition'] });
    const created = await createScan(owner, await createPhoto(owner));

    expect(await analyzeMutatedResult((result) => {
      result.sources.find((source) => source.id === 'synthetic-rule')!.itemRef = 'unbacked citation';
    })).toBe('failed');
    const response = await created.json() as { scanId: string };
    const current = await pool.query('SELECT revision,current_result_id FROM scan WHERE id=$1', [response.scanId]);
    expect(current.rows[0]).toMatchObject({ revision: 1, current_result_id: null });
  });

  it('rejects a rule/condition pair outside the imported supported condition authority', async () => {
    const owner = await createOwner({ version: 1, heightCm: 170, weightKg: 65, conditionIds: ['fixture-condition'] });
    const created = await createScan(owner, await createPhoto(owner));

    expect(await analyzeMutatedResult((result) => {
      result.attentions[0]!.conditionId = 'condition-not-supported';
    })).toBe('failed');
    const response = await created.json() as { scanId: string };
    const current = await pool.query('SELECT revision,current_result_id FROM scan WHERE id=$1', [response.scanId]);
    expect(current.rows[0]).toMatchObject({ revision: 1, current_result_id: null });
  });

  it('rejects attention when a persisted condition requirement is absent from the frozen profile', async () => {
    const owner = await createOwner({ version: 1, heightCm: 170, weightKg: null, conditionIds: ['fixture-condition'] });
    const created = await createScan(owner, await createPhoto(owner));
    const job = await created.json() as { scanId: string };

    expect(await analyzeMutatedResult(() => {})).toBe('failed');
    const current = await pool.query('SELECT revision,current_result_id FROM scan WHERE id=$1', [job.scanId]);
    expect(current.rows[0]).toMatchObject({ revision: 1, current_result_id: null });
  });

  it('rejects attention output when the immutable profile snapshot has no eligible condition', async () => {
    const owner = await createOwner();
    const created = await createScan(owner, await createPhoto(owner));
    const job = await created.json() as { id: string; scanId: string };

    expect(await analyzeMutatedResult(() => {})).toBe('failed');
    const current = await pool.query('SELECT revision,current_result_id FROM scan WHERE id=$1', [job.scanId]);
    expect(current.rows[0]).toMatchObject({ revision: 1, current_result_id: null });
  });

  it('rejects scan creation without a current capability manifest before persisting resources', async () => {
    const missingAuthorityVersion = 'fixture-catalog-without-authority';
    await pool.query('UPDATE catalog_version SET is_current=false WHERE version=$1', [catalogVersion]);
    await pool.query(
      `INSERT INTO catalog_version (version,nutrition_dataset_version,rule_set_version,data_mode,published_at,digest,is_current)
       VALUES ($1,'synthetic-nutrition-1','synthetic-rules-1','synthetic',now(),'missing-authority',true)`,
      [missingAuthorityVersion],
    );
    try {
      const owner = await createOwner();
      const photoId = await createPhoto(owner);
      const created = await createScan(owner, photoId);
      expect(created.status).toBe(409);
      expect(await created.json()).toMatchObject({ error: { code: 'CATALOG_VERSION_UNAVAILABLE' } });
      const state = await pool.query(
        `SELECT p.lifecycle,
          (SELECT count(*)::int FROM scan WHERE user_id=$1) AS scans,
          (SELECT count(*)::int FROM analysis_job WHERE user_id=$1) AS jobs,
          (SELECT count(*)::int FROM profile_snapshot WHERE user_id=$1) AS snapshots,
          (SELECT count(*)::int FROM idempotency_record WHERE user_id=$1) AS idempotency
         FROM photo p WHERE p.id=$2 AND p.user_id=$1`,
        [owner.userId, photoId],
      );
      expect(state.rows[0]).toMatchObject({
        lifecycle: 'uploaded', scans: 0, jobs: 0, snapshots: 0, idempotency: 0,
      });
    } finally {
      await pool.query('UPDATE catalog_version SET is_current=false WHERE version=$1', [missingAuthorityVersion]);
      await pool.query(
        'UPDATE catalog_version SET is_current=true, activation_generation=activation_generation+1 WHERE version=$1',
        [catalogVersion],
      );
    }
  });

  it('keeps the initial profile snapshot for corrections, blocks competing edits while pending, and advances only after success', async () => {
    const owner = await createOwner({ version: 4, heightCm: 168, weightKg: 65, conditionIds: ['fixture-condition'] });
    const photoId = await createPhoto(owner);
    const app = appFor(owner);
    const created = await createScan(owner, photoId, app);
    const initialJob = await created.json() as { id: string; scanId: string };
    expect(await analyzeOnce('complete')).toBe('completed');
    const scanResponse = await app.request(`/api/v1/scans/${initialJob.scanId}`, { headers: headers(owner) });
    const initialScan = await scanResponse.json() as { revision: number; latestResultId: string };
    const originalResultId = initialScan.latestResultId;
    await pool.query('UPDATE health_profile SET version=5,weight_kg=70 WHERE user_id=$1', [owner.userId]);

    const initialResult = fixture('complete');
    const body = {
      expectedRevision: 1,
      basedOnResultId: originalResultId,
      catalogVersion,
      components: [{
        id: initialResult.components[0]!.id,
        displayName: initialResult.components[0]!.displayName,
        catalogFoodId: initialResult.components[0]!.catalogFoodId,
        preparation: initialResult.components[0]!.preparation,
        portion: { kind: 'known', quantity: 0.5, unit: 'serving', servingId: 'fixture-serving-100g' },
      }],
    };
    const correction = await app.request(`/api/v1/scans/${initialJob.scanId}/corrections`, {
      method: 'POST', headers: headers(owner), body: JSON.stringify(body),
    });
    expect(correction.status).toBe(202);
    const correctionJob = await correction.json() as { id: string; status: string };
    expect(correctionJob.status).toBe('queued');
    const correctionSnapshot = await pool.query('SELECT input_snapshot,target_revision,target_generation FROM analysis_job WHERE id=$1', [correctionJob.id]);
    expect(correctionSnapshot.rows[0].input_snapshot.profile).toMatchObject({ profileVersion: 4, heightCm: 168, weightKg: 65 });
    expect(correctionSnapshot.rows[0]).toMatchObject({ target_revision: 2, target_generation: 2 });

    await expect(database.transaction((tx) => lockScanForConfirmation(tx, owner.userId, initialJob.scanId, originalResultId)))
      .rejects.toBeInstanceOf(ScanAnalysisPendingError);
    const competing = await app.request(`/api/v1/scans/${initialJob.scanId}/corrections`, {
      method: 'POST', headers: headers(owner), body: JSON.stringify(body),
    });
    expect(competing.status).toBe(409);

    expect(await analyzeOnce('correction')).toBe('completed');
    const after = await (await app.request(`/api/v1/scans/${initialJob.scanId}`, { headers: headers(owner) })).json() as {
      revision: number; latestResultId: string; latestJobId: string;
    };
    expect(after).toMatchObject({ revision: 2, latestJobId: correctionJob.id });
    expect(after.latestResultId).not.toBe(originalResultId);
    const saved = await (await app.request(`/api/v1/analysis-results/${after.latestResultId}`, { headers: headers(owner) })).json();
    expect(saved.components[0].portion.grams).toBe(50);
    expect(saved.components[0].nutrients.energyKcal).toBe(100);
    expect((await app.request(`/api/v1/analysis-results/${originalResultId}`, { headers: headers(owner) })).status).toBe(200);
    await cancelOpenJobs(owner.userId);
  });

  it('queues replacement, unmatched and unknown-portion correction drafts while rejecting stale revisions and catalog versions', async () => {
    const owner = await createOwner();
    const photoId = await createPhoto(owner);
    const app = appFor(owner);
    const created = await createScan(owner, photoId, app);
    const job = await created.json() as { scanId: string };
    expect(await analyzeOnce('complete')).toBe('completed');
    const current = await (await app.request(`/api/v1/scans/${job.scanId}`, { headers: headers(owner) })).json() as { latestResultId: string };
    const replacement = {
      expectedRevision: 1,
      basedOnResultId: current.latestResultId,
      catalogVersion,
      components: [{
        id: randomUUID(),
        displayName: 'Makanan pengganti sintetis',
        catalogFoodId: 'fixture-food-002',
        preparation: 'Contoh uji',
        portion: { kind: 'known', quantity: 75, unit: 'g' },
      }],
    };
    const acceptedReplacement = await app.request(`/api/v1/scans/${job.scanId}/corrections`, {
      method: 'POST', headers: headers(owner), body: JSON.stringify(replacement),
    });
    expect(acceptedReplacement.status).toBe(202);
    await cancelOpenJobs(owner.userId);
    const unknown = {
      ...replacement,
      components: [{ id: randomUUID(), displayName: 'Komponen bebas', catalogFoodId: null, preparation: null, portion: { kind: 'unknown' } }],
    };
    const acceptedUnknown = await app.request(`/api/v1/scans/${job.scanId}/corrections`, {
      method: 'POST', headers: headers(owner), body: JSON.stringify(unknown),
    });
    expect(acceptedUnknown.status).toBe(202);
    await cancelOpenJobs(owner.userId);

    const staleRevision = await app.request(`/api/v1/scans/${job.scanId}/corrections`, {
      method: 'POST', headers: headers(owner), body: JSON.stringify({ ...replacement, expectedRevision: 2 }),
    });
    expect(staleRevision.status).toBe(409);
    expect((await staleRevision.json()).error.code).toBe('REVISION_CONFLICT');
    const staleCatalog = await app.request(`/api/v1/scans/${job.scanId}/corrections`, {
      method: 'POST', headers: headers(owner), body: JSON.stringify({ ...replacement, catalogVersion: 'missing-catalog' }),
    });
    expect(staleCatalog.status).toBe(409);
    expect((await staleCatalog.json()).error.code).toBe('CATALOG_VERSION_UNAVAILABLE');
    await cancelOpenJobs(owner.userId);
  });

  it('publishes unrecognized results and leaves the last good result and revision intact after a failed correction', async () => {
    const owner = await createOwner();
    const photoId = await createPhoto(owner);
    const app = appFor(owner);
    const created = await createScan(owner, photoId, app);
    const initial = await created.json() as { scanId: string };
    expect(await analyzeOnce('unrecognized')).toBe('completed');
    const result = await (await app.request(`/api/v1/scans/${initial.scanId}`, { headers: headers(owner) })).json() as {
      latestResultId: string; revision: number;
    };
    const correctionBody = {
      expectedRevision: result.revision,
      basedOnResultId: result.latestResultId,
      catalogVersion,
      components: [{
        id: randomUUID(), displayName: 'Belum dikenali', catalogFoodId: null, preparation: null,
        portion: { kind: 'unknown' },
      }],
    };
    const correction = await app.request(`/api/v1/scans/${initial.scanId}/corrections`, {
      method: 'POST', headers: headers(owner), body: JSON.stringify(correctionBody),
    });
    expect(correction.status).toBe(202);
    expect(await analyzeOnce('failure')).toBe('failed');
    const after = await (await app.request(`/api/v1/scans/${initial.scanId}`, { headers: headers(owner) })).json() as {
      latestResultId: string; revision: number;
    };
    expect(after).toMatchObject({ latestResultId: result.latestResultId, revision: result.revision });
    await cancelOpenJobs(owner.userId);
  });

  it('keeps an initial scan readable without publishing a result after terminal AI failure', async () => {
    const owner = await createOwner();
    const photoId = await createPhoto(owner);
    const app = appFor(owner);
    const created = await createScan(owner, photoId, app);
    const job = await created.json() as { id: string; scanId: string };
    expect(await analyzeOnce('failure')).toBe('failed');
    const scanView = await (await app.request(`/api/v1/scans/${job.scanId}`, { headers: headers(owner) })).json() as {
      revision: number; latestJobId: string; latestResultId: string | null;
    };
    expect(scanView).toMatchObject({ revision: 1, latestJobId: job.id, latestResultId: null });
    const jobView = await app.request(`/api/v1/analysis-jobs/${job.id}`, { headers: headers(owner) });
    expect(jobView.status).toBe(200);
    expect(await jobView.json()).toMatchObject({ status: 'failed', resultId: null, result: null });
    const resultCount = await pool.query('SELECT count(*)::int AS count FROM analysis_result WHERE job_id=$1', [job.id]);
    expect(resultCount.rows[0].count).toBe(0);
    await cancelOpenJobs(owner.userId);
  });

  it('returns 404 for cross-account scan and immutable-result reads', async () => {
    const owner = await createOwner();
    const other = await createOwner();
    const photoId = await createPhoto(owner);
    const created = await createScan(owner, photoId);
    const job = await created.json() as { scanId: string };
    expect(await analyzeOnce('complete')).toBe('completed');
    const ownerScan = await (await appFor(owner).request(`/api/v1/scans/${job.scanId}`, { headers: headers(owner) })).json() as { latestResultId: string };
    const otherApp = appFor(other);
    expect((await otherApp.request(`/api/v1/scans/${job.scanId}`, { headers: headers(other) })).status).toBe(404);
    expect((await otherApp.request(`/api/v1/analysis-results/${ownerScan.latestResultId}`, { headers: headers(other) })).status).toBe(404);
    await cancelOpenJobs(owner.userId);
  });

  it('drops a correction result when its claimed scan generation has become stale', async () => {
    const owner = await createOwner();
    const photoId = await createPhoto(owner);
    const app = appFor(owner);
    const created = await createScan(owner, photoId, app);
    const initial = await created.json() as { scanId: string };
    expect(await analyzeOnce('complete')).toBe('completed');
    const scanView = await (await app.request(`/api/v1/scans/${initial.scanId}`, { headers: headers(owner) })).json() as {
      latestResultId: string; revision: number;
    };
    const output = fixture('complete');
    const input = {
      expectedRevision: 1,
      basedOnResultId: scanView.latestResultId,
      catalogVersion,
      components: [{
        id: output.components[0]!.id,
        displayName: output.components[0]!.displayName,
        catalogFoodId: output.components[0]!.catalogFoodId,
        preparation: output.components[0]!.preparation,
        portion: { kind: 'known', quantity: 0.5, unit: 'serving', servingId: 'fixture-serving-100g' },
      }],
    };
    const correction = await app.request(`/api/v1/scans/${initial.scanId}/corrections`, {
      method: 'POST', headers: headers(owner), body: JSON.stringify(input),
    });
    expect(correction.status).toBe(202);
    const jobView = await correction.json() as { id: string };
    const claim = await claimNextJob(database);
    expect(claim?.id).toBe(jobView.id);
    await pool.query('UPDATE scan SET generation=generation+1 WHERE id=$1', [initial.scanId]);
    const staleOutput = fixture('correction');
    staleOutput.operationId = claim!.operationId;
    staleOutput.profileVersion = 0;
    expect(await publishJobResult(database, {
      jobId: claim!.id,
      userId: owner.userId,
      leaseToken: claim!.leaseToken,
      result: staleOutput,
    })).toBe(false);
    const after = await (await app.request(`/api/v1/scans/${initial.scanId}`, { headers: headers(owner) })).json() as {
      latestResultId: string; revision: number;
    };
    expect(after).toMatchObject({ latestResultId: scanView.latestResultId, revision: 1 });
    await cancelOpenJobs(owner.userId);
  });
});
