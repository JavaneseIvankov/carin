import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { createDatabase, type Database } from '../db/client.js';
import type { DemoApiClient, DemoSeedEnvironment } from './api-client.js';
import { deriveIdempotencyKey, signInDemoAccount } from './api-client.js';
import { buildDemoData, loadPhotoPlans, type PhotoPlan } from './seed-data.js';
import {
  completeSeedResource,
  getOrCreateSeedAnchor,
  reserveSeedResource,
  saveSeedResourceId,
} from './seed-state.js';

export function assertRealAnalysisResult(result: unknown): void {
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('DEMO_ANALYSIS_NOT_REAL');
  const root = result as { dataMode?: unknown };
  const containsSyntheticKind = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(containsSyntheticKind);
    if (!value || typeof value !== 'object') return false;
    return Object.entries(value).some(([key, child]) =>
      (key === 'kind' && child === 'synthetic') || containsSyntheticKind(child));
  };
  if (root.dataMode !== 'real' || containsSyntheticKind(result)) throw new Error('DEMO_ANALYSIS_NOT_REAL');
}

export function nextPollDelayMs(attempt: number, retryAfter?: string | null): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(15_000, Math.max(1_000, seconds * 1_000));
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) return Math.min(15_000, Math.max(1_000, retryAt - Date.now()));
  }
  return Math.min(15_000, 1_000 * (2 ** Math.max(0, attempt)));
}

type JsonRecord = Record<string, unknown>;
type DemoSeedSummary = {
  profile: 'updated' | 'unchanged';
  onboarding: 'completed' | 'already_complete';
  examinations: number;
  consumptions: number;
  photos: number;
  realAnalyses: number;
};

function hashPayload(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function localDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function resourceId(value: unknown): string {
  if (!value || typeof value !== 'object' || typeof (value as JsonRecord).id !== 'string') {
    throw new Error('DEMO_API_RESOURCE_ID_MISSING');
  }
  return (value as { id: string }).id;
}

function assertApiPreconditions(appEnv: string, aiMode?: string): void {
  if (!['dev', 'staging', 'prod'].includes(appEnv)) throw new Error('DEMO_APP_ENV_INVALID');
  if (aiMode && aiMode !== 'real') throw new Error('DEMO_AI_MODE_MUST_BE_REAL');
}

async function pollAnalysis(api: DemoApiClient, jobId: string): Promise<JsonRecord> {
  let delay = 1_000;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    const { body: job, headers } = await api.getWithHeaders<JsonRecord>(`/api/v1/analysis-jobs/${jobId}`);
    if (job.status === 'failed' || job.status === 'cancelled') throw new Error('DEMO_ANALYSIS_JOB_FAILED');
    if (job.status === 'completed') {
      if (job.result && typeof job.result === 'object') return job.result as JsonRecord;
      if (typeof job.resultId === 'string') return api.get<JsonRecord>(`/api/v1/analysis-results/${job.resultId}`);
      throw new Error('DEMO_ANALYSIS_RESULT_MISSING');
    }
    delay = nextPollDelayMs(attempt, headers.get('retry-after'));
  }
  throw new Error('DEMO_ANALYSIS_TIMEOUT');
}

async function seedPhoto(
  db: Database,
  api: DemoApiClient,
  userId: string,
  photo: PhotoPlan,
  version: string,
): Promise<void> {
  const photoReservation = await reserveSeedResource(db, userId, {
    seedKey: photo.seedKey,
    resourceKind: 'photo',
    payloadHash: photo.sha256,
  });
  let photoId = photoReservation.resourceId;
  if (!photoId) {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(photo.bytes)], { type: 'image/jpeg' }), photo.filename);
    const uploaded = await api.multipart<JsonRecord>(
      '/api/v1/photos',
      form,
      deriveIdempotencyKey(userId, version, photo.seedKey, 'upload'),
    );
    photoId = resourceId(uploaded);
    await completeSeedResource(db, userId, photo.seedKey, photoId);
  }

  const analysisKey = `analysis:${photo.seedKey}`;
  const analysisReservation = await reserveSeedResource(db, userId, {
    seedKey: analysisKey,
    resourceKind: 'analysis',
    payloadHash: photo.sha256,
  });
  if (analysisReservation.state === 'complete') return;

  let jobId = analysisReservation.resourceId;
  let scanId: string | null = null;
  const scanKey = `scan:${photo.seedKey}`;
  const scanReservation = await reserveSeedResource(db, userId, {
    seedKey: scanKey,
    resourceKind: 'scan',
    payloadHash: photo.sha256,
  });
  scanId = scanReservation.resourceId;
  if (!jobId) {
    const created = await api.post<JsonRecord>(
      '/api/v1/analysis-jobs',
      { photoId },
      deriveIdempotencyKey(userId, version, analysisKey, 'create-job'),
    );
    jobId = resourceId(created);
    const returnedScanId = typeof created.scanId === 'string'
      ? created.scanId
      : created.targetType === 'scan' && typeof created.targetId === 'string' ? created.targetId : null;
    if (returnedScanId) {
      scanId = returnedScanId;
      await saveSeedResourceId(db, userId, scanKey, scanId);
    }
    await saveSeedResourceId(db, userId, analysisKey, jobId);
  }

  let result: JsonRecord;
  try {
    result = await pollAnalysis(api, jobId);
    assertRealAnalysisResult(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'DEMO_ANALYSIS_NOT_REAL' && scanId) {
      await api.json<void>(
        'DELETE',
        `/api/v1/scans/${scanId}`,
        undefined,
        deriveIdempotencyKey(userId, version, scanKey, 'delete-synthetic'),
      );
      await completeSeedResource(db, userId, scanKey, null);
    }
    throw error;
  }

  await completeSeedResource(db, userId, analysisKey, typeof result.id === 'string' ? result.id : jobId);
  if (scanId) await completeSeedResource(db, userId, scanKey, scanId);
}

