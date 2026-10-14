import { describe, expect, it, vi } from 'vitest';
import type { components } from '@/lib/api/generated/app-api';
import {
  createLatestAnalysisSnapshotRefreshCoordinator,
  getCorrectionPollingStatus,
  readLatestAnalysisSnapshot,
  refreshAnalysisStateOnReconnect,
} from './analysis-refresh';

const job = (id: string, scanId: string | null, inputKind: 'photo' | 'correction') =>
  ({ id, scanId, inputKind, status: 'completed' }) as components['schemas']['AnalysisJob'];

describe('analysis action snapshot refresh', () => {
  it('ignores an older refresh when it resolves after the newest refresh', async () => {
    let selectedRouteId = 'job-1';
    const coordinator = createLatestAnalysisSnapshotRefreshCoordinator<{ value: string }>();
    let resolveOld!: (snapshot: { value: string } | null) => void;
    let resolveNew!: (snapshot: { value: string } | null) => void;
    const oldRead = new Promise<{ value: string } | null>((resolve) => {
      resolveOld = resolve;
    });
    const newRead = new Promise<{ value: string } | null>((resolve) => {
      resolveNew = resolve;
    });
    const committed: { value: string }[] = [];
    const olderRefresh = coordinator.refresh(
      'job-1',
      () => selectedRouteId,
      () => oldRead,
      (snapshot) => committed.push(snapshot)
    );
    const newerRefresh = coordinator.refresh(
      'job-1',
      () => selectedRouteId,
      () => newRead,
      (snapshot) => committed.push(snapshot)
    );

    resolveNew({ value: 'new' });
    await newerRefresh;
    resolveOld({ value: 'old' });
    await olderRefresh;

    expect(committed).toEqual([{ value: 'new' }]);
  });

  it('does not commit a snapshot after the selected route changes', async () => {
    let selectedRouteId = 'job-1';
    const coordinator = createLatestAnalysisSnapshotRefreshCoordinator<{ value: string }>();
    let resolveRead!: (snapshot: { value: string } | null) => void;
    const pendingRead = new Promise<{ value: string } | null>((resolve) => {
      resolveRead = resolve;
    });
    const commit = vi.fn();
    const refresh = coordinator.refresh(
      'job-1',
      () => selectedRouteId,
      () => pendingRead,
      commit
    );

    selectedRouteId = 'job-2';
    resolveRead({ value: 'old route' });
    await refresh;

    expect(commit).not.toHaveBeenCalled();
  });

  it('keeps polling a known active correction when both resume snapshot reads fail', async () => {
    const activeCorrection = {
      ...job('correction-job', 'scan-1', 'correction'),
      status: 'processing',
    } as components['schemas']['AnalysisJob'];
    const previousSnapshot = { latestJob: activeCorrection };
    const retainedStatus = getCorrectionPollingStatus(previousSnapshot, null);
    const selectedJob = job('old-job', 'scan-1', 'photo');
    const readJob = vi.fn(async (id: string) => {
      if (id === 'old-job') return { data: selectedJob, stale: false };
      throw new Error('temporary network failure');
    });
    const readScan = vi.fn(async (id: string) => ({
      data: { id, latestJobId: 'correction-job' } as components['schemas']['Scan'],
      stale: false,
    }));

    expect(retainedStatus).toBe('processing');
    expect(getCorrectionPollingStatus(null, retainedStatus)).toBe('processing');
    await expect(readLatestAnalysisSnapshot('old-job', { readJob, readScan })).rejects.toThrow(
      'temporary network failure'
    );
    expect(readJob).toHaveBeenCalledTimes(3);
    expect(getCorrectionPollingStatus(null, retainedStatus)).toBe('processing');
    expect(
      getCorrectionPollingStatus(
        { latestJob: { ...activeCorrection, status: 'failed' } },
        retainedStatus
      )
    ).toBeNull();
  });

  it('follows the selected job to its scan, then reads the scan latestJobId', async () => {
    const selectedJob = job('old-job', 'scan-1', 'photo');
    const latestCorrection = {
      ...job('correction-job', 'scan-1', 'correction'),
      status: 'processing',
    } as components['schemas']['AnalysisJob'];
    const readJob = vi.fn(async (id: string) => ({
      data: id === 'old-job' ? selectedJob : latestCorrection,
      stale: false,
    }));
    const readScan = vi.fn(async (id: string) => ({
      data: {
        id,
        latestJobId: 'correction-job',
      } as components['schemas']['Scan'],
      stale: false,
    }));

    const snapshot = await readLatestAnalysisSnapshot('old-job', { readJob, readScan });

    expect(readJob.mock.calls.map(([id]) => id)).toEqual(['old-job', 'correction-job']);
    expect(readScan).toHaveBeenCalledWith('scan-1');
    expect(snapshot?.latestJob).toBe(latestCorrection);
    expect(snapshot?.latestJob.status).toBe('processing');
  });

  it('recovers when one snapshot read fails transiently', async () => {
    const selectedJob = job('old-job', 'scan-1', 'photo');
    const latestCorrection = {
      ...job('correction-job', 'scan-1', 'correction'),
      status: 'processing',
    } as components['schemas']['AnalysisJob'];
    let latestReadAttempts = 0;
    const readJob = vi.fn(async (id: string) => {
      if (id === 'correction-job' && latestReadAttempts++ === 0) {
        throw new Error('temporary network failure');
      }
      return {
        data: id === 'old-job' ? selectedJob : latestCorrection,
        stale: false,
      };
    });
    const readScan = vi.fn(async (id: string) => ({
      data: { id, latestJobId: 'correction-job' } as components['schemas']['Scan'],
      stale: false,
    }));

    const snapshot = await readLatestAnalysisSnapshot('old-job', { readJob, readScan });

    expect(snapshot?.latestJob).toBe(latestCorrection);
    expect(readJob).toHaveBeenCalledTimes(3);
  });

  it('retries a stale cache read once to obtain a fresh action snapshot', async () => {
    const selectedJob = job('old-job', 'scan-1', 'photo');
    const latestCorrection = {
      ...job('correction-job', 'scan-1', 'correction'),
      status: 'processing',
    } as components['schemas']['AnalysisJob'];
    let latestReadAttempts = 0;
    const readJob = vi.fn(async (id: string) => {
      if (id === 'correction-job' && latestReadAttempts++ === 0) {
        return { data: latestCorrection, stale: true };
      }
      return {
        data: id === 'old-job' ? selectedJob : latestCorrection,
        stale: false,
      };
    });
    const readScan = vi.fn(async (id: string) => ({
      data: { id, latestJobId: 'correction-job' } as components['schemas']['Scan'],
      stale: false,
    }));

    const snapshot = await readLatestAnalysisSnapshot('old-job', { readJob, readScan });

    expect(snapshot?.latestJob).toBe(latestCorrection);
    expect(readJob).toHaveBeenCalledTimes(3);
  });

  it('refreshes both job and action snapshot state after reconnecting online', async () => {
    const refetchJob = vi.fn(async () => {});
    const refreshActionSnapshot = vi.fn(async () => {});

    await expect(
      refreshAnalysisStateOnReconnect({
        previousConnectivity: 'offline',
        connectivity: 'online',
        focused: true,
        foreground: true,
        hasJobId: true,
        refetchJob,
        refreshActionSnapshot,
      })
    ).resolves.toBe(true);

    expect(refetchJob).toHaveBeenCalledOnce();
    expect(refreshActionSnapshot).toHaveBeenCalledOnce();
  });

  it('skips reconnect refreshes while the screen is offline or inactive', async () => {
    const refetchJob = vi.fn(async () => {});
    const refreshActionSnapshot = vi.fn(async () => {});

    await expect(
      refreshAnalysisStateOnReconnect({
        previousConnectivity: 'online',
        connectivity: 'offline',
        focused: true,
        foreground: true,
        hasJobId: true,
        refetchJob,
        refreshActionSnapshot,
      })
    ).resolves.toBe(false);
    await expect(
      refreshAnalysisStateOnReconnect({
        previousConnectivity: 'offline',
        connectivity: 'online',
        focused: false,
        foreground: true,
        hasJobId: true,
        refetchJob,
        refreshActionSnapshot,
      })
    ).resolves.toBe(false);

    expect(refetchJob).not.toHaveBeenCalled();
    expect(refreshActionSnapshot).not.toHaveBeenCalled();
  });
});
