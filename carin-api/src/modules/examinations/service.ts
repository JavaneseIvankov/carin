import type { Database } from '../../db/client.js';
import {
  getExaminationRecordSeriesKey,
  decodeExaminationCursor,
  encodeExaminationCursor,
  hashCanonicalJson,
  validateExaminationInput,
} from './validation.js';
import {
  findActiveExamination,
  hasActiveExaminationSession,
  insertExamination,
  listAllActiveExaminations,
  listExaminations as listExaminationRows,
  lockExaminationOwner,
  replaceExamination,
  reserveExaminationIdempotency,
  saveExaminationIdempotencyResponse,
  softDeleteExamination,
  type ExaminationCursorSort,
  type ExaminationRow,
  type ExaminationTransaction,
} from './repository.js';
import type { ExamSeries, Examination, ExaminationInput, ExaminationPage, ExaminationRecord } from './types.js';

export class ExaminationNotFoundError extends Error {}
export class ExaminationSessionError extends Error {}
export class ExaminationValidationError extends Error {}
export class ExaminationRevisionConflictError extends Error {}
export class ExaminationIdempotencyConflictError extends Error {}
export class ExaminationCursorError extends Error {}

export type ExaminationScope = { userId: string; sessionId: string };

function numeric(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error('Stored examination number is not finite');
  return parsed;
}

function recordFromRow(row: ExaminationRow): ExaminationInput {
  const shared = {
    measuredOn: row.measuredOn,
    measuredTime: row.measuredTime,
    timezone: row.timezone,
    note: row.notes,
  };
  if (row.type === 'pressure' && row.systolic !== null && row.diastolic !== null) {
    const systolic = numeric(row.systolic);
    const diastolic = numeric(row.diastolic);
    if (systolic === null || diastolic === null || !Number.isSafeInteger(systolic) || !Number.isSafeInteger(diastolic))
      throw new Error('Stored pressure values are invalid');
    return { ...shared, type: 'pressure', unit: 'mmHg', systolic, diastolic };
  }
  const value = numeric(row.value);
  if (value === null || value <= 0) throw new Error('Stored examination value is invalid');
  if (row.type === 'glucose' && row.context && ['fasting', 'random', 'post_meal', 'unknown'].includes(row.context))
    return { ...shared, type: 'glucose', unit: 'mg/dL', context: row.context as 'fasting' | 'random' | 'post_meal' | 'unknown', value };
  if (row.type === 'cholesterol' && row.subtype && ['total', 'ldl', 'hdl'].includes(row.subtype))
    return { ...shared, type: 'cholesterol', unit: 'mg/dL', subtype: row.subtype as 'total' | 'ldl' | 'hdl', value };
  throw new Error('Stored examination type is invalid');
}

