import { describe, expect, it } from 'vitest';
import {
  canonicalJson,
  compareExaminationsNewestFirst,
  decodeExaminationCursor,
  encodeExaminationCursor,
  getExaminationRecordSeriesKey,
  hashCanonicalJson,
  validateExaminationInput,
  type ExaminationCursorBinding,
  type ExaminationCursorPosition,
} from './validation.js';

const now = new Date('2026-10-14T16:00:00.000Z'); // 23:00 in Asia/Jakarta

const pressure = (overrides: Record<string, unknown> = {}) => ({
  measuredOn: '2026-10-14',
  measuredTime: null,
  timezone: 'Asia/Jakarta',
  note: null,
  type: 'pressure',
  unit: 'mmHg',
  systolic: 120,
  diastolic: 80,
  ...overrides,
});

const glucose = (overrides: Record<string, unknown> = {}) => ({
  measuredOn: '2026-10-14',
  measuredTime: '09:05',
  timezone: 'Asia/Jakarta',
  note: null,
  type: 'glucose',
  unit: 'mg/dL',
  context: 'fasting',
  value: 92.25,
  ...overrides,
});

const cholesterol = (overrides: Record<string, unknown> = {}) => ({
  measuredOn: '2026-10-14',
  measuredTime: '09:05',
  timezone: 'Asia/Jakarta',
  note: null,
  type: 'cholesterol',
  unit: 'mg/dL',
  subtype: 'total',
  value: 180,
  ...overrides,
});

describe('examination input validation', () => {
  it('accepts each contract discriminator without changing date precision or values', () => {
    expect(validateExaminationInput(pressure(), now)).toEqual(pressure());
    expect(validateExaminationInput(glucose(), now)).toEqual(glucose());
    expect(validateExaminationInput(cholesterol(), now)).toEqual(cholesterol());
  });

  it('rejects non-positive or non-finite scalar measurements', () => {
    for (const value of [0, -0.01, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => validateExaminationInput(glucose({ value }), now)).toThrow();
      expect(() => validateExaminationInput(cholesterol({ value }), now)).toThrow();
    }
  });

  it('requires positive integer systolic and diastolic values', () => {
    for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => validateExaminationInput(pressure({ systolic: value }), now)).toThrow();
      expect(() => validateExaminationInput(pressure({ diastolic: value }), now)).toThrow();
    }
    expect(validateExaminationInput(pressure({ systolic: 120, diastolic: 81 }), now)).toMatchObject({
      systolic: 120,
      diastolic: 81,
    });
    expect(() => validateExaminationInput(pressure({ systolic: Number.MAX_SAFE_INTEGER }), now)).not.toThrow();
  });

  it('rejects impossible calendar dates and malformed nullable measurement times', () => {
    for (const measuredOn of ['2026-02-29', '2026-04-31', '0000-01-01', '2026-2-03']) {
      expect(() => validateExaminationInput(glucose({ measuredOn }), now)).toThrow();
    }
    for (const measuredTime of ['24:00', '12:60', '9:05', '12:5', '12:00:00']) {
      expect(() => validateExaminationInput(glucose({ measuredTime }), now)).toThrow();
    }
    expect(validateExaminationInput(glucose({ measuredTime: null }), now).measuredTime).toBeNull();
  });

  it('requires a valid reported IANA timezone', () => {
    for (const timezone of ['', ' Asia/Jakarta', 'Mars/Olympus', '+07:00']) {
      expect(() => validateExaminationInput(glucose({ timezone }), now)).toThrow();
    }
    expect(validateExaminationInput(glucose({ timezone: 'Asia/Jakarta' }), now).timezone).toBe('Asia/Jakarta');
  });

  it('rejects future date-only days and future local times without inventing midnight', () => {
    expect(() => validateExaminationInput(pressure({ measuredOn: '2026-10-15' }), now)).toThrow();
    expect(() => validateExaminationInput(glucose({ measuredTime: '23:01' }), now)).toThrow();
    expect(validateExaminationInput(pressure({ measuredTime: null }), now).measuredTime).toBeNull();
    expect(validateExaminationInput(glucose({ measuredTime: '23:00' }), now).measuredTime).toBe('23:00');
    expect(validateExaminationInput(glucose({ measuredOn: '2026-10-13', measuredTime: '23:59' }), now)).toBeDefined();
  });

  it('evaluates the reported local date near a timezone boundary', () => {
    const utcNow = new Date('2026-10-14T03:30:00.000Z'); // 23:30 on October 13 in New York
    expect(() => validateExaminationInput(glucose({
      measuredOn: '2026-10-14',
      measuredTime: '00:00',
      timezone: 'America/New_York',
    }), utcNow)).toThrow();
    expect(validateExaminationInput(glucose({
      measuredOn: '2026-10-13',
      measuredTime: null,
      timezone: 'America/New_York',
    }), utcNow).measuredOn).toBe('2026-10-13');
  });

  it('rejects mismatched discriminators and unknown fields', () => {
    expect(() => validateExaminationInput(glucose({ type: 'cholesterol' }), now)).toThrow();
    expect(() => validateExaminationInput(pressure({ value: 12 }), now)).toThrow();
    expect(() => validateExaminationInput(cholesterol({ subtype: 'fasting' }), now)).toThrow();
  });
});

