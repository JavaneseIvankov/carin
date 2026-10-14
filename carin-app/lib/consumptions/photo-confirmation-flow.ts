import type { components } from '@/lib/api/generated/app-api';
import { ApiError, type ReadResult } from '@/lib/api/repository';
import { createDraftStore } from '@/lib/data/drafts';
import type { DataScope, StorageAdapter } from '@/lib/data/scope';
import { createIdempotencyKey } from '@/lib/profile/profile';
import {
  buildPhotoConsumptionInput,
  createPhotoConfirmationDraft,
  getPhotoConfirmationAvailability,
  type PhotoConfirmationOccurrence,
} from './photo-confirmation';
import type { ManualConsumptionDraft } from './consumption';

type Scan = components['schemas']['Scan'];
type AnalysisJob = components['schemas']['AnalysisJob'];
type AnalysisResult = components['schemas']['ai__AnalysisResult'];
type Consumption = components['schemas']['Consumption'];

export type SavedPhotoDraft = {
  draftId: string;
  sourceResultId: string;
  timeZone: string;
  form: ManualConsumptionDraft;
};

export type PhotoConfirmationSnapshot = {
  availability: ReturnType<typeof getPhotoConfirmationAvailability>;
  scan?: Scan;
  latestJob?: AnalysisJob;
  record?: SavedPhotoDraft;
  submitMessage?: string;
  loadError?: unknown;
  conflict?: 'already_confirmed';
  savedId?: string;
};

type PhotoConfirmationApi = {
  getMe: () => Promise<ReadResult<components['schemas']['Me']>>;
  getScan: (id: string) => Promise<ReadResult<Scan>>;
  getAnalysisJob: (id: string) => Promise<ReadResult<AnalysisJob>>;
  getAnalysisResult: (id: string) => Promise<ReadResult<AnalysisResult>>;
};

type PhotoConfirmationActions = {
  create: (draftId: string, body: components['schemas']['ConsumptionCreate']) => Promise<Consumption>;
  clearCreate: (draftId: string) => Promise<void>;
};

const FALLBACK_TIME_ZONE = 'Asia/Jakarta';

export function photoConfirmationDraftName(scanId: string, occurrence: PhotoConfirmationOccurrence) {
  return `photo-consumption:create:${scanId}:${occurrence}`;
}

