import type { Pool } from 'pg';
import type { AuthEmailInput } from './templates.js';
import { errorLogDetails, logEvent } from '../../logging.js';

export type AuthEmailSender = {
  send: (input: AuthEmailInput, idempotencyKey: string) => Promise<void>;
};

type ClaimedTask = {
  id: string;
  delivery_key: string;
  kind: string;
  payload: unknown;
  attempts: number;
  lease_token: string;
};

export type EmailWorkResult = 'idle' | 'delivered' | 'retry' | 'failed' | 'expired' | 'lease-lost';

function parsePayload(kind: string, payload: unknown): AuthEmailInput | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.to !== 'string' || typeof record.url !== 'string') return null;
  if (kind === 'verification') return { kind, to: record.to, url: record.url };
  if (kind === 'password_reset') return { kind: 'password-reset', to: record.to, url: record.url };
  return null;
}

async function claimTask(pool: Pool, now: Date): Promise<ClaimedTask | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM email_task WHERE expires_at <= $1', [now]);
    const result = await client.query<ClaimedTask>(
      `WITH candidate AS (
         SELECT task.id
         FROM email_task AS task
         JOIN "user" AS account ON account.id = task.user_id AND account.deletion_status = 'active'
         WHERE task.expires_at > $1
           AND task.next_attempt_at <= $1
           AND (
             task.status = 'queued'
             OR (task.status = 'processing' AND task.lease_expires_at <= $1)
           )
         ORDER BY task.next_attempt_at, task.created_at, task.id
         FOR UPDATE OF task SKIP LOCKED
         LIMIT 1
       )
       UPDATE email_task AS task
       SET status = 'processing',
           attempts = task.attempts + 1,
           lease_token = gen_random_uuid(),
           lease_expires_at = $1 + interval '30 seconds'
       FROM candidate
       WHERE task.id = candidate.id
       RETURNING task.id, task.delivery_key, task.kind, task.payload, task.attempts, task.lease_token`,
      [now],
    );
    await client.query('COMMIT');
    return result.rows[0] ?? null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function retryDelaySeconds(attempt: number): number {
  return [5, 30, 120, 300][Math.max(0, Math.min(attempt - 1, 3))]!;
}

function providerStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

export async function processNextEmailTask(
  pool: Pool,
  sender: AuthEmailSender,
  now = new Date(),
): Promise<EmailWorkResult> {
  const task = await claimTask(pool, now);
  if (!task) return 'idle';
  logEvent('info', 'worker.email.started', { taskId: task.id, kind: task.kind, attempt: task.attempts });
  const mail = parsePayload(task.kind, task.payload);
  if (!mail) {
    await pool.query(
      `UPDATE email_task SET status='failed', lease_token=NULL, lease_expires_at=NULL
       WHERE id=$1 AND lease_token=$2`,
      [task.id, task.lease_token],
    );
    logEvent('error', 'worker.email.invalid_task', { taskId: task.id, kind: task.kind });
    return 'failed';
  }

  try {
    await sender.send(mail, task.delivery_key);
    const deleted = await pool.query(
      'DELETE FROM email_task WHERE id=$1 AND lease_token=$2',
      [task.id, task.lease_token],
    );
    const outcome = deleted.rowCount ? 'delivered' : 'lease-lost';
    logEvent(outcome === 'delivered' ? 'info' : 'warn', 'worker.email.finished', {
      taskId: task.id, kind: task.kind, attempt: task.attempts, result: outcome,
    });
    return outcome;
  } catch (error) {
    const status = providerStatus(error);
    const permanent = status !== undefined && status >= 400 && status < 500 && ![408, 409, 429].includes(status);
    const finalAttempt = task.attempts >= 5;
    const failed = permanent || finalAttempt;
    await pool.query(
      `UPDATE email_task
       SET status=$3,
           next_attempt_at=$4,
           lease_token=NULL,
           lease_expires_at=NULL
       WHERE id=$1 AND lease_token=$2`,
      [
        task.id,
        task.lease_token,
        failed ? 'failed' : 'queued',
        new Date(now.getTime() + (failed ? 0 : retryDelaySeconds(task.attempts) * 1000)),
      ],
    );
    const outcome = failed ? 'failed' : 'retry';
    logEvent(failed ? 'error' : 'warn', 'worker.email.delivery_failed', {
      taskId: task.id, kind: task.kind, attempt: task.attempts, result: outcome,
      ...(status !== undefined ? { upstreamStatus: status } : {}),
      ...errorLogDetails(error),
    });
    return outcome;
  }
}
