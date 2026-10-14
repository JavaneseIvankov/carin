import { describe, expect, it } from 'vitest';
import { createAppRepository } from '@/lib/api/repository';
import { createDraftStore } from '@/lib/data/drafts';
import { getCorrectionErrorMessage } from './correction';

function makeRepository(fetcher: typeof fetch) {
  return createAppRepository({
    scope: { environment: 'test', userId: 'user-1' },
    storage: {
      getItem: async () => null,
      setItem: async () => {},
      getAllKeys: async () => [],
      removeItem: async () => {},
    },
    connectivity: () => 'online',
    onUnauthorized: async () => {},
    fetcher,
    baseUrl: 'https://api.example.test',
  });
}

describe('food correction API integration', () => {
  it('sends the frozen catalog, result reference, revision, and serving portion to the scan correction route', async () => {
    const requests: { url: string; init: RequestInit }[] = [];
    const repository = makeRepository(async (input, init) => {
      requests.push({ url: String(input), init: init ?? {} });
      return new Response(
        JSON.stringify({
          id: '50000000-0000-4000-8000-000000000001',
          status: 'queued',
          inputKind: 'correction',
        }),
        { status: 202, headers: { 'content-type': 'application/json' } }
      );
    });

    await repository.write('correctScan', {
      path: { id: '30000000-0000-4000-8000-000000000001' },
      headers: { 'Idempotency-Key': 'request-1' },
      body: {
        expectedRevision: 3,
        basedOnResultId: '40000000-0000-4000-8000-000000000001',
        catalogVersion: 'catalog-v7',
        components: [
          {
            id: '10000000-0000-4000-8000-000000000001',
            catalogFoodId: 'food-oat',
            displayName: 'Oatmeal',
            preparation: 'direbus',
            portion: { kind: 'known', quantity: 0.5, servingId: 'serving-cup', unit: 'serving' },
          },
        ],
      },
    });

    expect(requests[0]?.url).toBe(
      'https://api.example.test/api/v1/scans/30000000-0000-4000-8000-000000000001/corrections'
    );
    expect(new Headers(requests[0]?.init.headers).get('idempotency-key')).toBe('request-1');
    expect(JSON.parse(String(requests[0]?.init.body))).toMatchObject({
      expectedRevision: 3,
      basedOnResultId: '40000000-0000-4000-8000-000000000001',
      catalogVersion: 'catalog-v7',
      components: [{ portion: { kind: 'known', quantity: 0.5, unit: 'serving' } }],
    });
  });

  it('surfaces a server 409 as a refreshable conflict while retaining the correction draft', async () => {
    const repository = makeRepository(
      async () =>
        new Response(JSON.stringify({ error: { code: 'STALE_REVISION' } }), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        })
    );

    await expect(
      repository.write('correctScan', {
        path: { id: '30000000-0000-4000-8000-000000000001' },
        headers: { 'Idempotency-Key': 'request-2' },
        body: {
          expectedRevision: 3,
          basedOnResultId: '40000000-0000-4000-8000-000000000001',
          catalogVersion: 'catalog-v7',
          components: [
            {
              id: '10000000-0000-4000-8000-000000000001',
              catalogFoodId: null,
              displayName: 'Makanan bebas',
              preparation: null,
              portion: { kind: 'unknown' },
            },
          ],
        },
      })
    ).rejects.toMatchObject({ status: 409 });

    expect(getCorrectionErrorMessage(409)).toMatch(/Muat ulang status/i);
  });

  it('keeps a correction draft available after a failed job so the user can retry or return explicitly', async () => {
    const values = new Map<string, string>();
    const drafts = createDraftStore({
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => void values.set(key, value),
      getAllKeys: async () => [...values.keys()],
      removeItem: async (key) => void values.delete(key),
    });
    const scope = { environment: 'test', userId: 'user-1' };
    const correction = [
      {
        id: '10000000-0000-4000-8000-000000000001',
        catalogFoodId: 'food-oat',
        displayName: 'Oatmeal',
        preparation: 'direbus',
        portion: { kind: 'unknown' as const },
      },
    ];

    await drafts.save(scope, 'food-correction:scan-1:result-1', correction);
    const afterFailure = await drafts.load<typeof correction>(
      scope,
      'food-correction:scan-1:result-1'
    );

    expect(afterFailure).toEqual(correction);
  });
});
