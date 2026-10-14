import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, gt, inArray, lt, or, sql } from 'drizzle-orm';
import type { components } from '../../contracts/generated/ai-service.js';
import type { components as AppComponents } from '../../contracts/generated/app-api.js';
import { ContractValidationError, validateSchema } from '../../contracts/validation.js';
import type { Database } from '../../db/client.js';
import {
  analysisJob,
  analysisResult,
  catalogFood,
  catalogServing,
  catalogVersion,
  consumption,
  idempotencyRecord,
  profileSnapshot,
  scan,
  session,
  user,
} from '../../db/schema/index.js';
import { newJobDeadline } from '../../jobs/repository.js';
import { JOB_MAX_ACTIVE_PER_USER, JOB_MAX_ATTEMPTS } from '../../jobs/policy.js';
import { IdempotencyConflict, lockAndCheckCurrentAiConsent } from '../legal/consent-service.js';
import { AnalysisCatalogUnavailableError } from '../analyses/repository.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type Ai = components['schemas'];
type ProfileContext = components['schemas']['ProfileContext'];
type AnalysisJobView = AppComponents['schemas']['AnalysisJob'];
type ScanView = AppComponents['schemas']['Scan'];
type CorrectionInput = AppComponents['schemas']['CorrectionInput'];

export class ScanNotFoundError extends Error {}

export class ScanCorrectionError extends Error {
  constructor(readonly reason: 'session_invalid' | 'consent_required' | 'revision_conflict' | 'pending' | 'active_limit' | 'invalid_component') {
    super(reason);
  }
}

export class ScanAnalysisPendingError extends Error {}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function hash(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

async function databaseNow(tx: Transaction): Promise<Date> {
  const result = await tx.execute(sql`SELECT clock_timestamp() AS now`);
  const value = (result.rows[0] as { now?: Date | string } | undefined)?.now;
  const now = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
  if (!now || !Number.isFinite(now.getTime())) throw new Error('Database clock unavailable');
  return now;
}

function jobView(job: typeof analysisJob.$inferSelect): AnalysisJobView {
  return {
    attempts: job.attempts,
    createdAt: job.createdAt.toISOString(),
    error: job.error as AnalysisJobView['error'],
    finishedAt: job.finishedAt?.toISOString() ?? null,
    id: job.id,
    inputKind: 'correction',
    result: null,
    resultId: null,
    scanId: job.scanId,
    startedAt: job.startedAt?.toISOString() ?? null,
    status: job.status as AnalysisJobView['status'],
    targetId: job.scanId ?? job.consumptionId!,
    targetRevision: job.targetRevision,
    targetType: job.scanId ? 'scan' : 'consumption',
  };
}

function viewScan(
  row: typeof scan.$inferSelect,
  defaultConsumptionId: string | null,
): ScanView {
  if (!row.latestJobId) throw new Error('Active scan has no latest analysis job');
  return {
    id: row.id,
    revision: row.revision,
    photoId: row.photoId,
    createdAt: row.createdAt.toISOString(),
    latestJobId: row.latestJobId,
    latestResultId: row.currentResultId,
    defaultConsumptionId,
  };
}

async function defaultConsumptionFor(db: Database | Transaction, userId: string, scanId: string): Promise<string | null> {
  const [row] = await db.select({ id: consumption.id }).from(consumption).where(and(
    eq(consumption.userId, userId), eq(consumption.scanId, scanId),
    eq(consumption.source, 'photo_confirmation'), eq(consumption.confirmationMode, 'default'),
    sql`${consumption.deletedAt} IS NULL`,
  )).limit(1);
  return row?.id ?? null;
}

export async function getOwnedScan(db: Database, userId: string, scanId: string): Promise<ScanView | null> {
  const [row] = await db.select().from(scan).where(and(
    eq(scan.id, scanId), eq(scan.userId, userId), eq(scan.lifecycle, 'active'), sql`${scan.deletedAt} IS NULL`,
  )).limit(1);
  if (!row) return null;
  return viewScan(row, await defaultConsumptionFor(db, userId, scanId));
}

type ScanCursor = { createdAt: Date; id: string };
function decodeCursor(value: string): ScanCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { createdAt?: unknown; id?: unknown };
    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.id)) {
      throw new Error('Invalid cursor');
    }
    const createdAt = new Date(parsed.createdAt);
    if (!Number.isFinite(createdAt.getTime())) throw new Error('Invalid cursor');
    return { createdAt, id: parsed.id };
  } catch {
    throw new ContractValidationError('app.listScans.cursor');
  }
}

