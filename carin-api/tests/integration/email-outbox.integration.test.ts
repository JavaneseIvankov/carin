import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/db/client.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { enqueueAuthMail, type QueuedAuthMail } from '../../src/modules/email/outbox.js';
import { ResendDeliveryError } from '../../src/modules/email/resend.js';
import { processNextEmailTask } from '../../src/modules/email/worker.js';

const container = `carin-t9-email-${randomUUID()}`;
const secret = 'test-email-outbox-secret-with-more-than-32-characters';
let pool: Pool;
let db: ReturnType<typeof createDatabase>;
let containerStarted = false;

beforeAll(async () => {
  execFileSync('docker', [
    'run', '-d', '--rm', '--name', container,
    '-e', `POSTGRES_PASSWORD=${randomUUID()}`,
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
    '-p', '127.0.0.1::5432',
    'postgres:18.3-alpine@sha256:54451ecb8ab38c24c3ec123f2fd501303a3a1856a5c66e98cecf2460d5e1e9d7',
  ], { stdio: 'pipe' });
  containerStarted = true;
  const port = execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8' }).trim().split(':').at(-1);
  pool = new Pool({ connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres`, connectionTimeoutMillis: 1000 });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { await pool.query('SELECT 1'); break; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  await applyMigrations(pool);
  db = createDatabase(pool);
}, 120_000);

beforeEach(async () => {
  await pool.query('DELETE FROM email_task');
  await pool.query("DELETE FROM rate_limit WHERE key LIKE 'carin-email-%'");
});

afterAll(async () => {
  await pool?.query("DELETE FROM rate_limit WHERE key LIKE 'carin-email-%'");
  await pool?.end();
  if (containerStarted) execFileSync('docker', ['rm', '-f', container], { stdio: 'pipe' });
});

async function createUser(): Promise<{ id: string; email: string }> {
  const id = randomUUID();
  const email = `${id}@example.invalid`;
  await pool.query(
    `INSERT INTO "user" (id,name,email,birth_date,accepted_terms_version,accepted_privacy_version,accepted_at)
     VALUES ($1,'Email Test',$2,'1976-10-14','terms-v1','privacy-v1',now())`,
    [id, email],
  );
  return { id, email };
}

async function createResetMail(): Promise<QueuedAuthMail> {
  const user = await createUser();
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await pool.query(
    'INSERT INTO verification (identifier,value,expires_at) VALUES ($1,$2,$3)',
    [`reset-password:${token}`, user.id, expiresAt],
  );
  return {
    userId: user.id,
    kind: 'password-reset',
    to: user.email,
    token,
    url: `https://api.example.test/auth/reset?token=${token}`,
  };
}

describe('durable auth email outbox', () => {
  it('stores only the recipient and link and enforces a per-kind recipient cooldown', async () => {
    const mail = await createResetMail();
    const now = new Date();
    expect(await enqueueAuthMail(db, secret, mail, now)).toBe('queued');
    expect(await enqueueAuthMail(db, secret, mail, new Date(now.getTime() + 59_999))).toBe('cooldown');
    expect(await enqueueAuthMail(db, secret, mail, new Date(now.getTime() + 60_000))).toBe('queued');
    const task = await pool.query('SELECT kind,payload,delivery_key,expires_at FROM email_task WHERE user_id=$1', [mail.userId]);
    expect(task.rows).toHaveLength(2);
    expect(task.rows[0].kind).toBe('password_reset');
    expect(task.rows[0].payload).toEqual({ to: mail.to, url: mail.url });
    expect(task.rows[0].payload).not.toHaveProperty('token');
    expect(task.rows[0].delivery_key).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('deletes delivered task payloads and keeps the stable delivery key on retry', async () => {
    const mail = await createResetMail();
    expect(await enqueueAuthMail(db, secret, mail)).toBe('queued');
    const task = await pool.query('SELECT id,delivery_key FROM email_task WHERE user_id=$1', [mail.userId]);
    const keys: string[] = [];
    let attempt = 0;
    const now = new Date();
    const sender = {
      send: async (_message: unknown, key: string) => {
        keys.push(key);
        attempt += 1;
        if (attempt === 1) throw new ResendDeliveryError('RESEND_SEND_FAILED', 503);
      },
    };
    expect(await processNextEmailTask(pool, sender, now)).toBe('retry');
    let row = await pool.query('SELECT status,attempts,next_attempt_at FROM email_task WHERE id=$1', [task.rows[0].id]);
    expect(row.rows[0].status).toBe('queued');
    expect(Number(row.rows[0].attempts)).toBe(1);
    expect(new Date(row.rows[0].next_attempt_at).getTime()).toBe(now.getTime() + 5000);
    expect(await processNextEmailTask(pool, sender, new Date(now.getTime() + 5001))).toBe('delivered');
    expect(keys).toEqual([task.rows[0].delivery_key, task.rows[0].delivery_key]);
    row = await pool.query('SELECT id FROM email_task WHERE id=$1', [task.rows[0].id]);
    expect(row.rowCount).toBe(0);
  });

  it('marks permanent provider failures terminal instead of retrying', async () => {
    const mail = await createResetMail();
    await enqueueAuthMail(db, secret, mail);
    const task = await pool.query('SELECT id FROM email_task WHERE user_id=$1', [mail.userId]);
    const result = await processNextEmailTask(pool, {
      send: async () => { throw new ResendDeliveryError('RESEND_SEND_FAILED', 400); },
    });
    expect(result).toBe('failed');
    const row = await pool.query('SELECT status,attempts FROM email_task WHERE id=$1', [task.rows[0].id]);
    expect(row.rows[0]).toMatchObject({ status: 'failed', attempts: 1 });
  });

  it('recovers an expired lease and increments the attempt count', async () => {
    const mail = await createResetMail();
    await enqueueAuthMail(db, secret, mail);
    const task = await pool.query('SELECT id,delivery_key FROM email_task WHERE user_id=$1', [mail.userId]);
    await pool.query(
      `UPDATE email_task SET status='processing', attempts=1, lease_token=$2,
       lease_expires_at=now()-interval '1 second' WHERE id=$1`,
      [task.rows[0].id, randomUUID()],
    );
    const now = new Date();
    const result = await processNextEmailTask(pool, {
      send: async (_message, key) => {
        expect(key).toBe(task.rows[0].delivery_key);
        throw new ResendDeliveryError('RESEND_SEND_FAILED', 503);
      },
    }, now);
    expect(result).toBe('retry');
    const row = await pool.query('SELECT status,attempts,next_attempt_at FROM email_task WHERE id=$1', [task.rows[0].id]);
    expect(row.rows[0].status).toBe('queued');
    expect(Number(row.rows[0].attempts)).toBe(2);
    expect(new Date(row.rows[0].next_attempt_at).getTime()).toBe(now.getTime() + 30_000);
  });

  it('does not let concurrent workers claim the same unexpired lease', async () => {
    const mail = await createResetMail();
    await enqueueAuthMail(db, secret, mail);
    let releaseSend!: () => void;
    let markStarted!: () => void;
    const sending = new Promise<void>((resolve) => { releaseSend = resolve; });
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    let calls = 0;
    const first = processNextEmailTask(pool, {
      send: async () => { calls += 1; markStarted(); await sending; },
    });
    await started;
    expect(await processNextEmailTask(pool, {
      send: async () => { calls += 1; },
    })).toBe('idle');
    expect(calls).toBe(1);
    releaseSend();
    expect(await first).toBe('delivered');
  });

  it('removes expired delivery payloads without contacting the provider', async () => {
    const user = await createUser();
    const inserted = await pool.query(
      `INSERT INTO email_task (user_id,kind,payload,expires_at)
       VALUES ($1,'verification',$2,now()-interval '1 second') RETURNING id`,
      [user.id, { to: user.email, url: 'https://api.example.test/auth/verified' }],
    );
    const result = await processNextEmailTask(pool, { send: async () => { throw new Error('must not send'); } });
    expect(result).toBe('idle');
    expect((await pool.query('SELECT id FROM email_task WHERE id=$1', [inserted.rows[0].id])).rowCount).toBe(0);
  });
});