export async function runDemoSeed(
  env: DemoSeedEnvironment,
  db: Database,
  fetchImpl?: typeof fetch,
): Promise<DemoSeedSummary> {
  assertApiPreconditions(env.appEnv, env.aiMode);
  const api = await signInDemoAccount({
    baseUrl: env.baseUrl,
    email: env.email,
    password: env.password,
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  const me = await api.get<JsonRecord>('/api/v1/me');
  if (me.email !== env.targetEmail || me.emailVerified !== true) throw new Error('DEMO_ACCOUNT_NOT_VERIFIED_TARGET');
  const [legal, profile, onboarding] = await Promise.all([
    api.get<JsonRecord>('/api/v1/legal'),
    api.get<JsonRecord>('/api/v1/profile'),
    api.get<JsonRecord>('/api/v1/onboarding'),
  ]);
  const consent = me.aiConsent as JsonRecord | undefined;
  const aiLegal = legal.aiProcessing as JsonRecord | undefined;
  if (consent?.granted !== true || consent.version !== aiLegal?.version) throw new Error('DEMO_AI_CONSENT_REQUIRED');

  const anchorDate = await getOrCreateSeedAnchor(db, String(me.id), localDate());
  const data = buildDemoData(anchorDate);
  const summary: DemoSeedSummary = {
    profile: 'unchanged',
    onboarding: onboarding.completedAt ? 'already_complete' : 'completed',
    examinations: 0,
    consumptions: 0,
    photos: 0,
    realAnalyses: 0,
  };

  const profileHash = hashPayload(data.profile);
  const profileReservation = await reserveSeedResource(db, String(me.id), {
    seedKey: 'profile:v1', resourceKind: 'profile', payloadHash: profileHash,
  }, { allowPayloadUpdate: true });
  if (profileReservation.state !== 'complete') {
    const profileVersion = typeof profile.version === 'number' ? profile.version : 0;
    await api.patch('/api/v1/profile', { expectedVersion: profileVersion, fields: data.profile },
      deriveIdempotencyKey(String(me.id), 'v1', 'profile:v1', 'update'));
    await completeSeedResource(db, String(me.id), 'profile:v1', null);
    summary.profile = 'updated';
  }
  if (!onboarding.completedAt) await api.post('/api/v1/onboarding/complete', {},
    deriveIdempotencyKey(String(me.id), 'v1', 'onboarding:v1', 'complete'));

  for (const examination of data.examinations) {
    const subtype = 'subtype' in examination ? `:${examination.subtype}` : '';
    const key = `examination:${examination.type}:${examination.measuredOn}${subtype}`;
    const reservation = await reserveSeedResource(db, String(me.id), {
      seedKey: key, resourceKind: 'examination', payloadHash: hashPayload(examination),
    });
    if (reservation.state === 'complete') continue;
    const created = await api.post<JsonRecord>('/api/v1/examinations', examination,
      deriveIdempotencyKey(String(me.id), 'v1', key, 'create'));
    await completeSeedResource(db, String(me.id), key, resourceId(created));
    summary.examinations++;
  }

  for (const [index, consumption] of data.consumptions.entries()) {
    const key = `consumption:${consumption.consumedAt}:${index}`;
    const reservation = await reserveSeedResource(db, String(me.id), {
      seedKey: key, resourceKind: 'consumption', payloadHash: hashPayload(consumption),
    });
    if (reservation.state === 'complete') continue;
    const created = await api.post<JsonRecord>('/api/v1/consumptions', consumption,
      deriveIdempotencyKey(String(me.id), 'v1', key, 'create'));
    await completeSeedResource(db, String(me.id), key, resourceId(created));
    summary.consumptions++;
  }

  const photoDirectory = new URL('../../fixtures/demo/', import.meta.url);
  const photos = await loadPhotoPlans(photoDirectory);
  for (const photo of photos) {
    const analysisKey = `analysis:${photo.seedKey}`;
    const analysis = await reserveSeedResource(db, String(me.id), {
      seedKey: analysisKey, resourceKind: 'analysis', payloadHash: photo.sha256,
    });
    if (analysis.state === 'complete') {
      summary.photos++;
      summary.realAnalyses++;
      continue;
    }
    await seedPhoto(db, api, String(me.id), photo, 'v1');
    summary.photos++;
    summary.realAnalyses++;
  }
  return summary;
}

export function createDemoSeedDatabase(databaseUrl: string): { pool: Pool; db: Database } {
  const pool = new Pool({ connectionString: databaseUrl });
  return { pool, db: createDatabase(pool) };
}
