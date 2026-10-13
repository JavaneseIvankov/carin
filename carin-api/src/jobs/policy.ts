export const AI_CALL_TIMEOUT_MS = 90_000;
export const JOB_DEADLINE_MS = 5 * 60_000;
export const JOB_LEASE_MS = 120_000;
export const JOB_MAX_ATTEMPTS = 3;
export const JOB_MAX_ACTIVE_PER_USER = 2;

const RETRY_DELAYS_MS = [2_000, 10_000] as const;

export type RetryPlan =
  | { kind: 'retry'; nextAttemptAt: Date }
  | {
      kind: 'fail';
      reason: 'deadline_exceeded' | 'non_retryable' | 'attempts_exhausted';
    };

export function getLeaseExpiry(now: Date, deadlineAt: Date): Date | null {
  const currentTime = now.getTime();
  const deadlineTime = deadlineAt.getTime();
  if (!Number.isFinite(currentTime) || !Number.isFinite(deadlineTime) || deadlineTime <= currentTime) {
    return null;
  }
  return new Date(Math.min(currentTime + JOB_LEASE_MS, deadlineTime));
}

export function planRetry(input: {
  attempts: number;
  maxAttempts: number;
  now: Date;
  deadlineAt: Date;
  retryable: boolean;
}): RetryPlan {
  const currentTime = input.now.getTime();
  const deadlineTime = input.deadlineAt.getTime();
  if (!Number.isFinite(currentTime) || !Number.isFinite(deadlineTime) || deadlineTime <= currentTime) {
    return { kind: 'fail', reason: 'deadline_exceeded' };
  }
  if (!input.retryable) return { kind: 'fail', reason: 'non_retryable' };
  const attemptLimit = Math.min(input.maxAttempts, JOB_MAX_ATTEMPTS);
  if (
    !Number.isSafeInteger(input.attempts) || input.attempts < 1 ||
    !Number.isSafeInteger(attemptLimit) || input.attempts >= attemptLimit
  ) {
    return { kind: 'fail', reason: 'attempts_exhausted' };
  }

  const delayMs = RETRY_DELAYS_MS[input.attempts - 1] ?? RETRY_DELAYS_MS.at(-1)!;
  const nextAttemptAt = currentTime + delayMs;
  if (nextAttemptAt >= deadlineTime) return { kind: 'fail', reason: 'deadline_exceeded' };
  return { kind: 'retry', nextAttemptAt: new Date(nextAttemptAt) };
}
