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
  dateIndex: number;
  title: string;
  measurements: ProjectedMeasurement[];
};

export type ProjectedSeries = {
  key: string;
  label: string;
  unit: ExamSeries['unit'];
  summary: string;
  dateCount: number;
  points: ProjectedSeriesPoint[];
  lineSegments: ProjectedSeriesPoint[][];
};

type SeriesKey =
  | ['pressure', null, 'mmHg']
  | ['glucose', 'fasting' | 'random' | 'post_meal' | 'unknown', 'mg/dL']
  | ['cholesterol', 'total' | 'ldl' | 'hdl', 'mg/dL'];

function parseSeriesKey(key: string): SeriesKey | null {
  try {
    const value: unknown = JSON.parse(key);
    if (!Array.isArray(value) || value.length !== 3) return null;
    const [type, context, unit] = value;
    if (type === 'pressure' && context === null && unit === 'mmHg') {
      return ['pressure', null, 'mmHg'];
    }
    if (
      type === 'glucose' &&
      ['fasting', 'random', 'post_meal', 'unknown'].includes(context) &&
      unit === 'mg/dL'
    ) {
      return ['glucose', context as 'fasting' | 'random' | 'post_meal' | 'unknown', 'mg/dL'];
    }
    if (type === 'cholesterol' && ['total', 'ldl', 'hdl'].includes(context) && unit === 'mg/dL') {
      return ['cholesterol', context as 'total' | 'ldl' | 'hdl', 'mg/dL'];
    }
    return null;
  } catch {
    return null;
  }
}

export function localizedSeriesLabel(series: Pick<ExamSeries, 'key' | 'label' | 'items'>): string {
  const key = parseSeriesKey(series.key);
  if (key) {
    const [type, context] = key;
    if (type === 'pressure') return 'Tekanan darah';
    if (type === 'glucose') {
      return `Gula darah · ${
        {
          fasting: 'Puasa',
          random: 'Sewaktu',
          post_meal: 'Setelah makan',
          unknown: 'Konteks tidak diketahui',
        }[context]
      }`;
    }
    return `Kolesterol · ${{ total: 'Total', ldl: 'LDL', hdl: 'HDL' }[context]}`;
  }
  const first = series.items[0];
  return first ? recordTitle(first.record) : 'Seri pemeriksaan';
}

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

export function formatProjectedMeasurements(
  measurements: readonly ProjectedMeasurement[],
  unit: ExamSeries['unit']
): string {
  return `${measurements
    .map(({ label, value }) => `${label} ${formatMeasurement(value)}`)
    .join(' · ')} ${unit}`;
}

function formatSeriesMeasuredAt(
  record: Pick<ExaminationInput, 'measuredOn' | 'measuredTime'>,
  locale: string
) {
  const measuredAt = formatMeasuredAt(record, locale);
  return record.measuredTime ? measuredAt : `${measuredAt} · waktu tidak dicatat`;
}

function splitLineSegments(points: readonly ProjectedSeriesPoint[]): ProjectedSeriesPoint[][] {
  const segments: ProjectedSeriesPoint[][] = [];
  let currentSegment: ProjectedSeriesPoint[] = [];

  for (const point of points) {
    const previousPoint = currentSegment.at(-1);
    if (!previousPoint) {
      currentSegment = [point];
      continue;
    }

    const ordered =
      previousPoint.measuredOn !== point.measuredOn ||
      (previousPoint.measuredTime !== null &&
        point.measuredTime !== null &&
        previousPoint.measuredTime < point.measuredTime);

    if (ordered) {
      currentSegment.push(point);
    } else {
      if (currentSegment.length > 1) segments.push(currentSegment);
      currentSegment = [point];
    }
  }

  if (currentSegment.length > 1) segments.push(currentSegment);
  return segments;
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
    const sortedItems = [...items].sort((left, right) => {
      const dateOrder = left.record.measuredOn.localeCompare(right.record.measuredOn);
      if (dateOrder !== 0) return dateOrder;
      if (left.record.measuredTime === null) return right.record.measuredTime === null ? 0 : 1;
      if (right.record.measuredTime === null) return -1;
      return left.record.measuredTime.localeCompare(right.record.measuredTime);
    });
    let dateIndex = -1;
    let previousDate: string | null = null;
    const points = sortedItems.map(({ id, record }) => {
      if (record.measuredOn !== previousDate) {
        dateIndex += 1;
        previousDate = record.measuredOn;
      }
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
        measuredAt: formatSeriesMeasuredAt(record, locale),
        dateIndex,
        title: recordTitle(record),
        measurements,
      };
    });

    return {
      key,
      label: localizedSeriesLabel({ key, label, items }),
      unit,
      summary: `${points.length} pengukuran`,
      dateCount: dateIndex + 1,
      points,
      lineSegments: splitLineSegments(points),
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
