import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { createAppRepository, ApiError } from '@/lib/api/repository';
import { nextSheetOpen } from '@/lib/navigation';
import { cachePhotoUri, getCachedPhotoUri } from '@/lib/food/photo-media';
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

  it('rejects a cached read that resolves after logout', async () => {
    const storage = memoryStorage();
    const key = storageKey(alice, 'read', '/api/v1/dashboard');
    await storage.setItem(key, JSON.stringify({ data: { sample: 'alice' }, updatedAt: 1 }));
    const originalGetItem = storage.getItem;
    let releaseRead!: () => void;
    let readStarted!: () => void;
    const started = new Promise<void>((resolve) => (readStarted = resolve));
    const blocked = new Promise<void>((resolve) => (releaseRead = resolve));
    storage.getItem = async (requestedKey) => {
      const value = await originalGetItem(requestedKey);
      readStarted();
      await blocked;
      return value;
    };
    const repo = createAppRepository({
      scope: alice,
      storage,
      connectivity: () => 'offline',
      onUnauthorized: async () => {},
      baseUrl: 'https://api.test',
    });
    const read = repo.read('getDashboard', {});
    const outcome = expect(read).rejects.toThrow('Scope changed');
    await started;
    await clearScopedData(alice, new QueryClient(), storage);
    releaseRead();
    await outcome;
  });

  it('rejects a draft loaded before cleanup when its storage read resolves afterward', async () => {
    const storage = memoryStorage();
    const drafts = createDraftStore(storage);
    await drafts.save(alice, 'health', { condition: 'private' });
    const originalGetItem = storage.getItem;
    let releaseRead!: () => void;
    let readStarted!: () => void;
    const started = new Promise<void>((resolve) => (readStarted = resolve));
    const blocked = new Promise<void>((resolve) => (releaseRead = resolve));
    storage.getItem = async (key) => {
      const value = await originalGetItem(key);
      readStarted();
      await blocked;
      return value;
    };
    const load = drafts.load(alice, 'health');
    const outcome = expect(load).rejects.toThrow('Scope changed');
    await started;
    await clearScopedData(alice, new QueryClient(), storage);
    releaseRead();
    await outcome;
  });

  it('rejects a delayed network response after an account switch without repopulating queries', async () => {
    const storage = memoryStorage();
    const queryClient = new QueryClient();
    let releaseResponse!: () => void;
    let requestStarted!: () => void;
    const started = new Promise<void>((resolve) => (requestStarted = resolve));
    const blocked = new Promise<void>((resolve) => (releaseResponse = resolve));
    let current: DataScope | null = alice;
    const repo = createAppRepository({
      scope: alice,
      storage,
      connectivity: () => 'online',
      onUnauthorized: async () => {},
      isCurrentScope: () => current === alice,
      fetcher: vi.fn(async () => {
        requestStarted();
        await blocked;
        return Response.json({ sample: 'alice' });
      }) as unknown as typeof fetch,
      baseUrl: 'https://api.test',
    });
    let repositoryRead!: Promise<unknown>;
    const queryRead = queryClient.fetchQuery({
      queryKey: scopeKey(alice, 'getDashboard'),
      queryFn: () => {
        repositoryRead = repo.read('getDashboard', {});
        return repositoryRead;
      },
    });
    const queryOutcome = expect(queryRead).rejects.toThrow();
    await started;
    const repositoryOutcome = expect(repositoryRead).rejects.toThrow('Scope changed');
    current = bob;
    await clearScopedData(alice, queryClient, storage);
    queryClient.setQueryData(scopeKey(bob, 'getDashboard'), { sample: 'bob' });
    releaseResponse();
    await Promise.all([queryOutcome, repositoryOutcome]);
    expect(queryClient.getQueryData(scopeKey(alice, 'getDashboard'))).toBeUndefined();
    expect(queryClient.getQueryData(scopeKey(bob, 'getDashboard'))).toEqual({ sample: 'bob' });
    expect(await storage.getItem(storageKey(alice, 'read', '/api/v1/dashboard'))).toBeNull();
  });

  it('keeps drafts and queries scoped by user and environment, then clears the departing user', async () => {
    const storage = memoryStorage();
    const drafts = createDraftStore(storage);
    const queryClient = new QueryClient();
    await drafts.save(alice, 'meal', { name: 'nasi' });
    await drafts.save(bob, 'meal', { name: 'soto' });
    await drafts.save({ environment: 'staging', userId: 'alice' }, 'meal', { name: 'staging' });
    queryClient.setQueryData(scopeKey(alice, 'getDashboard'), { sample: true });
    cachePhotoUri('alice-scan', 'file:///private/alice-photo.jpg');
    const mutationCache = queryClient.getMutationCache();
    mutationCache.build(queryClient, { mutationKey: scopeKey(alice, 'saveProfile') });
    mutationCache.build(queryClient, { mutationKey: scopeKey(bob, 'saveProfile') });
    expect(scopeKey(alice, 'getDashboard')).not.toEqual(scopeKey(bob, 'getDashboard'));
    await clearScopedData(alice, queryClient, storage);
    expect(await drafts.load(alice, 'meal')).toBeNull();
    expect(await drafts.load(bob, 'meal')).toEqual({ name: 'soto' });
    expect(await drafts.load({ environment: 'staging', userId: 'alice' }, 'meal')).toEqual({
      name: 'staging',
    });
    expect(queryClient.getQueryData(scopeKey(alice, 'getDashboard'))).toBeUndefined();
    expect(getCachedPhotoUri('alice-scan')).toBeUndefined();
    expect(mutationCache.findAll({ mutationKey: scopeKey(alice) })).toHaveLength(0);
    expect(mutationCache.findAll({ mutationKey: scopeKey(bob) })).toHaveLength(1);
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

  it('waits for the secure session cookie and sends it without implicit credentials', async () => {
    let resolveCookie!: (cookie: string) => void;
    const cookie = new Promise<string>((resolve) => {
      resolveCookie = resolve;
    });
    const fetcher = vi.fn(async () => Response.json({ sample: true }));
    const repo = createAppRepository({
      scope: alice,
      storage: memoryStorage(),
      connectivity: () => 'online',
      onUnauthorized: async () => {},
      getCookie: () => cookie,
      fetcher: fetcher as unknown as typeof fetch,
      baseUrl: 'https://api.test',
    });
    const request = repo.read('getDashboard', {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    const fetchCallsBeforeCookie = fetcher.mock.calls.length;

    resolveCookie('carin-dev.session=alice-cookie');
    await request;

    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(fetchCallsBeforeCookie).toBe(0);
    expect(new Headers(init.headers).get('cookie')).toBe('carin-dev.session=alice-cookie');
    expect(init.credentials).toBe('omit');
  });

  it('preserves idempotency headers and multipart bodies when adding the session cookie', async () => {
    const fetcher = vi.fn(async () => Response.json({ id: 'photo-1' }, { status: 201 }));
    const repo = createAppRepository({
      scope: alice,
      storage: memoryStorage(),
      connectivity: () => 'online',
      onUnauthorized: async () => {},
      getCookie: async () => 'carin-dev.session=alice-cookie',
      fetcher: fetcher as unknown as typeof fetch,
      baseUrl: 'https://api.test',
    });

    await repo.write('uploadPhoto', {
      headers: { 'Idempotency-Key': 'photo-action-1' },
      body: { file: new Blob(['jpeg'], { type: 'image/jpeg' }) },
    });

    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get('idempotency-key')).toBe('photo-action-1');
    expect(new Headers(init.headers).get('cookie')).toBe('carin-dev.session=alice-cookie');
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.credentials).toBe('omit');
  });

  it.each(['logout', 'account switch'])(
    'does not restore a departing user cache when a read write settles after %s',
    async (transition) => {
      const storage = memoryStorage();
      const bobKey = storageKey(bob, 'read', '/api/v1/dashboard');
      await storage.setItem(bobKey, JSON.stringify({ data: { sample: 'bob' }, updatedAt: 1 }));
      const originalSetItem = storage.setItem;
      let releaseWrite!: () => void;
      let writeStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        writeStarted = resolve;
      });
      const blocked = new Promise<void>((resolve) => {
        releaseWrite = resolve;
      });
      storage.setItem = async (key, value) => {
        writeStarted();
        await blocked;
        await originalSetItem(key, value);
      };
      let current: DataScope | null = alice;
      const queryClient = new QueryClient();
      queryClient.setQueryData(scopeKey(bob, 'getDashboard'), { sample: 'bob' });
      const repo = createAppRepository({
        scope: alice,
        storage,
        connectivity: () => 'online',
        onUnauthorized: async () => {},
        isCurrentScope: () => current === alice,
        fetcher: vi.fn(async () => Response.json({ sample: 'alice' })) as unknown as typeof fetch,
        baseUrl: 'https://api.test',
      });
      const read = repo.read('getDashboard', {});
      const readOutcome = expect(read).rejects.toThrow('Scope changed');
      await started;
      current = transition === 'logout' ? null : bob;
      const logout = clearScopedData(alice, queryClient, storage);
      await new Promise((resolve) => setTimeout(resolve, 0));
      releaseWrite();
      await Promise.all([logout, readOutcome]);
      expect(await storage.getItem(storageKey(alice, 'read', '/api/v1/dashboard'))).toBeNull();
      expect(await storage.getItem(bobKey)).not.toBeNull();
      expect(queryClient.getQueryData(scopeKey(bob, 'getDashboard'))).toEqual({ sample: 'bob' });
    }
  );

  it('removes a draft whose storage write is still pending during logout', async () => {
    const storage = memoryStorage();
    const originalSetItem = storage.setItem;
    let releaseWrite!: () => void;
    let writeStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      writeStarted = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    storage.setItem = async (key, value) => {
      writeStarted();
      await blocked;
      await originalSetItem(key, value);
    };
    const drafts = createDraftStore(storage);
    const save = drafts.save(alice, 'health', { condition: 'private' });
    await started;
    const logout = clearScopedData(alice, new QueryClient(), storage);
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseWrite();
    await Promise.all([save, logout]);
    expect(await drafts.load(alice, 'health')).toBeNull();
  });
});
