import { and, desc, eq, getTableColumns, gt, isNull, lt, or, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { examination, idempotencyRecord, session, user } from '../../db/schema/index.js';
import type { ExaminationRecord } from './types.js';

export type ExaminationTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type ExaminationRow = typeof examination.$inferSelect;

export async function lockExaminationOwner(tx: ExaminationTransaction, userId: string) {
  const [owner] = await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for('update');
  return owner ?? null;
}

export async function hasActiveExaminationSession(
  tx: ExaminationTransaction,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const [active] = await tx.select({ id: session.id }).from(session).where(and(
    eq(session.id, sessionId),
    eq(session.userId, userId),
    gt(session.expiresAt, sql`clock_timestamp()`),
  ));
  return Boolean(active);
}

function measurementColumns(record: ExaminationRecord) {
  const shared = {
    type: record.type,
    seriesKey: record.seriesKey,
    measuredOn: record.measuredOn,
    measuredTime: record.measuredTime,
    timezone: record.timezone,
    unit: record.unit,
    notes: record.note,
  };
  if (record.type === 'pressure') return {
    ...shared,
    value: null,
    subtype: null,
    context: null,
    systolic: String(record.systolic),
    diastolic: String(record.diastolic),
  };
  return {
    ...shared,
    value: String(record.value),
    subtype: record.type === 'cholesterol' ? record.subtype : null,
    context: record.type === 'glucose' ? record.context : null,
    systolic: null,
    diastolic: null,
  };
}

export async function insertExamination(
  tx: ExaminationTransaction,
  userId: string,
  record: ExaminationRecord,
): Promise<ExaminationRow> {
  const [row] = await tx.insert(examination).values({
    userId,
    revision: 1,
    ...measurementColumns(record),
    // JavaScript Date and cursor timestamps have millisecond precision. Store
    // the same precision so a cursor cannot skip rows created in one DB tick.
    createdAt: sql`date_trunc('milliseconds', clock_timestamp())`,
    updatedAt: sql`date_trunc('milliseconds', clock_timestamp())`,
  }).returning();
  return row!;
}

export async function findActiveExamination(
  db: Database | ExaminationTransaction,
  userId: string,
  id: string,
): Promise<ExaminationRow | null> {
  const [row] = await db.select().from(examination).where(and(
    eq(examination.id, id), eq(examination.userId, userId), isNull(examination.deletedAt),
  ));
  return row ?? null;
}

export async function replaceExamination(
  tx: ExaminationTransaction,
  userId: string,
  id: string,
  expectedRevision: number,
  record: ExaminationRecord,
): Promise<ExaminationRow | null> {
  const [row] = await tx.update(examination).set({
    ...measurementColumns(record),
    revision: expectedRevision + 1,
    updatedAt: sql`clock_timestamp()`,
  }).where(and(
    eq(examination.id, id), eq(examination.userId, userId),
    eq(examination.revision, expectedRevision), isNull(examination.deletedAt),
  )).returning();
  return row ?? null;
}

export async function softDeleteExamination(
  tx: ExaminationTransaction,
  userId: string,
  id: string,
): Promise<ExaminationRow | null> {
  const [row] = await tx.update(examination).set({
    deletedAt: sql`clock_timestamp()`,
    updatedAt: sql`clock_timestamp()`,
  }).where(and(
    eq(examination.id, id), eq(examination.userId, userId), isNull(examination.deletedAt),
  )).returning();
  return row ?? null;
}

export type ExaminationCursorSort = {
  measuredOn: string;
  measuredTime: string | null;
  createdAt: string;
  id: string;
};

export type ListedExaminationRow = ExaminationRow & { cursorCreatedAt: string };

export async function listExaminations(
  db: Database | ExaminationTransaction,
  input: { userId: string; limit: number; type?: string; seriesKey?: string; after?: ExaminationCursorSort },
): Promise<ListedExaminationRow[]> {
  const filters = [eq(examination.userId, input.userId), isNull(examination.deletedAt)];
  if (input.type) filters.push(eq(examination.type, input.type));
  if (input.seriesKey) filters.push(eq(examination.seriesKey, input.seriesKey));
  if (input.after) {
    const cursor = input.after;
    const cursorDate = cursor.measuredOn;
    const cursorTime = cursor.measuredTime;
    const createdBeforeCursor = sql`${examination.createdAt} < ${cursor.createdAt}::timestamptz`;
    const createdAtEqualsCursor = sql`${examination.createdAt} = ${cursor.createdAt}::timestamptz`;
    const sameDayAfter = cursorTime === null
      ? and(isNull(examination.measuredTime), createdBeforeCursor)
      : or(
        lt(examination.measuredTime, cursorTime),
        isNull(examination.measuredTime),
        and(eq(examination.measuredTime, cursorTime), createdBeforeCursor),
      );
    filters.push(or(
      lt(examination.measuredOn, cursorDate),
      and(eq(examination.measuredOn, cursorDate), sameDayAfter),
      and(
        eq(examination.measuredOn, cursorDate),
        cursorTime === null ? isNull(examination.measuredTime) : eq(examination.measuredTime, cursorTime),
        createdAtEqualsCursor,
        lt(examination.id, cursor.id),
      ),
    )!);
  }
  return db.select({
    ...getTableColumns(examination),
    cursorCreatedAt: sql<string>`to_char(${examination.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
  }).from(examination).where(and(...filters)).orderBy(
    desc(examination.measuredOn),
    sql`${examination.measuredTime} DESC NULLS LAST`,
    desc(examination.createdAt),
    desc(examination.id),
  ).limit(input.limit + 1);
}

export async function listAllActiveExaminations(
  db: Database | ExaminationTransaction,
  userId: string,
): Promise<ExaminationRow[]> {
  return db.select().from(examination).where(and(
    eq(examination.userId, userId), isNull(examination.deletedAt),
  )).orderBy(
    // Timed readings have a comparable instant across timezones. Date-only
    // readings stay in a lower-precision group and retain their civil date.
    sql`(${examination.measuredTime} IS NULL) ASC`,
    sql`CASE WHEN ${examination.measuredTime} IS NOT NULL THEN (${examination.measuredOn} + ${examination.measuredTime}::time) AT TIME ZONE ${examination.timezone} END DESC NULLS LAST`,
    desc(examination.measuredOn),
    desc(examination.createdAt),
    desc(examination.id),
  );
}

export async function reserveExaminationIdempotency(
  tx: ExaminationTransaction,
  input: { userId: string; sessionId: string; key: string; action: 'create' | 'update' | 'delete'; requestHash: string },
) {
  const actionScope = `examination:${input.action}`;
  await tx.delete(idempotencyRecord).where(and(
    eq(idempotencyRecord.userId, input.userId),
    eq(idempotencyRecord.sessionId, input.sessionId),
    eq(idempotencyRecord.actionScope, actionScope),
    eq(idempotencyRecord.key, input.key),
    lt(idempotencyRecord.expiresAt, sql`clock_timestamp()`),
  ));
  const [reservation] = await tx.insert(idempotencyRecord).values({
    userId: input.userId,
    sessionId: input.sessionId,
    actionScope,
    key: input.key,
    requestHash: input.requestHash,
  }).onConflictDoNothing().returning({ id: idempotencyRecord.id });
  if (reservation) return { reservationId: reservation.id, replay: null as null | { status: number; body: unknown } };
  const [prior] = await tx.select().from(idempotencyRecord).where(and(
    eq(idempotencyRecord.userId, input.userId),
    eq(idempotencyRecord.sessionId, input.sessionId),
    eq(idempotencyRecord.actionScope, actionScope),
    eq(idempotencyRecord.key, input.key),
  )).for('update');
  if (!prior || prior.requestHash !== input.requestHash || prior.responseStatus === null || prior.responseBody === null && prior.responseStatus !== 204)
    throw new Error('EXAMINATION_IDEMPOTENCY_CONFLICT');
  return { reservationId: null, replay: { status: prior.responseStatus, body: prior.responseBody } };
}

export async function saveExaminationIdempotencyResponse(
  tx: ExaminationTransaction,
  reservationId: string,
  response: { status: number; body: unknown; resourceId?: string },
): Promise<void> {
  await tx.update(idempotencyRecord).set({
    responseStatus: response.status,
    responseBody: response.body,
    resourceId: response.resourceId ?? null,
  }).where(eq(idempotencyRecord.id, reservationId));
}
