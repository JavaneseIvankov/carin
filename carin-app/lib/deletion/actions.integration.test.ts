import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { createAppRepository } from '@/lib/api/repository';
import {
  clearScopedData,
  scopeKey,
  storageKey,
  type DataScope,
  type StorageAdapter,
} from '@/lib/data/scope';
import { createDeletionActionState, createDeletionActions } from './actions';

function createStorage(): StorageAdapter {
  const values = new Map<string, string>();
  return {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
    getAllKeys: async () => [...values.keys()],
    removeItem: async (key) => {
      values.delete(key);
    },
  };
}

describe('account deletion accepted flow', () => {
  it('clears scoped drafts, cached reads, and session only after a 202 acknowledgement', async () => {
    const scope: DataScope = { environment: 'dev', userId: 'account-1' };
    const storage = createStorage();
    const queryClient = new QueryClient();
    const cacheKey = storageKey(scope, 'read', '/api/v1/profile');
    const draftKey = storageKey(scope, 'draft', 'food-correction:scan-1');
    await storage.setItem(cacheKey, 'cached-profile');
    await storage.setItem(draftKey, 'saved-draft');
    queryClient.setQueryData(scopeKey(scope, 'getProfile', {}), { data: 'cached-profile' });
    let session: 'authenticated' | 'unauthenticated' = 'authenticated';
    const fetcher = vi.fn(async () =>
      Response.json(
        {
          status: 'deletion_pending',
          acceptedAt: '2026-10-14T10:00:00.000Z',
          accessRevoked: true,
        },
        { status: 202 }
      )
    );
    const repository = createAppRepository({
      scope,
      storage,
      connectivity: () => 'online',
      onUnauthorized: async () => {},
      getCookie: async () => 'carin-dev.session=session-value',
      fetcher: fetcher as unknown as typeof fetch,
      baseUrl: 'https://api.test',
    });
    const actions = createDeletionActions(
      {
        deleteAccount: (input) => repository.write('deleteAccount', input),
        deleteScan: (input) => repository.write('deleteScan', input),
      },
      async () => {
        session = 'unauthenticated';
        await clearScopedData(scope, queryClient, storage);
      },
      createDeletionActionState(() => 'account-delete-key')
    );

    await actions.deleteAccount('correct-password');

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/api/v1/account-deletion');
    expect(request.method).toBe('POST');
    expect(request.headers).toMatchObject({ 'Idempotency-Key': 'account-delete-key' });
    expect(JSON.parse(String(request.body))).toEqual({
      password: 'correct-password',
      confirmation: 'DELETE_MY_ACCOUNT',
    });
    expect(session).toBe('unauthenticated');
    expect(await storage.getAllKeys()).toEqual([]);
    expect(queryClient.getQueryData(scopeKey(scope, 'getProfile', {}))).toBeUndefined();
  });

  it('keeps the session and scoped data after a 403 reauthentication rejection', async () => {
    const scope: DataScope = { environment: 'dev', userId: 'account-1' };
    const storage = createStorage();
    const queryClient = new QueryClient();
    const cacheKey = storageKey(scope, 'read', '/api/v1/profile');
    await storage.setItem(cacheKey, 'cached-profile');
    queryClient.setQueryData(scopeKey(scope, 'getProfile', {}), { data: 'cached-profile' });
    const onUnauthorized = vi.fn();
    const fetcher = vi.fn(async () =>
      Response.json(
        { error: { code: 'REAUTHENTICATION_REQUIRED', message: 'Password mismatch.' } },
        { status: 403 }
      )
    );
    const repository = createAppRepository({
      scope,
      storage,
      connectivity: () => 'online',
      onUnauthorized,
      getCookie: async () => 'carin-dev.session=session-value',
      fetcher: fetcher as unknown as typeof fetch,
      baseUrl: 'https://api.test',
    });
    const clearLocalSession = vi.fn(async () => {
      await clearScopedData(scope, queryClient, storage);
    });
    const actions = createDeletionActions(
      {
        deleteAccount: (input) => repository.write('deleteAccount', input),
        deleteScan: (input) => repository.write('deleteScan', input),
      },
      clearLocalSession,
      createDeletionActionState(() => 'account-delete-key')
    );

    await expect(actions.deleteAccount('wrong-password')).rejects.toMatchObject({
      status: 403,
      code: 'REAUTHENTICATION_REQUIRED',
    });

    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(clearLocalSession).not.toHaveBeenCalled();
    expect(await storage.getItem(cacheKey)).toBe('cached-profile');
    expect(queryClient.getQueryData(scopeKey(scope, 'getProfile', {}))).toEqual({
      data: 'cached-profile',
    });
  });

  it('keeps an existing consumption snapshot when a scan is deleted', async () => {
    const scope: DataScope = { environment: 'dev', userId: 'account-1' };
    const storage = createStorage();
    const queryClient = new QueryClient();
    const consumptionKey = scopeKey(scope, 'getConsumption', { path: { id: 'consumption-1' } });
    const snapshot = {
      id: 'consumption-1',
      photoAvailable: true,
      snapshot: { components: [{ displayName: 'Sup sayur' }] },
    };
    queryClient.setQueryData(consumptionKey, { data: snapshot });
    const repository = createAppRepository({
      scope,
      storage,
      connectivity: () => 'online',
      onUnauthorized: async () => {},
      fetcher: vi.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch,
      baseUrl: 'https://api.test',
    });
    const actions = createDeletionActions(
      {
        deleteAccount: (input) => repository.write('deleteAccount', input),
        deleteScan: (input) => repository.write('deleteScan', input),
      },
      async () => {},
      createDeletionActionState(() => 'scan-delete-key')
    );

    await actions.deleteScan('scan-1', async () => {
      queryClient.removeQueries({
        queryKey: scopeKey(scope, 'getScan', { path: { id: 'scan-1' } }),
      });
      await queryClient.invalidateQueries({ queryKey: scopeKey(scope, 'listScans') });
      await queryClient.invalidateQueries({ queryKey: scopeKey(scope, 'listConsumptions') });
    });

    expect(queryClient.getQueryData(consumptionKey)).toEqual({ data: snapshot });
  });
});
