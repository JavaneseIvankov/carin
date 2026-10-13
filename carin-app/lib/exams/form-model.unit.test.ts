import { describe, expect, it } from 'vitest';
import { buildExaminationInput } from './form-model';

const validBase = {
  type: 'glucose' as const,
  value: '5,25',
  systolic: '',
  diastolic: '',
  context: 'unknown' as const,
  subtype: 'total' as const,
  measuredOn: '2026-10-10',
  measuredTime: null,
  note: '',
};

describe('buildExaminationInput', () => {
  it('normalizes decimal comma and keeps unknown context and absent time explicit', () => {
    expect(buildExaminationInput(validBase, 'Asia/Jakarta')).toEqual({
      record: {
        type: 'glucose',
        value: 5.25,
        unit: 'mg/dL',
        context: 'unknown',
        measuredOn: '2026-10-10',
        measuredTime: null,
        timezone: 'Asia/Jakarta',
        note: null,
      },
      errors: {},
    });
  });

  it('requires a real calendar date and valid optional time', () => {
    expect(
      buildExaminationInput({ ...validBase, measuredOn: '2026-02-30' }, 'Asia/Jakarta').errors
    ).toHaveProperty('measuredOn');
    expect(
      buildExaminationInput({ ...validBase, measuredTime: '9:05' }, 'Asia/Jakarta').errors
    ).toHaveProperty('measuredTime');
  });

  it('requires positive integer pressure values and uses the pressure unit', () => {
    const invalid = buildExaminationInput(
      {
        ...validBase,
        type: 'pressure',
        value: '',
        systolic: '120,5',
        diastolic: '80',
      },
      'Asia/Jakarta'
    );
    expect(invalid.errors).toHaveProperty('systolic');
    const valid = buildExaminationInput(
      {
        ...validBase,
        type: 'pressure',
        value: '',
        systolic: '120',
        diastolic: '80',
      },
      'Asia/Jakarta'
    );
    expect(valid.record).toMatchObject({
      type: 'pressure',
      unit: 'mmHg',
      systolic: 120,
      diastolic: 80,
    });
  });

  it('rejects ambiguous decimals and empty required measurements', () => {
    for (const value of ['', '1,2.3', '0', '-1', 'Infinity']) {
      expect(buildExaminationInput({ ...validBase, value }, 'Asia/Jakarta').errors).toHaveProperty(
        'value'
      );
    }
  });

  it('requires account timezone and never substitutes a device/default zone', () => {
    const result = buildExaminationInput(validBase, '');
    expect(result.record).toBeUndefined();
    expect(result.errors).toHaveProperty('timezone');
  });
});
