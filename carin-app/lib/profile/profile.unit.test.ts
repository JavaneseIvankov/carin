import { describe, expect, it } from 'vitest';
import {
  createIdempotencyKey,
  createOtherDiagnosisEntry,
  createStableActionKey,
  getKnowledgeStateLabel,
  getMissingFieldTarget,
  parseOptionalPositiveNumber,
  transitionKnowledgeState,
} from './profile';

describe('health profile presentation rules', () => {
  it('keeps unknown and not-provided knowledge separate from known absence', () => {
    expect(getKnowledgeStateLabel('diagnoses', 'not_provided')).toBe('Belum diisi');
    expect(getKnowledgeStateLabel('diagnoses', 'none_known')).toBe(
      'Tidak ada diagnosis yang diketahui'
    );
    expect(getKnowledgeStateLabel('diagnoses', 'never_examined')).toBe('Belum pernah diperiksa');
    expect(getKnowledgeStateLabel('allergies', 'unknown')).toBe('Belum diketahui');
    expect(getKnowledgeStateLabel('familyHistory', 'unknown')).toBe('Belum tahu riwayat keluarga');
  });

  it('requires confirmation before a knowledge-state change clears entries', () => {
    const current = { state: 'reported' as const, entries: ['hipertensi'] };
    const pending = transitionKnowledgeState(current, 'unknown');

    expect(pending).toEqual({ kind: 'confirmation-required', value: current });
    expect(transitionKnowledgeState(current, 'unknown', true)).toEqual({
      kind: 'changed',
      value: { state: 'unknown', entries: [] },
    });
    expect(transitionKnowledgeState(current, 'reported')).toEqual({
      kind: 'unchanged',
      value: current,
    });
  });

  it('maps missing profile fields to a focused Indonesian form target', () => {
    expect(getMissingFieldTarget('heightCm')).toEqual({ label: 'Tinggi badan', focus: 'heightCm' });
    expect(getMissingFieldTarget('diagnoses.state')).toEqual({
      label: 'Status diagnosis',
      focus: 'diagnoses',
    });
    expect(getMissingFieldTarget('allergies.entries')).toEqual({
      label: 'Alergi dan pantangan',
      focus: 'allergies',
    });
  });

  it('reuses an idempotency key for a retry of the same action payload', () => {
    const keys = ['fef4d5f0-7b6b-4fa3-97b8-f4f5d30aa4d4', 'ad9bcabd-10c5-4b36-aed6-1271ce945e3f'];
    const nextKey = createStableActionKey(() => keys.shift() ?? 'unexpected');

    expect(nextKey.forPayload({ version: 3, fields: { heightCm: 160 } })).toBe(
      'fef4d5f0-7b6b-4fa3-97b8-f4f5d30aa4d4'
    );
    expect(nextKey.forPayload({ version: 3, fields: { heightCm: 160 } })).toBe(
      'fef4d5f0-7b6b-4fa3-97b8-f4f5d30aa4d4'
    );
    expect(nextKey.forPayload({ version: 3, fields: { heightCm: 161 } })).toBe(
      'ad9bcabd-10c5-4b36-aed6-1271ce945e3f'
    );
    expect(createIdempotencyKey()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('stores an explicit other diagnosis as free text without catalog matching', () => {
    expect(createOtherDiagnosisEntry(' PCOS ')).toMatchObject({
      conditionId: null,
      label: 'PCOS',
    });
    expect(createOtherDiagnosisEntry('  ')).toBeNull();
  });

  it('parses optional measurements without treating invalid values as empty', () => {
    expect(parseOptionalPositiveNumber('')).toEqual({ value: null });
    expect(parseOptionalPositiveNumber('52,4')).toEqual({ value: 52.4 });
    expect(parseOptionalPositiveNumber('0')).toEqual({
      error: 'Masukkan angka lebih besar dari 0.',
    });
    expect(parseOptionalPositiveNumber('tinggi')).toEqual({ error: 'Masukkan angka yang valid.' });
  });
});
