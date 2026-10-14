import { describe, expect, it } from 'vitest';
import {
  AI_CALL_TIMEOUT_MS,
  JOB_DEADLINE_MS,
  JOB_LEASE_MS,
  JOB_MAX_ACTIVE_PER_USER,
  JOB_MAX_ATTEMPTS,
  getLeaseExpiry,
  planRetry,
} from './policy.js';

const now = new Date('2026-10-14T00:00:00.000Z');

describe('durable analysis job policy', () => {
  it('keeps the agreed AI, deadline, lease, retry, and per-user budgets', () => {
    expect({
      aiCallTimeout: AI_CALL_TIMEOUT_MS,
      deadline: JOB_DEADLINE_MS,
      lease: JOB_LEASE_MS,
      attempts: JOB_MAX_ATTEMPTS,
      activePerUser: JOB_MAX_ACTIVE_PER_USER,
    }).toEqual({
      aiCallTimeout: 90_000,
      deadline: 300_000,
      lease: 120_000,
      attempts: 3,
      activePerUser: 2,
    });
  });

  it('clamps a lease to the fixed overall deadline', () => {
    expect(getLeaseExpiry(now, new Date(now.getTime() + 45_000))).toEqual(
      new Date(now.getTime() + 45_000),
    );
    expect(getLeaseExpiry(now, new Date(now.getTime() - 1))).toBeNull();
  });

  it.each([
    [1, 2_000],
    [2, 10_000],
  ])('schedules retry attempt %i after its bounded backoff', (attempts, delayMs) => {
    expect(planRetry({
      attempts,
      maxAttempts: JOB_MAX_ATTEMPTS,
      now,
      deadlineAt: new Date(now.getTime() + 60_000),
      retryable: true,
    })).toEqual({
      kind: 'retry',
      nextAttemptAt: new Date(now.getTime() + delayMs),
    });
  });

  it('fails when the provider error is permanent, attempts are exhausted, or backoff crosses the deadline', () => {
    const common = {
      maxAttempts: JOB_MAX_ATTEMPTS,
      now,
      deadlineAt: new Date(now.getTime() + 60_000),
      retryable: true,
    };
    expect(planRetry({ ...common, attempts: 1, retryable: false })).toEqual({
      kind: 'fail',
      reason: 'non_retryable',
    });
    expect(planRetry({ ...common, attempts: 3 })).toEqual({
      kind: 'fail',
      reason: 'attempts_exhausted',
    });
    expect(planRetry({
      ...common,
      attempts: 2,
      deadlineAt: new Date(now.getTime() + 10_000),
    })).toEqual({ kind: 'fail', reason: 'deadline_exceeded' });
    expect(planRetry({
      ...common,
      attempts: 1,
      deadlineAt: new Date(now.getTime()),
    })).toEqual({ kind: 'fail', reason: 'deadline_exceeded' });
  });
});
