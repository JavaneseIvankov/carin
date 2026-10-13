import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type PgTableExtraConfigValue,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { user, session } from './auth.js';

const id = () => uuid('id').defaultRandom().primaryKey();
const owner = () =>
  uuid('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' });
const created = () =>
  timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const updated = () =>
  timestamp('updated_at', { withTimezone: true }).defaultNow().notNull();
const revision = () => integer('revision').default(1).notNull();
const decimal = (name: string) => numeric(name, { precision: 20, scale: 6 });

export const healthProfile = pgTable(
  'health_profile',
  {
    userId: owner().primaryKey(),
    version: integer('version').default(1).notNull(),
    heightCm: decimal('height_cm'),
    weightKg: decimal('weight_kg'),
    sexForReference: text('sex_for_reference'),
    clinicianNotes: text('clinician_notes'),
    activity: text('activity'),
    smoking: text('smoking'),
    diagnosisState: text('diagnosis_state').default('not_provided').notNull(),
    conditions: jsonb('conditions').default([]).notNull(),
    familyHistoryState: text('family_history_state')
      .default('not_provided')
      .notNull(),
    familyHistory: jsonb('family_history').default([]).notNull(),
    allergyState: text('allergy_state').default('not_provided').notNull(),
    allergies: jsonb('allergies').default([]).notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t): PgTableExtraConfigValue[] => [
    check('profile_version_positive', sql`${t.version} >= 1`),
    check(
      'profile_measurements_positive',
      sql`(${t.heightCm} IS NULL OR ${t.heightCm} > 0 AND ${t.heightCm} <> 'NaN'::numeric) AND (${t.weightKg} IS NULL OR ${t.weightKg} > 0 AND ${t.weightKg} <> 'NaN'::numeric)`,
    ),
    check(
      'profile_activity',
      sql`${t.activity} IS NULL OR ${t.activity} IN ('sedentary','light','moderate','high')`,
    ),
    check(
      'profile_smoking',
      sql`${t.smoking} IS NULL OR ${t.smoking} IN ('never','former','current')`,
    ),
    check(
      'profile_sex',
      sql`${t.sexForReference} IS NULL OR ${t.sexForReference} IN ('female','male')`,
    ),
    check(
      'profile_diagnosis',
      sql`${t.diagnosisState} IN ('not_provided','none_known','never_examined','reported') AND jsonb_typeof(${t.conditions}) = 'array' AND ((${t.diagnosisState} = 'reported') = (jsonb_array_length(${t.conditions}) > 0))`,
    ),
    check(
      'profile_family',
      sql`${t.familyHistoryState} IN ('not_provided','unknown','none_known','reported') AND jsonb_typeof(${t.familyHistory}) = 'array' AND ((${t.familyHistoryState} = 'reported') = (jsonb_array_length(${t.familyHistory}) > 0))`,
    ),
    check(
      'profile_allergies',
      sql`${t.allergyState} IN ('not_provided','unknown','none_known','reported') AND jsonb_typeof(${t.allergies}) = 'array' AND ((${t.allergyState} = 'reported') = (jsonb_array_length(${t.allergies}) > 0))`,
    ),
  ],
);

export const profileSnapshot = pgTable(
  'profile_snapshot',
  {
    id: id(),
    userId: owner(),
    profileVersion: integer('profile_version').notNull(),
    context: jsonb('context').notNull(),
    createdAt: created(),
  },
  (t): PgTableExtraConfigValue[] => [
    unique('profile_snapshot_owner').on(t.userId, t.id),
    check('snapshot_profile_version', sql`${t.profileVersion} >= 0`),
  ],
);

export const consentEvent = pgTable(
  'consent_event',
  {
    id: id(),
    userId: owner(),
    kind: text('kind').notNull(),
    version: text('version').notNull(),
    granted: boolean('granted').notNull(),
    createdAt: created(),
  },
  (t): PgTableExtraConfigValue[] => [
    check(
      'consent_kind',
      sql`${t.kind} IN ('terms','privacy','ai_processing')`,
    ),
    index('consent_latest').on(t.userId, t.kind, t.createdAt, t.id),
  ],
);