function examinationFromRow(row: ExaminationRow): Examination {
  return {
    id: row.id,
    revision: row.revision,
    record: recordFromRow(row),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function requestHash(value: unknown): string {
  return hashCanonicalJson(value);
}

async function checkOwnerAndSession(tx: ExaminationTransaction, scope: ExaminationScope): Promise<void> {
  if (!(await lockExaminationOwner(tx, scope.userId))) throw new ExaminationNotFoundError();
  if (!(await hasActiveExaminationSession(tx, scope.userId, scope.sessionId))) throw new ExaminationSessionError();
}

async function idempotentMutation<T>(
  db: Database,
  scope: ExaminationScope,
  input: { key: string; action: 'create' | 'update' | 'delete'; request: unknown },
  mutate: (tx: ExaminationTransaction) => Promise<{ status: number; body: T | null; resourceId?: string }>,
): Promise<{ status: number; body: T | null }> {
  if (!scope.sessionId) throw new ExaminationSessionError();
  return db.transaction(async (tx) => {
    await checkOwnerAndSession(tx, scope);
    let reservation: Awaited<ReturnType<typeof reserveExaminationIdempotency>>;
    try {
      reservation = await reserveExaminationIdempotency(tx, {
        ...scope,
        key: input.key,
        action: input.action,
        requestHash: requestHash(input.request),
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'EXAMINATION_IDEMPOTENCY_CONFLICT')
        throw new ExaminationIdempotencyConflictError();
      throw error;
    }
    if (reservation.replay) return reservation.replay as { status: number; body: T | null };
    const result = await mutate(tx);
    await saveExaminationIdempotencyResponse(tx, reservation.reservationId!, {
      ...result,
      body: result.body,
    });
    return { status: result.status, body: result.body };
  });
}

export async function getExamination(db: Database, userId: string, id: string): Promise<Examination> {
  const row = await findActiveExamination(db, userId, id);
  if (!row) throw new ExaminationNotFoundError();
  return examinationFromRow(row);
}

export async function createExamination(
  db: Database,
  scope: ExaminationScope,
  key: string,
  input: ExaminationInput,
): Promise<{ status: number; body: Examination }> {
  let record: ExaminationRecord;
  try {
    const validated = validateExaminationInput(input);
    record = { ...validated, seriesKey: getExaminationRecordSeriesKey(validated) };
  }
  catch { throw new ExaminationValidationError(); }
  const result = await idempotentMutation(db, scope, { key, action: 'create', request: record }, async (tx) => {
    const row = await insertExamination(tx, scope.userId, record);
    return { status: 201, body: examinationFromRow(row), resourceId: row.id };
  });
  if (!result.body) throw new Error('Create idempotency response missing body');
  return result as { status: number; body: Examination };
}

export async function updateExamination(
  db: Database,
  scope: ExaminationScope,
  key: string,
  id: string,
  expectedRevision: number,
  input: ExaminationInput,
): Promise<{ status: number; body: Examination }> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1 || expectedRevision >= 2_147_483_647)
    throw new ExaminationRevisionConflictError();
  let record: ExaminationRecord;
  try {
    const validated = validateExaminationInput(input);
    record = { ...validated, seriesKey: getExaminationRecordSeriesKey(validated) };
  }
  catch { throw new ExaminationValidationError(); }
  const result = await idempotentMutation(db, scope, {
    key, action: 'update', request: { id, expectedRevision, record },
  }, async (tx) => {
    const existing = await findActiveExamination(tx, scope.userId, id);
    if (!existing) throw new ExaminationNotFoundError();
    const row = await replaceExamination(tx, scope.userId, id, expectedRevision, record);
    if (!row) throw new ExaminationRevisionConflictError();
    return { status: 200, body: examinationFromRow(row), resourceId: row.id };
  });
  if (!result.body) throw new Error('Update idempotency response missing body');
  return result as { status: number; body: Examination };
}

export async function deleteExamination(
  db: Database,
  scope: ExaminationScope,
  key: string,
  id: string,
): Promise<{ status: 204; body: null }> {
  const result = await idempotentMutation(db, scope, { key, action: 'delete', request: { id } }, async (tx) => {
    if (!(await findActiveExamination(tx, scope.userId, id))) throw new ExaminationNotFoundError();
    const deleted = await softDeleteExamination(tx, scope.userId, id);
    if (!deleted) throw new ExaminationNotFoundError();
    return { status: 204, body: null, resourceId: id };
  });
  return result as { status: 204; body: null };
}

export async function listExaminations(
  db: Database,
  input: { userId: string; cursorSecret: string; limit: number; type?: string; seriesKey?: string; cursor?: string },
): Promise<ExaminationPage> {
  let after: ExaminationCursorSort | undefined;
  if (input.cursor) {
    try {
      after = decodeExaminationCursor(input.cursor, input.cursorSecret, {
        userId: input.userId,
        filters: { type: input.type ?? null, seriesKey: input.seriesKey ?? null },
        limit: input.limit,
      });
    } catch { throw new ExaminationCursorError(); }
  }
  const rows = await listExaminationRows(db, { ...input, after });
  const hasMore = rows.length > input.limit;
  const selected = rows.slice(0, input.limit);
  const items = selected.map(examinationFromRow);
  const last = selected.at(-1);
  const nextCursor = hasMore && last ? encodeExaminationCursor({
      measuredOn: last.measuredOn,
      measuredTime: last.measuredTime,
      createdAt: last.createdAt.toISOString(),
      id: last.id,
    }, input.cursorSecret, {
      userId: input.userId,
      filters: { type: input.type ?? null, seriesKey: input.seriesKey ?? null },
      limit: input.limit,
    }) : null;
  return { items, nextCursor };
}

function labelFor(record: ExaminationInput): string {
  if (record.type === 'pressure') return 'Blood pressure';
  if (record.type === 'glucose') return `Glucose · ${record.context.replace('_', ' ')}`;
  return `Cholesterol · ${record.subtype.toUpperCase()}`;
}

export async function getExaminationSeries(db: Database, userId: string): Promise<ExamSeries[]> {
  const rows = await listAllActiveExaminations(db, userId);
  const groups = new Map<string, Examination[]>();
  for (const row of rows) {
    const record = recordFromRow(row);
    const key = getExaminationRecordSeriesKey(record);
    const items = groups.get(key) ?? [];
    items.push(examinationFromRow(row));
    groups.set(key, items);
  }
  return [...groups.entries()].map(([key, items]) => ({
    key,
    label: labelFor(items[0]!.record),
    unit: items[0]!.record.unit,
    items,
    latestExaminationId: items[0]!.id,
  }));
}
