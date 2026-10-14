import type { components } from '@/lib/api/generated/app-api';
import type { AppRequestInput } from '@/lib/api/contracts';
import type { AppResponse } from '@/lib/api/repository';
import { createIdempotencyKey, createStableActionKey } from '@/lib/profile/profile';

export type CorrectionDraftComponent = components['schemas']['ai__ComponentInput'];
export type CorrectionFood = Pick<
  components['schemas']['ai__CatalogFood'],
  'id' | 'displayName' | 'preparation'
>;

export type CorrectionApi = {
  correctScan(input: AppRequestInput<'correctScan'>): Promise<AppResponse<'correctScan'>>;
  retryAnalysisJob(
    input: AppRequestInput<'retryAnalysisJob'>
  ): Promise<AppResponse<'retryAnalysisJob'>>;
};

export function createCorrectionActionState(makeKey: () => string = createIdempotencyKey) {
  return {
    correctionKeys: createStableActionKey(makeKey),
    retryKeys: createStableActionKey(makeKey),
  };
}

export function createCorrectionActions(api: CorrectionApi, state = createCorrectionActionState()) {
  return {
    async submit(
      scanId: string,
      scan: components['schemas']['Scan'],
      sourceResultId: string,
      catalogVersion: string,
      draft: CorrectionDraftComponent[]
    ) {
      const body = buildCorrectionInput(scan, sourceResultId, catalogVersion, draft);
      const key = state.correctionKeys.forPayload({ scanId, body });
      const job = await api.correctScan({
        path: { id: scanId },
        headers: { 'Idempotency-Key': key },
        body,
      });
      state.correctionKeys.clear();
      return job;
    },
    async retry(jobId: string) {
      const key = state.retryKeys.forPayload({ jobId });
      const job = await api.retryAnalysisJob({
        path: { id: jobId },
        headers: { 'Idempotency-Key': key },
      });
      state.retryKeys.clear();
      return job;
    },
  };
}

export function createCorrectionDraft(
  result: components['schemas']['ai__AnalysisResult']
): CorrectionDraftComponent[] {
  return result.components.map((component) => {
    const { quantity, unit, servingId } = component.portion;
    const portion: CorrectionDraftComponent['portion'] =
      quantity === null || unit === null
        ? { kind: 'unknown' }
        : unit === 'serving' && servingId
          ? { kind: 'known', quantity, servingId, unit }
          : unit === 'g'
            ? { kind: 'known', quantity, unit }
            : { kind: 'unknown' };

    return {
      id: component.id,
      catalogFoodId: component.catalogFoodId,
      displayName: component.displayName,
      preparation: component.preparation,
      portion,
    };
  });
}

export function replaceCorrectionFood(
  component: CorrectionDraftComponent,
  food: CorrectionFood
): CorrectionDraftComponent {
  return {
    ...component,
    catalogFoodId: food.id,
    displayName: food.displayName,
    preparation: food.preparation,
    portion: { kind: 'unknown' },
  };
}

export function buildCorrectionInput(
  scan: components['schemas']['Scan'],
  sourceResultId: string,
  catalogVersion: string,
  draft: CorrectionDraftComponent[]
): components['schemas']['CorrectionInput'] {
  if (!scan.latestResultId || sourceResultId !== scan.latestResultId) {
    throw new Error('Hasil terbaru sudah berubah. Muat ulang sebelum mengoreksi.');
  }
  if (!draft.length) throw new Error('Tambahkan minimal satu komponen makanan.');
  if (!catalogVersion) throw new Error('Versi katalog hasil sumber tidak tersedia.');
  return {
    expectedRevision: scan.revision,
    basedOnResultId: sourceResultId,
    catalogVersion,
    components: draft.map((component) => ({
      ...component,
      displayName: component.displayName.trim(),
    })),
  };
}

export function canConfirmLatestScanResult(
  scan: components['schemas']['Scan'],
  job: components['schemas']['AnalysisJob']
): boolean {
  return (
    isCurrentScanResult(scan, job) &&
    job.id === scan.latestJobId &&
    job.targetRevision === scan.revision
  );
}

export function isCurrentScanResult(
  scan: components['schemas']['Scan'],
  job: components['schemas']['AnalysisJob']
): boolean {
  return (
    scan.latestResultId !== null &&
    job.scanId === scan.id &&
    job.targetType === 'scan' &&
    job.targetId === scan.id &&
    job.status === 'completed' &&
    job.result !== null &&
    job.resultId === scan.latestResultId
  );
}

export function canConfirmSelectedScanResult(
  scan: components['schemas']['Scan'],
  selectedJob: components['schemas']['AnalysisJob'],
  latestJob: components['schemas']['AnalysisJob'],
  explicitlyReturnedToPrevious = false
): boolean {
  if (latestJob.id === selectedJob.id) return canConfirmLatestScanResult(scan, latestJob);
  const correctionFailed =
    scan.latestJobId === latestJob.id &&
    latestJob.scanId === scan.id &&
    latestJob.inputKind === 'correction' &&
    (latestJob.status === 'failed' || latestJob.status === 'cancelled');
  return explicitlyReturnedToPrevious && correctionFailed && isCurrentScanResult(scan, selectedJob);
}

export function getCorrectionErrorMessage(status: number | undefined): string {
  if (status === 409) {
    return 'Hasil berubah atau koreksi lain sedang berjalan. Muat ulang status sebelum mencoba lagi.';
  }
  return 'Koreksi belum dapat dikirim. Draft tetap tersimpan; periksa koneksi lalu coba lagi.';
}