function encodeCursor(row: typeof scan.$inferSelect): string {
  return Buffer.from(JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id }), 'utf8').toString('base64url');
}

export async function listOwnedScans(
  db: Database,
  input: { userId: string; cursor?: string; limit: number },
): Promise<AppComponents['schemas']['ScanPage']> {
  const cursor = input.cursor ? decodeCursor(input.cursor) : null;
  const filters = [eq(scan.userId, input.userId), eq(scan.lifecycle, 'active'), sql`${scan.deletedAt} IS NULL`];
  if (cursor) filters.push(or(
    lt(scan.createdAt, cursor.createdAt), and(eq(scan.createdAt, cursor.createdAt), lt(scan.id, cursor.id)),
  )!);
  const rows = await db.select({ scan, defaultConsumptionId: consumption.id })
    .from(scan)
    .leftJoin(consumption, and(
      eq(consumption.userId, input.userId), eq(consumption.scanId, scan.id),
      eq(consumption.source, 'photo_confirmation'), eq(consumption.confirmationMode, 'default'),
      sql`${consumption.deletedAt} IS NULL`,
    ))
    .where(and(...filters))
    .orderBy(desc(scan.createdAt), desc(scan.id))
    .limit(input.limit + 1);
  const hasMore = rows.length > input.limit;
  const page = rows.slice(0, input.limit);
  const last = page.at(-1)?.scan;
  return {
    items: page.map(({ scan: row, defaultConsumptionId }) => viewScan(row, defaultConsumptionId)),
    nextCursor: hasMore && last ? encodeCursor(last) : null,
  };
}

async function reserveCorrectionIdempotency(
  tx: Transaction,
  input: { userId: string; sessionId: string; key: string; requestHash: string; now: Date },
): Promise<{ reservationId: string | null; replay: AnalysisJobView | null }> {
  const actionScope = 'scan:correction';
  await tx.delete(idempotencyRecord).where(and(
    eq(idempotencyRecord.userId, input.userId), eq(idempotencyRecord.sessionId, input.sessionId),
    eq(idempotencyRecord.actionScope, actionScope), eq(idempotencyRecord.key, input.key),
    lt(idempotencyRecord.expiresAt, input.now),
  ));
  const [reserved] = await tx.insert(idempotencyRecord).values({
    userId: input.userId,
    sessionId: input.sessionId,
    actionScope,
    key: input.key,
    requestHash: input.requestHash,
  }).onConflictDoNothing().returning({ id: idempotencyRecord.id });
  if (reserved) return { reservationId: reserved.id, replay: null };
  const [prior] = await tx.select().from(idempotencyRecord).where(and(
    eq(idempotencyRecord.userId, input.userId), eq(idempotencyRecord.sessionId, input.sessionId),
    eq(idempotencyRecord.actionScope, actionScope), eq(idempotencyRecord.key, input.key),
  )).for('update');
  if (!prior || prior.requestHash !== input.requestHash || prior.responseStatus !== 202 || !prior.responseBody) {
    throw new IdempotencyConflict();
  }
  try {
    validateSchema('app.AnalysisJob', prior.responseBody);
  } catch {
    throw new IdempotencyConflict();
  }
  return { reservationId: null, replay: prior.responseBody as AnalysisJobView };
}

function validateCorrectionComponents(
  components: Ai['ComponentInput'][],
  foods: Array<typeof catalogFood.$inferSelect>,
  servings: Array<typeof catalogServing.$inferSelect>,
): void {
  if (new Set(components.map((component) => component.id)).size !== components.length) {
    throw new ScanCorrectionError('invalid_component');
  }
  for (const component of components) {
    const portion = component.portion;
    if (component.catalogFoodId === null) {
      if (portion.kind === 'known' && portion.unit === 'serving') throw new ScanCorrectionError('invalid_component');
      continue;
    }
    const food = foods.find(({ id }) => id === component.catalogFoodId);
    if (!food) throw new ScanCorrectionError('invalid_component');
    if (portion.kind === 'known' && portion.unit === 'serving' &&
        !servings.some((serving) => serving.foodId === food.id && serving.id === portion.servingId)) {
      throw new ScanCorrectionError('invalid_component');
    }
  }
}