export function createPhotoConfirmationFlow(options: {
  scanId: string;
  occurrence: PhotoConfirmationOccurrence;
  useLastSuccessfulResult: boolean;
  scope: DataScope;
  storage: StorageAdapter;
  api: PhotoConfirmationApi;
  actions: PhotoConfirmationActions;
  connectivity: () => 'online' | 'offline' | 'unknown';
  now?: () => Date;
}) {
  const store = createDraftStore(options.storage);
  const draftName = photoConfirmationDraftName(options.scanId, options.occurrence);
  const now = options.now ?? (() => new Date());
  let snapshot: PhotoConfirmationSnapshot = { availability: 'loading' };
  let submitInFlight = false;
  let persistQueue = Promise.resolve();

  const setSnapshot = (next: PhotoConfirmationSnapshot) => {
    snapshot = next;
    return snapshot;
  };

  async function loadCurrentSources() {
    const scanRead = await options.api.getScan(options.scanId);
    const scan = scanRead.data;
    if (options.occurrence === 'default_confirmation' && scan.defaultConsumptionId) {
      return { scan, latestJob: undefined, resultId: scan.latestResultId ?? undefined, result: undefined, stale: scanRead.stale };
    }
    if (scanRead.stale) {
      return { scan, latestJob: undefined, resultId: scan.latestResultId ?? undefined, result: undefined, stale: true };
    }

    const [jobRead, resultRead] = await Promise.all([
      options.api.getAnalysisJob(scan.latestJobId),
      scan.latestResultId ? options.api.getAnalysisResult(scan.latestResultId) : Promise.resolve(undefined),
    ]);
    return {
      scan,
      latestJob: jobRead.data,
      resultId: scan.latestResultId ?? undefined,
      result: resultRead?.data,
      stale: jobRead.stale || (resultRead?.stale ?? false),
    };
  }

  function availabilityFor(
    sources: Awaited<ReturnType<typeof loadCurrentSources>>,
    explicitlyUseLastSuccessfulResult = options.useLastSuccessfulResult
  ) {
    if (options.occurrence === 'default_confirmation' && sources.scan.defaultConsumptionId) {
      return 'open_existing' as const;
    }
    if (sources.stale) return 'unavailable' as const;
    return getPhotoConfirmationAvailability({
      scan: sources.scan,
      latestJob: sources.latestJob,
      resultId: sources.resultId,
      result: sources.result,
      explicitlyUseLastSuccessfulResult,
      occurrence: options.occurrence,
    });
  }

  async function readTimeZone() {
    try {
      const me = await options.api.getMe();
      return me.data.timezone?.trim() || FALLBACK_TIME_ZONE;
    } catch {
      return FALLBACK_TIME_ZONE;
    }
  }

  async function refreshSources(message?: string) {
    try {
      const sources = await loadCurrentSources();
      const currentAvailability = availabilityFor(sources);
      const staleDraft =
        currentAvailability === 'confirm' &&
        snapshot.record &&
        snapshot.record.sourceResultId !== sources.resultId;
      const availability = staleDraft ? 'unavailable' : currentAvailability;
      return setSnapshot({
        ...snapshot,
        availability,
        scan: sources.scan,
        latestJob: sources.latestJob,
        submitMessage: message,
        loadError: undefined,
      });
    } catch (error) {
      return setSnapshot({ ...snapshot, availability: 'unavailable', submitMessage: message, loadError: error });
    }
  }

  async function load() {
    setSnapshot({ availability: 'loading' });
    try {
      const [timeZone, sources] = await Promise.all([readTimeZone(), loadCurrentSources()]);
      let availability = availabilityFor(sources);
      let record = await store.load<SavedPhotoDraft>(options.scope, draftName);

      if (availability === 'confirm' && sources.result && sources.resultId) {
        if (record && record.sourceResultId !== sources.resultId) {
          availability = 'unavailable';
          return setSnapshot({
            availability,
            scan: sources.scan,
            latestJob: sources.latestJob,
            record,
            submitMessage: 'Hasil analisis berubah. Draft lama tetap tersimpan; mulai ulang dari hasil terbaru untuk melanjutkan.',
          });
        }
        if (!record) {
          record = {
            draftId: createIdempotencyKey(),
            sourceResultId: sources.resultId,
            timeZone,
            form: createPhotoConfirmationDraft(sources.result, now(), timeZone),
          };
          await store.save(options.scope, draftName, record);
        }
      }

      return setSnapshot({
        availability,
        scan: sources.scan,
        latestJob: sources.latestJob,
        ...(record ? { record } : {}),
      });
    } catch (error) {
      return setSnapshot({ availability: 'unavailable', loadError: error });
    }
  }

  function updateDraft(form: ManualConsumptionDraft) {
    if (!snapshot.record) return Promise.resolve(snapshot);
    const nextRecord = { ...snapshot.record, form };
    setSnapshot({ ...snapshot, record: nextRecord });
    persistQueue = persistQueue
      .catch(() => {})
      .then(() => store.save(options.scope, draftName, nextRecord));
    return persistQueue.then(() => snapshot);
  }

  async function restartFromLatestResult() {
    const previous = snapshot.record;
    if (!previous) return load();
    try {
      const sources = await loadCurrentSources();
      const availability = availabilityFor(sources);
      if (availability !== 'confirm' || !sources.result || !sources.resultId) {
        return setSnapshot({
          ...snapshot,
          availability,
          scan: sources.scan,
          latestJob: sources.latestJob,
          submitMessage:
            availability === 'correction_pending'
              ? 'Perbaikan analisis masih berlangsung. Tunggu sampai selesai sebelum memulai ulang.'
              : 'Hasil analisis terbaru belum dapat digunakan. Draft lama tetap tersimpan.',
        });
      }

      const seeded = createPhotoConfirmationDraft(sources.result, now(), previous.timeZone);
      const nextRecord: SavedPhotoDraft = {
        draftId: createIdempotencyKey(),
        sourceResultId: sources.resultId,
        timeZone: previous.timeZone,
        form: {
          ...seeded,
          consumedDate: previous.form.consumedDate,
          consumedTime: previous.form.consumedTime,
        },
      };
      await store.save(options.scope, draftName, nextRecord);
      return setSnapshot({
        availability: 'confirm',
        scan: sources.scan,
        latestJob: sources.latestJob,
        record: nextRecord,
      });
    } catch (error) {
      return setSnapshot({
        ...snapshot,
        submitMessage: 'Draft lama tetap tersimpan. Hasil terbaru belum dapat dimuat.',
        loadError: error,
      });
    }
  }

  async function submit(form: ManualConsumptionDraft) {
    if (submitInFlight || !snapshot.record) return snapshot;
    if (options.connectivity() !== 'online') {
      return setSnapshot({
        ...snapshot,
        submitMessage: 'Perlu koneksi internet untuk menyimpan catatan konsumsi. Draft Anda tetap tersimpan.',
      });
    }

    submitInFlight = true;
    const currentRecord = { ...snapshot.record, form };
    setSnapshot({ ...snapshot, record: currentRecord, submitMessage: undefined, conflict: undefined });
    try {
      await persistQueue.catch(() => {});
      await store.save(options.scope, draftName, currentRecord);

      // Re-read all server-owned source state immediately before building the write.
      const sources = await loadCurrentSources();
      const availability = availabilityFor(sources);
      if (
        availability !== 'confirm' ||
        !sources.resultId ||
        currentRecord.sourceResultId !== sources.resultId
      ) {
        return setSnapshot({
          ...snapshot,
          availability: availability === 'confirm' ? 'unavailable' : availability,
          scan: sources.scan,
          latestJob: sources.latestJob,
          record: currentRecord,
          submitMessage:
            currentRecord.sourceResultId !== sources.resultId
              ? 'Hasil analisis berubah. Draft Anda tetap tersimpan; muat hasil terbaru sebelum menyimpan.'
              : availability === 'correction_pending'
                ? 'Perbaikan analisis masih berlangsung. Tunggu sampai selesai sebelum menyimpan.'
                : 'Hasil analisis tidak lagi tersedia untuk konfirmasi. Draft Anda tetap tersimpan.',
        });
      }

      const payload = buildPhotoConsumptionInput(form, {
        scanId: options.scanId,
        resultId: sources.resultId,
        occurrence: options.occurrence,
        timeZone: currentRecord.timeZone,
      });
      if ('error' in payload) {
        return setSnapshot({ ...snapshot, record: currentRecord, submitMessage: payload.error });
      }

      const saved = await options.actions.create(currentRecord.draftId, payload.value);
      try {
        await store.remove(options.scope, draftName);
        await options.actions.clearCreate(currentRecord.draftId);
      } catch {
        // The server acknowledged the save; retaining the request key makes replay safe.
      }
      return setSnapshot({
        ...snapshot,
        availability: 'unavailable',
        scan: sources.scan,
        latestJob: sources.latestJob,
        savedId: saved.id,
        record: undefined,
        submitMessage: undefined,
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ANALYSIS_PENDING') {
        return refreshSources('Perbaikan analisis masih berlangsung. Tunggu sampai selesai sebelum menyimpan.');
      }
      if (error instanceof ApiError && error.code === 'SOURCE_REVISION_CONFLICT') {
        return refreshSources('Hasil analisis berubah. Draft Anda tetap tersimpan; muat hasil terbaru sebelum menyimpan.');
      }
      if (error instanceof ApiError && error.code === 'CONSUMPTION_ALREADY_CONFIRMED') {
        const refreshed = await refreshSources('Catatan default sudah tersimpan. Anda dapat membukanya atau mencatat konsumsi baru.');
        return setSnapshot({ ...refreshed, availability: 'open_existing', conflict: 'already_confirmed' });
      }
      return setSnapshot({
        ...snapshot,
        record: currentRecord,
        submitMessage:
          error instanceof ApiError
            ? error.message
            : 'Layanan belum tersedia. Draft Anda tetap tersimpan; coba lagi.',
      });
    } finally {
      submitInFlight = false;
    }
  }

  return {
    load,
    refresh: load,
    updateDraft,
    submit,
    restartFromLatestResult,
    refreshSources,
    getSnapshot: () => snapshot,
  };
}
