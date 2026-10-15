import { createHash, randomUUID } from 'node:crypto';
import { and, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import type { components } from '../../contracts/generated/ai-service.js';
import { ContractValidationError, validateSchema } from '../../contracts/validation.js';
import type { Database } from '../../db/client.js';
import {
  analysisJob,
  analysisResult,
  catalogCapabilityManifest,
  catalogFood,
  catalogServing,
  catalogVersion,
  healthProfile,
  idempotencyRecord,
  photo,
  profileSnapshot,
  scan,
  session,
  user,
} from '../../db/schema/index.js';
import { lockAndCheckCurrentAiConsent, IdempotencyConflict } from '../legal/consent-service.js';
import { JOB_MAX_ACTIVE_PER_USER, JOB_MAX_ATTEMPTS } from '../../jobs/policy.js';
import { newJobDeadline, type AnalysisJobView, type ClaimedAnalysisJob } from '../../jobs/repository.js';
import { buildProfileContext } from './snapshot.js';
import type { AnalysisExpectation, ValidationCatalog } from './result-validation.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type AnalysisResult = components['schemas']['AnalysisResult'];
type ProfileContext = components['schemas']['ProfileContext'];

export class CreateAnalysisError extends Error {
  constructor(readonly reason: 'session_invalid' | 'consent_required' | 'photo_not_found' | 'photo_unavailable' | 'catalog_unavailable' | 'active_limit') {
    super(reason);
  }
}

export class AnalysisCatalogUnavailableError extends Error {}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function requestHash(value: unknown): string {
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
    inputKind: 'photo',
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

async function reservePhotoJobIdempotency(
  tx: Transaction,
  input: { userId: string; sessionId: string; idempotencyKey: string; hash: string; now: Date },
): Promise<{ reservationId: string | null; replay: AnalysisJobView | null }> {
  const actionScope = 'analysis-job:create-photo';
  await tx.delete(idempotencyRecord).where(and(
    eq(idempotencyRecord.userId, input.userId),
    eq(idempotencyRecord.sessionId, input.sessionId),
    eq(idempotencyRecord.actionScope, actionScope),
    eq(idempotencyRecord.key, input.idempotencyKey),
    lt(idempotencyRecord.expiresAt, input.now),
  ));
  const [reserved] = await tx.insert(idempotencyRecord).values({
    userId: input.userId,
    sessionId: input.sessionId,
    actionScope,
    key: input.idempotencyKey,
    requestHash: input.hash,
  }).onConflictDoNothing().returning({ id: idempotencyRecord.id });
  if (reserved) return { reservationId: reserved.id, replay: null };

  const [prior] = await tx.select().from(idempotencyRecord).where(and(
    eq(idempotencyRecord.userId, input.userId),
    eq(idempotencyRecord.sessionId, input.sessionId),
    eq(idempotencyRecord.actionScope, actionScope),
    eq(idempotencyRecord.key, input.idempotencyKey),
  )).for('update');
  if (!prior || prior.requestHash !== input.hash || prior.responseStatus !== 202 || !prior.responseBody) {
    throw new IdempotencyConflict();
  }
  try {
    validateSchema('app.AnalysisJob', prior.responseBody);
  } catch {
    throw new IdempotencyConflict();
  }
  return { reservationId: null, replay: prior.responseBody as AnalysisJobView };
}

/** Binds a private uploaded photo to one revision-1 scan and a durable job atomically. */
export async function createPhotoAnalysisJob(
  db: Database,
  input: { userId: string; sessionId: string; idempotencyKey: string; photoId: string },
): Promise<AnalysisJobView> {
  const hash = requestHash({ photoId: input.photoId });
  return db.transaction(async (tx) => {
    const now = await databaseNow(tx);
    const [account] = await tx.select({ id: user.id, birthDate: user.birthDate, timezone: user.timezone, deletionStatus: user.deletionStatus })
      .from(user).where(eq(user.id, input.userId)).for('update');
    if (!account || account.deletionStatus !== 'active') throw new CreateAnalysisError('session_invalid');
    const [activeSession] = await tx.select({ id: session.id }).from(session).where(and(
      eq(session.id, input.sessionId), eq(session.userId, input.userId), gt(session.expiresAt, now),
    )).for('update');
    if (!activeSession) throw new CreateAnalysisError('session_invalid');

    const reservation = await reservePhotoJobIdempotency(tx, {
      userId: input.userId,
      sessionId: input.sessionId,
      idempotencyKey: input.idempotencyKey,
      hash,
      now,
    });
    if (reservation.replay) return reservation.replay;

    const [ownedPhoto] = await tx.select().from(photo).where(and(
      eq(photo.id, input.photoId), eq(photo.userId, input.userId),
    )).for('update');
    if (!ownedPhoto || ownedPhoto.deletedAt !== null) throw new CreateAnalysisError('photo_not_found');
    if (ownedPhoto.lifecycle !== 'uploaded') throw new CreateAnalysisError('photo_unavailable');
    if (!await lockAndCheckCurrentAiConsent(tx, input.userId)) throw new CreateAnalysisError('consent_required');

    const [existingScan] = await tx.select({ id: scan.id }).from(scan).where(eq(scan.photoId, ownedPhoto.id)).limit(1);
    if (existingScan) throw new CreateAnalysisError('photo_unavailable');
    const [activeJobs] = await tx.select({ count: sql<number>`count(*)::int` }).from(analysisJob).where(and(
      eq(analysisJob.userId, input.userId), inArray(analysisJob.status, ['queued', 'processing']),
    ));
    if (Number(activeJobs?.count ?? 0) >= JOB_MAX_ACTIVE_PER_USER) throw new CreateAnalysisError('active_limit');

    const [currentCatalog] = await tx.select().from(catalogVersion).where(eq(catalogVersion.isCurrent, true)).limit(1);
    if (!currentCatalog) throw new CreateAnalysisError('catalog_unavailable');
    const [currentAuthority] = await tx.select({ manifest: catalogCapabilityManifest.manifest })
      .from(catalogCapabilityManifest)
      .where(eq(catalogCapabilityManifest.catalogVersion, currentCatalog.version)).limit(1);
    if (!currentAuthority) throw new CreateAnalysisError('catalog_unavailable');
    try {
      validateSchema('ai.CapabilityManifest', currentAuthority.manifest);
    } catch {
      throw new CreateAnalysisError('catalog_unavailable');
    }
    const capabilityManifest = currentAuthority.manifest as components['schemas']['CapabilityManifest'];
    if (capabilityManifest.catalogVersion !== currentCatalog.version ||
        capabilityManifest.nutritionDatasetVersion !== currentCatalog.nutritionDatasetVersion ||
        capabilityManifest.ruleSetVersion !== currentCatalog.ruleSetVersion ||
        capabilityManifest.dataMode !== currentCatalog.dataMode) {
      throw new CreateAnalysisError('catalog_unavailable');
    }
    const [currentProfile] = await tx.select().from(healthProfile).where(eq(healthProfile.userId, input.userId)).limit(1);
    const profile = buildProfileContext(account, currentProfile ?? null, now);
    const profileSnapshotId = randomUUID();
    const scanId = randomUUID();
    const jobId = randomUUID();
    const operationId = randomUUID();
    const inputSnapshot = {
      contractVersion: '2.0.0',
      catalogVersion: currentCatalog.version,
      ruleSetVersion: currentCatalog.ruleSetVersion,
      profile,
      photo: {
        photoId: ownedPhoto.id,
        mimeType: ownedPhoto.mimeType,
        sha256: ownedPhoto.checksum,
      },
    };
    const deadlineAt = newJobDeadline(now);

    await tx.insert(profileSnapshot).values({
      id: profileSnapshotId,
      userId: input.userId,
      profileVersion: profile.profileVersion,
      context: profile,
      createdAt: now,
    });
    await tx.insert(scan).values({
      id: scanId,
      userId: input.userId,
      photoId: ownedPhoto.id,
      profileSnapshotId,
      revision: 1,
      generation: 1,
      lifecycle: 'active',
      createdAt: now,
      updatedAt: now,
    });
    const [job] = await tx.insert(analysisJob).values({
      id: jobId,
      userId: input.userId,
      operationId,
      kind: 'photo_analysis',
      inputSnapshot,
      profileSnapshotId,
      scanId,
      targetRevision: 1,
      targetGeneration: 1,
      status: 'queued',
      attempts: 0,
      maxAttempts: JOB_MAX_ATTEMPTS,
      nextAttemptAt: now,
      deadlineAt,
      createdAt: now,
      updatedAt: now,
    }).returning();
    if (!job) throw new Error('Analysis job was not created');
    await tx.update(scan).set({ latestJobId: job.id, updatedAt: now }).where(eq(scan.id, scanId));
    await tx.update(photo).set({ lifecycle: 'attached' }).where(and(
      eq(photo.id, ownedPhoto.id), eq(photo.userId, input.userId), eq(photo.lifecycle, 'uploaded'),
    ));
    const response = jobView(job);
    try {
      validateSchema('app.AnalysisJob', response);
    } catch {
      throw new Error('Created analysis job response failed contract validation');
    }
    await tx.update(idempotencyRecord).set({
      responseStatus: 202,
      responseBody: response,
      resourceId: job.id,
    }).where(eq(idempotencyRecord.id, reservation.reservationId!));
    return response;
  });
}

/** Reads one immutable result by owner ID; cross-account and missing IDs are indistinguishable. */
export async function getOwnedAnalysisResult(db: Database, userId: string, resultId: string): Promise<AnalysisResult | null> {
  const [row] = await db.select({ output: analysisResult.output }).from(analysisResult).where(and(
    eq(analysisResult.id, resultId), eq(analysisResult.userId, userId),
  )).limit(1);
  if (!row) return null;
  validateSchema('ai.AnalysisResult', row.output);
  return row.output as AnalysisResult;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asProfileContext(value: unknown): ProfileContext {
  try {
    validateSchema('ai.ProfileContext', value);
  } catch {
    throw new ContractValidationError('ai.ProfileContext');
  }
  return value as ProfileContext;
}

function nullableNumber(value: string | null): number | null {
  if (value === null) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new ContractValidationError('catalog.numeric');
  return number;
}

/** Loads immutable snapshot/catalog facts needed to distrust and recheck provider output. */
export async function loadAnalysisValidationContext(
  db: Database,
  job: ClaimedAnalysisJob,
  result: AnalysisResult,
): Promise<{ expectation: AnalysisExpectation; catalog: ValidationCatalog }> {
  const [snapshot] = await db.select({ context: profileSnapshot.context, profileVersion: profileSnapshot.profileVersion })
    .from(profileSnapshot).where(and(
      eq(profileSnapshot.id, job.profileSnapshotId), eq(profileSnapshot.userId, job.userId),
    )).limit(1);
  const request = objectRecord(job.inputSnapshot);
  const storedProfile = asProfileContext(snapshot?.context);
  if (!snapshot || snapshot.profileVersion !== storedProfile.profileVersion || !request ||
      canonical(request.profile) !== canonical(storedProfile)) {
    throw new ContractValidationError('analysis.snapshot');
  }
  const expectedCatalogVersion = request.catalogVersion;
  const expectedRuleVersion = request.ruleSetVersion;
  if (typeof expectedCatalogVersion !== 'string' || typeof expectedRuleVersion !== 'string') {
    throw new ContractValidationError('analysis.versions');
  }
  const [version] = await db.select().from(catalogVersion).where(eq(catalogVersion.version, expectedCatalogVersion)).limit(1);
  if (!version) throw new AnalysisCatalogUnavailableError();
  const [capabilityRow] = await db.select({ manifest: catalogCapabilityManifest.manifest })
    .from(catalogCapabilityManifest)
    .where(eq(catalogCapabilityManifest.catalogVersion, expectedCatalogVersion)).limit(1);
  if (!capabilityRow) throw new AnalysisCatalogUnavailableError();
  const manifest = capabilityRow.manifest as components['schemas']['CapabilityManifest'];
  try {
    validateSchema('ai.CapabilityManifest', capabilityRow.manifest);
  } catch {
    throw new ContractValidationError('ai.CapabilityManifest');
  }
  if (manifest.catalogVersion !== version.version ||
      manifest.nutritionDatasetVersion !== version.nutritionDatasetVersion ||
      manifest.ruleSetVersion !== version.ruleSetVersion || manifest.dataMode !== version.dataMode) {
    throw new ContractValidationError('analysis.catalogAuthority');
  }
  const outputFoodIds = [...new Set(result.components.flatMap((component) => component.catalogFoodId ? [component.catalogFoodId] : []))];
  const foods = outputFoodIds.length
    ? await db.select().from(catalogFood).where(and(
        eq(catalogFood.version, expectedCatalogVersion), inArray(catalogFood.id, outputFoodIds),
      ))
    : [];
  const servingRows = foods.length
    ? await db.select().from(catalogServing).where(and(
        eq(catalogServing.catalogVersion, expectedCatalogVersion),
        inArray(catalogServing.foodId, foods.map((food) => food.id)),
      ))
    : [];
  const servings = new Map<string, typeof catalogServing.$inferSelect[]>();
  for (const serving of servingRows) {
    const list = servings.get(serving.foodId) ?? [];
    list.push(serving);
    servings.set(serving.foodId, list);
  }
  const catalog: ValidationCatalog = {
    version: version.version,
    nutritionDatasetVersion: version.nutritionDatasetVersion,
    ruleSetVersion: version.ruleSetVersion,
    dataMode: version.dataMode as ValidationCatalog['dataMode'],
    supportedPhotoFoodIds: manifest.supportedPhotoFoodIds,
    conditions: manifest.conditions,
    supportedRules: manifest.supportedRules ?? [],
    foods: foods.map((food) => ({
      id: food.id,
      displayName: food.displayName,
      preparation: food.preparation,
      per100g: {
        energyKcal: nullableNumber(food.energyKcal),
        carbohydrateG: nullableNumber(food.carbohydrateG),
        proteinG: nullableNumber(food.proteinG),
        fatG: nullableNumber(food.fatG),
        fiberG: nullableNumber(food.fiberG),
        sugarsG: nullableNumber(food.sugarsG),
        sodiumMg: nullableNumber(food.sodiumMg),
      },
      nutrientSourceIds: food.nutrientSourceIds as ValidationCatalog['foods'][number]['nutrientSourceIds'],
      sourceRefs: food.sourceRefs as ValidationCatalog['foods'][number]['sourceRefs'],
      servings: (servings.get(food.id) ?? []).map((serving) => {
        const refs = serving.sourceRefs as { sourceId?: unknown } | null;
        if (typeof refs?.sourceId !== 'string') throw new ContractValidationError('catalog.serving');
        const grams = Number(serving.grams);
        if (!Number.isFinite(grams) || grams <= 0) throw new ContractValidationError('catalog.serving');
        return { id: serving.id, grams, sourceId: refs.sourceId };
      }),
    })),
  };
  const expectation: AnalysisExpectation = {
    kind: job.kind === 'photo_analysis' ? 'photo_analysis' : 'correction',
    operationId: job.operationId,
    profile: storedProfile,
    catalogVersion: expectedCatalogVersion,
    ruleSetVersion: expectedRuleVersion,
    ...(job.kind === 'correction' ? { components: request.components as components['schemas']['ComponentInput'][] } : {}),
  };
  return { expectation, catalog };
}