/** Enqueues a correction against the latest successful result, leaving its pointer intact until publication. */
export async function createScanCorrection(
  db: Database,
  input: {
    userId: string;
    sessionId: string;
    scanId: string;
    idempotencyKey: string;
    correction: CorrectionInput;
  },
): Promise<AnalysisJobView> {
  const requestHash = hash({
    expectedRevision: input.correction.expectedRevision,
    basedOnResultId: input.correction.basedOnResultId,
    components: input.correction.components,
    catalogVersion: input.correction.catalogVersion,
  });
  return db.transaction(async (tx) => {
    const now = await databaseNow(tx);
    const [account] = await tx.select({ id: user.id, deletionStatus: user.deletionStatus }).from(user)
      .where(eq(user.id, input.userId)).for('update');
    if (!account || account.deletionStatus !== 'active') throw new ScanCorrectionError('session_invalid');
    const [activeSession] = await tx.select({ id: session.id }).from(session).where(and(
      eq(session.id, input.sessionId), eq(session.userId, input.userId), gt(session.expiresAt, now),
    )).for('update');
    if (!activeSession) throw new ScanCorrectionError('session_invalid');
    const reservation = await reserveCorrectionIdempotency(tx, {
      userId: input.userId,
      sessionId: input.sessionId,
      key: input.idempotencyKey,
      requestHash,
      now,
    });
    if (reservation.replay) return reservation.replay;
    if (!await lockAndCheckCurrentAiConsent(tx, input.userId)) throw new ScanCorrectionError('consent_required');

    const [target] = await tx.select().from(scan).where(and(
      eq(scan.id, input.scanId), eq(scan.userId, input.userId), eq(scan.lifecycle, 'active'), sql`${scan.deletedAt} IS NULL`,
    )).for('update');
    if (!target) throw new ScanNotFoundError();
    if (input.correction.expectedRevision !== target.revision ||
        input.correction.basedOnResultId !== target.currentResultId || !target.currentResultId) {
      throw new ScanCorrectionError('revision_conflict');
    }
    if (target.photoId === null) throw new ScanNotFoundError();

    if (target.latestJobId) {
      const [latestJob] = await tx.select({ status: analysisJob.status }).from(analysisJob).where(and(
        eq(analysisJob.id, target.latestJobId), eq(analysisJob.userId, input.userId),
      )).for('update');
      if (latestJob && ['queued', 'processing'].includes(latestJob.status)) throw new ScanCorrectionError('pending');
    }
    const [source] = await tx.select({ output: analysisResult.output }).from(analysisResult).where(and(
      eq(analysisResult.id, target.currentResultId), eq(analysisResult.userId, input.userId),
    )).limit(1);
    if (!source) throw new ScanCorrectionError('revision_conflict');
    validateSchema('ai.AnalysisResult', source.output);
    const currentResult = source.output as Ai['AnalysisResult'];
    if (input.correction.catalogVersion !== currentResult.catalogVersion) {
      throw new AnalysisCatalogUnavailableError();
    }
    const [version] = await tx.select().from(catalogVersion).where(eq(catalogVersion.version, input.correction.catalogVersion)).limit(1);
    if (!version || version.ruleSetVersion !== currentResult.ruleSetVersion ||
        version.nutritionDatasetVersion !== currentResult.nutritionDatasetVersion) {
      throw new AnalysisCatalogUnavailableError();
    }
    const selectedFoodIds = [...new Set(input.correction.components.flatMap((component) =>
      component.catalogFoodId ? [component.catalogFoodId] : [],
    ))];
    const foods = selectedFoodIds.length
      ? await tx.select().from(catalogFood).where(and(
          eq(catalogFood.version, input.correction.catalogVersion), inArray(catalogFood.id, selectedFoodIds),
        ))
      : [];
    const selectedServings = foods.length
      ? await tx.select().from(catalogServing).where(and(
          eq(catalogServing.catalogVersion, input.correction.catalogVersion),
          inArray(catalogServing.foodId, foods.map((food) => food.id)),
        ))
      : [];
    validateCorrectionComponents(input.correction.components, foods, selectedServings);

    const [snapshot] = await tx.select({ context: profileSnapshot.context, profileVersion: profileSnapshot.profileVersion })
      .from(profileSnapshot).where(and(
        eq(profileSnapshot.id, target.profileSnapshotId), eq(profileSnapshot.userId, input.userId),
      )).limit(1);
    if (!snapshot) throw new ScanNotFoundError();
    validateSchema('ai.ProfileContext', snapshot.context);
    const profile = snapshot.context as ProfileContext;
    if (profile.profileVersion !== snapshot.profileVersion) throw new ScanCorrectionError('revision_conflict');
    const [activeJobs] = await tx.select({ count: sql<number>`count(*)::int` }).from(analysisJob).where(and(
      eq(analysisJob.userId, input.userId), inArray(analysisJob.status, ['queued', 'processing']),
    ));
    if (Number(activeJobs?.count ?? 0) >= JOB_MAX_ACTIVE_PER_USER) throw new ScanCorrectionError('active_limit');

    const generation = target.generation + 1;
    const targetRevision = target.revision + 1;
    const jobInput = {
      contractVersion: '1.0.0',
      inputKind: 'correction',
      catalogVersion: version.version,
      ruleSetVersion: version.ruleSetVersion,
      profile,
      components: input.correction.components,
    };
    const [job] = await tx.insert(analysisJob).values({
      id: randomUUID(),
      userId: input.userId,
      operationId: randomUUID(),
      kind: 'correction',
      inputSnapshot: jobInput,
      profileSnapshotId: target.profileSnapshotId,
      scanId: target.id,
      basedOnResultId: target.currentResultId,
      targetRevision,
      targetGeneration: generation,
      status: 'queued',
      attempts: 0,
      maxAttempts: JOB_MAX_ATTEMPTS,
      nextAttemptAt: now,
      deadlineAt: newJobDeadline(now),
      createdAt: now,
      updatedAt: now,
    }).returning();
    if (!job) throw new Error('Correction job was not created');
    await tx.update(scan).set({ generation, latestJobId: job.id, updatedAt: now }).where(and(
      eq(scan.id, target.id), eq(scan.userId, input.userId), eq(scan.revision, target.revision),
    ));
    const response = jobView(job);
    validateSchema('app.AnalysisJob', response);
    await tx.update(idempotencyRecord).set({
      responseStatus: 202,
      responseBody: response,
      resourceId: job.id,
    }).where(eq(idempotencyRecord.id, reservation.reservationId!));
    return response;
  });
}

/** Lock owner and scan and reject confirmation while a correction or initial job is pending. */
export async function lockScanForConfirmation(
  tx: Transaction,
  userId: string,
  scanId: string,
  expectedResultId: string,
): Promise<typeof scan.$inferSelect> {
  const [account] = await tx.select({ id: user.id, deletionStatus: user.deletionStatus }).from(user)
    .where(eq(user.id, userId)).for('update');
  if (!account || account.deletionStatus !== 'active') throw new ScanNotFoundError();
  const [target] = await tx.select().from(scan).where(and(
    eq(scan.id, scanId), eq(scan.userId, userId), eq(scan.lifecycle, 'active'), sql`${scan.deletedAt} IS NULL`,
  )).for('update');
  if (!target) throw new ScanNotFoundError();
  if (target.latestJobId) {
    const [latestJob] = await tx.select({ status: analysisJob.status }).from(analysisJob).where(and(
      eq(analysisJob.id, target.latestJobId), eq(analysisJob.userId, userId),
    )).for('update');
    if (latestJob && ['queued', 'processing'].includes(latestJob.status)) throw new ScanAnalysisPendingError();
  }
  if (target.currentResultId !== expectedResultId) throw new ScanCorrectionError('revision_conflict');
  return target;
}
