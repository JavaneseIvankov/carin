import { describe, expect, it, vi } from 'vitest';
import type { AppRequestInput } from '@/lib/api/contracts';
import { storageKey, type DataScope, type StorageAdapter } from '@/lib/data/scope';
import { createManualConsumptionActions } from './manual-actions';
import type { ManualConsumptionInput } from './consumption';

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

function manualInput(name = 'Nasi goreng'): ManualConsumptionInput {
  return {
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
        displayName: name,
        catalogFoodId: null,
        preparation: null,
        portion: { kind: 'unknown' },
      },
    ],
  };
}

describe('manual consumption action keys', () => {
  it('uses a different request key when a previously failed payload changes', async () => {
    const storage = new MemoryStorage();
    const create = vi.fn(async (_input: AppRequestInput<'createConsumption'>) => {
      throw new Error('timeout');
    });
    const actions = createManualConsumptionActions({
      scope,
      storage,
      api: { create, update: vi.fn(), delete: vi.fn() },
      makeKey: vi
        .fn<() => string>()
        .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
        .mockReturnValueOnce('00000000-0000-4000-8000-000000000002'),
    });

    await expect(actions.create('draft-1', manualInput())).rejects.toThrow('timeout');
    await expect(actions.create('draft-1', manualInput('Sup ayam'))).rejects.toThrow('timeout');

    expect(create.mock.calls[0]?.[0].headers?.['Idempotency-Key']).toBe(
      '00000000-0000-4000-8000-000000000001'
    );
    expect(create.mock.calls[1]?.[0].headers?.['Idempotency-Key']).toBe(
      '00000000-0000-4000-8000-000000000002'
    );
  });

  it('keeps edit and delete requests explicitly scoped and independently keyed', async () => {
    const storage = new MemoryStorage();
    const update = vi.fn(
      async (_input: AppRequestInput<'updateConsumption'>) => ({ id: 'consumption-1' }) as never
    );
    const remove = vi.fn(async (_input: AppRequestInput<'deleteConsumption'>) => undefined);
    const actions = createManualConsumptionActions({
      scope,
      storage,
      api: { create: vi.fn(), update, delete: remove },
      makeKey: vi
        .fn<() => string>()
        .mockReturnValueOnce('00000000-0000-4000-8000-000000000011')
        .mockReturnValueOnce('00000000-0000-4000-8000-000000000012'),
    });

    await actions.update('consumption-1', 'edit-draft-1', {
      expectedRevision: 2,
      consumedAt: '2026-10-14T05:30:00.000Z',
      timezone: 'Asia/Jakarta',
      components: manualInput().components,
      catalogVersion: 'catalog-v3',
    });
    await actions.delete('consumption-1');

    expect(update.mock.calls[0]?.[0]).toMatchObject({
      path: { id: 'consumption-1' },
      headers: { 'Idempotency-Key': '00000000-0000-4000-8000-000000000011' },
    });
    expect(remove.mock.calls[0]?.[0]).toMatchObject({
      path: { id: 'consumption-1' },
      headers: { 'Idempotency-Key': '00000000-0000-4000-8000-000000000012' },
    });
    const updateKey = storageKey(
      scope,
      'draft',
      'manual-request:consumption-1:update:edit-draft-1'
    );
    const deleteKey = storageKey(scope, 'draft', 'manual-request:consumption-1:delete');
    expect(await storage.getItem(updateKey)).not.toBeNull();
    expect(await storage.getItem(deleteKey)).not.toBeNull();
    await actions.clearUpdate('consumption-1', 'edit-draft-1');
    await actions.clearDelete('consumption-1');
    expect(await storage.getItem(updateKey)).toBeNull();
    expect(await storage.getItem(deleteKey)).toBeNull();
  });
});
