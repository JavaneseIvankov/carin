import { isSignupAgeEligible } from '../domain/age.js';
import { getLegalRegistry } from '../modules/legal/registry.js';

export type RegistrationInput = {
  [key: string]: unknown;
  birthDate?: unknown;
  acceptedTermsVersion?: unknown;
  acceptedPrivacyVersion?: unknown;
};

export type RegistrationMetadata = {
  birthDate: string;
  acceptedTermsVersion: string;
  acceptedPrivacyVersion: string;
  acceptedAt: Date;
};

export class RegistrationAdmissionError extends Error {
  readonly code:
    | 'INVALID_BIRTH_DATE'
    | 'AGE_NOT_ALLOWED'
    | 'STALE_LEGAL_VERSION';

  constructor(
    code: RegistrationAdmissionError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'RegistrationAdmissionError';
    this.code = code;
  }
}

export function validateRegistrationAdmission(
  input: RegistrationInput,
  registeredAt: Date,
): RegistrationMetadata {
  const birthDate = input.birthDate;
  if (typeof birthDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    throw new RegistrationAdmissionError(
      'INVALID_BIRTH_DATE',
      'A valid birth date is required',
    );
  }
  if (!isSignupAgeEligible(birthDate, registeredAt)) {
    throw new RegistrationAdmissionError(
      'AGE_NOT_ALLOWED',
      'Registration is available to users aged 18 through 50',
    );
  }

  const registry = getLegalRegistry();
  if (
    input.acceptedTermsVersion !== registry.terms.version ||
    input.acceptedPrivacyVersion !== registry.privacy.version
  ) {
    throw new RegistrationAdmissionError(
      'STALE_LEGAL_VERSION',
      'The submitted legal version is no longer current',
    );
  }

  return {
    birthDate,
    acceptedTermsVersion: registry.terms.version,
    acceptedPrivacyVersion: registry.privacy.version,
    acceptedAt: registeredAt,
  };
}
