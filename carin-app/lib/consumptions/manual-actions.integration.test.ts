import { describe, expect, it, vi } from 'vitest';
import type { AppRequestInput } from '@/lib/api/contracts';
import type { AppResponse } from '@/lib/api/repository';
import { createAppRepository } from '@/lib/api/repository';
import { OfflineError } from '@/lib/data/network';
import type { DataScope, StorageAdapter } from '@/lib/data/scope';
import { createDraftStore } from '@/lib/data/drafts';
import { createManualConsumptionActions } from './manual-actions';
import type { ManualConsumptionDraft, ManualConsumptionInput } from './consumption';

class MemoryStorage implements StorageAdapter {
  private readonly values = new Map<string, string>();

  async getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  async getAllKeys() {
    return [...this.values.keys()];
  }

  async removeItem(key: string) {
    this.values.delete(key);
  }
}

const scope: DataScope = { environment: 'test', userId: 'user-1' };
const persistedDraft: ManualConsumptionDraft = {
  consumedDate: '2026-10-14',
  consumedTime: '12:30',
  catalogVersion: 'catalog-v3',
  components: [
    {
      id: 'e15a4bd1-f98a-4abc-9f21-a0c1d3e78510',
      displayName: 'Makanan rumahan',
      catalogFoodId: null,
      preparation: null,
      portion: { kind: 'unknown' },
    },
  ],
};
const request: ManualConsumptionInput = {
  source: 'manual',
  scanId: null,
  sourceAnalysisResultId: null,
  occurrence: 'new_occurrence',
  consumedAt: '2026-10-14T05:30:00.000Z',
  timezone: 'Asia/Jakarta',
  catalogVersion: 'catalog-v3',
  components: [
    {
      id: 'e15a4bd1-f98a-4abc-9f21-a0c1d3e78510',
      displayName: 'Makanan rumahan',
      catalogFoodId: null,
      preparation: null,
      portion: { kind: 'unknown' },
    },
  ],
};

