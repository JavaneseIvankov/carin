export type ExaminationSeriesInput = {
  type: 'pressure' | 'glucose' | 'cholesterol';
  unit: string;
  context?: string | null;
};

export function getExaminationSeriesKey(input: ExaminationSeriesInput): string {
  if (!input.unit.trim()) throw new RangeError('Examination unit is required');
  // Pressure systolic and diastolic values are separate lines within one series.
  const context = input.type === 'pressure' ? null : input.context ?? null;
  return JSON.stringify([input.type, context, input.unit]);
}

export function getExaminationDatePrecision(measuredTime: string | null): 'date_only' | 'date_time' {
  if (measuredTime === null) return 'date_only';
  const match = /^(\d{2}):(\d{2})$/.exec(measuredTime);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    throw new RangeError('Measurement time must use HH:mm');
  }
  return 'date_time';
}
