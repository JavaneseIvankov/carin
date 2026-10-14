export type RegistrationInput = {
  name: string;
  email: string;
  password: string;
  birthDate: string;
  acceptedTerms: boolean;
  acceptedPrivacy: boolean;
  termsVersion: string;
  privacyVersion: string;
};

export type RegistrationPayload = {
  name: string;
  email: string;
  password: string;
  birthDate: string;
  acceptedTermsVersion: string;
  acceptedPrivacyVersion: string;
};

export type RegistrationField =
  'email' | 'password' | 'birthDate' | 'acceptedTerms' | 'acceptedPrivacy';

export type RegistrationResult =
  | { valid: true; payload: RegistrationPayload; errors: Record<string, never> }
  | { valid: false; errors: Partial<Record<RegistrationField, string>> };

function jakartaToday(now = new Date()): string {
  const dateParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: 'year' | 'month' | 'day') =>
    dateParts.find((value) => value.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function ageOnDate(birthDate: string, today: string): number {
  const [birthYear, birthMonth, birthDay] = birthDate.split('-').map(Number);
  const [year, month, day] = today.split('-').map(Number);
  return (
    year - birthYear - (month < birthMonth || (month === birthMonth && day < birthDay) ? 1 : 0)
  );
}

export function validateRegistration(
  input: RegistrationInput,
  today = jakartaToday()
): RegistrationResult {
  const errors: Partial<Record<RegistrationField, string>> = {};
  const email = input.email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Masukkan alamat email yang valid.';
  }
  if (input.password.length < 8 || input.password.length > 128) {
    errors.password = 'Kata sandi harus terdiri dari 8–128 karakter.';
  }
  if (
    !isValidDateOnly(input.birthDate) ||
    !isValidDateOnly(today) ||
    input.birthDate > today ||
    ageOnDate(input.birthDate, today) < 18 ||
    ageOnDate(input.birthDate, today) > 50
  ) {
    errors.birthDate = 'Tanggal lahir harus menunjukkan usia 18–50 tahun.';
  }
  if (!input.acceptedTerms) errors.acceptedTerms = 'Persetujuan syarat dan ketentuan wajib.';
  if (!input.acceptedPrivacy) errors.acceptedPrivacy = 'Persetujuan privasi wajib.';

  if (Object.keys(errors).length > 0) return { valid: false, errors };

  return {
    valid: true,
    errors: {},
    payload: {
      name: input.name.trim() || 'Pengguna',
      email,
      password: input.password,
      birthDate: input.birthDate,
      acceptedTermsVersion: input.termsVersion,
      acceptedPrivacyVersion: input.privacyVersion,
    },
  };
}

export function isStaleLegalVersionError(error: unknown): boolean {
  const visited = new Set<object>();
  const hasCode = (value: unknown, depth: number): boolean => {
    if (depth > 4 || !value || typeof value !== 'object' || visited.has(value)) return false;
    visited.add(value);
    const record = value as Record<string, unknown>;
    if (record.code === 'STALE_LEGAL_VERSION') return true;
    return ['body', 'data', 'error', 'cause'].some((key) => hasCode(record[key], depth + 1));
  };
  return hasCode(error, 0);
}
