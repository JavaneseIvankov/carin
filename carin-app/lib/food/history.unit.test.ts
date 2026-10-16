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
    expect(getScanHistoryPresentation(scan, null).quickAction).toBeNull();
  });

  it('uses the latest completed result to name the food and offer confirmation', () => {
    const currentScan = { ...scan, latestResultId: 'result-1', revision: 1 };
    const job = {
      id: 'job-1',
      scanId: 'scan-1',
      targetType: 'scan',
      targetId: 'scan-1',
      targetRevision: 1,
      status: 'completed',
      resultId: 'result-1',
      result: {
        components: [
          { displayName: 'Mi goreng' },
          { displayName: 'Telur mata sapi' },
          { displayName: 'Susu putih' },
        ],
      },
    } as Job;

    expect(getScanHistoryPresentation(currentScan, job)).toMatchObject({
      title: 'Mi goreng · Telur mata sapi +1',
      quickAction: 'confirm',
    });
    expect(
      getScanHistoryPresentation({ ...currentScan, defaultConsumptionId: 'consumption-1' }, job)
        .quickAction
    ).toBe('open_existing');
  });

  it('does not offer confirmation for an incomplete or stale result', () => {
    const currentScan = { ...scan, latestResultId: 'result-1', revision: 2 };
    const job = {
      id: 'job-1',
      scanId: 'scan-1',
      targetType: 'scan',
      targetId: 'scan-1',
      targetRevision: 1,
      status: 'completed',
      resultId: 'result-1',
      result: { components: [{ displayName: 'Mi goreng' }] },
    } as Job;

    expect(getScanHistoryPresentation(currentScan, job).quickAction).toBeNull();
    expect(getScanHistoryPresentation(currentScan, { ...job, status: 'processing' })).toMatchObject(
      {
        title: 'Analisis foto',
        quickAction: null,
      }
    );
  });
});
