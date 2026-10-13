import { describe, expect, it, vi } from 'vitest';
import { createAppRepository, ApiError } from '@/lib/api/repository';
import type { StorageAdapter } from '@/lib/data/scope';
import type { components } from '@/lib/api/generated/app-api';

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

function repository(fetcher: typeof fetch) {
  return createAppRepository({
    scope: { environment: 'test', userId: 'profile-user' },
    storage: memoryStorage(),
    connectivity: () => 'online',
    onUnauthorized: async () => {},
    fetcher,
    baseUrl: 'https://api.test',
  });
}

const fields = {
  heightCm: null,
  weightKg: null,
  sexForReference: null,
  diagnoses: { state: 'not_provided', entries: [] },
  familyHistory: { state: 'not_provided', entries: [] },
  allergies: { state: 'not_provided', entries: [] },
  clinicianNotes: null,
  activity: null,
  smoking: null,
} satisfies components['schemas']['Profile']['fields'];

describe('profile API integration', () => {
  it('sends real condition search through the typed catalog operation', async () => {
    const fetcher = vi.fn(async () => Response.json([]));
    await repository(fetcher as unknown as typeof fetch).read('getConditions', {
      query: { q: 'diabetes tipe 2' },
    });

    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).pathname).toBe('/api/v1/catalog/conditions');
    expect(new URL(url).searchParams.get('q')).toBe('diabetes tipe 2');
    expect(init.method).toBe('GET');
  });

  it('preserves the profile draft request and reports a revision conflict', async () => {
    const fetcher = vi.fn(async () => Response.json({}, { status: 409 }));
    const repo = repository(fetcher as unknown as typeof fetch);

    await expect(
      repo.write('updateProfile', {
        headers: { 'Idempotency-Key': '8fd95ed0-89f4-4c61-8353-d098167d8ed2' },
        body: { expectedVersion: 4, fields },
      })
    ).rejects.toBeInstanceOf(ApiError);

    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/api/v1/profile');
    expect(init.method).toBe('PATCH');
    expect(new Headers(init.headers).get('idempotency-key')).toBe(
      '8fd95ed0-89f4-4c61-8353-d098167d8ed2'
    );
    expect(JSON.parse(String(init.body))).toEqual({ expectedVersion: 4, fields });
  });

  it('uses the latest settings revision and legal version for timezone and consent writes', async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true }));
    const repo = repository(fetcher as unknown as typeof fetch);

    await repo.write('updateMe', {
      headers: { 'Idempotency-Key': 'd824bc4b-17bd-4d39-9d96-f7c7d9d3c805' },
      body: { expectedRevision: 7, timezone: 'Asia/Jakarta' },
    });
    await repo.write('setAiConsent', {
      headers: { 'Idempotency-Key': '3e4b09ba-4658-472e-9b11-35f6125de83e' },
      body: { version: 'ai-v3', granted: true },
    });
    await repo.write('setAiConsent', {
      headers: { 'Idempotency-Key': '1f249bc3-4f6f-43ae-8f15-e0d13a30ec18' },
      body: { version: 'ai-v3', granted: false },
    });

    const calls = fetcher.mock.calls as unknown as [string, RequestInit][];
    expect(JSON.parse(String(calls[0]?.[1].body))).toEqual({
      expectedRevision: 7,
      timezone: 'Asia/Jakarta',
    });
    expect(calls.slice(1).map(([url]) => new URL(url).pathname)).toEqual([
      '/api/v1/consents/ai-processing',
      '/api/v1/consents/ai-processing',
    ]);
    expect(calls.slice(1).map(([, init]) => JSON.parse(String(init.body)))).toEqual([
      { version: 'ai-v3', granted: true },
      { version: 'ai-v3', granted: false },
    ]);
  });
});
