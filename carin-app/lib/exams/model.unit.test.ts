import { describe, expect, it } from 'vitest';
import type { components } from '../api/generated/app-api';
import {
  formatMeasuredAt,
  formatMeasurement,
  seriesAccessibleSummary,
  parseMeasurement,
  projectSeries,
  recordTitle,
} from './model';

type Examination = components['schemas']['Examination'];
type ExaminationInput = components['schemas']['ExaminationInput'];
type ExamSeries = components['schemas']['ExamSeries'];

function examination(id: string, record: ExaminationInput, createdAt: string): Examination {
  return { id, record, revision: 1, createdAt, updatedAt: createdAt };
}

function glucoseRecord(
  measuredOn: string,
  measuredTime: string | null,
  context: Extract<ExaminationInput, { type: 'glucose' }>['context'] = 'fasting',
  value = 100
): ExaminationInput {
  return {
    type: 'glucose',
    value,
    unit: 'mg/dL',
    context,
    measuredOn,
    measuredTime,
    timezone: 'Asia/Jakarta',
    note: null,
  };
}

describe('parseMeasurement', () => {
  it('accepts dot and comma decimals without rounding valid precision', () => {
    expect(parseMeasurement(' 1.23456789 ')).toEqual({ ok: true, value: 1.23456789 });
    expect(parseMeasurement('1,23456789')).toEqual({ ok: true, value: 1.23456789 });
  });

  it.each(['', '   ', '0', '-1', 'Infinity', '1e309', '1,2.3', '1.2,3'])(
    'rejects empty, non-positive, non-finite, or ambiguous values: %s',
    (input) => {
      expect(parseMeasurement(input).ok).toBe(false);
    }
  );

  it('requires integer values when parsing pressure measurements', () => {
    expect(parseMeasurement('120', { integer: true })).toEqual({ ok: true, value: 120 });
    expect(parseMeasurement('120.5', { integer: true })).toEqual({
      ok: false,
      error: 'not-integer',
    });
  });
});

describe('measurement formatting', () => {
  it('preserves the supplied numeric precision without rounding', () => {
    expect(formatMeasurement(123.456789)).toBe('123,456789');
    expect(formatMeasurement(123.456789, 'en-US')).toBe('123.456789');
  });

  it('formats the measured date and only includes a time when one was recorded', () => {
    const dateOnly = glucoseRecord('2026-10-14', null);
    const withTime = glucoseRecord('2026-10-14', '09:35');

    expect(formatMeasuredAt(dateOnly, 'en-GB')).toBe('14 Oct 2026');
    expect(formatMeasuredAt(withTime, 'en-GB')).toBe('14 Oct 2026 · 09:35');
  });
});

describe('recordTitle', () => {
  it('labels examination type and glucose context', () => {
    expect(
      recordTitle({
        type: 'pressure',
        systolic: 120,
        diastolic: 80,
        unit: 'mmHg',
        measuredOn: '2026-10-14',
        measuredTime: null,
        timezone: 'Asia/Jakarta',
        note: null,
      })
    ).toBe('Tekanan darah');
    expect(recordTitle(glucoseRecord('2026-10-14', null, 'fasting'))).toBe('Gula darah · Puasa');
    expect(recordTitle(glucoseRecord('2026-10-14', null, 'random'))).toBe('Gula darah · Sewaktu');
    expect(recordTitle(glucoseRecord('2026-10-14', null, 'post_meal'))).toBe(
      'Gula darah · Setelah makan'
    );
    expect(recordTitle(glucoseRecord('2026-10-14', null, 'unknown'))).toBe(
      'Gula darah · Konteks tidak diketahui'
    );
  });

  it('labels cholesterol subtype', () => {
    const common = {
      measuredOn: '2026-10-14',
      measuredTime: null,
      timezone: 'Asia/Jakarta',
      note: null,
      unit: 'mg/dL' as const,
      type: 'cholesterol' as const,
    };

    expect(recordTitle({ ...common, subtype: 'total', value: 180 })).toBe('Kolesterol total');
    expect(recordTitle({ ...common, subtype: 'ldl', value: 100 })).toBe('Kolesterol LDL');
    expect(recordTitle({ ...common, subtype: 'hdl', value: 60 })).toBe('Kolesterol HDL');
  });
});

describe('projectSeries', () => {
  it('orders chart points by measured date and time, never by creation time', () => {
    const series: ExamSeries = {
      key: 'glucose:fasting:mg/dL',
      label: 'Gula darah · Puasa',
      unit: 'mg/dL',
      latestExaminationId: 'late',
      items: [
        examination('late', glucoseRecord('2026-10-14', '10:00'), '2020-01-01T00:00:00Z'),
        examination('early-time', glucoseRecord('2026-10-14', '09:00'), '2030-01-01T00:00:00Z'),
        examination('previous-day', glucoseRecord('2026-10-13', null), '2031-01-01T00:00:00Z'),
      ],
    };

    expect(projectSeries([series])[0]?.points.map(({ id }) => id)).toEqual([
      'previous-day',
      'early-time',
      'late',
    ]);
  });

  it('summarizes one point as a record count without implying a trend', () => {
    const series: ExamSeries = {
      key: 'glucose:fasting:mg/dL',
      label: 'Gula darah · Puasa',
      unit: 'mg/dL',
      latestExaminationId: 'only',
      items: [examination('only', glucoseRecord('2026-10-14', null), '2026-10-14T00:00:00Z')],
    };
    const projected = projectSeries([series])[0];

    expect(projected?.points).toHaveLength(1);
    expect(projected?.summary).toBe('1 pengukuran');
    expect(projected?.summary).not.toMatch(/naik|turun|membaik|memburuk/i);
  });

  it('keeps API-provided series separate', () => {
    const fasting: ExamSeries = {
      key: 'glucose:fasting:mg/dL',
      label: 'Gula darah · Puasa',
      unit: 'mg/dL',
      latestExaminationId: 'fasting',
      items: [
        examination(
          'fasting',
          glucoseRecord('2026-10-14', null, 'fasting'),
          '2026-10-14T00:00:00Z'
        ),
      ],
    };
    const random: ExamSeries = {
      key: 'glucose:random:mg/dL',
      label: 'Gula darah · Sewaktu',
      unit: 'mg/dL',
      latestExaminationId: 'random',
      items: [
        examination('random', glucoseRecord('2026-10-14', null, 'random'), '2026-10-14T00:00:00Z'),
      ],
    };

    expect(projectSeries([fasting, random]).map(({ key, points }) => [key, points.length])).toEqual(
      [
        ['glucose:fasting:mg/dL', 1],
        ['glucose:random:mg/dL', 1],
      ]
    );
  });
});

describe('seriesAccessibleSummary', () => {
  it('reads a chart summary with series name, measurement dates, values, and units', () => {
    const series: ExamSeries = {
      key: 'glucose:unknown:mg/dL',
      label: 'Gula darah · Konteks tidak diketahui',
      unit: 'mg/dL',
      latestExaminationId: 'one',
      items: [
        examination(
          'one',
          glucoseRecord('2026-10-14', null, 'unknown', 104),
          '2026-10-14T00:00:00Z'
        ),
      ],
    };

    expect(seriesAccessibleSummary(projectSeries([series])[0]!)).toBe(
      'Gula darah · Konteks tidak diketahui. 1 pengukuran. 14 Okt 2026: Gula darah · Konteks tidak diketahui 104 mg/dL.'
    );
  });
});
