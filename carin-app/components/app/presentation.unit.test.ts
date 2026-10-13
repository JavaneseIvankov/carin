import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api/repository';
import { OfflineError } from '@/lib/data/network';
import { fieldAccessibilityHint, fieldLabel, serviceErrorMessage } from './presentation';

describe('shared field and error presentation', () => {
  it('keeps units in the visible and accessible field label and gives errors priority', () => {
    expect(fieldLabel('Berat', 'kg')).toBe('Berat (kg)');
    expect(fieldLabel('Nama')).toBe('Nama');
    expect(fieldAccessibilityHint('Isi dalam kilogram', 'Nilai wajib diisi')).toBe(
      'Nilai wajib diisi'
    );
    expect(fieldAccessibilityHint('Isi dalam kilogram')).toBe('Isi dalam kilogram');
  });

  it('uses actionable service and offline errors without exposing unknown error internals', () => {
    expect(serviceErrorMessage(new OfflineError())).toContain('Perlu koneksi internet');
    expect(
      serviceErrorMessage(new ApiError(401, 'Sesi berakhir. Silakan masuk kembali.'))
    ).toContain('masuk kembali');
    expect(serviceErrorMessage(new Error('private stack detail'))).not.toContain(
      'private stack detail'
    );
  });
});
