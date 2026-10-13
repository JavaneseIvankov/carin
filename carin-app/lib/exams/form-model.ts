import type { components } from '@/lib/api/generated/app-api';
import { parseMeasurement } from './model';

export type ExaminationInput = components['schemas']['ExaminationInput'];
export type ExaminationFormValues = {
  type: ExaminationInput['type'];
  value: string;
  systolic: string;
  diastolic: string;
  context: Extract<ExaminationInput, { type: 'glucose' }>['context'];
  subtype: Extract<ExaminationInput, { type: 'cholesterol' }>['subtype'];
  measuredOn: string;
  measuredTime: string | null;
  note: string;
};
export type ExaminationFormField = keyof ExaminationFormValues | 'timezone';
export type ExaminationFormBuildResult = {
  record?: ExaminationInput;
  errors: Partial<Record<ExaminationFormField, string>>;
};

function isCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
  );
}

function parseField(
  value: string,
  field: 'value' | 'systolic' | 'diastolic',
  integer: boolean,
  errors: ExaminationFormBuildResult['errors']
) {
  const result = parseMeasurement(value, { integer });
  if (!result.ok) {
    errors[field] =
      result.error === 'required'
        ? 'Nilai wajib diisi.'
        : result.error === 'not-integer'
          ? 'Gunakan bilangan bulat.'
          : 'Masukkan angka lebih besar dari nol dengan koma atau titik desimal.';
    return undefined;
  }
  return result.value;
}

export function buildExaminationInput(
  values: ExaminationFormValues,
  timezone: string
): ExaminationFormBuildResult {
  const errors: ExaminationFormBuildResult['errors'] = {};
  if (!isCalendarDate(values.measuredOn))
    errors.measuredOn = 'Pilih tanggal pengukuran yang valid.';
  if (values.measuredTime !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(values.measuredTime)) {
    errors.measuredTime = 'Pilih waktu yang valid.';
  }
  if (!timezone.trim()) errors.timezone = 'Zona waktu akun belum tersedia. Coba lagi.';

  let record: ExaminationInput | undefined;
  if (values.type === 'pressure') {
    const systolic = parseField(values.systolic, 'systolic', true, errors);
    const diastolic = parseField(values.diastolic, 'diastolic', true, errors);
    if (systolic !== undefined && diastolic !== undefined) {
      record = {
        type: 'pressure',
        unit: 'mmHg',
        systolic,
        diastolic,
        measuredOn: values.measuredOn,
        measuredTime: values.measuredTime,
        timezone,
        note: values.note.trim() || null,
      };
    }
  } else {
    const value = parseField(values.value, 'value', false, errors);
    if (value !== undefined) {
      if (values.type === 'glucose') {
        record = {
          type: 'glucose',
          unit: 'mg/dL',
          value,
          context: values.context,
          measuredOn: values.measuredOn,
          measuredTime: values.measuredTime,
          timezone,
          note: values.note.trim() || null,
        };
      } else {
        record = {
          type: 'cholesterol',
          unit: 'mg/dL',
          value,
          subtype: values.subtype,
          measuredOn: values.measuredOn,
          measuredTime: values.measuredTime,
          timezone,
          note: values.note.trim() || null,
        };
      }
    }
  }

  if (Object.keys(errors).length) return { errors };
  return { record, errors };
}
