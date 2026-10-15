import type { AppRequestInput } from '@/lib/api/contracts';
import type { AppResponse } from '@/lib/api/repository';
import { createDraftStore } from '@/lib/data/drafts';
import type { DataScope, StorageAdapter } from '@/lib/data/scope';
import { createIdempotencyKey } from '@/lib/profile/profile';
import type { components } from '@/lib/api/generated/app-api';

type ConsumptionUpdate = components['schemas']['ConsumptionUpdate'];
type PendingRequest = { payload: string; key: string };

type ManualConsumptionApi = {
  create: (
    input: AppRequestInput<'createConsumption'>
  ) => Promise<AppResponse<'createConsumption'>>;
  update: (
    input: AppRequestInput<'updateConsumption'>
  ) => Promise<AppResponse<'updateConsumption'>>;
  delete: (
    input: AppRequestInput<'deleteConsumption'>
  ) => Promise<AppResponse<'deleteConsumption'>>;
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function createManualConsumptionActions(options: {
  scope: DataScope;
  storage: StorageAdapter;
  api: ManualConsumptionApi;
  makeKey?: () => string;
}) {
  const store = createDraftStore(options.storage);
  const makeKey = options.makeKey ?? createIdempotencyKey;
  const inFlight = new Map<string, { payload: string; promise: Promise<unknown> }>();

  function run<T>(
    actionId: string,
    payload: unknown,
    send: (key: string) => Promise<T>
  ): Promise<T> {
    const serializedPayload = stableJson(payload);
    const existing = inFlight.get(actionId);
    if (existing) {
      if (existing.payload === serializedPayload) return existing.promise as Promise<T>;
      return Promise.reject(new Error('Permintaan sebelumnya masih berjalan.'));
    }

    const stateName = `manual-request:${actionId}`;
    const promise = (async () => {
      const previous = await store.load<PendingRequest>(options.scope, stateName);
      const pending =
        previous?.payload === serializedPayload
          ? previous
          : { payload: serializedPayload, key: makeKey() };
      await store.save(options.scope, stateName, pending);
      return send(pending.key);
    })();
    const entry = { payload: serializedPayload, promise };
    inFlight.set(actionId, entry);
    void promise.then(
      () => {
        if (inFlight.get(actionId) === entry) inFlight.delete(actionId);
      },
      () => {
        if (inFlight.get(actionId) === entry) inFlight.delete(actionId);
      }
    );
    return promise;
  }

  return {
    create(draftId: string, body: components['schemas']['ConsumptionCreate']) {
      return run(`create:${draftId}`, body, (key) =>
        options.api.create({ headers: { 'Idempotency-Key': key }, body })
      );
    },
    update(id: string, draftId: string, body: ConsumptionUpdate) {
      return run(`${id}:update:${draftId}`, { id, body }, (key) =>
        options.api.update({
          path: { id },
          headers: { 'Idempotency-Key': key },
          body,
        })
      );
    },
    delete(id: string) {
      return run(`${id}:delete`, { id }, (key) =>
        options.api.delete({ path: { id }, headers: { 'Idempotency-Key': key } })
      );
    },
    clearCreate(draftId: string) {
      return store.remove(options.scope, `manual-request:create:${draftId}`);
    },
    clearUpdate(id: string, draftId: string) {
      return store.remove(options.scope, `manual-request:${id}:update:${draftId}`);
    },
    clearDelete(id: string) {
      return store.remove(options.scope, `manual-request:${id}:delete`);
    },
  };
}
