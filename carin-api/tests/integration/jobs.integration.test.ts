import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/db/client.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { createAiClient } from '../../src/integrations/ai/index.js';
import {
  claimNextJob,
  publishJobResult,
  recordJobFailure,
  renewJobLease,
} from '../../src/jobs/repository.js';
import { runAnalysisWorkerOnce } from '../../src/jobs/worker.js';
import { setAiConsent } from '../../src/modules/legal/consent-service.js';
import { getLegalRegistry } from '../../src/modules/legal/registry.js';

const containerName = `carin-c16-jobs-${randomUUID()}`;
const userId = randomUUID();
const sessionId = randomUUID();
const profileSnapshotId = randomUUID();
let pool: Pool;
let database: ReturnType<typeof createDatabase>;
let containerStarted = false;

beforeAll(async () => {
  execFileSync(
    'docker',
    [
      'run', '-d', '--rm', '--name', containerName,
      '-e', `POSTGRES_PASSWORD=${randomUUID()}`,
      '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
      '-p', '127.0.0.1::5432',
      'postgres:18.3-alpine@sha256:54451ecb8ab38c24c3ec123f2fd501303a3a1856a5c66e98cecf2460d5e1e9d7',
    ],
    { stdio: 'pipe' },
  );
  containerStarted = true;
  const port = execFileSync('docker', ['port', containerName, '5432/tcp'], { encoding: 'utf8' })
    .trim().split(':').at(-1);
  pool = new Pool({
    connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres`,
    connectionTimeoutMillis: 1_000,
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  await applyMigrations(pool);
  const legal = getLegalRegistry();
  await pool.query(
    `INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at,birth_date,accepted_terms_version,accepted_privacy_version,accepted_at)
     VALUES ($1,'Jobs test',$2,true,now(),now(),'1995-01-01',$3,$4,now())`,
    [userId, `${userId}@example.invalid`, legal.terms.version, legal.privacy.version],
  );
  await pool.query(
    `INSERT INTO session (id,expires_at,token,created_at,updated_at,user_id)
     VALUES ($1,now()+interval '1 day',$2,now(),now(),$3)`,
    [sessionId, randomUUID(), userId],
  );
  await pool.query(
    `INSERT INTO profile_snapshot (id,user_id,profile_version,context) VALUES ($1,$2,1,'{}')`,
    [profileSnapshotId, userId],
  );
  await pool.query(
    `INSERT INTO consent_event (user_id,kind,version,granted)
     VALUES ($1,'ai_processing',$2,true)`,
    [userId, legal.aiProcessing.version],
  );
  database = createDatabase(pool);
}, 120_000);

afterAll(async () => {
  await pool?.end();
  if (containerStarted) execFileSync('docker', ['rm', '-f', containerName], { stdio: 'pipe' });
});

async function createPhotoJob(options: {
  deadlineOffsetMs?: number;
  inputSnapshot?: Record<string, unknown>;
} = {}): Promise<{ id: string; operationId: string; scanId: string }> {
  const photoId = randomUUID();
  const scanId = randomUUID();
  const jobId = randomUUID();
  const operationId = randomUUID();
  await pool.query(
    `INSERT INTO photo (id,user_id,object_key,checksum,mime_type,size_bytes)
     VALUES ($1,$2,$3,'test-sha256','image/jpeg',100)`,
    [photoId, userId, randomUUID()],
  );
  await pool.query(
    `INSERT INTO scan (id,user_id,photo_id,profile_snapshot_id) VALUES ($1,$2,$3,$4)`,
    [scanId, userId, photoId, profileSnapshotId],
  );
  await pool.query(
    `INSERT INTO analysis_job
      (id,user_id,operation_id,kind,input_snapshot,profile_snapshot_id,scan_id,target_revision,deadline_at)
     VALUES ($1,$2,$3,'photo_analysis',$4,$5,$6,1,COALESCE($7,now()+interval '5 minutes'))`,
    [jobId, userId, operationId, options.inputSnapshot ?? {}, profileSnapshotId, scanId,
      options.deadlineOffsetMs === undefined ? null : new Date(Date.now() + options.deadlineOffsetMs)],
  );
  await pool.query('UPDATE scan SET latest_job_id=$1 WHERE id=$2', [jobId, scanId]);
  return { id: jobId, operationId, scanId };
}

function completePhotoResult(operationId: string) {
  const result = JSON.parse(readFileSync(
    new URL('../../../specs/fixtures/ai/analysis-complete.json', import.meta.url),
    'utf8',
  )) as Record<string, unknown>;
  result.operationId = operationId;
  result.profileVersion = 1;
  return result;
}

async function waitForLockWaiters(minimum: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const waiting = await pool.query(
      `SELECT count(*)::int AS count FROM pg_stat_activity
       WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock'`,
    );
    if (waiting.rows[0].count >= minimum) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Expected ${minimum} database lock waiters`);
}

async function holdOwnerLockPastLease<T>(jobId: string, operation: () => Promise<T>): Promise<T> {
  const blocker = await pool.connect();
  try {
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [userId]);
    await pool.query(
      `UPDATE analysis_job SET lease_expires_at=clock_timestamp()+interval '350 milliseconds' WHERE id=$1`,
      [jobId],
    );
    const pending = operation();
    await waitForLockWaiters(1);
    await new Promise((resolve) => setTimeout(resolve, 450));
    await blocker.query('COMMIT');
    return await pending;
  } finally {
    await blocker.query('ROLLBACK').catch(() => undefined);
    blocker.release();
  }
}

describe('durable analysis job leases and publication', () => {
  it('reclaims a crashed lease with a new fence and publishes at most once', async () => {
    const job = await createPhotoJob();
    const first = await claimNextJob(database);
    expect(first?.id).toBe(job.id);

    await pool.query(
      "UPDATE analysis_job SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
      [job.id],
    );
    const second = await claimNextJob(database);
    expect(second?.id).toBe(job.id);
    expect(second?.attempts).toBe(2);
    expect(second?.leaseToken).not.toBe(first?.leaseToken);

    const result = completePhotoResult(job.operationId);
    expect(await publishJobResult(database, {
      jobId: job.id,
      userId,
      leaseToken: first!.leaseToken,
      result,
    })).toBe(false);
    expect(await publishJobResult(database, {
      jobId: job.id,
      userId,
      leaseToken: second!.leaseToken,
      result,
    })).toBe(true);
    // A process that lost the commit acknowledgement cannot create a second result.
    expect(await publishJobResult(database, {
      jobId: job.id,
      userId,
      leaseToken: second!.leaseToken,
      result,
    })).toBe(false);

    const committed = await pool.query(
      `SELECT j.status,j.lease_token,j.finished_at,s.revision,s.current_result_id,
              (SELECT count(*) FROM analysis_result r WHERE r.job_id=j.id)::int AS result_count
       FROM analysis_job j JOIN scan s ON s.id=j.scan_id WHERE j.id=$1`,
      [job.id],
    );
    expect(committed.rows[0]).toMatchObject({ status: 'completed', lease_token: null, revision: 1, result_count: 1 });
    expect(committed.rows[0]?.finished_at).toBeInstanceOf(Date);
    expect(committed.rows[0]?.current_result_id).toEqual(expect.any(String));
  });

  it('rolls back a result when publication fails before commit, then commits it atomically', async () => {
    const job = await createPhotoJob();
    const claim = await claimNextJob(database);
    expect(claim?.id).toBe(job.id);
    await pool.query(`
      CREATE FUNCTION c16_fail_scan_publish() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'injected publish failure'; END $$;
      CREATE TRIGGER c16_fail_scan_publish BEFORE UPDATE ON scan
        FOR EACH ROW EXECUTE FUNCTION c16_fail_scan_publish();
    `);
    try {
      await expect(publishJobResult(database, {
        jobId: job.id,
        userId,
        leaseToken: claim!.leaseToken,
        result: completePhotoResult(job.operationId),
      })).rejects.toThrow();
    } finally {
      await pool.query('DROP TRIGGER c16_fail_scan_publish ON scan');
      await pool.query('DROP FUNCTION c16_fail_scan_publish()');
    }
    const beforeCommit = await pool.query(
      `SELECT status,(SELECT count(*) FROM analysis_result WHERE job_id=$1)::int AS result_count FROM analysis_job WHERE id=$1`,
      [job.id],
    );
    expect(beforeCommit.rows[0]).toEqual({ status: 'processing', result_count: 0 });
    expect(await publishJobResult(database, {
      jobId: job.id,
      userId,
      leaseToken: claim!.leaseToken,
      result: completePhotoResult(job.operationId),
    })).toBe(true);
    const afterCommit = await pool.query(
      `SELECT status,(SELECT count(*) FROM analysis_result WHERE job_id=$1)::int AS result_count FROM analysis_job WHERE id=$1`,
      [job.id],
    );
    expect(afterCommit.rows[0]).toEqual({ status: 'completed', result_count: 1 });
  });

  it('claims distinct jobs concurrently and caps live processing at two per user', async () => {
    const jobs = await Promise.all([createPhotoJob(), createPhotoJob(), createPhotoJob()]);
    const concurrent = await Promise.all([claimNextJob(database), claimNextJob(database), claimNextJob(database)]);
    const firstClaims = concurrent.filter((value) => value !== null);
    expect(new Set(firstClaims.map((value) => value.id)).size).toBe(firstClaims.length);
    const claimedIds = new Set(firstClaims.map((value) => value.id));

    for (let attempt = 0; attempt < 3 && claimedIds.size < 2; attempt++) {
      const next = await claimNextJob(database);
      if (next) claimedIds.add(next.id);
    }
    expect(claimedIds.size).toBe(2);
    expect(await claimNextJob(database)).toBeNull();
    expect(jobs.some((job) => claimedIds.has(job.id))).toBe(true);
    const active = await pool.query(
      "SELECT count(*)::int AS count FROM analysis_job WHERE user_id=$1 AND status='processing' AND lease_expires_at>now()",
      [userId],
    );
    expect(active.rows[0]?.count).toBe(2);
    await pool.query(
      `UPDATE analysis_job
       SET status='cancelled',lease_token=NULL,lease_expires_at=NULL,finished_at=now(),updated_at=now()
       WHERE id=ANY($1::uuid[]) AND status IN ('queued','processing')`,
      [jobs.map((job) => job.id)],
    );
  });

  it('rejects a stale heartbeat and cancels publication after target generation changes', async () => {
    const job = await createPhotoJob();
    const claim = await claimNextJob(database);
    expect(claim?.id).toBe(job.id);
    const renewed = await renewJobLease(database, {
      jobId: job.id,
      userId,
      leaseToken: claim!.leaseToken,
    });
    expect(renewed).toBeInstanceOf(Date);
    expect(await renewJobLease(database, {
      jobId: job.id,
      userId,
      leaseToken: randomUUID(),
    })).toBeNull();

    const fixedDeadline = new Date(Date.now() + 2_000);
    await pool.query(
      'UPDATE analysis_job SET deadline_at=$2 WHERE id=$1',
      [job.id, fixedDeadline],
    );
    const deadlineBoundRenewal = await renewJobLease(database, {
      jobId: job.id,
      userId,
      leaseToken: claim!.leaseToken,
    });
    expect(deadlineBoundRenewal).toBeInstanceOf(Date);
    expect(deadlineBoundRenewal!.getTime()).toBeLessThanOrEqual(fixedDeadline.getTime());

    await pool.query(
      "UPDATE scan SET generation=generation+1,latest_job_id=NULL WHERE id=$1",
      [job.scanId],
    );
    expect(await publishJobResult(database, {
      jobId: job.id,
      userId,
      leaseToken: claim!.leaseToken,
      result: completePhotoResult(job.operationId),
    })).toBe(false);
    const state = await pool.query(
      `SELECT status,finished_at,(SELECT count(*) FROM analysis_result WHERE job_id=$1)::int AS result_count
       FROM analysis_job WHERE id=$1`,
      [job.id],
    );
    expect(state.rows[0]).toMatchObject({ status: 'cancelled', result_count: 0 });
    expect(state.rows[0]?.finished_at).toBeInstanceOf(Date);
  });

  it('does not publish a scan after its photo target is deleted', async () => {
    const job = await createPhotoJob();
    const claim = await claimNextJob(database);
    expect(claim?.id).toBe(job.id);
    await pool.query('UPDATE scan SET photo_id=NULL WHERE id=$1', [job.scanId]);
    expect(await publishJobResult(database, {
      jobId: job.id,
      userId,
      leaseToken: claim!.leaseToken,
      result: completePhotoResult(job.operationId),
    })).toBe(false);
    const state = await pool.query(
      `SELECT status,(SELECT count(*) FROM analysis_result WHERE job_id=$1)::int AS result_count
       FROM analysis_job WHERE id=$1`,
      [job.id],
    );
    expect(state.rows[0]).toEqual({ status: 'cancelled', result_count: 0 });
  });

  it('withdraws consent, fences an in-flight lease, and does not revive it after re-grant', async () => {
    const job = await createPhotoJob();
    const claim = await claimNextJob(database);
    expect(claim?.id).toBe(job.id);
    const version = getLegalRegistry().aiProcessing.version;
    await setAiConsent(database, {
      userId,
      sessionId,
      key: randomUUID(),
      action: { version, granted: false },
    });
    expect(await publishJobResult(database, {
      jobId: job.id,
      userId,
      leaseToken: claim!.leaseToken,
      result: completePhotoResult(job.operationId),
    })).toBe(false);

    await setAiConsent(database, {
      userId,
      sessionId,
      key: randomUUID(),
      action: { version, granted: true },
    });
    expect(await claimNextJob(database)).toBeNull();
    const state = await pool.query(
      `SELECT status,lease_token,finished_at,(SELECT count(*) FROM analysis_result WHERE job_id=$1)::int AS result_count
       FROM analysis_job WHERE id=$1`,
      [job.id],
    );
    expect(state.rows[0]).toMatchObject({ status: 'cancelled', lease_token: null, result_count: 0 });
    expect(state.rows[0]?.finished_at).toBeInstanceOf(Date);
  });

  it('serializes a concurrent withdrawal ahead of publication on the owner row lock', async () => {
    const job = await createPhotoJob();
    const claim = await claimNextJob(database);
    expect(claim?.id).toBe(job.id);
    const blocker = await pool.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [userId]);
      const withdrawal = setAiConsent(database, {
        userId,
        sessionId,
        key: randomUUID(),
        action: { version: getLegalRegistry().aiProcessing.version, granted: false },
      });
      await waitForLockWaiters(1);
      const publication = publishJobResult(database, {
        jobId: job.id,
        userId,
        leaseToken: claim!.leaseToken,
        result: completePhotoResult(job.operationId),
      });
      await waitForLockWaiters(2);
      await blocker.query('COMMIT');
      await withdrawal;
      expect(await publication).toBe(false);
    } finally {
      await blocker.query('ROLLBACK').catch(() => undefined);
      blocker.release();
    }
    const final = await pool.query(
      `SELECT status,(SELECT count(*) FROM analysis_result WHERE job_id=$1)::int AS result_count
       FROM analysis_job WHERE id=$1`,
      [job.id],
    );
    expect(final.rows[0]).toEqual({ status: 'cancelled', result_count: 0 });
    await setAiConsent(database, {
      userId,
      sessionId,
      key: randomUUID(),
      action: { version: getLegalRegistry().aiProcessing.version, granted: true },
    });
    expect(await claimNextJob(database)).toBeNull();
  });

  it('uses bounded automatic retries and fails when the next retry crosses the job deadline', async () => {
    const job = await createPhotoJob();
    const first = await claimNextJob(database);
    const firstNow = new Date();
    expect(await recordJobFailure(database, {
      jobId: job.id,
      userId,
      leaseToken: first!.leaseToken,
      error: { code: 'SERVICE_UNAVAILABLE', message: 'AI service unavailable.', retryable: true },
      now: firstNow,
    })).toBe('retrying');
    const queued = await pool.query('SELECT next_attempt_at FROM analysis_job WHERE id=$1', [job.id]);
    const nextAttemptAt = new Date(queued.rows[0].next_attempt_at).getTime();
    expect(nextAttemptAt - firstNow.getTime()).toBeGreaterThanOrEqual(1_900);
    expect(nextAttemptAt - firstNow.getTime()).toBeLessThanOrEqual(2_100);

    const secondNow = new Date(nextAttemptAt + 1);
    const second = await claimNextJob(database, { now: secondNow });
    expect(second?.attempts).toBe(2);
    const deadlineAt = new Date(secondNow.getTime() + 5_000);
    await pool.query('UPDATE analysis_job SET deadline_at=$2 WHERE id=$1', [job.id, deadlineAt]);
    expect(await recordJobFailure(database, {
      jobId: job.id,
      userId,
      leaseToken: second!.leaseToken,
      error: { code: 'SERVICE_UNAVAILABLE', message: 'AI service unavailable.', retryable: true },
      now: secondNow,
    })).toBe('failed');
    const failed = await pool.query('SELECT status,error,finished_at FROM analysis_job WHERE id=$1', [job.id]);
    expect(failed.rows[0]).toMatchObject({
      status: 'failed',
      error: { code: 'DEADLINE_EXCEEDED', retryable: true },
    });
    expect(failed.rows[0]?.finished_at).toBeInstanceOf(Date);
  });

  it('stops after the third automatic attempt', async () => {
    const job = await createPhotoJob();
    const first = await claimNextJob(database);
    expect(first?.attempts).toBe(1);
    expect(await recordJobFailure(database, {
      jobId: job.id,
      userId,
      leaseToken: first!.leaseToken,
      error: { code: 'SERVICE_UNAVAILABLE', message: 'AI service unavailable.', retryable: true },
    })).toBe('retrying');
    const firstQueued = await pool.query('SELECT next_attempt_at FROM analysis_job WHERE id=$1', [job.id]);
    const secondNow = new Date(new Date(firstQueued.rows[0].next_attempt_at).getTime() + 1);
    const second = await claimNextJob(database, { now: secondNow });
    expect(second?.attempts).toBe(2);
    expect(await recordJobFailure(database, {
      jobId: job.id,
      userId,
      leaseToken: second!.leaseToken,
      error: { code: 'SERVICE_UNAVAILABLE', message: 'AI service unavailable.', retryable: true },
    })).toBe('retrying');
    const secondQueued = await pool.query('SELECT next_attempt_at FROM analysis_job WHERE id=$1', [job.id]);
    const thirdNow = new Date(new Date(secondQueued.rows[0].next_attempt_at).getTime() + 1);
    const third = await claimNextJob(database, { now: thirdNow });
    expect(third?.attempts).toBe(3);
    expect(await recordJobFailure(database, {
      jobId: job.id,
      userId,
      leaseToken: third!.leaseToken,
      error: { code: 'SERVICE_UNAVAILABLE', message: 'AI service unavailable.', retryable: true },
    })).toBe('failed');
    const failed = await pool.query('SELECT status,error FROM analysis_job WHERE id=$1', [job.id]);
    expect(failed.rows[0]).toMatchObject({
      status: 'failed',
      error: { code: 'SERVICE_UNAVAILABLE', retryable: true },
    });
  });

  it('fails queued jobs whose fixed deadline passes before a worker claims them', async () => {
    const job = await createPhotoJob({ deadlineOffsetMs: -1_000 });
    expect(await claimNextJob(database)).toBeNull();
    const failed = await pool.query('SELECT status,error,started_at,finished_at FROM analysis_job WHERE id=$1', [job.id]);
    expect(failed.rows[0]).toMatchObject({
      status: 'failed',
      error: { code: 'DEADLINE_EXCEEDED', retryable: true },
      started_at: null,
    });
    expect(failed.rows[0]?.finished_at).toBeInstanceOf(Date);
  });

  it('serves owner-only job reads and idempotently creates terminal retries from the frozen snapshot', async () => {
    const job = await createPhotoJob();
    const inputSnapshot = {};
    await pool.query(
      `UPDATE analysis_job SET status='failed',error=$2,finished_at=now() WHERE id=$1`,
      [job.id, { code: 'SERVICE_UNAVAILABLE', message: 'AI unavailable.', retryable: true }],
    );
    const app = createApp({
      readiness: async () => true,
      analysisJobs: {
        db: database,
        resolveSession: async (request) => ({
          userId: request.headers.get('x-test-user') ?? userId,
          emailVerified: true,
          sessionId,
        }),
      },
    });
    const key = randomUUID();
    const retryResponse = await app.request(`/api/v1/analysis-jobs/${job.id}/retry`, {
      method: 'POST',
      headers: { 'Idempotency-Key': key },
    });
    expect(retryResponse.status).toBe(202);
    const retried = await retryResponse.json() as { id: string; status: string };
    expect(retried.id).not.toBe(job.id);
    expect(retried.status).toBe('queued');

    const repeatedResponse = await app.request(`/api/v1/analysis-jobs/${job.id}/retry`, {
      method: 'POST',
      headers: { 'Idempotency-Key': key },
    });
    expect(repeatedResponse.status).toBe(202);
    expect((await repeatedResponse.json() as { id: string }).id).toBe(retried.id);
    const stored = await pool.query(
      'SELECT input_snapshot,operation_id,target_generation,target_revision FROM analysis_job WHERE id=$1',
      [retried.id],
    );
    expect(stored.rows[0]).toMatchObject({
      input_snapshot: inputSnapshot,
      target_generation: 1,
      target_revision: 1,
    });
    expect(stored.rows[0].operation_id).not.toBe(job.operationId);

    const ownedRead = await app.request(`/api/v1/analysis-jobs/${retried.id}`);
    expect(ownedRead.status).toBe(200);
    expect((await ownedRead.json() as { id: string }).id).toBe(retried.id);
    const foreignRead = await app.request(`/api/v1/analysis-jobs/${retried.id}`, {
      headers: { 'x-test-user': randomUUID() },
    });
    expect(foreignRead.status).toBe(404);

    const differentSource = await createPhotoJob();
    await pool.query(
      `UPDATE analysis_job SET status='failed',error=$2,finished_at=now() WHERE id=$1`,
      [differentSource.id, { code: 'SERVICE_UNAVAILABLE', message: 'AI unavailable.', retryable: true }],
    );
    const keyConflict = await app.request(`/api/v1/analysis-jobs/${differentSource.id}/retry`, {
      method: 'POST',
      headers: { 'Idempotency-Key': key },
    });
    expect(keyConflict.status).toBe(409);

    await createPhotoJob();
    const overflow = await createPhotoJob();
    await pool.query(
      `UPDATE analysis_job SET status='failed',error=$2,finished_at=now() WHERE id=$1`,
      [overflow.id, { code: 'SERVICE_UNAVAILABLE', message: 'AI unavailable.', retryable: true }],
    );
    const rateLimited = await app.request(`/api/v1/analysis-jobs/${overflow.id}/retry`, {
      method: 'POST',
      headers: { 'Idempotency-Key': randomUUID() },
    });
    expect(rateLimited.status).toBe(429);
    expect(rateLimited.headers.get('retry-after')).toBe('5');
  });

  it('refuses retry after target generation changes and after consent withdrawal', async () => {
    const stale = await createPhotoJob();
    await pool.query(
      `UPDATE analysis_job SET status='failed',error=$2,finished_at=now() WHERE id=$1`,
      [stale.id, { code: 'SERVICE_UNAVAILABLE', message: 'AI unavailable.', retryable: true }],
    );
    await pool.query('UPDATE scan SET generation=generation+1 WHERE id=$1', [stale.scanId]);
    const app = createApp({
      readiness: async () => true,
      analysisJobs: {
        db: database,
        resolveSession: async () => ({ userId, emailVerified: true, sessionId }),
      },
    });
    const staleResponse = await app.request(`/api/v1/analysis-jobs/${stale.id}/retry`, {
      method: 'POST',
      headers: { 'Idempotency-Key': randomUUID() },
    });
    expect(staleResponse.status).toBe(409);

    const withdrawn = await createPhotoJob();
    await pool.query(
      `UPDATE analysis_job SET status='failed',error=$2,finished_at=now() WHERE id=$1`,
      [withdrawn.id, { code: 'SERVICE_UNAVAILABLE', message: 'AI unavailable.', retryable: true }],
    );
    await setAiConsent(database, {
      userId,
      sessionId,
      key: randomUUID(),
      action: { version: getLegalRegistry().aiProcessing.version, granted: false },
    });
    const withdrawnResponse = await app.request(`/api/v1/analysis-jobs/${withdrawn.id}/retry`, {
      method: 'POST',
      headers: { 'Idempotency-Key': randomUUID() },
    });
    expect(withdrawnResponse.status).toBe(403);
    await setAiConsent(database, {
      userId,
      sessionId,
      key: randomUUID(),
      action: { version: getLegalRegistry().aiProcessing.version, granted: true },
    });
    expect(await claimNextJob(database)).toBeNull();
  });

  it('executes a durable claim through the shared fixture AI client and publishes its result', async () => {
    const inputSnapshot = {
        contractVersion: '1.0.0',
        catalogVersion: 'synthetic-catalog-1',
        ruleSetVersion: 'synthetic-rules-1',
        profile: {
          profileVersion: 1,
          ageYears: null,
          heightCm: null,
          weightKg: null,
          sexForReference: null,
          diagnosisState: 'not_provided',
          conditionIds: [],
          unsupportedConditionLabels: [],
          allergyState: 'not_provided',
          allergies: [],
          activity: null,
          smoking: null,
        },
        image: {
          downloadUrl: 'http://minio.internal.invalid/test.jpg',
          mimeType: 'image/jpeg',
          sha256: 'a'.repeat(64),
        },
      };
    const job = await createPhotoJob({ inputSnapshot });
    const ai = createAiClient(loadConfig({
      APP_ENV: 'dev',
      AI_MODE: 'fixture',
      DATABASE_URL: 'postgresql://postgres@localhost/carin',
    }));
    expect(await runAnalysisWorkerOnce(database, ai)).toBe('completed');
    const persisted = await pool.query(
      `SELECT status,(SELECT count(*) FROM analysis_result WHERE job_id=$1)::int AS result_count FROM analysis_job WHERE id=$1`,
      [job.id],
    );
    expect(persisted.rows[0]).toEqual({ status: 'completed', result_count: 1 });

    const retryJob = await createPhotoJob({ inputSnapshot });
    const failingAi = createAiClient(loadConfig({
      APP_ENV: 'dev',
      AI_MODE: 'fixture',
      DATABASE_URL: 'postgresql://postgres@localhost/carin',
    }), 'service-failure');
    expect(await runAnalysisWorkerOnce(database, failingAi)).toBe('failed');
    const scheduled = await pool.query(
      'SELECT status,attempts,error,next_attempt_at FROM analysis_job WHERE id=$1',
      [retryJob.id],
    );
    expect(scheduled.rows[0]).toMatchObject({ status: 'queued', attempts: 1, error: null });
    expect(scheduled.rows[0].next_attempt_at).toBeInstanceOf(Date);
    await pool.query(
      `UPDATE analysis_job SET status='cancelled',finished_at=clock_timestamp(),updated_at=clock_timestamp()
       WHERE id=$1 AND status='queued'`,
      [retryJob.id],
    );
  });

  it('rejects heartbeat, publication, and failure after waiting for the owner lock past lease expiry', async () => {
    const renewJob = await createPhotoJob();
    const renewClaim = await claimNextJob(database);
    expect(renewClaim?.id).toBe(renewJob.id);
    expect(await holdOwnerLockPastLease(renewJob.id, () => renewJobLease(database, {
      jobId: renewJob.id,
      userId,
      leaseToken: renewClaim!.leaseToken,
    }))).toBeNull();
    await pool.query(
      `UPDATE analysis_job SET status='cancelled',lease_token=NULL,lease_expires_at=NULL,finished_at=now()
       WHERE id=$1 AND status='processing'`,
      [renewJob.id],
    );

    const publishJob = await createPhotoJob();
    const publishClaim = await claimNextJob(database);
    expect(publishClaim?.id).toBe(publishJob.id);
    expect(await holdOwnerLockPastLease(publishJob.id, () => publishJobResult(database, {
      jobId: publishJob.id,
      userId,
      leaseToken: publishClaim!.leaseToken,
      result: completePhotoResult(publishJob.operationId),
    }))).toBe(false);
    await pool.query(
      `UPDATE analysis_job SET status='cancelled',lease_token=NULL,lease_expires_at=NULL,finished_at=now()
       WHERE id=$1 AND status='processing'`,
      [publishJob.id],
    );

    const failureJob = await createPhotoJob();
    const failureClaim = await claimNextJob(database);
    expect(failureClaim?.id).toBe(failureJob.id);
    expect(await holdOwnerLockPastLease(failureJob.id, () => recordJobFailure(database, {
      jobId: failureJob.id,
      userId,
      leaseToken: failureClaim!.leaseToken,
      error: { code: 'SERVICE_UNAVAILABLE', message: 'AI service unavailable.', retryable: true },
    }))).toBe('stale');
  });
});
