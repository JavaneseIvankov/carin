import type { components } from '@/lib/api/generated/app-api';

type AnalysisJob = components['schemas']['AnalysisJob'];
type Scan = components['schemas']['Scan'];
type FreshRead<T> = { data: T; stale: boolean };
export type ActiveCorrectionStatus = 'queued' | 'processing';

export function createLatestAnalysisSnapshotRefreshCoordinator<T>() {
  let latestGeneration = 0;

  return {
    async refresh(
      routeId: string,
      getCurrentRouteId: () => string | undefined,
      read: () => Promise<T | null>,
      commit: (snapshot: T) => void
    ): Promise<T | null> {
      const generation = ++latestGeneration;
      const snapshot = await read();
      if (!snapshot || generation !== latestGeneration || getCurrentRouteId() !== routeId) {
        return null;
      }

      commit(snapshot);
      return snapshot;
    },
  };
}

export function getActiveCorrectionStatus(
  latestJob: AnalysisJob | undefined
): ActiveCorrectionStatus | null {
  if (
    latestJob?.inputKind === 'correction' &&
    (latestJob.status === 'queued' || latestJob.status === 'processing')
  ) {
    return latestJob.status;
  }
  return null;
}

export function getCorrectionPollingStatus(
  snapshot: { latestJob: AnalysisJob } | null,
  retainedStatus: ActiveCorrectionStatus | null
): ActiveCorrectionStatus | null {
  return snapshot ? getActiveCorrectionStatus(snapshot.latestJob) : retainedStatus;
}

type AnalysisSnapshotReaders = {
  readJob: (id: string) => Promise<FreshRead<AnalysisJob>>;
  readScan: (id: string) => Promise<FreshRead<Scan>>;
};

async function readWithOneRetry<T>(read: () => Promise<FreshRead<T>>): Promise<FreshRead<T>> {
  try {
    const firstRead = await read();
    return firstRead.stale ? read() : firstRead;
  } catch {
    return read();
  }
}

export async function refreshAnalysisStateOnReconnect(input: {
  previousConnectivity: string;
  connectivity: string;
  focused: boolean;
  foreground: boolean;
  hasJobId: boolean;
  refetchJob: () => Promise<unknown>;
  refreshActionSnapshot: () => Promise<unknown>;
}): Promise<boolean> {
  if (
    input.previousConnectivity === 'online' ||
    input.connectivity !== 'online' ||
    !input.focused ||
    !input.foreground ||
    !input.hasJobId
  ) {
    return false;
  }

  await Promise.allSettled([input.refetchJob(), input.refreshActionSnapshot()]);
  return true;
}

export async function readLatestAnalysisSnapshot(
  selectedJobId: string,
  readers: AnalysisSnapshotReaders
): Promise<{ scan: Scan; latestJob: AnalysisJob } | null> {
  const selectedJob = await readWithOneRetry(() => readers.readJob(selectedJobId));
  const selectedScanId = selectedJob.data.scanId;
  if (selectedJob.stale || !selectedScanId) return null;

  const scan = await readWithOneRetry(() => readers.readScan(selectedScanId));
  if (scan.stale) return null;

  const latestJob = await readWithOneRetry(() => readers.readJob(scan.data.latestJobId));
  if (latestJob.stale) return null;

  return { scan: scan.data, latestJob: latestJob.data };
}
