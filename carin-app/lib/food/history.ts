import type { AppRequestInput } from '@/lib/api/contracts';
import type { components } from '@/lib/api/generated/app-api';
import { getPhotoConfirmationAvailability } from '@/lib/consumptions/photo-confirmation';

type Scan = components['schemas']['Scan'];
type AnalysisJob = components['schemas']['AnalysisJob'];
type ScanPage = { items: Scan[]; nextCursor: string | null };
type ScanReadPage = { data: ScanPage };

export const SCAN_HISTORY_PAGE_LIMIT = 20;

export function createScanHistoryPageInput(
  cursor: string | undefined
): AppRequestInput<'listScans'> {
  return { query: { limit: SCAN_HISTORY_PAGE_LIMIT, ...(cursor ? { cursor } : {}) } };
}

export function getNextScanCursor(page: Pick<ScanPage, 'nextCursor'>) {
  return page.nextCursor ?? undefined;
}

export function getScanHistoryItems(pages: readonly ScanReadPage[] | undefined): Scan[] {
  return pages?.flatMap((page) => page.data.items) ?? [];
}

const statusLabels: Record<AnalysisJob['status'], string> = {
  queued: 'Menunggu analisis',
  processing: 'Menganalisis foto',
  completed: 'Analisis selesai',
  failed: 'Analisis gagal',
  cancelled: 'Analisis dibatalkan',
};

export function getScanHistoryPresentation(scan: Scan, job: AnalysisJob | null) {
  const components =
    job?.status === 'completed' &&
    job.id === scan.latestJobId &&
    job.scanId === scan.id &&
    job.targetType === 'scan' &&
    job.targetId === scan.id &&
    job.targetRevision === scan.revision &&
    job.resultId === scan.latestResultId
      ? (job.result?.components ?? [])
      : [];
  const names = components.map((component) => component.displayName.trim()).filter(Boolean);
  const title = names.length
    ? `${names.slice(0, 2).join(' · ')}${names.length > 2 ? ` +${names.length - 2}` : ''}`
    : 'Analisis foto';
  const availability = getPhotoConfirmationAvailability({
    scan,
    latestJob: job ?? undefined,
    resultId: job?.resultId ?? undefined,
    result: job?.result ?? undefined,
    explicitlyUseLastSuccessfulResult: false,
  });

  return {
    title,
    statusLabel: job ? statusLabels[job.status] : 'Status analisis tidak tersedia',
    consumptionLabel: scan.defaultConsumptionId
      ? 'Konsumsi tersimpan'
      : 'Belum dicatat sebagai konsumsi',
    quickAction:
      availability === 'confirm' || availability === 'open_existing' ? availability : null,
  };
}