export const catalogFood = pgTable(
  'catalog_food',
  {
    id: text('id').notNull(),
    version: text('version').notNull(),
    displayName: text('display_name').notNull(),
    preparation: text('preparation'),
    energyKcal: decimal('energy_kcal'),
    carbohydrateG: decimal('carbohydrate_g'),
    proteinG: decimal('protein_g'),
    fatG: decimal('fat_g'),
    fiberG: decimal('fiber_g'),
    sugarsG: decimal('sugars_g'),
    sodiumMg: decimal('sodium_mg'),
    sourceRefs: jsonb('source_refs').notNull(),
    createdAt: created(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ columns: [t.version, t.id] }),
    index('catalog_search').on(t.version, t.displayName, t.id),
    check(
      'catalog_nutrients_nonnegative',
      sql`(${t.energyKcal} IS NULL OR ${t.energyKcal} >= 0 AND ${t.energyKcal} <> 'NaN'::numeric) AND (${t.carbohydrateG} IS NULL OR ${t.carbohydrateG} >= 0 AND ${t.carbohydrateG} <> 'NaN'::numeric) AND (${t.proteinG} IS NULL OR ${t.proteinG} >= 0 AND ${t.proteinG} <> 'NaN'::numeric) AND (${t.fatG} IS NULL OR ${t.fatG} >= 0 AND ${t.fatG} <> 'NaN'::numeric) AND (${t.fiberG} IS NULL OR ${t.fiberG} >= 0 AND ${t.fiberG} <> 'NaN'::numeric) AND (${t.sugarsG} IS NULL OR ${t.sugarsG} >= 0 AND ${t.sugarsG} <> 'NaN'::numeric) AND (${t.sodiumMg} IS NULL OR ${t.sodiumMg} >= 0 AND ${t.sodiumMg} <> 'NaN'::numeric)`,
    ),
  ],
);
export const catalogServing = pgTable(
  'catalog_serving',
  {
    id: text('id').notNull(),
    catalogVersion: text('catalog_version').notNull(),
    foodId: text('food_id').notNull(),
    label: text('label').notNull(),
    grams: decimal('grams').notNull(),
    sourceRefs: jsonb('source_refs').notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ columns: [t.catalogVersion, t.foodId, t.id] }),
    foreignKey({
      columns: [t.catalogVersion, t.foodId],
      foreignColumns: [catalogFood.version, catalogFood.id],
    }).onDelete('cascade'),
    check(
      'serving_grams_positive',
      sql`${t.grams} > 0 AND ${t.grams} <> 'NaN'::numeric`,
    ),
  ],
);

