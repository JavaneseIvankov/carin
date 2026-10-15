import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, gt, gte, inArray, lt, or, sql } from 'drizzle-orm';
import type { components } from '../../contracts/generated/ai-service.js';
import type { components as AppComponents } from '../../contracts/generated/app-api.js';
import { ContractValidationError, validateSchema } from '../../contracts/validation.js';
import type { Database } from '../../db/client.js';
import {
  analysisJob,
  analysisResult,
  catalogCapabilityManifest,
  catalogFood,
  catalogServing,
  catalogVersion,
  consumption,
  consumptionEvaluation,
  consumptionSnapshot,
  healthProfile,
  idempotencyRecord,
  profileSnapshot,
  scan,
  session,
  user,
} from '../../db/schema/index.js';
import { JOB_MAX_ACTIVE_PER_USER, JOB_MAX_ATTEMPTS } from '../../jobs/policy.js';
import { newJobDeadline } from '../../jobs/repository.js';
import { buildProfileContext } from '../analyses/snapshot.js';
import { AnalysisCatalogUnavailableError } from '../analyses/repository.js';
import { lockAndCheckCurrentAiConsent, IdempotencyConflict } from '../legal/consent-service.js';
import { canReusePhotoAttention, evaluatePersonalizationEligibility } from './evaluation.js';
import {
  buildConsumptionNutritionSnapshot,
  ConsumptionCatalogInputError,
  preservePhotoEvaluation,
  type ConsumptionCatalogFood,
} from './nutrition.js';
import {
  lockScanForConfirmation,
} from '../scans/repository.js';

type Ai = components['schemas'];
type App = AppComponents['schemas'];
type ProfileContext = Ai['ProfileContext'];
type AnalysisResult = Ai['AnalysisResult'];
type ConsumptionSnapshot = App['ConsumptionSnapshot'];
type ConsumptionView = App['Consumption'];
type ConsumptionPage = App['ConsumptionPage'];
type ConsumptionCreate = App['ConsumptionCreate'];
type ConsumptionUpdate = App['ConsumptionUpdate'];
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export class ConsumptionError extends Error {
  constructor(readonly reason:
    | 'session_invalid'
    | 'not_found'
    | 'revision_conflict'
    | 'time_in_future'
    | 'invalid_timezone'
    | 'invalid_input'
    | 'catalog_unavailable'
    | 'source_changed'
    | 'already_confirmed') {
    super(reason);
  }
}

export type CreateConsumptionResult = { status: 200 | 201; body: ConsumptionView };

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
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

