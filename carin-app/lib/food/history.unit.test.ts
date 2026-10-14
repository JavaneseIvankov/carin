import { describe, expect, it } from 'vitest';
import type { components } from '@/lib/api/generated/app-api';
import {
  createScanHistoryPageInput,
  getNextScanCursor,
  getScanHistoryItems,
  getScanHistoryPresentation,
} from './history';

type Scan = components['schemas']['Scan'];
type Job = components['schemas']['AnalysisJob'];

const scan = {
  id: 'scan-1',
  createdAt: '2026-10-14T09:00:00Z',
  latestJobId: 'job-1',
  defaultConsumptionId: null,
} as Scan;

describe('scan history', () => {
  it('pages scans through the opaque API cursor without changing their order', () => {
    expect(createScanHistoryPageInput(undefined)).toEqual({ query: { limit: 20 } });
    expect(createScanHistoryPageInput('next')).toEqual({ query: { limit: 20, cursor: 'next' } });
    expect(getNextScanCursor({ nextCursor: 'next' })).toBe('next');
    expect(getNextScanCursor({ nextCursor: null })).toBeUndefined();
    expect(
      getScanHistoryItems([
        { data: { items: [scan], nextCursor: 'next' } },
        { data: { items: [{ ...scan, id: 'scan-2' }], nextCursor: null } },
      ]).map((item) => item.id)
    ).toEqual(['scan-1', 'scan-2']);
  });

  it('never represents a scan as eaten unless it links to a saved consumption', () => {
    expect(getScanHistoryPresentation(scan, null).consumptionLabel).toBe(
      'Belum dicatat sebagai konsumsi'
    );
    expect(
      getScanHistoryPresentation({ ...scan, defaultConsumptionId: 'consumption-1' }, null)
        .consumptionLabel
    ).toBe('Konsumsi tersimpan');
  });

  it.each([
    ['queued', 'Menunggu analisis'],
    ['processing', 'Menganalisis foto'],
    ['completed', 'Analisis selesai'],
    ['failed', 'Analisis gagal'],
    ['cancelled', 'Analisis dibatalkan'],
  ] as const)('labels %s jobs', (status, label) => {
    expect(getScanHistoryPresentation(scan, { status } as Job).statusLabel).toBe(label);
  });

  it('keeps a missing or inaccessible job visibly unavailable', () => {
    expect(getScanHistoryPresentation(scan, null).statusLabel).toBe(
      'Status analisis tidak tersedia'
    );
  });
});