describe('manual consumption retry and draft persistence', () => {
  it('keeps an offline draft without queueing a write, then reuses the key after timeout', async () => {
    const storage = new MemoryStorage();
    const drafts = createDraftStore(storage);
    await drafts.save(scope, 'manual-consumption:create:draft-1', persistedDraft);
    let connectivity: 'online' | 'offline' = 'offline';
    const fetcher = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockRejectedValueOnce(new TypeError('request timed out'))
      .mockResolvedValueOnce(Response.json({ id: 'consumption-1' }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ id: 'consumption-1' }, { status: 200 }));
    const repository = createAppRepository({
      scope,
      storage,
      connectivity: () => connectivity,
      onUnauthorized: async () => {},
      fetcher: fetcher as unknown as typeof fetch,
      baseUrl: 'https://api.test',
    });
    const api = {
      create: (input: AppRequestInput<'createConsumption'>) =>
        repository.write('createConsumption', input),
      update: (input: AppRequestInput<'updateConsumption'>) =>
        repository.write('updateConsumption', input),
      delete: (input: AppRequestInput<'deleteConsumption'>) =>
        repository.write('deleteConsumption', input),
    };
    const makeKey = vi.fn(() => '00000000-0000-4000-8000-000000000051');
    const first = createManualConsumptionActions({ scope, storage, api, makeKey });

    await expect(first.create('draft-1', request)).rejects.toBeInstanceOf(OfflineError);
    expect(fetcher).not.toHaveBeenCalled();
    expect(await drafts.load(scope, 'manual-consumption:create:draft-1')).toEqual(persistedDraft);

    connectivity = 'online';
    const reopenedAfterOffline = createManualConsumptionActions({ scope, storage, api, makeKey });
    await expect(reopenedAfterOffline.create('draft-1', request)).rejects.toThrow(
      'request timed out'
    );
    const reopenedAfterTimeout = createManualConsumptionActions({ scope, storage, api, makeKey });
    await expect(reopenedAfterTimeout.create('draft-1', request)).resolves.toMatchObject({
      id: 'consumption-1',
    });
    const reopenedAfterAcknowledgement = createManualConsumptionActions({
      scope,
      storage,
      api,
      makeKey,
    });
    await expect(reopenedAfterAcknowledgement.create('draft-1', request)).resolves.toMatchObject({
      id: 'consumption-1',
    });

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(makeKey).toHaveBeenCalledTimes(1);
    const calls = fetcher.mock.calls as unknown as [string, RequestInit][];
    for (const [, init] of calls) {
      expect(new Headers(init.headers).get('idempotency-key')).toBe(
        '00000000-0000-4000-8000-000000000051'
      );
      expect(JSON.parse(String(init.body))).toEqual(request);
    }
  });

  it('reopens an offline draft and replays a timed-out save with the same idempotency key', async () => {
    const storage = new MemoryStorage();
    const drafts = createDraftStore(storage);
    await drafts.save(scope, 'manual-consumption:draft-1', persistedDraft);
    const create = vi
      .fn<
        (input: AppRequestInput<'createConsumption'>) => Promise<AppResponse<'createConsumption'>>
      >()
      .mockRejectedValueOnce(new TypeError('request timed out'))
      .mockResolvedValueOnce({
        id: 'consumption-1',
      } as unknown as AppResponse<'createConsumption'>);
    const makeKey = vi.fn<() => string>().mockReturnValue('00000000-0000-4000-8000-000000000021');

    const firstScreen = createManualConsumptionActions({
      scope,
      storage,
      api: { create, update: vi.fn(), delete: vi.fn() },
      makeKey,
    });
    await expect(firstScreen.create('draft-1', request)).rejects.toThrow('timed out');

    const reopened = await drafts.load<ManualConsumptionDraft>(scope, 'manual-consumption:draft-1');
    const secondScreen = createManualConsumptionActions({
      scope,
      storage,
      api: { create, update: vi.fn(), delete: vi.fn() },
      makeKey,
    });
    expect(reopened).toEqual(persistedDraft);
    await secondScreen.create('draft-1', request);

    const firstRequest = create.mock.calls[0]?.[0];
    const retryRequest = create.mock.calls[1]?.[0];
    expect(firstRequest).toEqual(retryRequest);
    expect(firstRequest).toEqual({
      headers: { 'Idempotency-Key': '00000000-0000-4000-8000-000000000021' },
      body: request,
    });
    expect(makeKey).toHaveBeenCalledTimes(1);
  });

  it('does not reuse one user’s pending request key for another user', async () => {
    const storage = new MemoryStorage();
    const create = vi
      .fn<
        (input: AppRequestInput<'createConsumption'>) => Promise<AppResponse<'createConsumption'>>
      >()
      .mockRejectedValue(new TypeError('request timed out'));
    const makeKey = vi
      .fn<() => string>()
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000031')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000032');
    const first = createManualConsumptionActions({
      scope,
      storage,
      api: { create, update: vi.fn(), delete: vi.fn() },
      makeKey,
    });
    const otherUser = createManualConsumptionActions({
      scope: { ...scope, userId: 'user-2' },
      storage,
      api: { create, update: vi.fn(), delete: vi.fn() },
      makeKey,
    });

    await expect(first.create('draft-1', request)).rejects.toThrow('timed out');
    await expect(otherUser.create('draft-1', request)).rejects.toThrow('timed out');

    expect(create.mock.calls[0]?.[0].headers?.['Idempotency-Key']).not.toBe(
      create.mock.calls[1]?.[0].headers?.['Idempotency-Key']
    );
  });

  it('replays timed-out edit and delete commands with their original request keys', async () => {
    const update = vi
      .fn<
        (input: AppRequestInput<'updateConsumption'>) => Promise<AppResponse<'updateConsumption'>>
      >()
      .mockRejectedValueOnce(new TypeError('edit timed out'))
      .mockResolvedValueOnce({
        id: 'consumption-1',
      } as unknown as AppResponse<'updateConsumption'>);
    const remove = vi
      .fn<(input: AppRequestInput<'deleteConsumption'>) => Promise<undefined>>()
      .mockRejectedValueOnce(new TypeError('delete timed out'))
      .mockResolvedValueOnce(undefined);
    const makeKey = vi
      .fn<() => string>()
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000041')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000042');
    const payload = {
      expectedRevision: 2,
      consumedAt: request.consumedAt,
      timezone: request.timezone,
      components: request.components,
      catalogVersion: request.catalogVersion,
    };

    const persistentStorage = new MemoryStorage();
    const firstSession = createManualConsumptionActions({
      scope,
      storage: persistentStorage,
      api: { create: vi.fn(), update, delete: remove },
      makeKey,
    });
    await expect(firstSession.update('consumption-1', 'edit-1', payload)).rejects.toThrow(
      'edit timed out'
    );
    const secondSession = createManualConsumptionActions({
      scope,
      storage: persistentStorage,
      api: { create: vi.fn(), update, delete: remove },
      makeKey,
    });
    await secondSession.update('consumption-1', 'edit-1', payload);
    await expect(secondSession.delete('consumption-1')).rejects.toThrow('delete timed out');
    const thirdSession = createManualConsumptionActions({
      scope,
      storage: persistentStorage,
      api: { create: vi.fn(), update: vi.fn(), delete: remove },
      makeKey,
    });
    await thirdSession.delete('consumption-1');

    expect(update.mock.calls[0]?.[0].headers?.['Idempotency-Key']).toBe(
      update.mock.calls[1]?.[0].headers?.['Idempotency-Key']
    );
    expect(remove.mock.calls[0]?.[0].headers?.['Idempotency-Key']).toBe(
      remove.mock.calls[1]?.[0].headers?.['Idempotency-Key']
    );
  });
});
