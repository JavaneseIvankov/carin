import type { components } from '@/lib/api/generated/app-api';
import { getAnalysisPollInterval } from './analysis-presentation';

type AnalysisStatus = components['schemas']['AnalysisJob']['status'];

type AnalysisPollingOptions = {
  initialStatus: AnalysisStatus;
  getElapsedMs: () => number;
  shouldPoll: () => boolean;
  refetch: () => Promise<AnalysisStatus | null>;
};

export function startAnalysisPolling(options: AnalysisPollingOptions): () => void {
  let cancelled = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const schedule = (status: AnalysisStatus) => {
    if (cancelled) return;
    const delay = getAnalysisPollInterval(status, options.getElapsedMs(), options.shouldPoll());
    if (delay === false) return;

    timeout = setTimeout(() => {
      if (cancelled || !options.shouldPoll()) return;
      void options
        .refetch()
        .then((nextStatus) => schedule(nextStatus ?? status))
        .catch(() => schedule(status));
    }, delay);
  };

  schedule(options.initialStatus);

  return () => {
    cancelled = true;
    if (timeout !== undefined) clearTimeout(timeout);
  };
}
