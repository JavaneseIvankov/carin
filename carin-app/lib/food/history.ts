import type { AppRequestInput } from '@/lib/api/contracts';
import type { components } from '@/lib/api/generated/app-api';

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

export function getScanHistoryPresentation(scan: Scan, job: Pick<AnalysisJob, 'status'> | null) {
  return {
    statusLabel: job ? statusLabels[job.status] : 'Status analisis tidak tersedia',
    consumptionLabel: scan.defaultConsumptionId
      ? 'Konsumsi tersimpan'
      : 'Belum dicatat sebagai konsumsi',
  };
}