export const photo = pgTable(
  'photo',
  {
    id: id(),
    userId: owner(),
    objectKey: text('object_key').notNull().unique(),
    checksum: text('checksum').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    lifecycle: text('lifecycle').default('uploaded').notNull(),
    createdAt: created(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t): PgTableExtraConfigValue[] => [
    unique('photo_owner').on(t.userId, t.id),
    check('photo_type', sql`${t.mimeType} IN ('image/jpeg','image/png')`),
    check('photo_size', sql`${t.sizeBytes} > 0 AND ${t.sizeBytes} <= 10485760`),
    check(
      'photo_lifecycle',
      sql`${t.lifecycle} IN ('uploaded','attached','deleting','deleted')`,
    ),
    index('photo_orphan_cleanup').on(t.lifecycle, t.createdAt),
  ],
);

export const scan = pgTable(
  'scan',
  {
    id: id(),
    userId: owner(),
    photoId: uuid('photo_id').references(() => photo.id, {
      onDelete: 'set null',
    }),
    profileSnapshotId: uuid('profile_snapshot_id').notNull(),
    revision: revision(),
    generation: integer('generation').default(1).notNull(),
    currentResultId: uuid('current_result_id').references(
      (): AnyPgColumn => analysisResult.id,
      { onDelete: 'set null' },
    ),
    latestJobId: uuid('latest_job_id').references(
      (): AnyPgColumn => analysisJob.id,
      { onDelete: 'set null' },
    ),
    lifecycle: text('lifecycle').default('active').notNull(),
    createdAt: created(),
    updatedAt: updated(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t): PgTableExtraConfigValue[] => [
    unique('scan_owner').on(t.userId, t.id),
    unique('scan_photo_root').on(t.photoId),
    check('scan_revision', sql`${t.revision} >= 1 AND ${t.generation} >= 1`),
    check(
      'scan_lifecycle',
      sql`${t.lifecycle} IN ('active','deleting','deleted')`,
    ),
    index('scan_history').on(t.userId, t.createdAt, t.id),
    foreignKey({
      columns: [t.userId, t.photoId],
      foreignColumns: [photo.userId, photo.id],
    }),
    foreignKey({
      columns: [t.userId, t.profileSnapshotId],
      foreignColumns: [profileSnapshot.userId, profileSnapshot.id],
    }),
    foreignKey({
      columns: [t.userId, t.currentResultId],
      foreignColumns: [analysisResult.userId, analysisResult.id],
    }),
    foreignKey({
      columns: [t.userId, t.latestJobId],
      foreignColumns: [analysisJob.userId, analysisJob.id],
    }),
  ],
);

export const analysisJob = pgTable(
  'analysis_job',
  {
    id: id(),
    userId: owner(),
    operationId: uuid('operation_id').defaultRandom().notNull().unique(),
    kind: text('kind').notNull(),
    inputSnapshot: jsonb('input_snapshot').notNull(),
    profileSnapshotId: uuid('profile_snapshot_id').notNull(),
    scanId: uuid('scan_id').references((): AnyPgColumn => scan.id, {
      onDelete: 'cascade',
    }),
    consumptionId: uuid('consumption_id').references(
      (): AnyPgColumn => consumption.id,
      { onDelete: 'cascade' },
    ),
    basedOnResultId: uuid('based_on_result_id').references(
      (): AnyPgColumn => analysisResult.id,
      { onDelete: 'set null' },
    ),
    targetRevision: integer('target_revision').notNull(),
    targetGeneration: integer('target_generation').default(1).notNull(),
    status: text('status').default('queued').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(3).notNull(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    leaseToken: uuid('lease_token'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    deadlineAt: timestamp('deadline_at', { withTimezone: true })
      .default(sql`now() + interval '5 minutes'`)
      .notNull(),
    error: jsonb('error'),
    createdAt: created(),
    updatedAt: updated(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t): PgTableExtraConfigValue[] => [
    unique('job_owner').on(t.userId, t.id),
    check(
      'job_kind',
      sql`${t.kind} IN ('photo_analysis','correction','consumption_evaluation')`,
    ),
    check(
      'job_status',
      sql`${t.status} IN ('queued','processing','completed','failed','cancelled')`,
    ),
    check(
      'job_revision_attempt',
      sql`${t.targetRevision} >= 1 AND ${t.targetGeneration} >= 1 AND ${t.attempts} >= 0 AND ${t.maxAttempts} > 0 AND ${t.attempts} <= ${t.maxAttempts}`,
    ),
    check(
      'job_target',
      sql`(${t.scanId} IS NOT NULL AND ${t.consumptionId} IS NULL AND ${t.kind} IN ('photo_analysis','correction')) OR (${t.scanId} IS NULL AND ${t.consumptionId} IS NOT NULL AND ${t.kind} = 'consumption_evaluation')`,
    ),
    check(
      'job_processing_lease',
      sql`${t.status} <> 'processing' OR (${t.leaseToken} IS NOT NULL AND ${t.leaseExpiresAt} IS NOT NULL)`,
    ),
    index('job_queue').on(t.status, t.nextAttemptAt),
    index('job_lease').on(t.status, t.leaseExpiresAt),
    foreignKey({
      columns: [t.userId, t.scanId],
      foreignColumns: [scan.userId, scan.id],
    }),
    foreignKey({
      columns: [t.userId, t.consumptionId],
      foreignColumns: [consumption.userId, consumption.id],
    }),
    foreignKey({
      columns: [t.userId, t.profileSnapshotId],
      foreignColumns: [profileSnapshot.userId, profileSnapshot.id],
    }),
    foreignKey({
      columns: [t.userId, t.basedOnResultId],
      foreignColumns: [analysisResult.userId, analysisResult.id],
    }),
  ],
);

export const analysisResult = pgTable(
  'analysis_result',
  {
    id: id(),
    userId: owner(),
    jobId: uuid('job_id')
      .notNull()
      .unique()
      .references((): AnyPgColumn => analysisJob.id, { onDelete: 'cascade' }),
    profileSnapshotId: uuid('profile_snapshot_id').notNull(),
    catalogVersion: text('catalog_version').notNull(),
    ruleVersion: text('rule_version').notNull(),
    output: jsonb('output').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    unique('result_owner').on(t.userId, t.id),
    foreignKey({
      columns: [t.userId, t.jobId],
      foreignColumns: [analysisJob.userId, analysisJob.id],
    }),
    foreignKey({
      columns: [t.userId, t.profileSnapshotId],
      foreignColumns: [profileSnapshot.userId, profileSnapshot.id],
    }),
  ],
);

export const consumption = pgTable(
  'consumption',
  {
    id: id(),
    userId: owner(),
    revision: revision(),
    generation: integer('generation').default(1).notNull(),
    source: text('source').notNull(),
    confirmationMode: text('confirmation_mode').default('default').notNull(),
    scanId: uuid('scan_id').references((): AnyPgColumn => scan.id, {
      onDelete: 'set null',
    }),
    sourceAnalysisResultId: uuid('source_analysis_result_id').references(
      (): AnyPgColumn => analysisResult.id,
      { onDelete: 'set null' },
    ),
    currentSnapshotId: uuid('current_snapshot_id').references(
      (): AnyPgColumn => consumptionSnapshot.id,
      { onDelete: 'set null' },
    ),
    photoAvailable: boolean('photo_available').default(false).notNull(),
    canonicalInput: jsonb('canonical_input').default({}).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }).notNull(),
    timezone: text('timezone').default('Asia/Jakarta').notNull(),
    createdAt: created(),
    updatedAt: updated(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t): PgTableExtraConfigValue[] => [
    unique('consumption_owner').on(t.userId, t.id),
    unique('consumption_owner_revision').on(t.userId, t.id, t.revision),
    check(
      'consumption_revision',
      sql`${t.revision} >= 1 AND ${t.generation} >= 1`,
    ),
    check(
      'consumption_source',
      sql`${t.source} IN ('manual','photo_confirmation') AND (${t.source} <> 'manual' OR (${t.scanId} IS NULL AND ${t.sourceAnalysisResultId} IS NULL))`,
    ),
    check(
      'consumption_confirmation_mode',
      sql`${t.confirmationMode} IN ('default','new_occurrence')`,
    ),
    uniqueIndex('consumption_active_default_confirmation')
      .on(t.scanId)
      .where(
        sql`${t.source} = 'photo_confirmation' AND ${t.confirmationMode} = 'default' AND ${t.deletedAt} IS NULL AND ${t.scanId} IS NOT NULL`,
      ),
    index('consumption_history').on(t.userId, t.consumedAt, t.id),
    foreignKey({
      columns: [t.userId, t.scanId],
      foreignColumns: [scan.userId, scan.id],
    }),
    foreignKey({
      columns: [t.userId, t.sourceAnalysisResultId],
      foreignColumns: [analysisResult.userId, analysisResult.id],
    }),
    foreignKey({
      columns: [t.userId, t.id, t.revision, t.currentSnapshotId],
      foreignColumns: [
        consumptionSnapshot.userId,
        consumptionSnapshot.consumptionId,
        consumptionSnapshot.revision,
        consumptionSnapshot.id,
      ],
    }),
  ],
);

export const consumptionSnapshot = pgTable(
  'consumption_snapshot',
  {
    id: id(),
    userId: owner(),
    consumptionId: uuid('consumption_id')
      .notNull()
      .references((): AnyPgColumn => consumption.id, { onDelete: 'cascade' }),
    revision: revision(),
    profileSnapshotId: uuid('profile_snapshot_id').notNull(),
    snapshot: jsonb('snapshot').notNull(),
    createdAt: created(),
  },
  (t): PgTableExtraConfigValue[] => [
    unique('consumption_snapshot_revision').on(t.consumptionId, t.revision),
    unique('consumption_snapshot_pointer').on(
      t.userId,
      t.consumptionId,
      t.revision,
      t.id,
    ),
    check('consumption_snapshot_revision_positive', sql`${t.revision} >= 1`),
    foreignKey({
      columns: [t.userId, t.consumptionId],
      foreignColumns: [consumption.userId, consumption.id],
    }),
    foreignKey({
      columns: [t.userId, t.profileSnapshotId],
      foreignColumns: [profileSnapshot.userId, profileSnapshot.id],
    }),
  ],
);

// Evaluation completion is separate from immutable nutrition/profile snapshots.
export const consumptionEvaluation = pgTable(
  'consumption_evaluation',
  {
    id: id(),
    userId: owner(),
    consumptionId: uuid('consumption_id')
      .notNull()
      .references((): AnyPgColumn => consumption.id, { onDelete: 'cascade' }),
    revision: revision(),
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references((): AnyPgColumn => consumptionSnapshot.id, {
        onDelete: 'cascade',
      }),
    state: text('state').default('not_requested').notNull(),
    jobId: uuid('job_id').references((): AnyPgColumn => analysisJob.id, {
      onDelete: 'set null',
    }),
    resultId: uuid('result_id').references(
      (): AnyPgColumn => analysisResult.id,
      { onDelete: 'set null' },
    ),
    limitations: jsonb('limitations').default([]).notNull(),
    updatedAt: updated(),
  },
  (t): PgTableExtraConfigValue[] => [
    unique('evaluation_snapshot').on(t.snapshotId),
    check(
      'evaluation_state',
      sql`${t.state} IN ('not_requested','pending','completed','failed')`,
    ),
    foreignKey({
      columns: [t.userId, t.consumptionId, t.revision, t.snapshotId],
      foreignColumns: [
        consumptionSnapshot.userId,
        consumptionSnapshot.consumptionId,
        consumptionSnapshot.revision,
        consumptionSnapshot.id,
      ],
    }),
    foreignKey({
      columns: [t.userId, t.jobId],
      foreignColumns: [analysisJob.userId, analysisJob.id],
    }),
    foreignKey({
      columns: [t.userId, t.resultId],
      foreignColumns: [analysisResult.userId, analysisResult.id],
    }),
  ],
);

export const examination = pgTable(
  'examination',
  {
    id: id(),
    userId: owner(),
    revision: revision(),
    type: text('type').notNull(),
    subtype: text('subtype'),
    context: text('context'),
    seriesKey: text('series_key').notNull(),
    measuredOn: date('measured_on').notNull(),
    measuredTime: text('measured_time'),
    timezone: text('timezone').notNull(),
    value: decimal('value'),
    systolic: integer('systolic'),
    diastolic: integer('diastolic'),
    unit: text('unit').notNull(),
    notes: text('notes'),
    createdAt: created(),
    updatedAt: updated(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t): PgTableExtraConfigValue[] => [
    check('exam_revision', sql`${t.revision} >= 1`),
    check(
      'exam_time',
      sql`${t.measuredTime} IS NULL OR ${t.measuredTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`,
    ),
    check(
      'exam_measurements',
      sql`(${t.type} = 'pressure' AND ${t.unit} = 'mmHg' AND ${t.systolic} > 0 AND ${t.diastolic} > 0 AND ${t.systolic} IS NOT NULL AND ${t.diastolic} IS NOT NULL AND ${t.value} IS NULL AND ${t.subtype} IS NULL AND ${t.context} IS NULL) OR (${t.type} = 'glucose' AND ${t.unit} = 'mg/dL' AND ${t.value} > 0 AND ${t.value} <> 'NaN'::numeric AND ${t.value} IS NOT NULL AND ${t.context} IN ('fasting','random','post_meal','unknown') AND ${t.context} IS NOT NULL AND ${t.subtype} IS NULL AND ${t.systolic} IS NULL AND ${t.diastolic} IS NULL) OR (${t.type} = 'cholesterol' AND ${t.unit} = 'mg/dL' AND ${t.value} > 0 AND ${t.value} <> 'NaN'::numeric AND ${t.value} IS NOT NULL AND ${t.subtype} IN ('total','ldl','hdl') AND ${t.subtype} IS NOT NULL AND ${t.context} IS NULL AND ${t.systolic} IS NULL AND ${t.diastolic} IS NULL)`,
    ),
    index('exam_series_history').on(t.userId, t.seriesKey, t.measuredOn, t.id),
  ],
);

export const idempotencyRecord = pgTable(
  'idempotency_record',
  {
    id: id(),
    userId: owner(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => session.id, { onDelete: 'cascade' }),
    actionScope: text('action_scope').notNull(),
    key: uuid('key').notNull(),
    requestHash: text('request_hash').notNull(),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),
    resourceId: uuid('resource_id'),
    createdAt: created(),
    expiresAt: timestamp('expires_at', { withTimezone: true })
      .default(sql`now() + interval '24 hours'`)
      .notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    unique('idempotency_scope_key').on(
      t.userId,
      t.sessionId,
      t.actionScope,
      t.key,
    ),
    check(
      'idempotency_status',
      sql`${t.responseStatus} IS NULL OR ${t.responseStatus} BETWEEN 100 AND 599`,
    ),
    index('idempotency_expiry').on(t.expiresAt),
  ],
);

export const deletionTask = pgTable(
  'deletion_task',
  {
    id: id(),
    userId: owner(),
    kind: text('kind').notNull(),
    objectKeys: jsonb('object_keys').default([]).notNull(),
    status: text('status').default('queued').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    leaseToken: uuid('lease_token'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    createdAt: created(),
  },
  (t): PgTableExtraConfigValue[] => [
    check('deletion_kind', sql`${t.kind} IN ('account','photo')`),
    check(
      'deletion_status',
      sql`${t.status} IN ('queued','processing','failed')`,
    ),
    check('deletion_attempts', sql`${t.attempts} >= 0`),
    index('deletion_queue').on(t.status, t.nextAttemptAt),
  ],
);

export const emailTask = pgTable(
  'email_task',
  {
    id: id(),
    userId: owner(),
    deliveryKey: uuid('delivery_key').defaultRandom().notNull().unique(),
    kind: text('kind').notNull(),
    payload: jsonb('payload').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    status: text('status').default('queued').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    leaseToken: uuid('lease_token'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    createdAt: created(),
  },
  (t): PgTableExtraConfigValue[] => [
    check('email_kind', sql`${t.kind} IN ('verification','password_reset')`),
    check('email_status', sql`${t.status} IN ('queued','processing','failed')`),
    check('email_attempts', sql`${t.attempts} >= 0`),
    index('email_queue').on(t.status, t.nextAttemptAt),
  ],
);
