import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { getExaminationSeriesKey as domainSeriesKey } from '../../domain/examinations.js';
import type { ExaminationInput } from './types.js';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const CREATED_AT_PATTERN = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?Z$/;
const CURSOR_DOMAIN = 'carin-api:examination-cursor:v1';
const CURSOR_MAX_LENGTH = 500;

export class ExaminationValidationError extends Error {
  constructor() {
    super('Examination input is invalid');
    this.name = 'ExaminationValidationError';
  }
}

export class ExaminationCursorError extends Error {
  constructor() {
    super('Examination cursor is invalid');
    this.name = 'ExaminationCursorError';
  }
}

export type ExaminationRecordSort = {
  measuredOn: string;
  measuredTime: string | null;
  createdAt: Date | string;
  id: string;
};

export type ExaminationCursorPosition = {
  measuredOn: string;
  measuredTime: string | null;
  createdAt: string;
  id: string;
};

export type ExaminationCursorPayload = {
  userId: string;
  filters: { type: string | null; seriesKey: string | null };
  limit: number;
  after: ExaminationCursorPosition;
};

export type ExaminationCursorBinding = Omit<ExaminationCursorPayload, 'after'>;

function recordOf(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isCalendarDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= monthDays[month - 1]!;
}

function isMeasurementTime(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && TIME_PATTERN.test(value));
}

