import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { createAppRepository } from '@/lib/api/repository';
import { clearScopedData, scopeKey, type DataScope, type StorageAdapter } from '@/lib/data/scope';
import { createAuthSessionLifecycle, type AuthSession } from './session';

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
const bob: DataScope = { environment: 'dev', userId: 'bob' };
const sessionFor = (userId: string): AuthSession => ({
  data: { user: { id: userId, email: `${userId}@example.test`, emailVerified: true } },
});

describe('auth session lifecycle', () => {
  it('times out a stalled restoration and ignores its late session after retry', async () => {
    vi.useFakeTimers();
    try {
      let resolveStalled!: (session: AuthSession) => void;
      const stalled = new Promise<AuthSession>((resolve) => {
        resolveStalled = resolve;
      });
      const getSession = vi
        .fn<() => Promise<AuthSession>>()
        .mockReturnValueOnce(stalled)
        .mockResolvedValueOnce(sessionFor('bob'));
      const setSessionUser = vi.fn(async () => {});
      const lifecycle = createAuthSessionLifecycle({
        getSession,
        setSessionUser,
        clearSession: async () => {},
        onState: () => {},
        restorationTimeoutMs: 100,
      });
      const restoration = lifecycle.restore();
      await vi.advanceTimersByTimeAsync(100);
      await restoration;
      expect(lifecycle.getState()).toMatchObject({ status: 'loading', error: expect.any(Error) });
      expect(setSessionUser).not.toHaveBeenCalled();
      await lifecycle.restore();
      resolveStalled(sessionFor('alice'));
      await Promise.resolve();
      expect(setSessionUser).toHaveBeenCalledExactlyOnceWith('bob');
      expect(lifecycle.getState()).toMatchObject({ status: 'authenticated', user: { id: 'bob' } });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('allows leaving a failed restoration for sign-in without granting a data scope', async () => {
    const setSessionUser = vi.fn(async () => {});
    const clearSession = vi.fn(async () => {});
    const lifecycle = createAuthSessionLifecycle({
      getSession: async () => {
        throw new Error('offline');
      },
      setSessionUser,
      clearSession,
      onState: () => {},
    });
    await lifecycle.restore();
    await lifecycle.invalidateSession();
    expect(lifecycle.getState()).toEqual({ status: 'unauthenticated', user: null });
    expect(setSessionUser).not.toHaveBeenCalled();
    expect(clearSession).toHaveBeenCalledOnce();
  });

  it('establishes app scope only after the server confirms a verified session', async () => {
    const states: string[] = [];
    const setSessionUser = vi.fn(async () => {});
    const lifecycle = createAuthSessionLifecycle({
      getSession: async () => sessionFor('alice'),
      setSessionUser,
      clearSession: async () => {},
      onState: (state) => states.push(state.status),
    });

    await lifecycle.restore();

    expect(setSessionUser).toHaveBeenCalledWith('alice');
    expect(states).toEqual(['loading', 'authenticated']);
    expect(lifecycle.getState()).toMatchObject({
      status: 'authenticated',
      user: { id: 'alice', emailVerified: true },
    });
  });

  it('does not establish app scope for an unverified session response', async () => {
    const setSessionUser = vi.fn(async () => {});
    const clearSession = vi.fn(async () => {});
    const lifecycle = createAuthSessionLifecycle({
      getSession: async () => ({
        data: {
          user: { id: 'alice', email: 'alice@example.test', emailVerified: false },
        },
      }),
      setSessionUser,
      clearSession,
      onState: () => {},
    });

    await lifecycle.restore();

    expect(setSessionUser).not.toHaveBeenCalled();
    expect(clearSession).toHaveBeenCalledOnce();
    expect(lifecycle.getState()).toMatchObject({ status: 'unauthenticated', user: null });
  });

  it('keeps restoration retryable after a network error', async () => {
    const states: { status: string; error?: unknown }[] = [];
    const getSession = vi
      .fn<() => Promise<AuthSession>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(sessionFor('alice'));
    const lifecycle = createAuthSessionLifecycle({
      getSession,
      setSessionUser: async () => {},
      clearSession: async () => {},
      onState: (state) => states.push(state),
    });

    await lifecycle.restore();
    expect(lifecycle.getState()).toMatchObject({ status: 'loading', error: expect.any(Error) });
    expect(states.some((state) => state.status === 'unauthenticated')).toBe(false);

    await lifecycle.restore();
    expect(lifecycle.getState()).toMatchObject({ status: 'authenticated' });
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it('clears the local session and app scope even when server sign-out fails', async () => {
    const states: string[] = [];
    const storage = memoryStorage();
    const queryClient = new QueryClient();
    const cachedKey = scopeKey(alice, 'getDashboard');
    queryClient.setQueryData(cachedKey, { private: true });
    const clearSession = vi.fn(async () => clearScopedData(alice, queryClient, storage));
    const lifecycle = createAuthSessionLifecycle({
      getSession: async () => sessionFor('alice'),
      setSessionUser: async () => {},
      clearSession,
      onState: (state) => states.push(state.status),
    });
    await lifecycle.restore();

    await lifecycle.signOut(async () => {
      throw new Error('network failure');
    });

    expect(clearSession).toHaveBeenCalledOnce();
    expect(lifecycle.getState()).toMatchObject({ status: 'unauthenticated', user: null });
    expect(queryClient.getQueryData(cachedKey)).toBeUndefined();
    expect(states.at(-1)).toBe('unauthenticated');
  });

  it('defers 401 invalidation until pending sign-out cookie cleanup finishes', async () => {
    const states: string[] = [];
    let releaseServerSignOut!: () => void;
    let serverSignOutStarted!: () => void;
    const serverSignOut = new Promise<void>((resolve) => {
      releaseServerSignOut = resolve;
    });
    const started = new Promise<void>((resolve) => {
      serverSignOutStarted = resolve;
    });
    let serverSignOutSettled = false;
    let releaseLocalCleanup!: () => void;
    let localCleanupStarted!: () => void;
    const localCleanup = new Promise<void>((resolve) => {
      releaseLocalCleanup = resolve;
    });
    const cleanupStarted = new Promise<void>((resolve) => {
      localCleanupStarted = resolve;
    });
    const clearSession = vi.fn(async () => {
      if (serverSignOutSettled) {
        localCleanupStarted();
        await localCleanup;
      }
    });
    const lifecycle = createAuthSessionLifecycle({
      getSession: async () => sessionFor('alice'),
      setSessionUser: async () => {},
      clearSession,
      onState: (state) => states.push(state.status),
    });
    await lifecycle.restore();

    const signOut = lifecycle.signOut(async () => {
      serverSignOutStarted();
      await serverSignOut;
      serverSignOutSettled = true;
    });
    await started;
    const invalidation = lifecycle.invalidateSession();

    await Promise.resolve();
    expect(lifecycle.getState().status).toBe('loading');
    expect(states).not.toContain('unauthenticated');

    releaseServerSignOut();
    await cleanupStarted;
    expect(lifecycle.getState().status).toBe('loading');
    releaseLocalCleanup();
    await Promise.all([signOut, invalidation]);

    expect(clearSession).toHaveBeenCalledOnce();
    expect(lifecycle.getState()).toMatchObject({ status: 'unauthenticated', user: null });
    expect(states.at(-1)).toBe('unauthenticated');
  });

  it('invalidates the auth state when a protected request returns 401', async () => {
    const storage = memoryStorage();
    const queryClient = new QueryClient();
    const states: string[] = [];
    const lifecycle = createAuthSessionLifecycle({
      getSession: async () => sessionFor('alice'),
      setSessionUser: async () => {},
      clearSession: async () => clearScopedData(alice, queryClient, storage),
      onState: (state) => states.push(state.status),
    });
    await lifecycle.restore();
    queryClient.setQueryData(scopeKey(alice, 'getDashboard'), { private: true });
    const repository = createAppRepository({
      scope: alice,
      storage,
      connectivity: () => 'online',
      onUnauthorized: lifecycle.invalidateSession,
      fetcher: vi.fn(async () => new Response(null, { status: 401 })) as unknown as typeof fetch,
      baseUrl: 'https://api.test',
    });

    await expect(repository.read('getDashboard', {})).rejects.toMatchObject({ status: 401 });

    expect(lifecycle.getState()).toMatchObject({ status: 'unauthenticated', user: null });
    expect(queryClient.getQueryData(scopeKey(alice, 'getDashboard'))).toBeUndefined();
    expect(states.at(-1)).toBe('unauthenticated');
  });

  it('waits for departing account cleanup before exposing a restored account', async () => {
    const states: { status: string; userId?: string }[] = [];
    const storage = memoryStorage();
    const queryClient = new QueryClient();
    const aliceKey = scopeKey(alice, 'getDashboard');
    queryClient.setQueryData(aliceKey, { private: 'alice' });
    let releaseCleanup!: () => void;
    let cleanupStarted!: () => void;
    const cleanup = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });
    const started = new Promise<void>((resolve) => {
      cleanupStarted = resolve;
    });
    let currentUserId: string | null = null;
    let response = sessionFor('alice');
    const setSessionUser = vi.fn(async (userId: string | null) => {
      if (currentUserId && currentUserId !== userId) {
        cleanupStarted();
        await cleanup;
        const departing = currentUserId === 'alice' ? alice : bob;
        await clearScopedData(departing, queryClient, storage);
      }
      currentUserId = userId;
    });
    const lifecycle = createAuthSessionLifecycle({
      getSession: async () => response,
      setSessionUser,
      clearSession: async () => {
        currentUserId = null;
      },
      onState: (state) => states.push({ status: state.status, userId: state.user?.id }),
    });
    await lifecycle.restore();
    response = sessionFor('bob');

    const transition = lifecycle.restore();
    await started;

    expect(lifecycle.getState().status).toBe('loading');
    expect(currentUserId).toBe('alice');
    expect(queryClient.getQueryData(aliceKey)).toEqual({ private: 'alice' });

    releaseCleanup();
    await transition;

    expect(queryClient.getQueryData(aliceKey)).toBeUndefined();
    expect(setSessionUser).toHaveBeenNthCalledWith(2, 'bob');
    expect(states.at(-1)).toEqual({ status: 'authenticated', userId: 'bob' });
  });
});