describe('examination series and sort helpers', () => {
  it('groups pressure together and separates glucose context and cholesterol subtype', () => {
    const systolic = validateExaminationInput(pressure(), now);
    const diastolic = pressure({ systolic: 110, diastolic: 70 });
    expect(getExaminationRecordSeriesKey(systolic)).toBe(
      getExaminationRecordSeriesKey(validateExaminationInput(diastolic, now)),
    );
    expect(getExaminationRecordSeriesKey(validateExaminationInput(glucose(), now))).not.toBe(
      getExaminationRecordSeriesKey(validateExaminationInput(glucose({ context: 'random' }), now)),
    );
    expect(getExaminationRecordSeriesKey(validateExaminationInput(cholesterol(), now))).not.toBe(
      getExaminationRecordSeriesKey(validateExaminationInput(cholesterol({ subtype: 'hdl' }), now)),
    );
  });

  it('orders by measurement date, time with nulls last, creation time, then ID descending', () => {
    const rows = [
      { measuredOn: '2026-10-14', measuredTime: null, createdAt: '2026-10-14T15:00:00.000Z', id: 'c' },
      { measuredOn: '2026-10-14', measuredTime: '08:30', createdAt: '2026-10-14T12:00:00.000Z', id: 'a' },
      { measuredOn: '2026-10-14', measuredTime: '09:00', createdAt: '2026-10-14T10:00:00.000Z', id: 'a' },
      { measuredOn: '2026-10-14', measuredTime: null, createdAt: '2026-10-14T15:00:00.000Z', id: 'd' },
      { measuredOn: '2026-10-13', measuredTime: '23:59', createdAt: '2026-10-14T15:00:00.000Z', id: 'z' },
    ];
    expect([...rows].sort(compareExaminationsNewestFirst).map(({ id, measuredTime }) => [id, measuredTime])).toEqual([
      ['a', '09:00'],
      ['a', '08:30'],
      ['d', null],
      ['c', null],
      ['z', '23:59'],
    ]);
  });
});

describe('canonical request encoding', () => {
  it('sorts object keys recursively, preserves array order, and hashes canonical bytes', () => {
    const left = { z: 1, nested: { b: true, a: 'x' }, list: [2, 1] };
    const right = { list: [2, 1], nested: { a: 'x', b: true }, z: 1 };
    expect(canonicalJson(left)).toBe('{"list":[2,1],"nested":{"a":"x","b":true},"z":1}');
    expect(canonicalJson(left)).toBe(canonicalJson(right));
    expect(hashCanonicalJson(left)).toBe(hashCanonicalJson(right));
    expect(hashCanonicalJson({ ...right, list: [1, 2] })).not.toBe(hashCanonicalJson(right));
  });

  it('rejects non-JSON numbers, cycles, and unsupported object values', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalJson(Number.NaN)).toThrow();
    expect(() => canonicalJson({ value: Number.POSITIVE_INFINITY })).toThrow();
    expect(() => canonicalJson(cyclic)).toThrow();
    expect(() => canonicalJson({ value: undefined })).toThrow();
  });
});

describe('signed examination cursors', () => {
  const secret = 'local-development-secret-with-at-least-32-chars';
  const binding: ExaminationCursorBinding = {
    userId: 'user-123',
    filters: { type: 'glucose', seriesKey: null },
    limit: 30,
  };
  const position: ExaminationCursorPosition = {
    measuredOn: '2026-10-14',
    measuredTime: '09:05',
    createdAt: '2026-10-14T02:05:00.000Z',
    id: '00000000-0000-4000-8000-000000000001',
  };

  it('round-trips the cursor and binds it to the owner, filter tuple, and page size', () => {
    const token = encodeExaminationCursor(position, secret, binding);
    expect(token.length).toBeLessThanOrEqual(500);
    expect(decodeExaminationCursor(token, secret, binding)).toEqual(position);
    expect(() => decodeExaminationCursor(token, secret, { ...binding, userId: 'other-user' })).toThrow();
    expect(() => decodeExaminationCursor(token, secret, {
      ...binding,
      filters: { type: 'pressure', seriesKey: null },
    })).toThrow();
    expect(() => decodeExaminationCursor(token, secret, { ...binding, limit: 31 })).toThrow();
    expect(() => decodeExaminationCursor(token, secret, {
      ...binding,
      filters: { type: 'glucose', seriesKey: 'glucose-fasting-mgdl' },
    })).toThrow();
    const longBinding: ExaminationCursorBinding = {
      ...binding,
      filters: { type: null, seriesKey: 's'.repeat(500) },
    };
    const longFilterToken = encodeExaminationCursor(position, secret, longBinding);
    expect(longFilterToken.length).toBeLessThanOrEqual(500);
    expect(decodeExaminationCursor(longFilterToken, secret, longBinding)).toEqual(position);
  });

  it('rejects tampered, malformed, expired-shape, and wrong-secret cursors', () => {
    const token = encodeExaminationCursor(position, secret, binding);
    const [payload, signature] = token.split('.');
    expect(() => decodeExaminationCursor(`${payload}x.${signature}`, secret, binding)).toThrow();
    expect(() => decodeExaminationCursor(token, 'another-secret-with-at-least-32-characters', binding)).toThrow();
    expect(() => decodeExaminationCursor('not.a.cursor', secret, binding)).toThrow();
    expect(() => decodeExaminationCursor('x'.repeat(501), secret, binding)).toThrow();
  });
});
