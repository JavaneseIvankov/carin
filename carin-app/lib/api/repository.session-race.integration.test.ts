import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { createAppRepository } from './repository';
import {
  clearScopedData,
  StaleScopeError,
  type DataScope,
  type StorageAdapter,
} from '@/lib/data/scope';

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

describe('repository auth scope races', () => {
  it('does not dispatch an old write with the next account cookie', async () => {
    const storage = memoryStorage();
    const queryClient = new QueryClient();
    let currentScope: DataScope | null = alice;
    let resolveCookie!: (cookie: string) => void;
    let cookieRequested!: () => void;
    const requested = new Promise<void>((resolve) => {
      cookieRequested = resolve;
    });
    const cookie = new Promise<string>((resolve) => {
      resolveCookie = resolve;
    });
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    const repository = createAppRepository({
      scope: alice,
      storage,
      connectivity: () => 'online',
      onUnauthorized: async () => {},
      isCurrentScope: () => currentScope?.userId === 'alice',
      getCookie: () => {
        cookieRequested();
        return cookie;
      },
      fetcher: fetcher as unknown as typeof fetch,
      baseUrl: 'https://api.test',
    });

    const operation = repository.write('deleteConsumption', {
      path: { id: 'entry-1' },
      headers: { 'Idempotency-Key': 'delete-1' },
    });
    const outcome = operation.then(
      () => null,
      (error: unknown) => error
    );
    await requested;

    currentScope = null;
    await clearScopedData(alice, queryClient, storage);
    currentScope = bob;
    resolveCookie('carin-dev.session=bob-cookie');

    const error = await outcome;

    expect(error).toBeInstanceOf(StaleScopeError);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
