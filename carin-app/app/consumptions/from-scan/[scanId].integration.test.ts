import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { components } from '@/lib/api/generated/app-api';
import { createAppRepository, ApiError } from '@/lib/api/repository';
import { createDraftStore } from '@/lib/data/drafts';
import type { DataScope, StorageAdapter } from '@/lib/data/scope';
import { createManualConsumptionActions } from '@/lib/consumptions/manual-actions';
import { createPhotoConfirmationDraft } from '@/lib/consumptions/photo-confirmation';
import {
  createPhotoConfirmationRouteGuard,
  createPhotoConfirmationFlow,
  photoConfirmationDraftName,
} from '@/lib/consumptions/photo-confirmation-flow';

type AnalysisJob = components['schemas']['AnalysisJob'];
type AnalysisResult = components['schemas']['ai__AnalysisResult'];
type Scan = components['schemas']['Scan'];

const scope: DataScope = { environment: 'test', userId: 'user-1' };

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

function makeScan(fields: Partial<Scan> = {}): Scan {
  return {
    createdAt: '2026-10-14T04:00:00.000Z',
    defaultConsumptionId: null,
    id: 'scan-1',
    latestJobId: 'job-1',
    latestResultId: 'result-1',
    photoId: 'photo-1',
    revision: 2,
    ...fields,
  } as Scan;
}

function makeJob(fields: Partial<AnalysisJob> = {}): AnalysisJob {
  return {
    attempts: 1,
    createdAt: '2026-10-14T04:00:00.000Z',
    error: null,
    finishedAt: '2026-10-14T04:01:00.000Z',
    id: 'job-1',
    inputKind: 'photo',
    result: null,
    resultId: 'result-1',
    scanId: 'scan-1',
    startedAt: '2026-10-14T04:00:10.000Z',
    status: 'completed',
    targetId: 'scan-1',
    targetRevision: 2,
    targetType: 'scan',
    ...fields,
  } as AnalysisJob;
}

function makeResult(fields: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    attentions: [],
    catalogVersion: 'catalog-v5',
    components: [
      {
        id: 'component-1',
        displayName: 'Nasi goreng',
        catalogFoodId: 'food-rice',
        preparation: 'digoreng',
        matchStatus: 'matched',
        nutrients: {},
        nutrientSourceIds: {},
        per100g: {},
        portion: {
          basis: 'porsi',
          grams: 125,
          origin: 'photo_estimate',
          quantity: 125,
          servingId: null,
          sourceId: null,
          unit: 'g',
        },
        sourceIds: [],
      },
    ],
    computedAt: '2026-10-14T04:00:00.000Z',
    contractVersion: '1.0.0',
    coverage: {},
    dataMode: 'synthetic',
    inputKind: 'photo',
    limitations: [],
    nutritionDatasetVersion: 'nutrition-v1',
    operationId: 'job-operation-1',
    overallAttention: 'insufficient_information',
    profileVersion: 1,
    ruleSetVersion: 'rules-v1',
    sources: [],
    supportStatus: 'partial',
    totals: {},
    ...fields,
  } as AnalysisResult;
}

function read<T>(data: T, stale = false) {
  return { data, stale, updatedAt: 1 };
}

function errorWithCode(code: string) {
  return Object.assign(new ApiError(409, code), { code });
}

