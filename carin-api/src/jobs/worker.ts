import type { components } from '../contracts/generated/ai-service.js';
import type { Database } from '../db/client.js';
import { ContractValidationError } from '../contracts/validation.js';
import { AiAdapterError, type AiClient } from '../integrations/ai/index.js';
import { AnalysisCatalogUnavailableError, loadAnalysisValidationContext } from '../modules/analyses/repository.js';
import { InvalidAnalysisResult, validateAnalysisResult } from '../modules/analyses/result-validation.js';
import {
  claimNextJob,
  publishJobResult,
  recordJobFailure,
  renewJobLease,
  type ClaimedAnalysisJob,
  type JobFailure,
} from './repository.js';
import { AI_CALL_TIMEOUT_MS } from './policy.js';

type AnalysisResult = components['schemas']['AnalysisResult'];

async function aiRequestSnapshot(
  job: ClaimedAnalysisJob,
  photoUrlForJob?: (userId: string, photoId: string) => Promise<string>,
): Promise<Record<string, unknown>> {
  if (typeof job.inputSnapshot !== 'object' || job.inputSnapshot === null || Array.isArray(job.inputSnapshot)) {
    throw new AiAdapterError('INVALID_REQUEST', 'Stored analysis input is invalid.', false);
  }
  const snapshot = job.inputSnapshot as Record<string, unknown>;
  const photo = snapshot.photo;
  if (job.kind === 'photo_analysis' && typeof photo === 'object' && photo !== null && !Array.isArray(photo)) {
    const metadata = photo as Record<string, unknown>;
    if (!photoUrlForJob || typeof metadata.photoId !== 'string' ||
        (metadata.mimeType !== 'image/jpeg' && metadata.mimeType !== 'image/png') ||
        typeof metadata.sha256 !== 'string') {
      throw new AiAdapterError('INVALID_REQUEST', 'Stored photo request is incomplete.', false);
    }
    let downloadUrl: string;
    try {
      downloadUrl = await photoUrlForJob(job.userId, metadata.photoId);
      const parsed = new URL(downloadUrl);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) throw new Error();
    } catch {
      throw new AiAdapterError('SERVICE_UNAVAILABLE', 'Private photo is unavailable to the analysis worker.', true);
    }
    return {
      contractVersion: snapshot.contractVersion,
      operationId: job.operationId,
      catalogVersion: snapshot.catalogVersion,
      ruleSetVersion: snapshot.ruleSetVersion,
      profile: snapshot.profile,
      image: {
        downloadUrl,
        mimeType: metadata.mimeType,
        sha256: metadata.sha256,
      },
    };
  }
  return { ...snapshot, operationId: job.operationId };
}

function failureFor(error: unknown): JobFailure {
  if (error instanceof AiAdapterError) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }
  return {
    code: 'SERVICE_UNAVAILABLE',
    message: 'The analysis service could not complete this job.',
    retryable: true,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForHeartbeat<T>(completion: Promise<T>, ms: number): Promise<T | { kind: 'heartbeat' }> {
  let timer: ReturnType<typeof setTimeout>;
  const heartbeat = new Promise<{ kind: 'heartbeat' }>((resolve) => {
    timer = setTimeout(() => resolve({ kind: 'heartbeat' }), ms);
  });
  return Promise.race([completion, heartbeat]).finally(() => clearTimeout(timer!));
}

function timed<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    task,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new AiAdapterError('TIMEOUT', 'AI service request timed out.', true)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer!));
}

async function invokeWithHeartbeat(
  db: Database,
  ai: AiClient,
  job: ClaimedAnalysisJob,
  heartbeatMs: number,
  photoUrlForJob?: (userId: string, photoId: string) => Promise<string>,
): Promise<AnalysisResult> {
  const request = await aiRequestSnapshot(job, photoUrlForJob);
  const invoke = job.kind === 'photo_analysis'
    ? ai.analyzePhoto(request as unknown as components['schemas']['PhotoAnalysisRequest'])
    : ai.recalculateComponents(request as unknown as components['schemas']['RecalculationRequest']);
  const provider = timed(invoke, AI_CALL_TIMEOUT_MS);
  const completion = provider.then(
    (value) => ({ kind: 'complete' as const, value }),
    (error: unknown) => ({ kind: 'error' as const, error }),
  );

  for (;;) {
    const next = await waitForHeartbeat(completion, heartbeatMs);
    if (next.kind === 'complete') return next.value;
    if (next.kind === 'error') throw next.error;
    const renewed = await renewJobLease(db, {
      jobId: job.id,
      userId: job.userId,
      leaseToken: job.leaseToken,
    });
    if (!renewed) return provider;
  }
}

export type RunWorkerOnceResult = 'idle' | 'completed' | 'failed' | 'stale';

/** Claims work from PostgreSQL, calls the AI outside a transaction, and publishes behind the fence. */
export async function runAnalysisWorkerOnce(
  db: Database,
  ai: AiClient,
  options: {
    heartbeatMs?: number;
    photoUrlForJob?: (userId: string, photoId: string) => Promise<string>;
  } = {},
): Promise<RunWorkerOnceResult> {
  const job = await claimNextJob(db);
  if (!job) return 'idle';

  let result: AnalysisResult;
  try {
    result = await invokeWithHeartbeat(db, ai, job, options.heartbeatMs ?? 40_000, options.photoUrlForJob);
  } catch (error) {
    const outcome = await recordJobFailure(db, {
      jobId: job.id,
      userId: job.userId,
      leaseToken: job.leaseToken,
      error: failureFor(error),
    });
    return outcome === 'stale' ? 'stale' : 'failed';
  }

  try {
    if (job.scanId) {
      const context = await loadAnalysisValidationContext(db, job, result);
      validateAnalysisResult(result, context.expectation, context.catalog);
    }
    return await publishJobResult(db, {
      jobId: job.id,
      userId: job.userId,
      leaseToken: job.leaseToken,
      result,
    }) ? 'completed' : 'stale';
  } catch (error) {
    if (!(error instanceof ContractValidationError) && !(error instanceof InvalidAnalysisResult) &&
        !(error instanceof AnalysisCatalogUnavailableError)) throw error;
    const outcome = await recordJobFailure(db, {
      jobId: job.id,
      userId: job.userId,
      leaseToken: job.leaseToken,
      error: { code: 'INVALID_RESPONSE', message: 'AI result failed contract validation.', retryable: false },
    });
    return outcome === 'stale' ? 'stale' : 'failed';
  }
}

export async function runAnalysisWorker(
  db: Database,
  ai: AiClient,
  options: {
    concurrency?: number;
    pollIntervalMs?: number;
    signal?: AbortSignal;
    onError?: () => void;
    photoUrlForJob?: (userId: string, photoId: string) => Promise<string>;
  } = {},
): Promise<void> {
  const concurrency = options.concurrency ?? 2;
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) {
    throw new RangeError('Worker concurrency must be an integer between 1 and 32');
  }
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 50) {
    throw new RangeError('Worker poll interval must be at least 50 milliseconds');
  }

  const runLoop = async () => {
    while (!options.signal?.aborted) {
      try {
        const result = await runAnalysisWorkerOnce(db, ai, { photoUrlForJob: options.photoUrlForJob });
        if (result === 'idle') await delay(pollIntervalMs);
      } catch {
        options.onError?.();
        await delay(pollIntervalMs);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, runLoop));
}
