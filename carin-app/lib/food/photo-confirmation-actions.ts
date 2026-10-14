import type { components } from '@/lib/api/generated/app-api';
import { getPhotoConfirmationAvailability } from '@/lib/consumptions/photo-confirmation';

type Action = {
  label: string;
  pathname: '/consumptions/from-scan/[scanId]' | '/consumptions/[id]' | '/food/analysis/[id]';
  params: Record<string, string>;
};

export async function refreshAnalysisReads(input: {
  refetchJob: () => Promise<unknown>;
  refreshActionSnapshot: () => Promise<unknown>;
  refetchLatestResult?: () => Promise<unknown>;
}) {
  await Promise.allSettled([
    input.refetchJob(),
    input.refreshActionSnapshot(),
    ...(input.refetchLatestResult ? [input.refetchLatestResult()] : []),
  ]);
}

export function getPhotoConfirmationActions(input: {
  scan: components['schemas']['Scan'];
  selectedJobId: string;
  latestJob: components['schemas']['AnalysisJob'];
  resultId: string | undefined;
  result: components['schemas']['ai__AnalysisResult'] | undefined;
  latestResultLoadError?: boolean;
}): { primary: Action | null; secondary: Action | null; message: string | null } {
  const { scan, selectedJobId, latestJob, resultId, result, latestResultLoadError } = input;
  if (selectedJobId !== latestJob.id) {
    return {
      primary: {
        label: 'Buka hasil terbaru',
        pathname: '/food/analysis/[id]',
        params: { id: latestJob.id },
      },
      secondary: null,
      message: 'Hasil scan yang lebih baru tersedia.',
    };
  }
  const availability = getPhotoConfirmationAvailability({
    scan,
    latestJob,
    resultId,
    result,
    explicitlyUseLastSuccessfulResult: false,
  });
  const newOccurrence = getPhotoConfirmationAvailability({
    scan,
    latestJob,
    resultId,
    result,
    explicitlyUseLastSuccessfulResult: false,
    occurrence: 'new_occurrence',
  });
  const canUseLastResultForNewOccurrence =
    latestJob.status === 'failed' &&
    getPhotoConfirmationAvailability({
      scan,
      latestJob,
      resultId,
      result,
      explicitlyUseLastSuccessfulResult: true,
      occurrence: 'new_occurrence',
    }) === 'confirm';
  const photoRoute = {
    pathname: '/consumptions/from-scan/[scanId]' as const,
    params: { scanId: scan.id },
  };

  if (availability === 'open_existing') {
    return {
      primary: {
        label: 'Buka catatan konsumsi',
        pathname: '/consumptions/[id]',
        params: { id: scan.defaultConsumptionId! },
      },
      secondary:
        newOccurrence === 'confirm'
          ? {
              label: 'Catat sebagai konsumsi baru',
              ...photoRoute,
              params: { ...photoRoute.params, occurrence: 'new_occurrence' },
            }
          : canUseLastResultForNewOccurrence
            ? {
                label: 'Catat sebagai konsumsi baru dari hasil terakhir yang berhasil',
                ...photoRoute,
                params: {
                  ...photoRoute.params,
                  occurrence: 'new_occurrence',
                  useLastSuccessfulResult: 'true',
                },
              }
            : null,
      message:
        newOccurrence === 'correction_pending' ? 'Tunggu koreksi sebelum mencatat konsumsi' : null,
    };
  }
  if (availability === 'confirm') {
    return {
      primary: { label: 'Sudah dikonsumsi', ...photoRoute },
      secondary: null,
      message: null,
    };
  }
  if (availability === 'correction_pending') {
    return { primary: null, secondary: null, message: 'Tunggu koreksi sebelum mencatat konsumsi' };
  }

  const canUseLastResult =
    getPhotoConfirmationAvailability({
      scan,
      latestJob,
      resultId,
      result,
      explicitlyUseLastSuccessfulResult: true,
    }) === 'confirm';
  if (canUseLastResult && latestJob.status === 'failed') {
    return {
      primary: {
        label: 'Gunakan hasil terakhir yang berhasil',
        ...photoRoute,
        params: { ...photoRoute.params, useLastSuccessfulResult: 'true' },
      },
      secondary: null,
      message: null,
    };
  }
  return {
    primary: null,
    secondary: null,
    message: latestResultLoadError
      ? 'Hasil terbaru belum dapat dimuat. Pilih Muat status terbaru untuk mencoba lagi.'
      : availability === 'loading'
        ? 'Memuat hasil terbaru…'
        : 'Konfirmasi tersedia hanya untuk hasil terbaru yang berhasil.',
  };
}
