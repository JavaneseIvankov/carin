import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { decideAuthRoute } from './routes';
import { createAuthSessionLifecycle, type AuthSession } from './session';
import {
  clearScopedData,
  scopeKey,
  storageKey,
  type DataScope,
  type StorageAdapter,
} from '@/lib/data/scope';
import {
  classifySignInError,
  completePasswordReset,
  PASSWORD_RESET_REQUEST_CONFIRMATION,
  requestPasswordResetPrivately,
} from './flows';
import { buildPasswordResetLandingUrl, parsePasswordResetLink } from './links';

function memoryStorage(): StorageAdapter {
  const values = new Map<string, string>();
  return {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
    removeItem: async (key) => {
      values.delete(key);
    },
    getAllKeys: async () => [...values.keys()],
  };
}

const alice: DataScope = { environment: 'dev', userId: 'alice' };
const verifiedSession: AuthSession = {
  data: { user: { id: 'alice', email: 'alice@example.test', emailVerified: true } },
};

describe('mobile auth route flows', () => {
  it('shows identical reset confirmation for known and unknown email responses', async () => {
    const redirectTo = buildPasswordResetLandingUrl('https://api.example.test/v1');
    expect(redirectTo).toBe('https://api.example.test/auth/reset');
    const requestKnown = vi.fn(async () => ({ status: true, message: 'queued' }));
    const requestUnknown = vi.fn(async () => ({ status: false, message: 'not-found' }));
    const input = { email: 'person@example.test', redirectTo: redirectTo! };

    const knownFeedback = await requestPasswordResetPrivately(requestKnown, input);
    const unknownFeedback = await requestPasswordResetPrivately(requestUnknown, input);

    expect(knownFeedback).toBe(PASSWORD_RESET_REQUEST_CONFIRMATION);
    expect(unknownFeedback).toBe(knownFeedback);
    expect(requestKnown).toHaveBeenCalledWith(input);
    expect(requestUnknown).toHaveBeenCalledWith(input);
  });

  it('does not establish app scope for an unverified sign-in response', async () => {
    const setSessionUser = vi.fn(async () => {});
    const clearSession = vi.fn(async () => {});
    const lifecycle = createAuthSessionLifecycle({
      getSession: async () => ({ data: null }),
      setSessionUser,
      clearSession,
      onState: () => {},
    });
    const signInResponse = { error: { code: 'EMAIL_NOT_VERIFIED' } };

    await lifecycle.restore();
    const signInFailure = classifySignInError(signInResponse.error);

    expect(signInFailure).toBe('unverified-email');
    expect(setSessionUser).not.toHaveBeenCalled();
    expect(lifecycle.getState()).toMatchObject({ status: 'unauthenticated', user: null });
    expect(decideAuthRoute('unauthenticated', ['(auth)', 'verify-email'])).toEqual({
      type: 'render',
    });
  });

  it('restores a verified server session before routing to the requested in-app destination', async () => {
    const states: string[] = [];
    const lifecycle = createAuthSessionLifecycle({
      getSession: async () => verifiedSession,
      setSessionUser: async (userId) => {
        expect(userId).toBe('alice');
        states.push('scope-established');
      },
      clearSession: async () => {},
      onState: (state) => states.push(state.status),
    });

    await lifecycle.restore();
    const route = decideAuthRoute(
      'authenticated',
      ['(auth)', 'sign-in'],
      '/(auth)/sign-in',
      '/food/analysis/meal-1'
    );

    expect(states).toEqual(['loading', 'scope-established', 'authenticated']);
    expect(route).toEqual({ type: 'redirect', href: '/food/analysis/meal-1' });
  });

  it('clears session scope and cached data after reset succeeds even if its session was revoked', async () => {
    const storage = memoryStorage();
    const queryClient = new QueryClient();
    const queryKey = scopeKey(alice, 'getDashboard');
    queryClient.setQueryData(queryKey, { private: true });
    const draftKey = storageKey(alice, 'draft', 'health');
    await storage.setItem(draftKey, 'private draft');
    const lifecycle = createAuthSessionLifecycle({
      getSession: async () => verifiedSession,
      setSessionUser: async () => {},
      clearSession: async () => clearScopedData(alice, queryClient, storage),
      onState: () => {},
    });
    await lifecycle.restore();
    const resetPassword = vi.fn(async () => ({ data: { status: true }, error: null }));

    const result = await completePasswordReset(
      resetPassword,
      () => lifecycle.signOut(async () => Promise.reject(new Error('session already revoked'))),
      'opaque-reset-token',
      'new-password'
    );

    expect(result).toBe('success');
    expect(lifecycle.getState()).toMatchObject({ status: 'unauthenticated', user: null });
    expect(queryClient.getQueryData(queryKey)).toBeUndefined();
    expect(await storage.getItem(draftKey)).toBeNull();
  });

  it('keeps an invalid deep link in the guest auth flow so the user can request a new link', () => {
    const parsed = parsePasswordResetLink('carin://auth/reset?token=private-token', 'carin-dev');

    expect(parsed).toEqual({ valid: false, reason: 'invalid-link' });
    expect(decideAuthRoute('unauthenticated', ['reset-password'])).toEqual({
      type: 'render',
    });
  });
});
