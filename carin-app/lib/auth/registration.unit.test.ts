import { describe, expect, it } from 'vitest';
import { isStaleLegalVersionError, validateRegistration } from './registration';

const validInput = {
  name: '  Nadia  ',
  email: 'nadia@example.test',
  password: 'password123',
  birthDate: '1990-01-01',
  acceptedTerms: true,
  acceptedPrivacy: true,
  termsVersion: 'terms.v1',
  privacyVersion: 'privacy.v1',
};

describe('validateRegistration', () => {
  it('uses Pengguna when the optional name is blank', () => {
    const result = validateRegistration({ ...validInput, name: '   ' }, '2026-10-14');

    expect(result).toMatchObject({
      valid: true,
      payload: { name: 'Pengguna' },
    });
  });

  it('rejects an invalid email address', () => {
    const result = validateRegistration({ ...validInput, email: 'bukan-email' }, '2026-10-14');

    expect(result).toMatchObject({ valid: false, errors: { email: expect.any(String) } });
  });

  it('rejects passwords shorter than eight characters', () => {
    const result = validateRegistration({ ...validInput, password: 'short7' }, '2026-10-14');

    expect(result).toMatchObject({ valid: false, errors: { password: expect.any(String) } });
  });

  it('rejects passwords longer than 128 characters', () => {
    const result = validateRegistration({ ...validInput, password: 'p'.repeat(129) }, '2026-10-14');

    expect(result).toMatchObject({ valid: false, errors: { password: expect.any(String) } });
  });

  it.each([8, 128])('accepts a password of exactly %i characters', (length) => {
    const result = validateRegistration(
      { ...validInput, password: 'p'.repeat(length) },
      '2026-10-14'
    );

    expect(result).toMatchObject({ valid: true });
  });

  it.each(['2026-02-30', 'not-a-date', '2026-10-15'])(
    'rejects invalid or future DOB %s',
    (birthDate) => {
      const result = validateRegistration({ ...validInput, birthDate }, '2026-10-14');

      expect(result).toMatchObject({ valid: false, errors: { birthDate: expect.any(String) } });
    }
  );

  it.each([
    ['2008-10-15', 'one day younger than 18'],
    ['1975-10-13', 'older than 50'],
  ])('rejects DOB %s (%s)', (birthDate) => {
    const result = validateRegistration({ ...validInput, birthDate }, '2026-10-14');

    expect(result).toMatchObject({ valid: false, errors: { birthDate: expect.any(String) } });
  });

  it.each([
    ['2008-10-14', '18 years old'],
    ['1976-10-14', '50 years old'],
  ])('accepts DOB %s (%s)', (birthDate) => {
    const result = validateRegistration({ ...validInput, birthDate }, '2026-10-14');

    expect(result).toMatchObject({ valid: true, payload: { birthDate } });
  });

  it('requires terms consent', () => {
    const result = validateRegistration({ ...validInput, acceptedTerms: false }, '2026-10-14');

    expect(result).toMatchObject({ valid: false, errors: { acceptedTerms: expect.any(String) } });
  });

  it('requires privacy consent', () => {
    const result = validateRegistration({ ...validInput, acceptedPrivacy: false }, '2026-10-14');

    expect(result).toMatchObject({ valid: false, errors: { acceptedPrivacy: expect.any(String) } });
  });

  it('submits both displayed consent versions unchanged', () => {
    const result = validateRegistration(
      { ...validInput, termsVersion: 'terms draft 1 ', privacyVersion: ' privacy.v2' },
      '2026-10-14'
    );

    expect(result).toMatchObject({
      valid: true,
      payload: {
        acceptedTermsVersion: 'terms draft 1 ',
        acceptedPrivacyVersion: ' privacy.v2',
      },
    });
  });

  it('recognizes a stale legal version response from Better Auth', () => {
    expect(isStaleLegalVersionError({ code: 'STALE_LEGAL_VERSION' })).toBe(true);
    expect(isStaleLegalVersionError({ body: { code: 'STALE_LEGAL_VERSION' } })).toBe(true);
    expect(isStaleLegalVersionError({ code: 'INVALID_EMAIL' })).toBe(false);
  });
});