function createHarness(
  options: {
    occurrence?: 'default_confirmation' | 'new_occurrence';
    useLastSuccessfulResult?: boolean;
    onCreate?: (input: unknown, remote: RemoteState) => Promise<unknown>;
    storage?: MemoryStorage;
  } = {}
) {
  const storage = options.storage ?? new MemoryStorage();
  const remote: RemoteState = {
    me: { timezone: 'Asia/Jakarta' },
    scan: makeScan(),
    jobs: new Map([['job-1', makeJob()]]),
    results: new Map([['result-1', makeResult()]]),
  };
  const getMe = vi.fn(async () => read(remote.me));
  const getScan = vi.fn(async (id: string) => read(remote.scan));
  const getAnalysisJob = vi.fn(async (id: string) => {
    const found = remote.jobs.get(id);
    if (!found) throw new Error(`Missing job ${id}`);
    return read(found);
  });
  const getAnalysisResult = vi.fn(async (id: string) => {
    const found = remote.results.get(id);
    if (!found) throw new Error(`Missing result ${id}`);
    return read(found);
  });
  const api = { getMe, getScan, getAnalysisJob, getAnalysisResult };
  const create = vi.fn(async (input: unknown) =>
    options.onCreate ? options.onCreate(input, remote) : { id: 'consumption-saved' }
  );
  const makeKey = vi.fn(() => '00000000-0000-4000-8000-000000000101');
  const actions = createManualConsumptionActions({
    scope,
    storage,
    api: { create: create as never, update: vi.fn() as never, delete: vi.fn() as never },
    makeKey,
  });
  const connectivity = { current: 'online' as 'online' | 'offline' | 'unknown' };
  const flow = createPhotoConfirmationFlow({
    scanId: 'scan-1',
    occurrence: options.occurrence ?? 'default_confirmation',
    useLastSuccessfulResult: options.useLastSuccessfulResult ?? false,
    scope,
    storage,
    api: api as never,
    actions,
    connectivity: () => connectivity.current,
    now: () => new Date('2026-10-14T05:30:00.000Z'),
  });

  return { flow, storage, remote, api, create, makeKey, connectivity, actions };
}

type RemoteState = {
  me: { timezone: string };
  scan: Scan;
  jobs: Map<string, AnalysisJob>;
  results: Map<string, AnalysisResult>;
};

