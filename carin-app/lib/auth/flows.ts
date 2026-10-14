export const PASSWORD_RESET_REQUEST_CONFIRMATION =
  'Jika akun dengan alamat tersebut tersedia, instruksi pengaturan ulang akan dikirim. Periksa kotak masuk dan folder spam.';

export type SignInFailure =
  'unverified-email' | 'invalid-credentials' | 'rate-limited' | 'service-unavailable';

export function classifySignInError(error: unknown): SignInFailure {
  const visited = new Set<object>();
  const classify = (value: unknown, depth: number): SignInFailure | null => {
    if (depth > 4 || !value || typeof value !== 'object' || visited.has(value)) return null;
    visited.add(value);
    const record = value as Record<string, unknown>;
    if (record.status === 429 || record.code === 'TOO_MANY_REQUESTS') return 'rate-limited';
    if (typeof record.status === 'number' && record.status >= 500) return 'service-unavailable';
    if (record.code === 'EMAIL_NOT_VERIFIED') return 'unverified-email';
    if (record.code === 'INVALID_EMAIL_OR_PASSWORD') return 'invalid-credentials';
    for (const key of ['error', 'cause', 'body']) {
      const failure = classify(record[key], depth + 1);
      if (failure) return failure;
    }
    return null;
  };

  return classify(error, 0) ?? 'service-unavailable';
}

export const SIGN_IN_FAILURE_MESSAGES: Record<SignInFailure, string> = {
  'invalid-credentials': 'Email atau kata sandi tidak sesuai. Periksa kembali lalu coba lagi.',
  'unverified-email':
    'Email belum diverifikasi. Buka instruksi verifikasi atau kirim ulang email terlebih dahulu.',
  'rate-limited': 'Terlalu banyak percobaan masuk. Tunggu sebentar lalu coba lagi.',
  'service-unavailable': 'Belum dapat terhubung ke layanan Carin. Periksa koneksi lalu coba lagi.',
};

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