function validTimezone(value: unknown): value is string {
  if (
    typeof value !== 'string' || value.length < 1 || value.length > 500 ||
    value.trim() !== value || /^[+-]\d{2}(?::?\d{2})?$/.test(value)
  ) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function localDateAndMinute(now: Date, timezone: string): { date: string; minute: string } {
  if (!Number.isFinite(now.getTime())) throw new ExaminationValidationError();
  try {
    const parts = new Intl.DateTimeFormat('en-US-u-ca-iso8601', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((item) => item.type === type)?.value;
    const year = part('year');
    const month = part('month');
    const day = part('day');
    const hour = part('hour');
    const minute = part('minute');
    if (!year || !month || !day || !hour || !minute) throw new ExaminationValidationError();
    return { date: `${year.padStart(4, '0')}-${month}-${day}`, minute: `${hour}:${minute}` };
  } catch {
    throw new ExaminationValidationError();
  }
}

function requireCommonFields(record: Record<string, unknown>): void {
  if (
    typeof record.measuredOn !== 'string' || !isCalendarDate(record.measuredOn) ||
    !isMeasurementTime(record.measuredTime) || !validTimezone(record.timezone) ||
    !(record.note === null || typeof record.note === 'string' && Array.from(record.note).length <= 2000)
  ) {
    throw new ExaminationValidationError();
  }
}

/** Validate wire shape and domain rules while preserving date-only precision. */
export function validateExaminationInput(input: unknown, now: Date = new Date()): ExaminationInput {
  if (!recordOf(input)) throw new ExaminationValidationError();
  requireCommonFields(input);

  let allowedKeys: readonly string[];
  if (input.type === 'pressure') {
    allowedKeys = [
      'measuredOn', 'measuredTime', 'timezone', 'note', 'type', 'unit', 'systolic', 'diastolic',
    ];
    if (
      input.unit !== 'mmHg' || typeof input.systolic !== 'number' ||
      !Number.isFinite(input.systolic) || !Number.isSafeInteger(input.systolic) || input.systolic <= 0 ||
      typeof input.diastolic !== 'number' || !Number.isFinite(input.diastolic) ||
      !Number.isSafeInteger(input.diastolic) || input.diastolic <= 0
    ) {
      throw new ExaminationValidationError();
    }
  } else if (input.type === 'glucose') {
    allowedKeys = [
      'measuredOn', 'measuredTime', 'timezone', 'note', 'type', 'unit', 'context', 'value',
    ];
    if (
      input.unit !== 'mg/dL' ||
      !['fasting', 'random', 'post_meal', 'unknown'].includes(String(input.context)) ||
      typeof input.value !== 'number' || !Number.isFinite(input.value) || input.value <= 0
    ) {
      throw new ExaminationValidationError();
    }
  } else if (input.type === 'cholesterol') {
    allowedKeys = [
      'measuredOn', 'measuredTime', 'timezone', 'note', 'type', 'unit', 'subtype', 'value',
    ];
    if (
      input.unit !== 'mg/dL' || !['total', 'ldl', 'hdl'].includes(String(input.subtype)) ||
      typeof input.value !== 'number' || !Number.isFinite(input.value) || input.value <= 0
    ) {
      throw new ExaminationValidationError();
    }
  } else {
    throw new ExaminationValidationError();
  }

  if (!hasOnlyKeys(input, allowedKeys)) throw new ExaminationValidationError();
  const localNow = localDateAndMinute(now, input.timezone as string);
  const measuredOn = input.measuredOn as string;
  if (
    measuredOn > localNow.date ||
    measuredOn === localNow.date && typeof input.measuredTime === 'string' &&
      input.measuredTime > localNow.minute
  ) {
    throw new ExaminationValidationError();
  }

  return input as ExaminationInput;
}

/** Pressure values share a series; glucose context and cholesterol subtype remain distinct. */
export function getExaminationRecordSeriesKey(record: ExaminationInput): string {
  if (record.type === 'pressure') {
    return domainSeriesKey({ type: record.type, unit: record.unit });
  }
  if (record.type === 'glucose') {
    return domainSeriesKey({ type: record.type, unit: record.unit, context: record.context });
  }
  return domainSeriesKey({ type: record.type, unit: record.unit, context: record.subtype });
}

function timestamp(value: Date | string): number {
  const millis = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(millis)) throw new RangeError('Examination creation time is invalid');
  return millis;
}

/** SQL-compatible newest-first tuple order; unknown-time rows sort after timed rows that day. */
export function compareExaminationsNewestFirst(
  left: ExaminationRecordSort,
  right: ExaminationRecordSort,
): number {
  if (left.measuredOn !== right.measuredOn) return left.measuredOn > right.measuredOn ? -1 : 1;
  if (left.measuredTime !== right.measuredTime) {
    if (left.measuredTime === null) return 1;
    if (right.measuredTime === null) return -1;
    return left.measuredTime > right.measuredTime ? -1 : 1;
  }
  const leftCreated = timestamp(left.createdAt);
  const rightCreated = timestamp(right.createdAt);
  if (leftCreated !== rightCreated) return leftCreated > rightCreated ? -1 : 1;
  if (left.id === right.id) return 0;
  return left.id > right.id ? -1 : 1;
}

function canonicalValue(value: unknown, active: WeakSet<object>): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON requires finite numbers');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') throw new TypeError('Canonical JSON requires JSON values');
  if (active.has(value)) throw new TypeError('Canonical JSON does not accept cycles');
  active.add(value);
  try {
    if (Array.isArray(value)) {
      const items: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) throw new TypeError('Canonical JSON does not accept sparse arrays');
        items.push(canonicalValue(value[index], active));
      }
      return `[${items.join(',')}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Canonical JSON requires plain objects');
    }
    if (Reflect.ownKeys(value).some((key) => typeof key === 'symbol')) {
      throw new TypeError('Canonical JSON does not accept symbol keys');
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Object.keys(descriptors).sort();
    const properties: string[] = [];
    for (const key of keys) {
      const descriptor = descriptors[key]!;
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        throw new TypeError('Canonical JSON requires enumerable data properties');
      }
      properties.push(`${JSON.stringify(key)}:${canonicalValue(descriptor.value, active)}`);
    }
    return `{${properties.join(',')}}`;
  } finally {
    active.delete(value);
  }
}

/** Stable JSON encoding for idempotency hashes; array order is significant. */
export function canonicalJson(value: unknown): string {
  return canonicalValue(value, new WeakSet<object>());
}

export function hashCanonicalJson(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function assertSecret(secret: string): void {
  if (typeof secret !== 'string' || secret.length < 32) throw new RangeError('Cursor secret is invalid');
}

function normalizedBinding(binding: ExaminationCursorBinding): ExaminationCursorBinding {
  if (
    !binding || typeof binding.userId !== 'string' || !binding.userId ||
    !recordOf(binding.filters) || !hasOnlyKeys(binding.filters, ['type', 'seriesKey']) ||
    !(binding.filters.type === null || ['pressure', 'glucose', 'cholesterol'].includes(binding.filters.type)) ||
    !(binding.filters.seriesKey === null || typeof binding.filters.seriesKey === 'string' && binding.filters.seriesKey.length > 0 && binding.filters.seriesKey.length <= 500) ||
    !Number.isInteger(binding.limit) || binding.limit < 1 || binding.limit > 100
  ) {
    throw new ExaminationCursorError();
  }
  return binding;
}

function normalizedPosition(position: ExaminationCursorPosition): ExaminationCursorPosition {
  const createdAt = typeof position?.createdAt === 'string' ? CREATED_AT_PATTERN.exec(position.createdAt) : null;
  if (
    !position || typeof position.measuredOn !== 'string' || !isCalendarDate(position.measuredOn) ||
    !isMeasurementTime(position.measuredTime) || !createdAt || !isCalendarDate(createdAt[1]!) ||
    !Number.isFinite(Date.parse(position.createdAt)) || typeof position.id !== 'string' ||
    !position.id || position.id.length > 200
  ) {
    throw new ExaminationCursorError();
  }
  return {
    measuredOn: position.measuredOn,
    measuredTime: position.measuredTime,
    // Preserve PostgreSQL's full microsecond sort key; Date.toISOString() would truncate it.
    createdAt: position.createdAt,
    id: position.id,
  };
}

function deriveCursorKey(secret: string): Buffer {
  assertSecret(secret);
  return createHmac('sha256', secret).update(CURSOR_DOMAIN, 'utf8').digest();
}

function cursorMac(encodedPayload: string, secret: string): string {
  return createHmac('sha256', deriveCursorKey(secret)).update(encodedPayload, 'utf8').digest('base64url');
}

function filterDigest(binding: ExaminationCursorBinding): string {
  return hashCanonicalJson(binding.filters);
}

/** Encode a compact integrity-protected cursor. Filters are hashed to keep long keys opaque and bounded. */
export function encodeExaminationCursor(
  position: ExaminationCursorPosition,
  secret: string,
  providedBinding: ExaminationCursorBinding,
): string {
  try {
    assertSecret(secret);
    const binding = normalizedBinding(providedBinding);
    const after = normalizedPosition(position);
    const signedPayload = {
      v: 1,
      o: binding.userId,
      f: filterDigest(binding),
      l: binding.limit,
      a: {
        d: after.measuredOn,
        t: after.measuredTime,
        c: after.createdAt,
        i: after.id,
      },
    };
    const encodedPayload = Buffer.from(canonicalJson(signedPayload), 'utf8').toString('base64url');
    const token = `${encodedPayload}.${cursorMac(encodedPayload, secret)}`;
    if (token.length > CURSOR_MAX_LENGTH) throw new ExaminationCursorError();
    return token;
  } catch {
    throw new ExaminationCursorError();
  }
}

function cursorObject(value: unknown): value is Record<string, unknown> {
  return recordOf(value);
}

/** Verify a cursor and reject reuse under another owner, filter tuple, or page size. */
export function decodeExaminationCursor(
  token: string,
  secret: string,
  expectedBinding: ExaminationCursorBinding,
): ExaminationCursorPosition {
  try {
    assertSecret(secret);
    const expected = normalizedBinding(expectedBinding);
    if (
      typeof token !== 'string' || token.length < 1 || token.length > CURSOR_MAX_LENGTH ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)
    ) {
      throw new ExaminationCursorError();
    }
    const [encodedPayload, providedSignature] = token.split('.');
    const expectedSignature = cursorMac(encodedPayload!, secret);
    const supplied = Buffer.from(providedSignature!, 'base64url');
    const actual = Buffer.from(expectedSignature, 'base64url');
    if (supplied.length !== actual.length || !timingSafeEqual(supplied, actual)) {
      throw new ExaminationCursorError();
    }
    const decoded: unknown = JSON.parse(Buffer.from(encodedPayload!, 'base64url').toString('utf8'));
    if (
      !cursorObject(decoded) || !hasOnlyKeys(decoded, ['v', 'o', 'f', 'l', 'a']) ||
      decoded.v !== 1 || decoded.o !== expected.userId || decoded.f !== filterDigest(expected) ||
      decoded.l !== expected.limit || !cursorObject(decoded.a) ||
      !hasOnlyKeys(decoded.a, ['d', 't', 'c', 'i'])
    ) {
      throw new ExaminationCursorError();
    }
    const position = normalizedPosition({
      measuredOn: decoded.a.d as string,
      measuredTime: decoded.a.t as string | null,
      createdAt: decoded.a.c as string,
      id: decoded.a.i as string,
    });
    return position;
  } catch {
    throw new ExaminationCursorError();
  }
}