function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function nullableNumber(value: string | null): number | null {
  if (value === null) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new AnalysisCatalogUnavailableError();
  return number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asAnalysisResult(value: unknown): AnalysisResult {
  try {
    validateSchema('ai.AnalysisResult', value);
  } catch {
    throw new ConsumptionError('source_changed');
  }
  return value as AnalysisResult;
}

function asConsumptionSnapshot(value: unknown): ConsumptionSnapshot {
  try {
    validateSchema('app.ConsumptionSnapshot', value);
  } catch {
    throw new ConsumptionError('source_changed');
  }
  return value as ConsumptionSnapshot;
}

async function requireAccountAndSession(
  tx: Transaction,
  input: { userId: string; sessionId: string },
  now: Date,
) {
  const [account] = await tx.select({
    id: user.id,
    birthDate: user.birthDate,
    timezone: user.timezone,
    deletionStatus: user.deletionStatus,
  }).from(user).where(eq(user.id, input.userId)).for('update');
  if (!account || account.deletionStatus !== 'active') throw new ConsumptionError('session_invalid');
  const [activeSession] = await tx.select({ id: session.id }).from(session).where(and(
    eq(session.id, input.sessionId),
    eq(session.userId, input.userId),
    gt(session.expiresAt, now),
  )).for('update');
  if (!activeSession) throw new ConsumptionError('session_invalid');
  return account;
}

async function reserveIdempotency(
  tx: Transaction,
  input: {
    userId: string;
    sessionId: string;
    actionScope: string;
    key: string;
    requestHash: string;
    now: Date;
  },
): Promise<{ id: string; replay: { status: number; body: unknown } | null }> {
  await tx.delete(idempotencyRecord).where(and(
    eq(idempotencyRecord.userId, input.userId),
    eq(idempotencyRecord.sessionId, input.sessionId),
    eq(idempotencyRecord.actionScope, input.actionScope),
    eq(idempotencyRecord.key, input.key),
    lt(idempotencyRecord.expiresAt, input.now),
  ));
  const [reserved] = await tx.insert(idempotencyRecord).values({
    userId: input.userId,
    sessionId: input.sessionId,
    actionScope: input.actionScope,
    key: input.key,
    requestHash: input.requestHash,
  }).onConflictDoNothing().returning({ id: idempotencyRecord.id });
  if (reserved) return { id: reserved.id, replay: null };

  const [prior] = await tx.select().from(idempotencyRecord).where(and(
    eq(idempotencyRecord.userId, input.userId),
    eq(idempotencyRecord.sessionId, input.sessionId),
    eq(idempotencyRecord.actionScope, input.actionScope),
    eq(idempotencyRecord.key, input.key),
  )).for('update');
  if (!prior || prior.requestHash !== input.requestHash || prior.responseStatus === null) {
    throw new IdempotencyConflict();
  }
  return {
    id: prior.id,
    replay: { status: prior.responseStatus, body: prior.responseBody },
  };
}

function profileView(
  account: { birthDate: string; timezone: string },
  storedProfile: typeof healthProfile.$inferSelect | undefined,
  now: Date,
): ProfileContext {
  return buildProfileContext(account, storedProfile ?? null, now);
}

async function storeProfileSnapshot(
  tx: Transaction,
  userId: string,
  profile: ProfileContext,
  now: Date,
): Promise<string> {
  const id = randomUUID();
  await tx.insert(profileSnapshot).values({
    id,
    userId,
    profileVersion: profile.profileVersion,
    context: profile,
    createdAt: now,
  });
  return id;
}

type LoadedCatalog = {
  version: typeof catalogVersion.$inferSelect | null;
  foods: ConsumptionCatalogFood[];
  manifest: Ai['CapabilityManifest'] | null;
  ready: boolean;
};

async function loadCatalog(
  tx: Transaction,
  versionName: string,
  components: Ai['ComponentInput'][],
  allowUnavailable: boolean,
): Promise<LoadedCatalog> {
  if (versionName === 'unavailable') {
    if (!allowUnavailable || components.some((component) => component.catalogFoodId !== null)) {
      throw new ConsumptionError('catalog_unavailable');
    }
    return { version: null, foods: [], manifest: null, ready: false };
  }
  const [version] = await tx.select().from(catalogVersion)
    .where(eq(catalogVersion.version, versionName)).limit(1);
  if (!version) throw new ConsumptionError('catalog_unavailable');

  const ids = [...new Set(components.flatMap((component) => component.catalogFoodId ? [component.catalogFoodId] : []))];
  const foods = ids.length
    ? await tx.select().from(catalogFood).where(and(
      eq(catalogFood.version, versionName),
      inArray(catalogFood.id, ids),
    ))
    : [];
  if (foods.length !== ids.length) throw new ConsumptionCatalogInputError('food_unavailable');
  const servings = foods.length
    ? await tx.select().from(catalogServing).where(and(
      eq(catalogServing.catalogVersion, versionName),
      inArray(catalogServing.foodId, foods.map((food) => food.id)),
    ))
    : [];
  const servingsByFood = new Map<string, Array<{ id: string; grams: number; sourceId: string }>>();
  for (const serving of servings) {
    const refs = asRecord(serving.sourceRefs);
    if (typeof refs?.sourceId !== 'string') throw new ConsumptionCatalogInputError('serving_source_unavailable');
    const grams = Number(serving.grams);
    if (!Number.isFinite(grams) || grams <= 0) throw new ConsumptionCatalogInputError('serving_unavailable');
    const list = servingsByFood.get(serving.foodId) ?? [];
    list.push({ id: serving.id, grams, sourceId: refs.sourceId });
    servingsByFood.set(serving.foodId, list);
  }
  const mappedFoods: ConsumptionCatalogFood[] = foods.map((food) => ({
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
    nutrientSourceIds: food.nutrientSourceIds as Ai['NutrientSources'],
    sourceRefs: food.sourceRefs as Ai['Source'][],
    servings: servingsByFood.get(food.id) ?? [],
  }));

  const [manifestRow] = await tx.select({ manifest: catalogCapabilityManifest.manifest })
    .from(catalogCapabilityManifest)
    .where(eq(catalogCapabilityManifest.catalogVersion, versionName)).limit(1);
  let manifest: Ai['CapabilityManifest'] | null = null;
  if (manifestRow) {
    try {
      validateSchema('ai.CapabilityManifest', manifestRow.manifest);
      const candidate = manifestRow.manifest as Ai['CapabilityManifest'];
      if (candidate.catalogVersion === version.version &&
          candidate.nutritionDatasetVersion === version.nutritionDatasetVersion &&
          candidate.ruleSetVersion === version.ruleSetVersion &&
          candidate.dataMode === version.dataMode) manifest = candidate;
    } catch {
      // Nutrition remains available when personal evaluation authority is not ready.
    }
  }
  return { version, foods: mappedFoods, manifest, ready: manifest !== null };
}

function validateConsumptionComponents(
  components: Ai['ComponentInput'][],
  sourceResult: AnalysisResult | null,
): void {
  if (!components.length || components.length > 30 || new Set(components.map(({ id }) => id)).size !== components.length) {
    throw new ConsumptionError('invalid_input');
  }
  if (sourceResult) {
    const sourceIds = new Set(sourceResult.components.map(({ id }) => id));
    if (components.some(({ id }) => !sourceIds.has(id))) throw new ConsumptionError('invalid_input');
  }
}

function createCanonicalInput(input: ConsumptionCreate, consumedAt: Date): Record<string, unknown> {
  return {
    source: input.source,
    scanId: input.scanId,
    sourceAnalysisResultId: input.sourceAnalysisResultId,
    occurrence: input.occurrence,
    consumedAt: consumedAt.toISOString(),
    timezone: input.timezone,
    components: input.components,
    catalogVersion: input.catalogVersion,
  };
}

function updateCanonicalInput(input: ConsumptionUpdate, consumedAt: Date): Record<string, unknown> {
  return {
    expectedRevision: input.expectedRevision,
    consumedAt: consumedAt.toISOString(),
    timezone: input.timezone,
    components: input.components,
    catalogVersion: input.catalogVersion,
  };
}

function viewFromJoinedRow(row: {
  item: typeof consumption.$inferSelect;
  snapshot: unknown;
  evaluationState: string | null;
  evaluationJobId: string | null;
  evaluationOutput: unknown;
  evaluationLimitations: unknown;
}): ConsumptionView {
  const snapshot = asConsumptionSnapshot(row.snapshot);
  const evaluationOutput = asRecord(row.evaluationOutput);
  const storedLimitations = Array.isArray(row.evaluationLimitations)
    ? row.evaluationLimitations.flatMap((value): ConsumptionSnapshot['limitations'] => {
      if (typeof value === 'string') return [{
        code: value,
        message: 'Personal evaluation did not complete.',
        componentIds: [],
        critical: false,
      }];
      return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? [value as ConsumptionSnapshot['limitations'][number]]
        : [];
    })
    : [];
  const resultLimitations = evaluationOutput && Array.isArray(evaluationOutput.limitations)
    ? evaluationOutput.limitations as ConsumptionSnapshot['limitations']
    : [];
  const hasEvaluationOutput = evaluationOutput &&
      Array.isArray(evaluationOutput.attentions) &&
      ['considerable', 'needs_attention', 'insufficient_information'].includes(String(evaluationOutput.overallAttention));
  const allLimitations = [...snapshot.limitations, ...storedLimitations, ...resultLimitations];
  const uniqueLimitations = allLimitations.filter((item, index) =>
    allLimitations.findIndex((candidate) => canonical(candidate) === canonical(item)) === index,
  );
  const responseSnapshot: ConsumptionSnapshot = {
      ...snapshot,
      ...(hasEvaluationOutput ? {
        overallAttention: evaluationOutput.overallAttention as ConsumptionSnapshot['overallAttention'],
        attentions: evaluationOutput.attentions as ConsumptionSnapshot['attentions'],
      } : {}),
      limitations: uniqueLimitations,
    };
  return {
    id: row.item.id,
    revision: row.item.revision,
    source: row.item.source as ConsumptionView['source'],
    scanId: row.item.scanId,
    sourceAnalysisResultId: row.item.sourceAnalysisResultId,
    photoAvailable: row.item.photoAvailable,
    consumedAt: row.item.consumedAt.toISOString(),
    timezone: row.item.timezone,
    createdAt: row.item.createdAt.toISOString(),
    updatedAt: row.item.updatedAt.toISOString(),
    snapshot: responseSnapshot,
    attentionState: row.evaluationState === 'completed'
      ? 'available'
      : (row.evaluationState ?? 'not_requested') as ConsumptionView['attentionState'],
    attentionJobId: row.evaluationJobId,
  };
}

async function readConsumptionView(
  db: Database | Transaction,
  userId: string,
  consumptionId: string,
): Promise<ConsumptionView | null> {
  const [row] = await db.select({
    item: consumption,
    snapshot: consumptionSnapshot.snapshot,
    evaluationState: consumptionEvaluation.state,
    evaluationJobId: consumptionEvaluation.jobId,
    evaluationOutput: analysisResult.output,
    evaluationLimitations: consumptionEvaluation.limitations,
  }).from(consumption)
    .innerJoin(consumptionSnapshot, and(
      eq(consumptionSnapshot.id, consumption.currentSnapshotId),
      eq(consumptionSnapshot.userId, consumption.userId),
    ))
    .leftJoin(consumptionEvaluation, and(
      eq(consumptionEvaluation.snapshotId, consumptionSnapshot.id),
      eq(consumptionEvaluation.userId, consumption.userId),
    ))
    .leftJoin(analysisResult, eq(analysisResult.id, consumptionEvaluation.resultId))
    .where(and(
      eq(consumption.id, consumptionId),
      eq(consumption.userId, userId),
      sql`${consumption.deletedAt} IS NULL`,
      sql`${consumption.currentSnapshotId} IS NOT NULL`,
    )).limit(1);
  return row ? viewFromJoinedRow(row) : null;
}

async function writeEvaluation(
  tx: Transaction,
  input: {
    userId: string;
    consumptionId: string;
    revision: number;
    generation: number;
    profileSnapshotId: string;
    profile: ProfileContext;
    components: Ai['ComponentInput'][];
    snapshot: { id: string; snapshot: ConsumptionSnapshot };
    catalog: LoadedCatalog;
    sourceResultId: string | null;
    reusePhotoResultId: string | null;
    consentGranted: boolean;
    now: Date;
  },
): Promise<void> {
  const consentGranted = input.consentGranted;
  if (input.reusePhotoResultId && consentGranted) {
    await tx.insert(consumptionEvaluation).values({
      userId: input.userId,
      consumptionId: input.consumptionId,
      revision: input.revision,
      snapshotId: input.snapshot.id,
      state: 'completed',
      jobId: null,
      resultId: input.reusePhotoResultId,
      limitations: [],
      updatedAt: input.now,
    });
    return;
  }

  const eligibility = evaluatePersonalizationEligibility({
    profile: input.profile,
    snapshot: input.snapshot.snapshot,
    manifest: input.catalog.manifest,
    consentGranted,
    catalogReady: input.catalog.ready,
  });
  const limitations = [...eligibility.limitations];
  let jobId: string | null = null;
  let state: 'not_requested' | 'pending' = 'not_requested';
  if (eligibility.eligible && input.catalog.version) {
    const [active] = await tx.select({ count: sql<number>`count(*)::int` })
      .from(analysisJob).where(and(
        eq(analysisJob.userId, input.userId),
        inArray(analysisJob.status, ['queued', 'processing']),
      ));
    if (Number(active?.count ?? 0) >= JOB_MAX_ACTIVE_PER_USER) {
      limitations.push({
        code: 'active_job_limit',
        message: 'Personal evaluation was not queued because the active job limit was reached.',
        componentIds: [],
        critical: false,
      });
    } else {
      const operationId = randomUUID();
      const [job] = await tx.insert(analysisJob).values({
        id: randomUUID(),
        userId: input.userId,
        operationId,
        kind: 'consumption_evaluation',
        inputSnapshot: {
          contractVersion: '2.0.0',
          inputKind: 'manual',
          catalogVersion: input.catalog.version.version,
          ruleSetVersion: input.catalog.version.ruleSetVersion,
          profile: input.profile,
          components: input.components,
        },
        profileSnapshotId: input.profileSnapshotId,
        consumptionId: input.consumptionId,
        targetRevision: input.revision,
        targetGeneration: input.generation,
        status: 'queued',
        attempts: 0,
        maxAttempts: JOB_MAX_ATTEMPTS,
        nextAttemptAt: input.now,
        deadlineAt: newJobDeadline(input.now),
        createdAt: input.now,
        updatedAt: input.now,
      }).returning({ id: analysisJob.id });
      if (!job) throw new Error('Consumption evaluation job was not created');
      jobId = job.id;
      state = 'pending';
    }
  }

  await tx.insert(consumptionEvaluation).values({
    userId: input.userId,
    consumptionId: input.consumptionId,
    revision: input.revision,
    snapshotId: input.snapshot.id,
    state,
    jobId,
    resultId: null,
    limitations,
    updatedAt: input.now,
  });
}

type ResolvedSource = {
  scan: typeof scan.$inferSelect;
  resultRow: typeof analysisResult.$inferSelect;
  result: AnalysisResult;
  profileRow: typeof profileSnapshot.$inferSelect;
  profile: ProfileContext;
};

async function lockAndLoadSource(
  tx: Transaction,
  userId: string,
  scanId: string,
  resultId: string,
): Promise<ResolvedSource> {
  const scanRow = await lockScanForConfirmation(tx, userId, scanId, resultId);
  const [resultRow] = await tx.select().from(analysisResult).where(and(
    eq(analysisResult.id, resultId),
    eq(analysisResult.userId, userId),
  )).limit(1);
  if (!resultRow || resultRow.id !== scanRow.currentResultId) throw new ConsumptionError('source_changed');
  const result = asAnalysisResult(resultRow.output);
  const [profileRow] = await tx.select().from(profileSnapshot).where(and(
    eq(profileSnapshot.id, resultRow.profileSnapshotId),
    eq(profileSnapshot.userId, userId),
  )).limit(1);
  if (!profileRow || profileRow.profileVersion !== result.profileVersion) throw new ConsumptionError('source_changed');
  try {
    validateSchema('ai.ProfileContext', profileRow.context);
  } catch {
    throw new ConsumptionError('source_changed');
  }
  return { scan: scanRow, resultRow, result, profileRow, profile: profileRow.context as ProfileContext };
}

function assertPhotoInputMatchesSource(input: ConsumptionCreate, source: ResolvedSource): void {
  if (input.catalogVersion !== source.result.catalogVersion) throw new ConsumptionError('source_changed');
  validateConsumptionComponents(input.components, source.result);
}

function assertDateAndTimezone(consumedAt: Date, timezone: string, now: Date): void {
  if (!validTimezone(timezone)) throw new ConsumptionError('invalid_timezone');
  if (consumedAt.getTime() > now.getTime() + 5 * 60_000) throw new ConsumptionError('time_in_future');
}

function snapshotMode(catalog: LoadedCatalog): 'real' | 'synthetic' | 'unavailable' {
  return catalog.version?.dataMode as 'real' | 'synthetic' | undefined ?? 'unavailable';
}

async function findDefaultConfirmation(tx: Transaction, userId: string, scanId: string) {
  const [row] = await tx.select({ id: consumption.id, canonicalInput: consumption.canonicalInput })
    .from(consumption).where(and(
      eq(consumption.userId, userId),
      eq(consumption.scanId, scanId),
      eq(consumption.source, 'photo_confirmation'),
      eq(consumption.confirmationMode, 'default'),
      sql`${consumption.deletedAt} IS NULL`,
    )).for('update').limit(1);
  return row ?? null;
}

async function storeCreateResponse(
  tx: Transaction,
  reservationId: string,
  status: 200 | 201,
  body: ConsumptionView,
): Promise<void> {
  await tx.update(idempotencyRecord).set({
    responseStatus: status,
    responseBody: body,
    resourceId: body.id,
  }).where(eq(idempotencyRecord.id, reservationId));
}

/** Create a consumption and its deterministic snapshot/evaluation state atomically. */
export async function createConsumption(
  db: Database,
  input: {
    userId: string;
    sessionId: string;
    idempotencyKey: string;
    body: ConsumptionCreate;
  },
): Promise<CreateConsumptionResult> {
  const consumedAt = new Date(input.body.consumedAt);
  if (!Number.isFinite(consumedAt.getTime())) throw new ConsumptionError('invalid_input');
  if ((input.body.source === 'manual' &&
        (input.body.scanId !== null || input.body.sourceAnalysisResultId !== null || input.body.occurrence !== 'new_occurrence')) ||
      (input.body.source === 'photo_confirmation' &&
        (!input.body.scanId || !input.body.sourceAnalysisResultId))) throw new ConsumptionError('invalid_input');
  if (input.body.source === 'manual' && input.body.catalogVersion === 'unavailable' &&
      input.body.components.some((component) => component.catalogFoodId !== null)) {
    throw new ConsumptionError('catalog_unavailable');
  }
  const canonicalInput = createCanonicalInput(input.body, consumedAt);
  const requestHash = hash(canonicalInput);
  return db.transaction(async (tx) => {
    const account = await requireAccountAndSession(
      tx,
      { userId: input.userId, sessionId: input.sessionId },
      await databaseNow(tx),
    );
    const now = await databaseNow(tx);
    assertDateAndTimezone(consumedAt, input.body.timezone, now);
    const reservation = await reserveIdempotency(tx, {
      userId: input.userId,
      sessionId: input.sessionId,
      actionScope: 'consumption:create',
      key: input.idempotencyKey,
      requestHash,
      now,
    });
    if (reservation.replay) {
      if (reservation.replay.status !== 200 && reservation.replay.status !== 201) throw new IdempotencyConflict();
      try {
        validateSchema('app.Consumption', reservation.replay.body);
      } catch {
        throw new IdempotencyConflict();
      }
      return { status: reservation.replay.status, body: reservation.replay.body as ConsumptionView };
    }

    if (input.body.source === 'photo_confirmation' && input.body.occurrence === 'default_confirmation') {
      const existing = await findDefaultConfirmation(tx, input.userId, input.body.scanId!);
      if (existing) {
        if (canonical(existing.canonicalInput) !== canonical(canonicalInput)) throw new ConsumptionError('already_confirmed');
        const body = await readConsumptionView(tx, input.userId, existing.id);
        if (!body) throw new Error('Active default confirmation has no current snapshot');
        await storeCreateResponse(tx, reservation.id, 200, body);
        return { status: 200, body };
      }
    }

    let source: ResolvedSource | null = null;
    if (input.body.source === 'photo_confirmation') {
      source = await lockAndLoadSource(
        tx,
        input.userId,
        input.body.scanId!,
        input.body.sourceAnalysisResultId!,
      );
      assertPhotoInputMatchesSource(input.body, source);
    } else {
      validateConsumptionComponents(input.body.components, null);
    }

    const catalog = await loadCatalog(tx, input.body.catalogVersion, input.body.components, input.body.source === 'manual');
    const [storedProfile] = await tx.select().from(healthProfile)
      .where(eq(healthProfile.userId, input.userId)).limit(1);
    const profile = profileView(account, storedProfile, now);
    const consentGranted = await lockAndCheckCurrentAiConsent(tx, input.userId);
    const reuse = Boolean(consentGranted && source && source.resultRow.profileSnapshotId === source.profileRow.id &&
      canReusePhotoAttention({
        sourceResult: source.result,
        sourceProfile: source.profile,
        currentProfile: profile,
        catalogVersion: input.body.catalogVersion,
        ruleSetVersion: source.result.ruleSetVersion,
        components: input.body.components,
      }));
    const profileSnapshotId = reuse
      ? source!.profileRow.id
      : await storeProfileSnapshot(tx, input.userId, profile, now);
    const id = randomUUID();
    const snapshotId = randomUUID();
    const nutritionSnapshot = buildConsumptionNutritionSnapshot({
      operationId: randomUUID(),
      computedAt: now.toISOString(),
      profileVersion: profile.profileVersion,
      catalogVersion: input.body.catalogVersion,
      nutritionDatasetVersion: catalog.version?.nutritionDatasetVersion ?? 'unavailable',
      ruleSetVersion: catalog.version?.ruleSetVersion ?? 'unavailable',
      dataMode: snapshotMode(catalog),
      components: input.body.components,
      catalogFoods: catalog.foods,
    });
    const snapshot = reuse && source
      ? preservePhotoEvaluation(nutritionSnapshot, source.result)
      : nutritionSnapshot;

    await tx.insert(consumption).values({
      id,
      userId: input.userId,
      revision: 1,
      generation: 1,
      source: input.body.source,
      confirmationMode: input.body.occurrence === 'default_confirmation' ? 'default' : 'new_occurrence',
      scanId: input.body.source === 'photo_confirmation' ? input.body.scanId : null,
      sourceAnalysisResultId: input.body.source === 'photo_confirmation' ? input.body.sourceAnalysisResultId : null,
      currentSnapshotId: null,
      photoAvailable: Boolean(source?.scan.photoId),
      canonicalInput,
      consumedAt,
      timezone: input.body.timezone,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(consumptionSnapshot).values({
      id: snapshotId,
      userId: input.userId,
      consumptionId: id,
      revision: 1,
      profileSnapshotId,
      snapshot,
      createdAt: now,
    });
    await writeEvaluation(tx, {
      userId: input.userId,
      consumptionId: id,
      revision: 1,
      generation: 1,
      profileSnapshotId,
      profile,
      components: input.body.components,
      snapshot: { id: snapshotId, snapshot },
      catalog,
      sourceResultId: source?.resultRow.id ?? null,
      reusePhotoResultId: reuse ? source!.resultRow.id : null,
      consentGranted,
      now,
    });
    await tx.update(consumption).set({ currentSnapshotId: snapshotId }).where(and(
      eq(consumption.id, id), eq(consumption.userId, input.userId),
    ));
    const body = await readConsumptionView(tx, input.userId, id);
    if (!body) throw new Error('Created consumption has no current snapshot');
    await storeCreateResponse(tx, reservation.id, 201, body);
    return { status: 201, body };
  });
}

export async function getConsumption(db: Database, userId: string, consumptionId: string): Promise<ConsumptionView | null> {
  return readConsumptionView(db, userId, consumptionId);
}

type ConsumptionCursor = { consumedAt: Date; id: string };
function decodeCursor(value: string): ConsumptionCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { consumedAt?: unknown; id?: unknown };
    if (typeof parsed.consumedAt !== 'string' || typeof parsed.id !== 'string') throw new Error();
    const consumedAt = new Date(parsed.consumedAt);
    if (!Number.isFinite(consumedAt.getTime()) || !/^[0-9a-f-]{36}$/i.test(parsed.id)) throw new Error();
    return { consumedAt, id: parsed.id };
  } catch {
    throw new ContractValidationError('consumption.cursor');
  }
}

function encodeCursor(row: typeof consumption.$inferSelect): string {
  return Buffer.from(JSON.stringify({ consumedAt: row.consumedAt.toISOString(), id: row.id })).toString('base64url');
}

export async function listConsumptions(
  db: Database,
  input: { userId: string; cursor?: string; limit: number; from?: string; to?: string },
): Promise<ConsumptionPage> {
  const limit = Math.min(100, Math.max(1, input.limit));
  const conditions = [eq(consumption.userId, input.userId), sql`${consumption.deletedAt} IS NULL`, sql`${consumption.currentSnapshotId} IS NOT NULL`];
  if (input.from) conditions.push(gte(consumption.consumedAt, new Date(input.from)));
  if (input.to) conditions.push(lt(consumption.consumedAt, new Date(input.to)));
  if (input.cursor) {
    const cursor = decodeCursor(input.cursor);
    conditions.push(or(
      lt(consumption.consumedAt, cursor.consumedAt),
      and(eq(consumption.consumedAt, cursor.consumedAt), lt(consumption.id, cursor.id)),
    )!);
  }
  const rows = await db.select({
    item: consumption,
    snapshot: consumptionSnapshot.snapshot,
    evaluationState: consumptionEvaluation.state,
    evaluationJobId: consumptionEvaluation.jobId,
    evaluationOutput: analysisResult.output,
    evaluationLimitations: consumptionEvaluation.limitations,
  }).from(consumption)
    .innerJoin(consumptionSnapshot, and(
      eq(consumptionSnapshot.id, consumption.currentSnapshotId),
      eq(consumptionSnapshot.userId, consumption.userId),
    ))
    .leftJoin(consumptionEvaluation, and(
      eq(consumptionEvaluation.snapshotId, consumptionSnapshot.id),
      eq(consumptionEvaluation.userId, consumption.userId),
    ))
    .leftJoin(analysisResult, eq(analysisResult.id, consumptionEvaluation.resultId))
    .where(and(...conditions))
    .orderBy(desc(consumption.consumedAt), desc(consumption.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const current = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: current.map(viewFromJoinedRow),
    nextCursor: hasMore ? encodeCursor(current[current.length - 1]!.item) : null,
  };
}

async function cancelPendingEvaluation(tx: Transaction, userId: string, consumptionId: string, snapshotId: string, now: Date): Promise<void> {
  const [evaluation] = await tx.select().from(consumptionEvaluation).where(and(
    eq(consumptionEvaluation.userId, userId),
    eq(consumptionEvaluation.consumptionId, consumptionId),
    eq(consumptionEvaluation.snapshotId, snapshotId),
  )).for('update').limit(1);
  if (!evaluation?.jobId || evaluation.state !== 'pending') return;
  await tx.update(analysisJob).set({
    status: 'cancelled',
    leaseToken: null,
    leaseExpiresAt: null,
    error: { code: 'TARGET_SUPERSEDED', message: 'Consumption revision changed', retryable: false },
    finishedAt: now,
    updatedAt: now,
  }).where(and(
    eq(analysisJob.id, evaluation.jobId),
    eq(analysisJob.userId, userId),
    inArray(analysisJob.status, ['queued', 'processing']),
  ));
}

async function replayResponse(tx: Transaction, reserved: { id: string; replay: { status: number; body: unknown } | null }): Promise<ConsumptionView | null> {
  if (!reserved.replay) return null;
  if (reserved.replay.status !== 200) throw new IdempotencyConflict();
  try {
    validateSchema('app.Consumption', reserved.replay.body);
  } catch {
    throw new IdempotencyConflict();
  }
  return reserved.replay.body as ConsumptionView;
}

/** Replace an active consumption revision; nutrition and personal evaluation stay separate. */
export async function updateConsumption(
  db: Database,
  input: {
    userId: string;
    sessionId: string;
    idempotencyKey: string;
    consumptionId: string;
    body: ConsumptionUpdate;
  },
): Promise<ConsumptionView | null> {
  const consumedAt = new Date(input.body.consumedAt);
  if (!Number.isFinite(consumedAt.getTime())) throw new ConsumptionError('invalid_input');
  const requestHash = hash({ consumptionId: input.consumptionId, ...updateCanonicalInput(input.body, consumedAt) });
  return db.transaction(async (tx) => {
    const account = await requireAccountAndSession(
      tx,
      { userId: input.userId, sessionId: input.sessionId },
      await databaseNow(tx),
    );
    const now = await databaseNow(tx);
    assertDateAndTimezone(consumedAt, input.body.timezone, now);
    const reservation = await reserveIdempotency(tx, {
      userId: input.userId,
      sessionId: input.sessionId,
      actionScope: `consumption:update:${input.consumptionId}`,
      key: input.idempotencyKey,
      requestHash,
      now,
    });
    const replay = await replayResponse(tx, reservation);
    if (replay) return replay;

    const [target] = await tx.select().from(consumption).where(and(
      eq(consumption.id, input.consumptionId),
      eq(consumption.userId, input.userId),
      sql`${consumption.deletedAt} IS NULL`,
    )).for('update').limit(1);
    if (!target || !target.currentSnapshotId) throw new ConsumptionError('not_found');
    if (target.revision !== input.body.expectedRevision) throw new ConsumptionError('revision_conflict');
    if (input.body.catalogVersion === 'unavailable' &&
        (target.source !== 'manual' || input.body.components.some((component) => component.catalogFoodId !== null))) {
      throw new ConsumptionError('catalog_unavailable');
    }
    const [sourceSnapshot] = await tx.select().from(consumptionSnapshot).where(and(
      eq(consumptionSnapshot.id, target.currentSnapshotId),
      eq(consumptionSnapshot.userId, input.userId),
    )).limit(1);
    if (!sourceSnapshot) throw new ConsumptionError('not_found');

    const catalog = await loadCatalog(tx, input.body.catalogVersion, input.body.components, target.source === 'manual');
    validateConsumptionComponents(input.body.components, null);
    const [storedProfile] = await tx.select().from(healthProfile)
      .where(eq(healthProfile.userId, input.userId)).limit(1);
    const profile = profileView(account, storedProfile, now);
    const consentGranted = await lockAndCheckCurrentAiConsent(tx, input.userId);
    const source = target.source === 'photo_confirmation' && target.sourceAnalysisResultId
      ? await loadExistingAttentionSource(tx, input.userId, target.sourceAnalysisResultId)
      : null;
    const reuse = Boolean(consentGranted && source && canReusePhotoAttention({
      sourceResult: source.result,
      sourceProfile: source.profile,
      currentProfile: profile,
      catalogVersion: input.body.catalogVersion,
      ruleSetVersion: source.result.ruleSetVersion,
      components: input.body.components,
    }));
    const profileSnapshotId = reuse
      ? source!.profileRow.id
      : await storeProfileSnapshot(tx, input.userId, profile, now);
    const revision = target.revision + 1;
    const generation = target.generation + 1;
    const snapshotId = randomUUID();
    const canonicalInput = updateCanonicalInput(input.body, consumedAt);
    await cancelPendingEvaluation(tx, input.userId, target.id, target.currentSnapshotId, now);
    const nutritionSnapshot = buildConsumptionNutritionSnapshot({
      operationId: randomUUID(),
      computedAt: now.toISOString(),
      profileVersion: profile.profileVersion,
      catalogVersion: input.body.catalogVersion,
      nutritionDatasetVersion: catalog.version?.nutritionDatasetVersion ?? 'unavailable',
      ruleSetVersion: catalog.version?.ruleSetVersion ?? 'unavailable',
      dataMode: snapshotMode(catalog),
      components: input.body.components,
      catalogFoods: catalog.foods,
    });
    const snapshot = reuse && source
      ? preservePhotoEvaluation(nutritionSnapshot, source.result)
      : nutritionSnapshot;
    await tx.insert(consumptionSnapshot).values({
      id: snapshotId,
      userId: input.userId,
      consumptionId: target.id,
      revision,
      profileSnapshotId,
      snapshot,
      createdAt: now,
    });
    await writeEvaluation(tx, {
      userId: input.userId,
      consumptionId: target.id,
      revision,
      generation,
      profileSnapshotId,
      profile,
      components: input.body.components,
      snapshot: { id: snapshotId, snapshot },
      catalog,
      sourceResultId: source?.resultRow.id ?? null,
      reusePhotoResultId: reuse ? source!.resultRow.id : null,
      consentGranted,
      now,
    });
    await tx.update(consumption).set({
      revision,
      generation,
      currentSnapshotId: snapshotId,
      consumedAt,
      timezone: input.body.timezone,
      canonicalInput,
      updatedAt: now,
    }).where(and(
      eq(consumption.id, target.id),
      eq(consumption.userId, input.userId),
      eq(consumption.revision, input.body.expectedRevision),
    ));
    const body = await readConsumptionView(tx, input.userId, target.id);
    if (!body) throw new Error('Updated consumption has no current snapshot');
    await tx.update(idempotencyRecord).set({
      responseStatus: 200,
      responseBody: body,
      resourceId: target.id,
    }).where(eq(idempotencyRecord.id, reservation.id));
    return body;
  });
}

async function loadExistingAttentionSource(
  tx: Transaction,
  userId: string,
  resultId: string,
): Promise<ResolvedSource | null> {
  const [resultRow] = await tx.select().from(analysisResult).where(and(
    eq(analysisResult.id, resultId), eq(analysisResult.userId, userId),
  )).limit(1);
  if (!resultRow) return null;
  const result = asAnalysisResult(resultRow.output);
  const [profileRow] = await tx.select().from(profileSnapshot).where(and(
    eq(profileSnapshot.id, resultRow.profileSnapshotId), eq(profileSnapshot.userId, userId),
  )).limit(1);
  if (!profileRow) return null;
  try { validateSchema('ai.ProfileContext', profileRow.context); } catch { return null; }
  return {
    scan: {} as typeof scan.$inferSelect,
    resultRow,
    result,
    profileRow,
    profile: profileRow.context as ProfileContext,
  };
}

/** Delete from current views immediately and invalidate any in-flight evaluation generation. */
export async function deleteConsumption(
  db: Database,
  input: { userId: string; sessionId: string; idempotencyKey: string; consumptionId: string },
): Promise<boolean> {
  const requestHash = hash({ consumptionId: input.consumptionId, action: 'delete' });
  return db.transaction(async (tx) => {
    await requireAccountAndSession(
      tx,
      { userId: input.userId, sessionId: input.sessionId },
      await databaseNow(tx),
    );
    const now = await databaseNow(tx);
    const reservation = await reserveIdempotency(tx, {
      userId: input.userId,
      sessionId: input.sessionId,
      actionScope: `consumption:delete:${input.consumptionId}`,
      key: input.idempotencyKey,
      requestHash,
      now,
    });
    if (reservation.replay) {
      if (reservation.replay.status !== 204) throw new IdempotencyConflict();
      return false;
    }
    const [target] = await tx.select().from(consumption).where(and(
      eq(consumption.id, input.consumptionId),
      eq(consumption.userId, input.userId),
      sql`${consumption.deletedAt} IS NULL`,
    )).for('update').limit(1);
    if (!target || !target.currentSnapshotId) throw new ConsumptionError('not_found');
    await cancelPendingEvaluation(tx, input.userId, target.id, target.currentSnapshotId, now);
    await tx.update(consumption).set({
      deletedAt: now,
      generation: target.generation + 1,
      currentSnapshotId: null,
      updatedAt: now,
    }).where(and(eq(consumption.id, target.id), eq(consumption.userId, input.userId)));
    await tx.update(idempotencyRecord).set({
      responseStatus: 204,
      responseBody: null,
      resourceId: target.id,
    }).where(eq(idempotencyRecord.id, reservation.id));
    return true;
  });
}
