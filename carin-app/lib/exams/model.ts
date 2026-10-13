import type { components } from '../api/generated/app-api';

export type ExaminationInput = components['schemas']['ExaminationInput'];
export type ExamSeries = components['schemas']['ExamSeries'];

export type MeasurementParseResult =
  | { ok: true; value: number }
  | { ok: false; error: 'required' | 'invalid' | 'non-positive' | 'not-integer' };

export type ProjectedMeasurement = {
  key: 'value' | 'systolic' | 'diastolic';
  label: string;
  value: number;
};

export type ProjectedSeriesPoint = {
  id: string;
  measuredOn: string;
  measuredTime: string | null;
  measuredAt: string;
  title: string;
  measurements: ProjectedMeasurement[];
};

export type ProjectedSeries = {
  key: string;
  label: string;
  unit: ExamSeries['unit'];
  summary: string;
  points: ProjectedSeriesPoint[];
};

export function parseMeasurement(
  input: string,
  options: { integer?: boolean } = {}
): MeasurementParseResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: 'required' };
  if (trimmed.includes(',') && trimmed.includes('.')) return { ok: false, error: 'invalid' };

  const normalized = trimmed.replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
    return { ok: false, error: 'invalid' };
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return { ok: false, error: 'invalid' };
  if (value <= 0) return { ok: false, error: 'non-positive' };
  if (options.integer && !Number.isInteger(value)) return { ok: false, error: 'not-integer' };

  return { ok: true, value };
}

export function formatMeasurement(value: number, locale = 'id-ID'): string {
  const decimal = new Intl.NumberFormat(locale)
    .formatToParts(1.1)
    .find(({ type }) => type === 'decimal')?.value;
  const raw = String(value);
  return decimal ? raw.replace('.', decimal) : raw;
}

export function formatMeasuredAt(
  record: Pick<ExaminationInput, 'measuredOn' | 'measuredTime'>,
  locale = 'id-ID'
): string {
  const [year, month, day] = record.measuredOn.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dateLabel = Number.isNaN(date.getTime())
    ? record.measuredOn
    : new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(date);

  return record.measuredTime ? `${dateLabel} · ${record.measuredTime}` : dateLabel;
}

export function recordTitle(record: ExaminationInput): string {
  switch (record.type) {
    case 'pressure':
      return 'Tekanan darah';
    case 'glucose':
      return `Gula darah · ${
        {
          fasting: 'Puasa',
          random: 'Sewaktu',
          post_meal: 'Setelah makan',
          unknown: 'Konteks tidak diketahui',
        }[record.context]
      }`;
    case 'cholesterol':
      return `Kolesterol ${
        {
          total: 'total',
          ldl: 'LDL',
          hdl: 'HDL',
        }[record.subtype]
      }`;
  }
}

export function projectSeries(series: readonly ExamSeries[], locale = 'id-ID'): ProjectedSeries[] {
  return series.map(({ key, label, unit, items }) => {
    const points = [...items]
      .sort((left, right) => {
        const dateOrder = left.record.measuredOn.localeCompare(right.record.measuredOn);
        if (dateOrder !== 0) return dateOrder;
        return (left.record.measuredTime ?? '').localeCompare(right.record.measuredTime ?? '');
      })
      .map(({ id, record }) => {
        const measurements: ProjectedMeasurement[] =
          record.type === 'pressure'
            ? [
                { key: 'systolic', label: 'Sistolik', value: record.systolic },
                { key: 'diastolic', label: 'Diastolik', value: record.diastolic },
              ]
            : [{ key: 'value', label: recordTitle(record), value: record.value }];

        return {
          id,
          measuredOn: record.measuredOn,
          measuredTime: record.measuredTime,
          measuredAt: formatMeasuredAt(record, locale),
          title: recordTitle(record),
          measurements,
        };
      });

    return {
      key,
      label,
      unit,
      summary: `${points.length} pengukuran`,
      points,
    };
  });
}

export function seriesAccessibleSummary(series: ProjectedSeries): string {
  const entries = series.points.map((point) => {
    const values = point.measurements
      .map(({ label, value }) => `${label} ${formatMeasurement(value)} ${series.unit}`)
      .join(', ');
    return `${point.measuredAt}: ${values}`;
  });
  return `${[series.label, series.summary, ...entries].join('. ')}.`;
}
