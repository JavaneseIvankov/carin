type AnalysisJobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

type AnalysisJobState = {
  status: AnalysisJobStatus;
  startedAt: unknown;
  finishedAt: unknown;
  resultId: unknown;
  result: unknown;
  error: unknown;
};

function hasTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

function hasError(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const error = value as Record<string, unknown>;
  return typeof error.code === 'string' && error.code.length > 0 &&
    typeof error.message === 'string' && error.message.length > 0 &&
    typeof error.retryable === 'boolean';
}

export function isValidAnalysisJobState(value: unknown): value is AnalysisJobState {
  if (typeof value !== 'object' || value === null) return false;
  const job = value as Partial<AnalysisJobState>;
  switch (job.status) {
    case 'queued':
      return job.startedAt === null && job.finishedAt === null && job.resultId === null &&
        job.result === null && job.error === null;
    case 'processing':
      return hasTimestamp(job.startedAt) && job.finishedAt === null && job.resultId === null &&
        job.result === null && job.error === null;
    case 'completed':
      return hasTimestamp(job.startedAt) && hasTimestamp(job.finishedAt) &&
        typeof job.resultId === 'string' && job.resultId.length > 0 &&
        typeof job.result === 'object' && job.result !== null && job.error === null;
    case 'failed':
      return (job.startedAt === null || hasTimestamp(job.startedAt)) && hasTimestamp(job.finishedAt) &&
        job.resultId === null && job.result === null && hasError(job.error);
    case 'cancelled':
      return (job.startedAt === null || hasTimestamp(job.startedAt)) &&
        hasTimestamp(job.finishedAt) && job.resultId === null && job.result === null &&
        job.error === null;
    default:
      return false;
  }
}