describe('photo consumption route flow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('follows the scan latest job and result IDs and persists a scoped draft for confirmation', async () => {
    const harness = createHarness({ occurrence: 'new_occurrence' });
    const snapshot = await harness.flow.load();

    expect(harness.api.getMe).toHaveBeenCalledOnce();
    expect(harness.api.getScan).toHaveBeenCalledWith('scan-1');
    expect(harness.api.getAnalysisJob).toHaveBeenCalledWith('job-1');
    expect(harness.api.getAnalysisResult).toHaveBeenCalledWith('result-1');
    expect(snapshot.availability).toBe('confirm');
    expect(snapshot.record?.sourceResultId).toBe('result-1');

    const saved = await createDraftStore(harness.storage).load(
      scope,
      photoConfirmationDraftName('scan-1', 'new_occurrence')
    );
    expect(saved).toEqual(snapshot.record);
  });

  it('uses Asia/Jakarta when the account read succeeds without a timezone', async () => {
    const harness = createHarness({ occurrence: 'new_occurrence' });
    harness.remote.me.timezone = '   ';

    const snapshot = await harness.flow.load();

    expect(snapshot.availability).toBe('confirm');
    expect(snapshot.record?.timeZone).toBe('Asia/Jakarta');
  });

  it('uses Asia/Jakarta when the successful account response omits timezone', async () => {
    const harness = createHarness({ occurrence: 'new_occurrence' });
    delete (harness.remote.me as Partial<{ timezone: string }>).timezone;

    const snapshot = await harness.flow.load();

    expect(snapshot.availability).toBe('confirm');
    expect(snapshot.record?.timeZone).toBe('Asia/Jakarta');
  });

  it('does not create a draft or allow a save when the account timezone read fails', async () => {
    const harness = createHarness({ occurrence: 'new_occurrence' });
    harness.api.getMe.mockRejectedValueOnce(new Error('temporary /me timeout'));

    const snapshot = await harness.flow.load();
    const afterSubmit = await harness.flow.submit(
      createPhotoConfirmationDraft(
        makeResult(),
        new Date('2026-10-14T05:30:00.000Z'),
        'Asia/Jakarta'
      )
    );

    expect(snapshot.availability).toBe('unavailable');
    expect(snapshot.record).toBeUndefined();
    expect(snapshot.loadError).toBeInstanceOf(Error);
    expect(afterSubmit.record).toBeUndefined();
    expect(harness.create).not.toHaveBeenCalled();
  });

  it('uses the timezone from a previously persisted photo draft if /me is temporarily unavailable', async () => {
    const harness = createHarness({ occurrence: 'new_occurrence' });
    harness.remote.me.timezone = 'Pacific/Auckland';
    const initial = await harness.flow.load();
    harness.api.getMe.mockRejectedValueOnce(new Error('temporary /me timeout'));

    const restored = await harness.flow.load();

    expect(restored.availability).toBe('confirm');
    expect(restored.record?.timeZone).toBe(initial.record?.timeZone);
  });

  it('does not expose the form while a latest correction is pending or no result exists', async () => {
    const pending = createHarness({ occurrence: 'new_occurrence' });
    pending.remote.jobs.set(
      'job-1',
      makeJob({ status: 'processing', inputKind: 'correction', targetRevision: 3 })
    );
    const pendingSnapshot = await pending.flow.load();
    expect(pendingSnapshot.availability).toBe('correction_pending');
    expect(pendingSnapshot.record).toBeUndefined();

    const noResult = createHarness({ occurrence: 'new_occurrence' });
    noResult.remote.scan = makeScan({ latestResultId: null });
    const unavailable = await noResult.flow.load();
    expect(unavailable.availability).toBe('unavailable');
    expect(unavailable.record).toBeUndefined();
    expect(noResult.api.getAnalysisResult).not.toHaveBeenCalled();
  });

  it('opens a saved default record before analysis gates, while new occurrences remain gated', async () => {
    const defaultRecord = createHarness();
    defaultRecord.remote.scan = makeScan({ defaultConsumptionId: 'consumption-existing' });
    defaultRecord.remote.jobs.set(
      'job-1',
      makeJob({ status: 'processing', inputKind: 'correction', targetRevision: 3 })
    );
    const openExisting = await defaultRecord.flow.load();
    expect(openExisting.availability).toBe('open_existing');
    expect(openExisting.scan?.defaultConsumptionId).toBe('consumption-existing');
    expect(defaultRecord.api.getAnalysisJob).not.toHaveBeenCalled();

    const newOccurrence = createHarness({ occurrence: 'new_occurrence' });
    newOccurrence.remote.scan = makeScan({
      defaultConsumptionId: 'consumption-existing',
      latestResultId: null,
    });
    const gated = await newOccurrence.flow.load();
    expect(gated.availability).toBe('unavailable');
  });

  it('requires the explicit last-successful-result choice after a failed correction', async () => {
    const failed = createHarness({ occurrence: 'new_occurrence' });
    failed.remote.jobs.set(
      'job-1',
      makeJob({ status: 'failed', inputKind: 'correction', resultId: null, targetRevision: 3 })
    );
    const blocked = await failed.flow.load();
    expect(blocked.availability).toBe('unavailable');
    expect(blocked.record).toBeUndefined();

    const selected = createHarness({ occurrence: 'new_occurrence', useLastSuccessfulResult: true });
    selected.remote.jobs.set(
      'job-1',
      makeJob({ status: 'failed', inputKind: 'correction', resultId: null, targetRevision: 3 })
    );
    const confirmed = await selected.flow.load();
    expect(confirmed.availability).toBe('confirm');
    expect(confirmed.record?.sourceResultId).toBe('result-1');
  });

  it('refetches scan, latest job, and latest result before submit and blocks a stale draft', async () => {
    const harness = createHarness({ occurrence: 'new_occurrence' });
    const loaded = await harness.flow.load();
    expect(loaded.record).toBeDefined();

    harness.remote.scan = makeScan({ latestJobId: 'job-2', latestResultId: 'result-2' });
    harness.remote.jobs.set('job-2', makeJob({ id: 'job-2', resultId: 'result-2' }));
    harness.remote.results.set('result-2', makeResult());
    const afterSubmit = await harness.flow.submit(loaded.record!.form);

    expect(harness.api.getScan).toHaveBeenCalledTimes(2);
    expect(harness.api.getAnalysisJob).toHaveBeenLastCalledWith('job-2');
    expect(harness.api.getAnalysisResult).toHaveBeenLastCalledWith('result-2');
    expect(afterSubmit.availability).toBe('unavailable');
    expect(afterSubmit.record?.sourceResultId).toBe('result-1');
    expect(harness.create).not.toHaveBeenCalled();
  });

  it('does not attempt a write when offline and retains the draft', async () => {
    const harness = createHarness({ occurrence: 'new_occurrence' });
    const loaded = await harness.flow.load();
    harness.connectivity.current = 'offline';

    const afterSubmit = await harness.flow.submit(loaded.record!.form);

    expect(harness.create).not.toHaveBeenCalled();
    expect(afterSubmit.record).toEqual(loaded.record);
    expect(afterSubmit.submitMessage).toContain('Perlu koneksi internet');
  });

  it('retries an identical ambiguous save with the same draft ID and idempotency key', async () => {
    const calls: unknown[] = [];
    let attempt = 0;
    const harness = createHarness({
      occurrence: 'new_occurrence',
      onCreate: async (input) => {
        calls.push(input);
        attempt += 1;
        if (attempt === 1) throw new TypeError('request timed out');
        return { id: 'consumption-from-server' };
      },
    });
    const loaded = await harness.flow.load();
    const failed = await harness.flow.submit(loaded.record!.form);
    expect(failed.record).toEqual(loaded.record);
    expect(failed.submitMessage).toContain('Layanan belum tersedia');

    const saved = await harness.flow.submit(loaded.record!.form);

    expect(saved.savedId).toBe('consumption-from-server');
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(calls[1]);
    expect(
      (calls[0] as { headers: { 'Idempotency-Key': string } }).headers['Idempotency-Key']
    ).toBe('00000000-0000-4000-8000-000000000101');
    expect(harness.makeKey).toHaveBeenCalledOnce();
    expect(
      await createDraftStore(harness.storage).load(
        scope,
        photoConfirmationDraftName('scan-1', 'new_occurrence')
      )
    ).toBeNull();
  });

  it.each([
    [201, 'consumption-created'],
    [200, 'consumption-existing'],
  ])('uses the server record ID from a %i response', async (status, id) => {
    const storage = new MemoryStorage();
    const repository = createAppRepository({
      scope,
      storage,
      connectivity: () => 'online',
      onUnauthorized: async () => {},
      fetcher: vi.fn(async () => Response.json({ id }, { status })) as unknown as typeof fetch,
      baseUrl: 'https://api.test',
    });
    const actions = createManualConsumptionActions({
      scope,
      storage,
      api: {
        create: (input) => repository.write('createConsumption', input),
        update: vi.fn() as never,
        delete: vi.fn() as never,
      },
      makeKey: () => '00000000-0000-4000-8000-000000000102',
    });
    const harness = createHarness({ occurrence: 'default_confirmation', storage });
    harness.flow = createPhotoConfirmationFlow({
      scanId: 'scan-1',
      occurrence: 'default_confirmation',
      useLastSuccessfulResult: false,
      scope,
      storage,
      api: harness.api as never,
      actions,
      connectivity: () => 'online',
      now: () => new Date('2026-10-14T05:30:00.000Z'),
    });
    const loaded = await harness.flow.load();
    const saved = await harness.flow.submit(loaded.record!.form);

    expect(saved.savedId).toBe(id);
  });

  it('refreshes after ANALYSIS_PENDING and retains the draft with a wait message', async () => {
    const harness = createHarness({
      occurrence: 'new_occurrence',
      onCreate: async (_input, remote) => {
        remote.scan = makeScan({ latestJobId: 'job-pending' });
        remote.jobs.set(
          'job-pending',
          makeJob({
            id: 'job-pending',
            status: 'queued',
            inputKind: 'correction',
            resultId: null,
            targetRevision: 3,
          })
        );
        throw errorWithCode('ANALYSIS_PENDING');
      },
    });
    const loaded = await harness.flow.load();

    const afterConflict = await harness.flow.submit(loaded.record!.form);

    expect(harness.api.getScan).toHaveBeenCalledTimes(3);
    expect(harness.api.getAnalysisJob).toHaveBeenLastCalledWith('job-pending');
    expect(afterConflict.availability).toBe('correction_pending');
    expect(afterConflict.submitMessage).toContain('Perbaikan analisis masih berlangsung');
    expect(afterConflict.record).toEqual(loaded.record);
  });

  it('refreshes after a stale-source conflict and keeps the old draft for an explicit rebuild', async () => {
    const harness = createHarness({
      occurrence: 'new_occurrence',
      onCreate: async (_input, remote) => {
        remote.scan = makeScan({ latestJobId: 'job-2', latestResultId: 'result-2' });
        remote.jobs.set('job-2', makeJob({ id: 'job-2', resultId: 'result-2' }));
        remote.results.set(
          'result-2',
          makeResult({
            components: [
              {
                ...makeResult().components[0],
                id: 'component-2',
                displayName: 'Nasi putih',
              },
            ],
          })
        );
        throw errorWithCode('SOURCE_REVISION_CONFLICT');
      },
    });
    const loaded = await harness.flow.load();

    const afterConflict = await harness.flow.submit(loaded.record!.form);

    expect(harness.api.getScan).toHaveBeenCalledTimes(3);
    expect(afterConflict.availability).toBe('unavailable');
    expect(afterConflict.scan?.latestResultId).toBe('result-2');
    expect(afterConflict.record).toEqual(loaded.record);
    expect(afterConflict.submitMessage).toContain('Hasil analisis berubah');

    const rebuilt = await harness.flow.restartFromLatestResult();
    expect(rebuilt.availability).toBe('confirm');
    expect(rebuilt.record?.sourceResultId).toBe('result-2');
    expect(rebuilt.record?.draftId).not.toBe(loaded.record?.draftId);
    expect(rebuilt.record?.form.components[0]?.displayName).toBe('Nasi putih');
    expect(rebuilt.record?.form.consumedTime).toBe(loaded.record?.form.consumedTime);
  });

  it('reloads an existing default after CONSUMPTION_ALREADY_CONFIRMED', async () => {
    const harness = createHarness({
      onCreate: async (_input, remote) => {
        remote.scan = makeScan({ defaultConsumptionId: 'consumption-existing' });
        throw errorWithCode('CONSUMPTION_ALREADY_CONFIRMED');
      },
    });
    const loaded = await harness.flow.load();

    const afterConflict = await harness.flow.submit(loaded.record!.form);

    expect(harness.api.getScan).toHaveBeenCalledTimes(3);
    expect(afterConflict.availability).toBe('open_existing');
    expect(afterConflict.scan?.defaultConsumptionId).toBe('consumption-existing');
    expect(afterConflict.conflict).toBe('already_confirmed');
    expect(afterConflict.record).toEqual(loaded.record);
  });

  it('keeps duplicate confirmation retryable when refreshing the existing record fails', async () => {
    const harness = createHarness({
      onCreate: async (_input, remote) => {
        remote.scan = makeScan({ defaultConsumptionId: 'consumption-existing' });
        throw errorWithCode('CONSUMPTION_ALREADY_CONFIRMED');
      },
    });
    const loaded = await harness.flow.load();
    const getScan = harness.api.getScan.getMockImplementation();
    harness.api.getScan
      .mockImplementationOnce(getScan!)
      .mockRejectedValueOnce(new Error('temporary scan refresh failure'));

    const afterConflict = await harness.flow.submit(loaded.record!.form);

    expect(afterConflict.availability).toBe('unavailable');
    expect(afterConflict.scan?.defaultConsumptionId).not.toBe('consumption-existing');
    expect(afterConflict.conflict).toBe('already_confirmed');
    expect(afterConflict.loadError).toBeInstanceOf(Error);

    const retried = await harness.flow.refresh();
    expect(retried.availability).toBe('open_existing');
    expect(retried.scan?.defaultConsumptionId).toBe('consumption-existing');
  });
});

