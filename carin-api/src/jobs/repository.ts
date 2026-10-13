import { createHash, randomUUID } from 'node:crypto';
import {
  and,
  asc,
  eq,
  exists,
  gt,
  gte,
  inArray,
  lt,
  lte,
  notExists,
  or,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { components } from '../contracts/generated/ai-service.js';
import type { components as AppComponents } from '../contracts/generated/app-api.js';
import type { Database } from '../db/client.js';
import {
  analysisJob,
  analysisResult,
  consentEvent,
  consumption,
  consumptionEvaluation,
  idempotencyRecord,
  scan,
  session,
  user,
} from '../db/schema/index.js';
import { validateSchema } from '../contracts/validation.js';
import { IdempotencyConflict, lockAndCheckCurrentAiConsent } from '../modules/legal/consent-service.js';
import { getLegalRegistry } from '../modules/legal/registry.js';
import {
  JOB_MAX_ACTIVE_PER_USER,
  JOB_MAX_ATTEMPTS,
  JOB_DEADLINE_MS,
  getLeaseExpiry,
  planRetry,
} from './policy.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type AnalysisResult = components['schemas']['AnalysisResult'];
export type AnalysisJobView = AppComponents['schemas']['AnalysisJob'];

export type ClaimedAnalysisJob = {
  id: string;
  userId: string;
  operationId: string;
  kind: 'photo_analysis' | 'correction' | 'consumption_evaluation';
  inputSnapshot: unknown;
  profileSnapshotId: string;
  scanId: string | null;
  consumptionId: string | null;
  basedOnResultId: string | null;
  targetRevision: number;
  targetGeneration: number;
  attempts: number;
  maxAttempts: number;
  leaseToken: string;
  leaseExpiresAt: Date;
  deadlineAt: Date;
  startedAt: Date;
};

export type JobFailure = { code: string; message: string; retryable: boolean };

function databaseNow(tx: Transaction): Promise<Date> {
  return tx.execute(sql`SELECT clock_timestamp() AS now`).then((result) => {
    const row = result.rows[0] as { now: Date | string } | undefined;
    const now = row ? (row.now instanceof Date ? row.now : new Date(row.now)) : undefined;
    if (!now || !Number.isFinite(now.getTime())) throw new Error('Database clock unavailable');
    return now;
  });
}

function currentConsentExists(tx: Transaction, version: string) {
  const newerConsent = alias(consentEvent, 'newer_ai_consent');
  return exists(
    tx.select({ id: consentEvent.id })
      .from(consentEvent)
      .where(and(
        eq(consentEvent.userId, user.id),
        eq(consentEvent.kind, 'ai_processing'),
        eq(consentEvent.version, version),
        eq(consentEvent.granted, true),
        notExists(
          tx.select({ id: newerConsent.id })
            .from(newerConsent)
            .where(and(
              eq(newerConsent.userId, user.id),
              eq(newerConsent.kind, 'ai_processing'),
              or(
                gt(newerConsent.createdAt, consentEvent.createdAt),
                and(
                  eq(newerConsent.createdAt, consentEvent.createdAt),
                  gt(newerConsent.id, consentEvent.id),
                ),
              ),
            )),
        ),
      )),
  );
}

function workExists(tx: Transaction, now: Date) {
  const job = analysisJob;
  return exists(
    tx.select({ id: job.id })
      .from(job)
      .where(and(
        eq(job.userId, user.id),
        inArray(job.status, ['queued', 'processing']),
        or(
          lte(job.deadlineAt, now),
          and(
            eq(job.status, 'processing'),
            lte(job.leaseExpiresAt, now),
            gte(job.attempts, job.maxAttempts),
          ),
          and(
            lt(job.attempts, job.maxAttempts),
            or(
              and(eq(job.status, 'queued'), lte(job.nextAttemptAt, now)),
              and(eq(job.status, 'processing'), lte(job.leaseExpiresAt, now)),
            ),
          ),
        ),
      )),
  );
}

function activeCountSubquery(tx: Transaction, now: Date) {
  return tx.select({ count: sql<number>`count(*)` })
    .from(analysisJob)
    .where(and(
      eq(analysisJob.userId, user.id),
      eq(analysisJob.status, 'processing'),
      gt(analysisJob.leaseExpiresAt, now),
      gt(analysisJob.deadlineAt, now),
    ));
}

async function markEvaluationsFailed(
  tx: Transaction,
  jobIds: string[],
  limitation: string,
  now: Date,
): Promise<void> {
  if (!jobIds.length) return;
  await tx.update(consumptionEvaluation)
    .set({
      state: 'failed',
      limitations: sql`${consumptionEvaluation.limitations} || ${JSON.stringify([limitation])}::jsonb`,
      updatedAt: now,
    })
    .where(and(
      inArray(consumptionEvaluation.jobId, jobIds),
      eq(consumptionEvaluation.state, 'pending'),
    ));
}

async function failExpiredJobs(tx: Transaction, userId: string, now: Date): Promise<void> {
  const expired = await tx.update(analysisJob)
    .set({
      status: 'failed',
      error: {
        code: 'DEADLINE_EXCEEDED',
        message: 'The analysis job exceeded its time limit.',
        retryable: true,
      },
      leaseToken: null,
      leaseExpiresAt: null,
      finishedAt: now,
      updatedAt: now,
    })
    .where(and(
      eq(analysisJob.userId, userId),
      inArray(analysisJob.status, ['queued', 'processing']),
      lte(analysisJob.deadlineAt, now),
    ))
    .returning({ id: analysisJob.id });
  await markEvaluationsFailed(tx, expired.map(({ id }) => id), 'analysis_deadline_exceeded', now);

  const exhausted = await tx.update(analysisJob)
    .set({
      status: 'failed',
      error: {
        code: 'ATTEMPTS_EXHAUSTED',
        message: 'The analysis job exhausted its automatic attempts.',
        retryable: true,
      },
      leaseToken: null,
      leaseExpiresAt: null,
      finishedAt: now,
      updatedAt: now,
    })
    .where(and(
      eq(analysisJob.userId, userId),
      eq(analysisJob.status, 'processing'),
      lte(analysisJob.leaseExpiresAt, now),
      gte(analysisJob.attempts, analysisJob.maxAttempts),
    ))
    .returning({ id: analysisJob.id });
  await markEvaluationsFailed(tx, exhausted.map(({ id }) => id), 'analysis_attempts_exhausted', now);
}

function eligibleJobWhere(userId: string, now: Date) {
  return and(
    eq(analysisJob.userId, userId),
    gt(analysisJob.deadlineAt, now),
    lt(analysisJob.attempts, analysisJob.maxAttempts),
    or(
      and(eq(analysisJob.status, 'queued'), lte(analysisJob.nextAttemptAt, now)),
      and(eq(analysisJob.status, 'processing'), lte(analysisJob.leaseExpiresAt, now)),
    ),
  );
}

/** Claims one due row from PostgreSQL; there is no process-local queue. */
export async function claimNextJob(
  db: Database,
  options: { now?: Date } = {},
): Promise<ClaimedAnalysisJob | null> {
  return db.transaction(async (tx) => {
    const now = options.now ?? await databaseNow(tx);
    const activeCount = activeCountSubquery(tx, now);
    const [owner] = await tx.select({ id: user.id })
      .from(user)
      .where(and(
        eq(user.deletionStatus, 'active'),
        currentConsentExists(tx, getLegalRegistry().aiProcessing.version),
        workExists(tx, now),
        sql`(${activeCount}) < ${JOB_MAX_ACTIVE_PER_USER}`,
      ))
      .orderBy(asc(user.createdAt), asc(user.id))
      .limit(1)
      .for('update', { skipLocked: true });
    if (!owner) return null;
    await failExpiredJobs(tx, owner.id, now);
    if (!await lockAndCheckCurrentAiConsent(tx, owner.id)) return null;

    const [active] = await tx.select({ count: sql<number>`count(*)::int` })
      .from(analysisJob)
      .where(and(
        eq(analysisJob.userId, owner.id),
        eq(analysisJob.status, 'processing'),
        gt(analysisJob.leaseExpiresAt, now),
        gt(analysisJob.deadlineAt, now),
      ));
    if (Number(active?.count ?? 0) >= JOB_MAX_ACTIVE_PER_USER) return null;

    const [candidate] = await tx.select()
      .from(analysisJob)
      .where(eligibleJobWhere(owner.id, now))
      .orderBy(asc(analysisJob.createdAt), asc(analysisJob.id))
      .limit(1)
      .for('update', { skipLocked: true });
    if (!candidate) return null;
    const leaseExpiresAt = getLeaseExpiry(now, candidate.deadlineAt);
    if (!leaseExpiresAt) return null;
    const leaseToken = crypto.randomUUID();
    const [claimed] = await tx.update(analysisJob)
      .set({
        status: 'processing',
        attempts: candidate.attempts + 1,
        leaseToken,
        leaseExpiresAt,
        startedAt: sql`COALESCE(${analysisJob.startedAt}, ${now})`,
        error: null,
        updatedAt: now,
      })
      .where(and(eq(analysisJob.id, candidate.id), eq(analysisJob.userId, owner.id)))
      .returning({
        id: analysisJob.id,
        userId: analysisJob.userId,
        operationId: analysisJob.operationId,
        kind: analysisJob.kind,
        inputSnapshot: analysisJob.inputSnapshot,
        profileSnapshotId: analysisJob.profileSnapshotId,
        scanId: analysisJob.scanId,
        consumptionId: analysisJob.consumptionId,
        basedOnResultId: analysisJob.basedOnResultId,
        targetRevision: analysisJob.targetRevision,
        targetGeneration: analysisJob.targetGeneration,
        attempts: analysisJob.attempts,
        maxAttempts: analysisJob.maxAttempts,
        leaseToken: analysisJob.leaseToken,
        leaseExpiresAt: analysisJob.leaseExpiresAt,
        deadlineAt: analysisJob.deadlineAt,
        startedAt: analysisJob.startedAt,
      });
    if (!claimed?.leaseToken || !claimed.leaseExpiresAt || !claimed.startedAt) return null;
    return {
      ...claimed,
      leaseToken: claimed.leaseToken!,
      leaseExpiresAt: claimed.leaseExpiresAt!,
      startedAt: claimed.startedAt!,
      kind: claimed.kind as ClaimedAnalysisJob['kind'],
    };
  });
}

async function lockOwnedJob(
  tx: Transaction,
  jobId: string,
  userId: string,
) {
  const [account] = await tx.select({ deletionStatus: user.deletionStatus })
    .from(user).where(eq(user.id, userId)).for('update');
  if (!account) return { account: null, job: null };
  const [job] = await tx.select()
    .from(analysisJob)
    .where(and(eq(analysisJob.id, jobId), eq(analysisJob.userId, userId)))
    .for('update');
  return { account, job: job ?? null };
}

/** Renews only the still-live fencing token, never past the immutable deadline. */
export async function renewJobLease(
  db: Database,
  input: { jobId: string; userId: string; leaseToken: string; now?: Date },
): Promise<Date | null> {
  return db.transaction(async (tx) => {
    const now = input.now ?? await databaseNow(tx);
    const { account, job } = await lockOwnedJob(tx, input.jobId, input.userId);
    if (!account || !job) return null;
    if (
      account.deletionStatus !== 'active' ||
      job.status !== 'processing' ||
      job.leaseToken !== input.leaseToken ||
      !job.leaseExpiresAt || job.leaseExpiresAt <= now || job.deadlineAt <= now
    ) return null;
    if (!await lockAndCheckCurrentAiConsent(tx, input.userId)) return null;
    const expiresAt = getLeaseExpiry(now, job.deadlineAt);
    if (!expiresAt) return null;
    const [renewed] = await tx.update(analysisJob)
      .set({ leaseExpiresAt: expiresAt, updatedAt: now })
      .where(and(
        eq(analysisJob.id, input.jobId),
        eq(analysisJob.userId, input.userId),
        eq(analysisJob.status, 'processing'),
        eq(analysisJob.leaseToken, input.leaseToken),
        gt(analysisJob.leaseExpiresAt, now),
        gt(analysisJob.deadlineAt, now),
      ))
      .returning({ leaseExpiresAt: analysisJob.leaseExpiresAt });
    return renewed?.leaseExpiresAt ?? null;
  });
}

function isCurrentAttempt(
  job: typeof analysisJob.$inferSelect,
  leaseToken: string,
  now: Date,
): boolean {
  return job.status === 'processing' && job.leaseToken === leaseToken &&
    job.leaseExpiresAt !== null && job.leaseExpiresAt > now && job.deadlineAt > now;
}

async function cancelStaleAttempt(tx: Transaction, jobId: string, now: Date): Promise<void> {
  await tx.update(analysisJob)
    .set({
      status: 'cancelled',
      leaseToken: null,
      leaseExpiresAt: null,
      finishedAt: now,
      updatedAt: now,
    })
    .where(and(eq(analysisJob.id, jobId), eq(analysisJob.status, 'processing')));
}

/** Inserts the result and advances its target in one fenced transaction. */
export async function publishJobResult(
  db: Database,
  input: {
    jobId: string;
    userId: string;
    leaseToken: string;
    result: AnalysisResult | Record<string, unknown>;
    now?: Date;
  },
): Promise<boolean> {
  validateSchema('ai.AnalysisResult', input.result);
  return db.transaction(async (tx) => {
    const now = input.now ?? await databaseNow(tx);
    const { account, job } = await lockOwnedJob(tx, input.jobId, input.userId);
    if (!account || !job || !isCurrentAttempt(job, input.leaseToken, now)) return false;
    if (account.deletionStatus !== 'active' || !await lockAndCheckCurrentAiConsent(tx, input.userId)) {
      await cancelStaleAttempt(tx, job.id, now);
      return false;
    }
    const output = input.result as AnalysisResult;
    if (output.operationId !== job.operationId) {
      throw new Error('Analysis result operation does not match the claimed job');
    }

    let scanRow: typeof scan.$inferSelect | undefined;
    let consumptionRow: typeof consumption.$inferSelect | undefined;
    let evaluationRow: typeof consumptionEvaluation.$inferSelect | undefined;
    if (job.scanId) {
      [scanRow] = await tx.select().from(scan)
        .where(and(eq(scan.id, job.scanId), eq(scan.userId, input.userId)))
        .for('update');
      const targetIsCurrent = Boolean(scanRow) && scanRow!.lifecycle === 'active' &&
        scanRow!.photoId !== null && scanRow!.deletedAt === null && scanRow!.generation === job.targetGeneration &&
        scanRow!.latestJobId === job.id && (
          job.kind === 'photo_analysis'
            ? job.targetRevision === scanRow!.revision && scanRow!.currentResultId === null
            : job.kind === 'correction' && job.targetRevision === scanRow!.revision + 1 &&
              job.basedOnResultId === scanRow!.currentResultId
        );
      if (!targetIsCurrent) {
        await cancelStaleAttempt(tx, job.id, now);
        return false;
      }
    } else if (job.consumptionId) {
      [consumptionRow] = await tx.select().from(consumption)
        .where(and(eq(consumption.id, job.consumptionId), eq(consumption.userId, input.userId)))
        .for('update');
      if (!consumptionRow || consumptionRow.deletedAt !== null ||
          consumptionRow.revision !== job.targetRevision ||
          consumptionRow.generation !== job.targetGeneration || !consumptionRow.currentSnapshotId) {
        await cancelStaleAttempt(tx, job.id, now);
        return false;
      }
      [evaluationRow] = await tx.select().from(consumptionEvaluation)
        .where(and(
          eq(consumptionEvaluation.userId, input.userId),
          eq(consumptionEvaluation.consumptionId, job.consumptionId),
          eq(consumptionEvaluation.revision, job.targetRevision),
          eq(consumptionEvaluation.jobId, job.id),
        ))
        .for('update');
      if (!evaluationRow || evaluationRow.state !== 'pending' ||
          evaluationRow.snapshotId !== consumptionRow.currentSnapshotId) {
        await cancelStaleAttempt(tx, job.id, now);
        return false;
      }
    } else {
      await cancelStaleAttempt(tx, job.id, now);
      return false;
    }

    const [stored] = await tx.insert(analysisResult).values({
      userId: input.userId,
      jobId: job.id,
      profileSnapshotId: job.profileSnapshotId,
      catalogVersion: output.catalogVersion,
      ruleVersion: output.ruleSetVersion,
      output,
      completedAt: now,
    }).returning({ id: analysisResult.id });
    if (!stored) throw new Error('Analysis result was not stored');

    if (scanRow) {
      await tx.update(scan)
        .set({
          revision: job.targetRevision,
          currentResultId: stored.id,
          updatedAt: now,
        })
        .where(and(eq(scan.id, scanRow.id), eq(scan.userId, input.userId)));
    } else if (evaluationRow) {
      await tx.update(consumptionEvaluation)
        .set({ state: 'completed', resultId: stored.id, updatedAt: now })
        .where(eq(consumptionEvaluation.id, evaluationRow.id));
    }
    await tx.update(analysisJob)
      .set({
        status: 'completed',
        leaseToken: null,
        leaseExpiresAt: null,
        error: null,
        finishedAt: now,
        updatedAt: now,
      })
      .where(and(
        eq(analysisJob.id, job.id),
        eq(analysisJob.userId, input.userId),
        eq(analysisJob.status, 'processing'),
        eq(analysisJob.leaseToken, input.leaseToken),
      ));
    return true;
  });
}

/** Saves only the current attempt's provider failure and applies bounded backoff. */
export async function recordJobFailure(
  db: Database,
  input: {
    jobId: string;
    userId: string;
    leaseToken: string;
    error: JobFailure;
    now?: Date;
  },
): Promise<'retrying' | 'failed' | 'stale'> {
  return db.transaction(async (tx) => {
    const now = input.now ?? await databaseNow(tx);
    const { account, job } = await lockOwnedJob(tx, input.jobId, input.userId);
    if (!account || !job || !isCurrentAttempt(job, input.leaseToken, now)) return 'stale';
    if (account.deletionStatus !== 'active' || !await lockAndCheckCurrentAiConsent(tx, input.userId)) {
      await cancelStaleAttempt(tx, job.id, now);
      return 'stale';
    }
    const retry = planRetry({
      attempts: job.attempts,
      maxAttempts: Math.min(job.maxAttempts, JOB_MAX_ATTEMPTS),
      now,
      deadlineAt: job.deadlineAt,
      retryable: input.error.retryable,
    });
    if (retry.kind === 'retry') {
      await tx.update(analysisJob)
        .set({
          status: 'queued',
          nextAttemptAt: retry.nextAttemptAt,
          leaseToken: null,
          leaseExpiresAt: null,
          error: null,
          updatedAt: now,
        })
        .where(and(
          eq(analysisJob.id, job.id),
          eq(analysisJob.userId, input.userId),
          eq(analysisJob.status, 'processing'),
          eq(analysisJob.leaseToken, input.leaseToken),
        ));
      return 'retrying';
    }

    const deadlineExceeded = retry.reason === 'deadline_exceeded';
    await tx.update(analysisJob)
      .set({
        status: 'failed',
        leaseToken: null,
        leaseExpiresAt: null,
        error: {
          code: deadlineExceeded ? 'DEADLINE_EXCEEDED' : input.error.code,
          message: deadlineExceeded ? 'The analysis job exceeded its time limit.' : input.error.message,
          retryable: input.error.retryable,
        },
        finishedAt: now,
        updatedAt: now,
      })
      .where(and(
        eq(analysisJob.id, job.id),
        eq(analysisJob.userId, input.userId),
        eq(analysisJob.status, 'processing'),
        eq(analysisJob.leaseToken, input.leaseToken),
      ));
    await markEvaluationsFailed(tx, [job.id], deadlineExceeded ? 'analysis_deadline_exceeded' : 'analysis_failed', now);
    return 'failed';
  });
}

/** Creates the immutable first deadline from database time for job producers. */
export function newJobDeadline(now: Date): Date {
  return new Date(now.getTime() + JOB_DEADLINE_MS);
}

export class RetryJobError extends Error {
  constructor(readonly reason: 'consent_required' | 'target_stale' | 'not_retryable' | 'active_limit' | 'session_invalid') {
    super(reason);
  }
}

function toJobView(
  job: typeof analysisJob.$inferSelect,
  resultId: string | null,
  result: unknown,
): AnalysisJobView {
  return {
    attempts: job.attempts,
    createdAt: job.createdAt.toISOString(),
    error: job.error as AnalysisJobView['error'],
    finishedAt: job.finishedAt?.toISOString() ?? null,
    id: job.id,
    inputKind: job.kind === 'photo_analysis' ? 'photo' : job.kind === 'correction' ? 'correction' : 'manual',
    result: result as AnalysisJobView['result'],
    resultId,
    scanId: job.scanId,
    startedAt: job.startedAt?.toISOString() ?? null,
    status: job.status as AnalysisJobView['status'],
    targetId: job.scanId ?? job.consumptionId!,
    targetRevision: job.targetRevision,
    targetType: job.scanId ? 'scan' : 'consumption',
  };
}

async function findOwnedJobView(tx: Transaction, userId: string, jobId: string): Promise<AnalysisJobView | null> {
  const [row] = await tx.select({
    job: analysisJob,
    resultId: analysisResult.id,
    result: analysisResult.output,
  })
    .from(analysisJob)
    .leftJoin(analysisResult, eq(analysisResult.jobId, analysisJob.id))
    .where(and(eq(analysisJob.id, jobId), eq(analysisJob.userId, userId)));
  return row ? toJobView(row.job, row.resultId, row.result) : null;
}

/** Owner-scoped status/result read. Consent does not hide already stored job state. */
export async function getOwnedJobView(db: Database, userId: string, jobId: string): Promise<AnalysisJobView | null> {
  const [row] = await db.select({
    job: analysisJob,
    resultId: analysisResult.id,
    result: analysisResult.output,
  })
    .from(analysisJob)
    .leftJoin(analysisResult, eq(analysisResult.jobId, analysisJob.id))
    .where(and(eq(analysisJob.id, jobId), eq(analysisJob.userId, userId)));
  const view = row ? toJobView(row.job, row.resultId, row.result) : null;
  if (!view) return null;
  validateSchema('app.AnalysisJob', view);
  return view;
}

/** Creates a new durable row for an explicit retry without changing the old snapshot. */
export async function retryTerminalJob(
  db: Database,
  input: { userId: string; sessionId: string; jobId: string; idempotencyKey: string },
): Promise<AnalysisJobView | null> {
  const requestHash = createHash('sha256')
    .update(JSON.stringify({ action: 'retry_analysis_job', jobId: input.jobId }))
    .digest('hex');

  const view = await db.transaction(async (tx) => {
    const now = await databaseNow(tx);
    const [account] = await tx.select({ id: user.id, deletionStatus: user.deletionStatus })
      .from(user)
      .where(eq(user.id, input.userId))
      .for('update');
    if (!account || account.deletionStatus !== 'active') return null;

    const [authSession] = await tx.select({ id: session.id })
      .from(session)
      .where(and(
        eq(session.id, input.sessionId),
        eq(session.userId, input.userId),
        gt(session.expiresAt, now),
      ));
    if (!authSession) throw new RetryJobError('session_invalid');

    await tx.delete(idempotencyRecord).where(and(
      eq(idempotencyRecord.userId, input.userId),
      eq(idempotencyRecord.sessionId, input.sessionId),
      eq(idempotencyRecord.actionScope, 'analysis-job:retry'),
      eq(idempotencyRecord.key, input.idempotencyKey),
      lt(idempotencyRecord.expiresAt, now),
    ));
    const [reserved] = await tx.insert(idempotencyRecord).values({
      userId: input.userId,
      sessionId: input.sessionId,
      actionScope: 'analysis-job:retry',
      key: input.idempotencyKey,
      requestHash,
    }).onConflictDoNothing().returning({ id: idempotencyRecord.id });

    if (!reserved) {
      const [prior] = await tx.select()
        .from(idempotencyRecord)
        .where(and(
          eq(idempotencyRecord.userId, input.userId),
          eq(idempotencyRecord.sessionId, input.sessionId),
          eq(idempotencyRecord.actionScope, 'analysis-job:retry'),
          eq(idempotencyRecord.key, input.idempotencyKey),
        ))
        .for('update');
      if (!prior || prior.requestHash !== requestHash || !prior.resourceId || prior.responseStatus !== 202) {
        throw new IdempotencyConflict();
      }
      return findOwnedJobView(tx, input.userId, prior.resourceId);
    }

    const [source] = await tx.select().from(analysisJob)
      .where(and(eq(analysisJob.id, input.jobId), eq(analysisJob.userId, input.userId)))
      .for('update');
    if (!source) return null;
    if (source.status !== 'failed' || typeof source.error !== 'object' || source.error === null ||
      !('retryable' in source.error) || source.error.retryable !== true) {
      throw new RetryJobError('not_retryable');
    }
    if (!await lockAndCheckCurrentAiConsent(tx, input.userId)) {
      throw new RetryJobError('consent_required');
    }

    if (source.scanId) {
      const [target] = await tx.select().from(scan)
        .where(and(eq(scan.id, source.scanId), eq(scan.userId, input.userId)))
        .for('update');
      const current = Boolean(target) && target!.lifecycle === 'active' && target!.photoId !== null &&
        target!.deletedAt === null &&
        target!.generation === source.targetGeneration && target!.latestJobId === source.id && (
          source.kind === 'photo_analysis'
            ? source.targetRevision === target!.revision && target!.currentResultId === null
            : source.kind === 'correction' && source.targetRevision === target!.revision + 1 &&
              source.basedOnResultId === target!.currentResultId
        );
      if (!current) throw new RetryJobError('target_stale');
    } else if (source.consumptionId) {
      const [target] = await tx.select().from(consumption)
        .where(and(eq(consumption.id, source.consumptionId), eq(consumption.userId, input.userId)))
        .for('update');
      if (!target || target.deletedAt !== null || target.revision !== source.targetRevision ||
        target.generation !== source.targetGeneration || !target.currentSnapshotId) {
        throw new RetryJobError('target_stale');
      }
      const [evaluation] = await tx.select().from(consumptionEvaluation)
        .where(and(
          eq(consumptionEvaluation.userId, input.userId),
          eq(consumptionEvaluation.consumptionId, source.consumptionId),
          eq(consumptionEvaluation.revision, source.targetRevision),
          eq(consumptionEvaluation.jobId, source.id),
        ))
        .for('update');
      if (!evaluation || evaluation.state !== 'failed' || evaluation.snapshotId !== target.currentSnapshotId) {
        throw new RetryJobError('target_stale');
      }
    } else {
      throw new RetryJobError('target_stale');
    }

    const [active] = await tx.select({ count: sql<number>`count(*)::int` })
      .from(analysisJob)
      .where(and(
        eq(analysisJob.userId, input.userId),
        inArray(analysisJob.status, ['queued', 'processing']),
      ));
    if (Number(active?.count ?? 0) >= JOB_MAX_ACTIVE_PER_USER) throw new RetryJobError('active_limit');

    const newId = randomUUID();
    const [created] = await tx.insert(analysisJob).values({
      id: newId,
      userId: input.userId,
      operationId: randomUUID(),
      kind: source.kind,
      inputSnapshot: source.inputSnapshot,
      profileSnapshotId: source.profileSnapshotId,
      scanId: source.scanId,
      consumptionId: source.consumptionId,
      basedOnResultId: source.basedOnResultId,
      targetRevision: source.targetRevision,
      targetGeneration: source.targetGeneration,
      status: 'queued',
      attempts: 0,
      maxAttempts: Math.min(source.maxAttempts, JOB_MAX_ATTEMPTS),
      nextAttemptAt: now,
      deadlineAt: newJobDeadline(now),
    }).returning();
    if (!created) throw new Error('Retry job was not created');

    if (source.scanId) {
      await tx.update(scan)
        .set({ latestJobId: created.id, updatedAt: now })
        .where(and(eq(scan.id, source.scanId), eq(scan.userId, input.userId)));
    } else if (source.consumptionId) {
      await tx.update(consumptionEvaluation)
        .set({ state: 'pending', jobId: created.id, resultId: null, updatedAt: now })
        .where(and(
          eq(consumptionEvaluation.userId, input.userId),
          eq(consumptionEvaluation.consumptionId, source.consumptionId),
          eq(consumptionEvaluation.revision, source.targetRevision),
          eq(consumptionEvaluation.jobId, source.id),
          eq(consumptionEvaluation.state, 'failed'),
        ));
    }

    const createdView = toJobView(created, null, null);
    await tx.update(idempotencyRecord)
      .set({ responseStatus: 202, responseBody: createdView, resourceId: created.id })
      .where(eq(idempotencyRecord.id, reserved.id));
    return createdView;
  });

  if (view) validateSchema('app.AnalysisJob', view);
  return view;
}
