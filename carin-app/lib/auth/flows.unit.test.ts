import { describe, expect, it, vi } from 'vitest';
import { classifySignInError, completePasswordReset, validatePasswordReset } from './flows';

describe('auth flow helpers', () => {
  it('offers verification only for Better Auth unverified-email errors', () => {
    expect(classifySignInError({ code: 'EMAIL_NOT_VERIFIED' })).toBe('unverified-email');
    expect(classifySignInError({ error: { code: 'EMAIL_NOT_VERIFIED' } })).toBe('unverified-email');
    expect(classifySignInError({ code: 'INVALID_EMAIL_OR_PASSWORD' })).toBe('invalid-credentials');
    expect(classifySignInError(new Error('private backend detail'))).toBe('invalid-credentials');
  });

  it('requires an 8–128 character password and matching confirmation', () => {
    expect(validatePasswordReset('short', 'short')).toEqual({
      valid: false,
      error: 'Kata sandi harus terdiri dari 8–128 karakter.',
    });
    expect(validatePasswordReset('long-enough', 'different')).toEqual({
      valid: false,
      error: 'Konfirmasi kata sandi belum sama.',
    });
    expect(validatePasswordReset('long-enough', 'long-enough')).toEqual({ valid: true });
  });

  it('clears the prior local session only after the server accepts a reset', async () => {
    const resetPassword = vi.fn(async () => ({ data: { status: true }, error: null }));
    const clearSession = vi.fn(async () => {});
    const failedReset = vi.fn(async () => ({ data: null, error: { code: 'INVALID_TOKEN' } }));

    await expect(
      completePasswordReset(resetPassword, clearSession, 'opaque-token', 'new-password')
    ).resolves.toBe('success');
    expect(resetPassword).toHaveBeenCalledWith({
      token: 'opaque-token',
      newPassword: 'new-password',
    });
    expect(clearSession).toHaveBeenCalledOnce();

    clearSession.mockClear();
    await expect(
      completePasswordReset(failedReset, clearSession, 'opaque-token', 'new-password')
    ).resolves.toBe('recoverable-error');
    expect(clearSession).not.toHaveBeenCalled();
  });
});