describe('photo confirmation conflict codes', () => {
  it('preserves API error codes needed to map analysis and duplicate conflicts', async () => {
    const storage = new MemoryStorage();
    const repository = createAppRepository({
      scope,
      storage,
      connectivity: () => 'online',
      onUnauthorized: async () => {},
      fetcher: vi.fn(async () =>
        Response.json(
          {
            error: {
              code: 'ANALYSIS_PENDING',
              message: 'pending',
              details: {},
              requestId: 'req-1',
              retryable: true,
            },
          },
          { status: 409 }
        )
      ) as unknown as typeof fetch,
      baseUrl: 'https://api.test',
    });

    await expect(
      repository.write('createConsumption', {
        headers: { 'Idempotency-Key': '00000000-0000-4000-8000-000000000103' },
        body: {
          source: 'manual',
          scanId: null,
          sourceAnalysisResultId: null,
          occurrence: 'new_occurrence',
          consumedAt: '2026-10-14T05:30:00.000Z',
          timezone: 'Asia/Jakarta',
          components: [
            {
              id: 'component-1',
              displayName: 'Nasi goreng',
              catalogFoodId: null,
              preparation: null,
              portion: { kind: 'unknown' },
            },
          ],
          catalogVersion: 'catalog-v5',
        },
      })
    ).rejects.toMatchObject({ status: 409, code: 'ANALYSIS_PENDING' });
  });
});

