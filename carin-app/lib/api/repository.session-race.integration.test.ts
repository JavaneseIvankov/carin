import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, createAppRepository } from './repository';
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
  it('uses browser credentials for web requests without reading native cookie storage', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    const repository = createAppRepository({
      scope: alice,
      storage: memoryStorage(),
      connectivity: () => 'online',
      onUnauthorized: async () => {},
      credentials: 'include',
      fetcher: fetcher as unknown as typeof fetch,
      baseUrl: 'https://api.test',
    });
    await repository.write('deleteConsumption', {
      path: { id: 'entry-1' },
      headers: { 'Idempotency-Key': 'delete-1' },
    });
    expect(fetcher).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: 'include' })
    );
    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(headers.has('Cookie')).toBe(false);
  });

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

  it('preserves the structured reason for an examination revision conflict', async () => {
    const repository = createAppRepository({
      scope: alice,
      storage: memoryStorage(),
      connectivity: () => 'online',
      onUnauthorized: async () => {},
      fetcher: (async () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'REVISION_CONFLICT',
              message: 'Examination has changed',
              retryable: false,
              requestId: 'request-1',
              details: {},
            },
          }),
          { status: 409, headers: { 'content-type': 'application/json' } }
        )) as typeof fetch,
      baseUrl: 'https://api.test',
    });

    const outcome = repository.write('updateExamination', {
      path: { id: 'examination-1' },
      headers: { 'Idempotency-Key': 'update-1' },
      body: {
        expectedRevision: 1,
        record: {
          type: 'glucose',
          value: 100,
          unit: 'mg/dL',
          context: 'fasting',
          measuredOn: '2026-10-14',
          measuredTime: null,
          timezone: 'Asia/Jakarta',
          note: null,
        },
      },
    });

    await expect(outcome).rejects.toBeInstanceOf(ApiError);
    await expect(outcome).rejects.toMatchObject({ status: 409, code: 'REVISION_CONFLICT' });
  });
});
