import { describe, expect, it } from 'vitest';
import { getLegalRegistry } from '../modules/legal/registry.js';
import {
  RegistrationAdmissionError,
  validateRegistrationAdmission,
} from './admission.js';

const current = getLegalRegistry();
const base = {
  birthDate: '1976-10-14',
  acceptedTermsVersion: current.terms.version,
  acceptedPrivacyVersion: current.privacy.version,
};

describe('Better Auth registration admission', () => {
  it.each([
    ['2008-10-14', true],
    ['2008-10-15', false],
    ['1976-10-14', true],
    ['1975-10-14', false],
  ])('evaluates DOB %s at the Asia/Jakarta calendar boundary', (birthDate, accepted) => {
    const run = () => validateRegistrationAdmission({ ...base, birthDate }, new Date('2026-10-14T01:00:00.000Z'));
    if (accepted) expect(run()).toEqual(expect.objectContaining({ birthDate }));
    else expect(run).toThrow(RegistrationAdmissionError);
  });

  it('rejects a future or malformed date', () => {
    expect(() => validateRegistrationAdmission({ ...base, birthDate: 'nope' }, new Date())).toThrow(RegistrationAdmissionError);
  });

  it('rejects stale legal document versions', () => {
    expect(() => validateRegistrationAdmission({ ...base, acceptedTermsVersion: 'stale' }, new Date())).toThrow(RegistrationAdmissionError);
  });

  it('returns server controlled acceptance metadata', () => {
    expect(validateRegistrationAdmission(base, new Date('2026-10-14T01:00:00.000Z'))).toEqual({
      birthDate: base.birthDate,
      acceptedTermsVersion: current.terms.version,
      acceptedPrivacyVersion: current.privacy.version,
      acceptedAt: expect.any(Date),
    });
  });
});
