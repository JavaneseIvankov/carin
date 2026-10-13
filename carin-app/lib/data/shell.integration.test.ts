import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { createAppRepository, ApiError } from '@/lib/api/repository';
import { nextSheetOpen } from '@/lib/navigation';
import { createDraftStore } from './drafts';
import { OfflineError, staleReadLabel } from './network';
import {
  clearScopedData,
  scopeKey,
  storageKey,
  type DataScope,
  type StorageAdapter,
} from './scope';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));

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

describe('mobile shell and data boundary', () => {
  it('opens center sheet and closes it on Android back, backdrop, or tab selection', () => {
    expect(nextSheetOpen(false, 'open-sheet')).toBe(true);
    expect(nextSheetOpen(true, 'back')).toBe(false);
    expect(nextSheetOpen(true, 'close-sheet')).toBe(false);
    expect(nextSheetOpen(true, 'select-tab')).toBe(false);
  });

  it('blocks writes offline without calling the server or showing success', async () => {
    const fetcher = vi.fn();
    const repo = createAppRepository({
      scope: alice,
      storage: memoryStorage(),
      connectivity: () => 'offline',
      onUnauthorized: async () => {},
      fetcher: fetcher as unknown as typeof fetch,
      baseUrl: 'https://api.test',
    });
    await expect(
      repo.write('deleteConsumption', {
        path: { id: 'id-1' },
        headers: { 'Idempotency-Key': 'test-key' },
      })
    ).rejects.toBeInstanceOf(OfflineError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('labels an offline cached read with its last update and never invents fresh data', async () => {
    const storage = memoryStorage();
    const updatedAt = Date.UTC(2026, 9, 14);
    await storage.setItem(
      storageKey(alice, 'read', '/api/v1/dashboard'),
      JSON.stringify({ data: { sample: true }, updatedAt })
    );
    const fetcher = vi.fn();
    const repo = createAppRepository({
      scope: alice,
      storage,
      connectivity: () => 'offline',
      onUnauthorized: async () => {},
      fetcher: fetcher as unknown as typeof fetch,
      baseUrl: 'https://api.test',
    });
    const read = await repo.read('getDashboard', {});
    expect(read.stale).toBe(true);
    expect(read.updatedAt).toBe(updatedAt);
    expect(staleReadLabel(read.updatedAt, 'offline')).toContain(
      'Offline · Data terakhir diperbarui'
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('keeps drafts and queries scoped by user and environment, then clears the departing user', async () => {
    const storage = memoryStorage();
    const drafts = createDraftStore(storage);
    const queryClient = new QueryClient();
    await drafts.save(alice, 'meal', { name: 'nasi' });
    await drafts.save(bob, 'meal', { name: 'soto' });
    await drafts.save({ environment: 'staging', userId: 'alice' }, 'meal', { name: 'staging' });
    queryClient.setQueryData(scopeKey(alice, 'getDashboard'), { sample: true });
    expect(scopeKey(alice, 'getDashboard')).not.toEqual(scopeKey(bob, 'getDashboard'));
    await clearScopedData(alice, queryClient, storage);
    expect(await drafts.load(alice, 'meal')).toBeNull();
    expect(await drafts.load(bob, 'meal')).toEqual({ name: 'soto' });
    expect(await drafts.load({ environment: 'staging', userId: 'alice' }, 'meal')).toEqual({
      name: 'staging',
    });
    expect(queryClient.getQueryData(scopeKey(alice, 'getDashboard'))).toBeUndefined();
  });

  it('clears session data on 401 and never serves a cached read as authorized', async () => {
    const storage = memoryStorage();
    await storage.setItem(
      storageKey(alice, 'read', '/api/v1/dashboard'),
      JSON.stringify({ data: {}, updatedAt: 1 })
    );
    const unauthorized = vi.fn(async () => {
      await clearScopedData(alice, new QueryClient(), storage);
    });
    const repo = createAppRepository({
      scope: alice,
      storage,
      connectivity: () => 'online',
      onUnauthorized: unauthorized,
      fetcher: vi.fn(async () => new Response(null, { status: 401 })) as unknown as typeof fetch,
      baseUrl: 'https://api.test',
    });
    await expect(repo.read('getDashboard', {})).rejects.toMatchObject({
      status: 401,
    } satisfies Partial<ApiError>);
    expect(unauthorized).toHaveBeenCalledOnce();
    expect(await storage.getItem(storageKey(alice, 'read', '/api/v1/dashboard'))).toBeNull();
  });
});
