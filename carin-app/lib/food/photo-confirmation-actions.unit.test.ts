import { describe, expect, it } from 'vitest';
import type { components } from '@/lib/api/generated/app-api';
import { getPhotoConfirmationActions } from './photo-confirmation-actions';

const scan = {
  id: 'scan-1',
  revision: 1,
  latestJobId: 'job-1',
  latestResultId: 'result-1',
  defaultConsumptionId: null,
} as components['schemas']['Scan'];
const completed = {
  id: 'job-1',
  scanId: 'scan-1',
  targetType: 'scan',
  targetId: 'scan-1',
  targetRevision: 1,
  inputKind: 'photo',
  status: 'completed',
  resultId: 'result-1',
} as components['schemas']['AnalysisJob'];
const result = {} as components['schemas']['ai__AnalysisResult'];

function actions(overrides: Partial<Parameters<typeof getPhotoConfirmationActions>[0]> = {}) {
  return getPhotoConfirmationActions({
    scan,
    selectedJobId: 'job-1',
    latestJob: completed,
    resultId: 'result-1',
    result,
    ...overrides,
  });
}

describe('scan analysis consumption actions', () => {
  it('opens default photo confirmation when no record exists', () => {
    expect(actions().primary).toEqual({
      label: 'Sudah dikonsumsi',
      pathname: '/consumptions/from-scan/[scanId]',
      params: { scanId: 'scan-1' },
    });
    expect(actions().secondary).toBeNull();
  });

  it('opens the existing default and offers an explicit new occurrence', () => {
    const selected = actions({ scan: { ...scan, defaultConsumptionId: 'consumption-1' } });
    expect(selected.primary).toEqual({
      label: 'Buka catatan konsumsi',
      pathname: '/consumptions/[id]',
      params: { id: 'consumption-1' },
    });
    expect(selected.secondary).toEqual({
      label: 'Catat sebagai konsumsi baru',
      pathname: '/consumptions/from-scan/[scanId]',
      params: { scanId: 'scan-1', occurrence: 'new_occurrence' },
    });
  });

  it.each(['queued', 'processing'] as const)(
    'blocks confirmation during a %s correction',
    (status) => {
      const selected = actions({
        selectedJobId: 'job-2',
        scan: { ...scan, latestJobId: 'job-2' },
        latestJob: {
          ...completed,
          id: 'job-2',
          inputKind: 'correction',
          targetRevision: 2,
          status,
        },
      });
      expect(selected.primary).toBeNull();
      expect(selected.secondary).toBeNull();
      expect(selected.message).toBe('Tunggu koreksi sebelum mencatat konsumsi');
    }
  );

  it('requires an explicit last-successful-result choice after correction failure', () => {
    const selected = actions({
      selectedJobId: 'job-2',
      scan: { ...scan, latestJobId: 'job-2' },
      latestJob: {
        ...completed,
        id: 'job-2',
        inputKind: 'correction',
        targetRevision: 2,
        status: 'failed',
        resultId: null,
      },
    });
    expect(selected.primary).toEqual({
      label: 'Gunakan hasil terakhir yang berhasil',
      pathname: '/consumptions/from-scan/[scanId]',
      params: { scanId: 'scan-1', useLastSuccessfulResult: 'true' },
    });
    expect(selected.secondary).toBeNull();
  });

  it('keeps new occurrence explicit after a failed correction with an existing record', () => {
    const selected = actions({
      selectedJobId: 'job-2',
      scan: { ...scan, latestJobId: 'job-2', defaultConsumptionId: 'consumption-1' },
      latestJob: {
        ...completed,
        id: 'job-2',
        inputKind: 'correction',
        targetRevision: 2,
        status: 'failed',
        resultId: null,
      },
    });
    expect(selected.primary?.label).toBe('Buka catatan konsumsi');
    expect(selected.secondary).toEqual({
      label: 'Catat sebagai konsumsi baru dari hasil terakhir yang berhasil',
      pathname: '/consumptions/from-scan/[scanId]',
      params: {
        scanId: 'scan-1',
        occurrence: 'new_occurrence',
        useLastSuccessfulResult: 'true',
      },
    });
  });

  it('requires the new result after a successful correction', () => {
    const correctedScan = {
      ...scan,
      revision: 2,
      latestJobId: 'job-2',
      latestResultId: 'result-2',
    };
    const correctedJob = {
      ...completed,
      id: 'job-2',
      inputKind: 'correction' as const,
      targetRevision: 2,
      resultId: 'result-2',
    };
    expect(
      actions({
        selectedJobId: 'job-2',
        scan: correctedScan,
        latestJob: correctedJob,
        resultId: 'result-1',
      }).primary
    ).toBeNull();
    expect(
      actions({
        selectedJobId: 'job-2',
        scan: correctedScan,
        latestJob: correctedJob,
        resultId: 'result-2',
      }).primary
    ).toMatchObject({ label: 'Sudah dikonsumsi' });
  });

  it('sends an old completed job screen to the latest successful analysis before confirmation', () => {
    const selected = actions({
      scan: { ...scan, revision: 2, latestJobId: 'job-2', latestResultId: 'result-2' },
      latestJob: {
        ...completed,
        id: 'job-2',
        inputKind: 'correction',
        targetRevision: 2,
        resultId: 'result-2',
      },
      resultId: 'result-2',
    });
    expect(selected).toMatchObject({
      primary: {
        label: 'Buka hasil terbaru',
        pathname: '/food/analysis/[id]',
        params: { id: 'job-2' },
      },
      secondary: null,
    });
  });

  it.each(['failed', 'cancelled'] as const)(
    'sends an old %s job screen to the latest analysis without offering confirmation',
    (status) => {
      const selected = actions({
        selectedJobId: 'job-old',
        scan: { ...scan, defaultConsumptionId: 'consumption-1' },
        latestJob: { ...completed, status },
      });
      expect(selected.primary).toEqual({
        label: 'Buka hasil terbaru',
        pathname: '/food/analysis/[id]',
        params: { id: 'job-1' },
      });
      expect(selected.secondary).toBeNull();
    }
  );

  it('offers a useful retry message when the latest result read fails', () => {
    expect(
      actions({ resultId: undefined, result: undefined, latestResultLoadError: true })
    ).toMatchObject({
      primary: null,
      message: 'Hasil terbaru belum dapat dimuat. Pilih Muat status terbaru untuk mencoba lagi.',
    });
  });

  it('retries the latest result with the job and scan on manual refresh', async () => {
    const calls: string[] = [];
    const { refreshAnalysisReads } = await import('./photo-confirmation-actions');
    await refreshAnalysisReads({
      refetchJob: async () => {
        calls.push('job');
      },
      refreshActionSnapshot: async () => {
        calls.push('scan');
      },
      refetchLatestResult: async () => {
        calls.push('result');
      },
    });
    expect(calls).toEqual(['job', 'scan', 'result']);
  });
});
