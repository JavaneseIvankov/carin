export const PASSWORD_RESET_REQUEST_CONFIRMATION =
  'Jika akun dengan alamat tersebut tersedia, instruksi pengaturan ulang akan dikirim. Periksa kotak masuk dan folder spam.';

export type SignInFailure = 'unverified-email' | 'invalid-credentials';

export function classifySignInError(error: unknown): SignInFailure {
  const visited = new Set<object>();
  const hasUnverifiedCode = (value: unknown, depth: number): boolean => {
    if (depth > 4 || !value || typeof value !== 'object' || visited.has(value)) return false;
    visited.add(value);
    const record = value as Record<string, unknown>;
    if (record.code === 'EMAIL_NOT_VERIFIED') return true;
    return ['error', 'cause', 'body'].some((key) => hasUnverifiedCode(record[key], depth + 1));
  };

  return hasUnverifiedCode(error, 0) ? 'unverified-email' : 'invalid-credentials';
}

export async function requestPasswordResetPrivately<TInput>(
  request: (input: TInput) => Promise<unknown>,
  input: TInput
): Promise<string> {
  try {
    await request(input);
  } catch {
    // The same response is shown for every address and request outcome.
  }
  return PASSWORD_RESET_REQUEST_CONFIRMATION;
}

export function validatePasswordReset(
  newPassword: string,
  confirmation: string
): { valid: true } | { valid: false; error: string } {
  if (newPassword.length < 8 || newPassword.length > 128) {
    return { valid: false, error: 'Kata sandi harus terdiri dari 8–128 karakter.' };
  }
  if (newPassword !== confirmation) {
    return { valid: false, error: 'Konfirmasi kata sandi belum sama.' };
  }
  return { valid: true };
}

export async function completePasswordReset<TResponse extends { error?: unknown | null }>(
  resetPassword: (input: { token: string; newPassword: string }) => Promise<TResponse>,
  clearLocalSession: () => Promise<void>,
  token: string,
  newPassword: string
): Promise<'success' | 'recoverable-error'> {
  try {
    const result = await resetPassword({ token, newPassword });
    if (result.error) return 'recoverable-error';
    await clearLocalSession();
    return 'success';
  } catch {
    return 'recoverable-error';
  }
}