describe('photo confirmation route identity', () => {
  it('does not let a blurred restart replace the refocused draft', async () => {
    const harness = createHarness({ occurrence: 'new_occurrence' });
    const original = await harness.flow.load();
    let releaseOld!: () => void;
    const oldScan = new Promise<ReturnType<typeof read<Scan>>>((resolve) => {
      releaseOld = () =>
        resolve(read(makeScan({ latestJobId: 'job-2', latestResultId: 'result-2' })));
    });
    harness.remote.jobs.set('job-2', makeJob({ id: 'job-2', resultId: 'result-2' }));
    harness.remote.results.set('result-2', makeResult());
    harness.api.getScan.mockImplementationOnce(() => oldScan);

    const restart = harness.flow.restartFromLatestResult();
    harness.flow.invalidate();
    const refocused = await harness.flow.load();
    releaseOld();
    await restart;

    expect(harness.flow.getSnapshot()).toEqual(refocused);
    expect(
      await createDraftStore(harness.storage).load(
        scope,
        photoConfirmationDraftName('scan-1', 'new_occurrence')
      )
    ).toEqual(original.record);
  });

  it('restores the previous draft when a restart save was already running at blur', async () => {
    let releaseRestartSave!: () => void;
    let markRestartSaveStarted!: () => void;
    const restartSaveStarted = new Promise<void>((resolve) => {
      markRestartSaveStarted = resolve;
    });
    const storage = new (class extends MemoryStorage {
      private writes = 0;
      override async setItem(key: string, value: string) {
        this.writes += 1;
        if (this.writes === 2) {
          markRestartSaveStarted();
          await new Promise<void>((resolve) => {
            releaseRestartSave = resolve;
          });
        }
        await super.setItem(key, value);
      }
    })();
    const harness = createHarness({ occurrence: 'new_occurrence', storage });
    const original = await harness.flow.load();
    harness.remote.scan = makeScan({ latestJobId: 'job-2', latestResultId: 'result-2' });
    harness.remote.jobs.set('job-2', makeJob({ id: 'job-2', resultId: 'result-2' }));
    harness.remote.results.set('result-2', makeResult());

    const restart = harness.flow.restartFromLatestResult();
    await restartSaveStarted;
    harness.flow.invalidate();
    const refocusedLoad = harness.flow.load();
    releaseRestartSave();
    await restart;
    const refocused = await refocusedLoad;

    expect(refocused.record).toEqual(original.record);
    expect(
      await createDraftStore(storage).load(
        scope,
        photoConfirmationDraftName('scan-1', 'new_occurrence')
      )
    ).toEqual(original.record);
  });

  it('does not let an old conflict refresh replace a refocused snapshot', async () => {
    const harness = createHarness({
      occurrence: 'new_occurrence',
      onCreate: async () => {
        throw errorWithCode('SOURCE_REVISION_CONFLICT');
      },
    });
    const loaded = await harness.flow.load();
    let releaseRefresh!: () => void;
    const refreshScan = new Promise<ReturnType<typeof read<Scan>>>((resolve) => {
      releaseRefresh = () => resolve(read(makeScan({ latestResultId: null })));
    });
    harness.api.getScan.mockImplementationOnce(async () => read(harness.remote.scan));
    harness.api.getScan.mockImplementationOnce(() => refreshScan);

    const submit = harness.flow.submit(loaded.record!.form);
    await vi.waitFor(() => expect(harness.api.getScan).toHaveBeenCalledTimes(3));
    harness.flow.invalidate();
    const refocused = await harness.flow.load();
    releaseRefresh();
    await submit;

    expect(harness.flow.getSnapshot()).toEqual(refocused);
  });

  it('keeps persisted draft aligned with a refocused load after an old save finishes late', async () => {
    let releaseOldSave!: () => void;
    let markOldSaveStarted!: () => void;
    const oldSaveStarted = new Promise<void>((resolve) => {
      markOldSaveStarted = resolve;
    });
    const storage = new (class extends MemoryStorage {
      private writes = 0;
      override async setItem(key: string, value: string) {
        this.writes += 1;
        if (this.writes === 1) {
          markOldSaveStarted();
          await new Promise<void>((resolve) => {
            releaseOldSave = resolve;
          });
        }
        await super.setItem(key, value);
      }
    })();
    const harness = createHarness({ occurrence: 'new_occurrence', storage });
    const oldLoad = harness.flow.load();
    await oldSaveStarted;
    harness.flow.invalidate();
    const refocusedLoad = harness.flow.load();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    releaseOldSave();
    await oldLoad;
    const refocused = await refocusedLoad;

    expect(
      await createDraftStore(storage).load(
        scope,
        photoConfirmationDraftName('scan-1', 'new_occurrence')
      )
    ).toEqual(refocused.record);
  });

  it('keeps the refocused load as the flow snapshot when an older load finishes last', async () => {
    const harness = createHarness({ occurrence: 'new_occurrence' });
    const guard = createPhotoConfirmationRouteGuard();
    let releaseOld!: () => void;
    const oldMe = new Promise<ReturnType<typeof read<{ timezone: string }>>>((resolve) => {
      releaseOld = () => resolve(read({ timezone: 'Asia/Jakarta' }));
    });
    harness.api.getMe.mockImplementationOnce(() => oldMe);
    const committed: string[] = [];
    guard.activate(harness.flow);
    const oldLoad = guard.run(
      harness.flow,
      () => harness.flow.load(),
      (next) => {
        committed.push(next.availability);
      }
    );

    guard.deactivate(harness.flow);
    harness.flow.invalidate();
    guard.activate(harness.flow);
    const currentLoad = await guard.run(
      harness.flow,
      () => harness.flow.load(),
      (next) => {
        committed.push(next.availability);
      }
    );
    expect(currentLoad.status).toBe('current');
    expect(harness.flow.getSnapshot().availability).toBe('confirm');

    releaseOld();
    expect((await oldLoad).status).toBe('stale');
    expect(committed).toEqual(['confirm']);
    expect(harness.flow.getSnapshot()).toEqual(currentLoad.value);
  });

  it('retains a successful blurred submit for same-key replay without stale navigation', async () => {
    let acknowledge!: () => void;
    const firstSave = new Promise<{ id: string }>((resolve) => {
      acknowledge = () => resolve({ id: 'consumption-saved' });
    });
    let saves = 0;
    const harness = createHarness({
      occurrence: 'new_occurrence',
      onCreate: async () => {
        saves += 1;
        return saves === 1 ? firstSave : { id: 'consumption-saved' };
      },
    });
    const loaded = await harness.flow.load();
    const guard = createPhotoConfirmationRouteGuard();
    const navigate = vi.fn();
    guard.activate(harness.flow);
    const submit = guard.run(
      harness.flow,
      () => harness.flow.submit(loaded.record!.form),
      (next) => {
        if (next.savedId) navigate(next.savedId);
      }
    );
    await vi.waitFor(() => expect(harness.create).toHaveBeenCalledOnce());

    guard.deactivate(harness.flow);
    harness.flow.invalidate();
    acknowledge();
    expect((await submit).status).toBe('stale');
    expect(navigate).not.toHaveBeenCalled();
    expect(
      await createDraftStore(harness.storage).load(
        scope,
        photoConfirmationDraftName('scan-1', 'new_occurrence')
      )
    ).toEqual(loaded.record);

    guard.activate(harness.flow);
    const reopened = await harness.flow.load();
    expect(reopened.record?.draftId).toBe(loaded.record?.draftId);
    const replayed = await harness.flow.submit(reopened.record!.form);
    expect(replayed.savedId).toBe('consumption-saved');
    expect(harness.makeKey).toHaveBeenCalledOnce();
    expect(harness.create).toHaveBeenCalledTimes(2);
    expect(harness.create.mock.calls[0]).toEqual(harness.create.mock.calls[1]);
  });

  it('retains the draft and request key if blur interrupts post-ack cleanup', async () => {
    let releaseRemoval!: () => void;
    let markRemovalStarted!: () => void;
    const removalStarted = new Promise<void>((resolve) => {
      markRemovalStarted = resolve;
    });
    const storage = new (class extends MemoryStorage {
      override async removeItem(key: string) {
        if (key.includes('photo-consumption%3Acreate')) {
          markRemovalStarted();
          await new Promise<void>((resolve) => {
            releaseRemoval = resolve;
          });
        }
        await super.removeItem(key);
      }
    })();
    const harness = createHarness({ occurrence: 'new_occurrence', storage });
    const loaded = await harness.flow.load();
    const submit = harness.flow.submit(loaded.record!.form);
    await removalStarted;

    harness.flow.invalidate();
    const refocusedLoad = harness.flow.load();
    releaseRemoval();
    await submit;
    const refocused = await refocusedLoad;

    expect(refocused.record).toEqual(loaded.record);
    expect(
      await createDraftStore(storage).load(scope, `manual-request:create:${loaded.record!.draftId}`)
    ).not.toBeNull();
  });

  it('ignores deferred load and submit completions after the route blurs', async () => {
    const guard = createPhotoConfirmationRouteGuard();
    const route = {};
    let resolveLoad!: (value: string) => void;
    let resolveSubmit!: (value: string) => void;
    const pendingLoad = new Promise<string>((resolve) => {
      resolveLoad = resolve;
    });
    const pendingSubmit = new Promise<string>((resolve) => {
      resolveSubmit = resolve;
    });
    const committed: string[] = [];
    const navigate = vi.fn();
    guard.activate(route);

    const load = guard.run(
      route,
      () => pendingLoad,
      (value) => committed.push(`load:${value}`)
    );
    const submit = guard.run(
      route,
      () => pendingSubmit,
      (value) => {
        committed.push(`submit:${value}`);
        navigate(value);
      }
    );

    guard.deactivate(route);
    resolveLoad('late load');
    resolveSubmit('saved-consumption-id');

    const [loadResult, submitResult] = await Promise.all([load, submit]);

    expect(loadResult).toEqual({ status: 'stale' });
    expect(submitResult).toEqual({ status: 'stale' });
    expect(committed).toEqual([]);
    expect(navigate).not.toHaveBeenCalled();
    expect(guard.isActive(route)).toBe(false);
  });

  it('ignores a deferred load and submit after the active route changes', async () => {
    const guard = createPhotoConfirmationRouteGuard();
    const oldRoute = {};
    const activeRoute = {};
    let resolveOldLoad!: (value: string) => void;
    const oldLoadValue = new Promise<string>((resolve) => {
      resolveOldLoad = resolve;
    });
    const committed: string[] = [];
    guard.activate(oldRoute);

    const oldLoad = guard.run(
      oldRoute,
      () => oldLoadValue,
      (value) => committed.push(value)
    );
    guard.activate(activeRoute);
    const currentLoad = await guard.run(
      activeRoute,
      async () => 'active route result',
      (value) => committed.push(value)
    );
    resolveOldLoad('old route result');
    await oldLoad;

    const staleSubmit = vi.fn(async () => 'old route submission');
    const oldSubmission = await guard.run(oldRoute, staleSubmit, (value) => committed.push(value));

    expect(currentLoad).toEqual({ status: 'current', value: 'active route result' });
    expect(committed).toEqual(['active route result']);
    expect(oldSubmission).toEqual({ status: 'stale' });
    expect(staleSubmit).not.toHaveBeenCalled();
  });
});
