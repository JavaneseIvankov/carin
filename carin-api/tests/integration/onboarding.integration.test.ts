import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/db/client.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createApp } from '../../src/app.js';
import { getLegalRegistry } from '../../src/modules/legal/registry.js';

const containerName = `carin-onboarding-${randomUUID()}`;
let pool: Pool;
let database: ReturnType<typeof createDatabase>;
let containerStarted = false;

type Owner = { userId: string; sessionId: string };

beforeAll(async () => {
  execFileSync(
    'docker',
    [
      'run',
      '-d',
      '--rm',
      '--name',
      containerName,
      '-e',
      `POSTGRES_PASSWORD=${randomUUID()}`,
      '-e',
      'POSTGRES_HOST_AUTH_METHOD=trust',
      '-p',
      '127.0.0.1::5432',
      'postgres:18.3-alpine@sha256:54451ecb8ab38c24c3ec123f2fd501303a3a1856a5c66e98cecf2460d5e1e9d7',
    ],
    { stdio: 'pipe' }
  );
  containerStarted = true;
  const port = execFileSync('docker', ['port', containerName, '5432/tcp'], { encoding: 'utf8' })
    .trim()
    .split(':')
    .at(-1);
  if (!port) throw new Error('Postgres test container did not publish a port');
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
  database = createDatabase(pool);
}, 120_000);

afterAll(async () => {
  await pool?.end();
  if (containerStarted) execFileSync('docker', ['rm', '-f', containerName], { stdio: 'pipe' });
});

async function createOwner(): Promise<Owner> {
  const userId = randomUUID();
  const sessionId = randomUUID();
  const legal = getLegalRegistry();
  await pool.query(
    `INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at,birth_date,timezone,accepted_terms_version,accepted_privacy_version,accepted_at)
     VALUES ($1,'Onboarding test',$2,true,now(),now(),'1995-01-01','Asia/Jakarta',$3,$4,now())`,
    [userId, `${userId}@example.invalid`, legal.terms.version, legal.privacy.version]
  );
  await pool.query(
    `INSERT INTO session (id,expires_at,token,created_at,updated_at,user_id)
     VALUES ($1,now()+interval '1 day',$2,now(),now(),$3)`,
    [sessionId, randomUUID(), userId]
  );
  return { userId, sessionId };
}

function appFor(owner: Owner) {
  const resolveSession = async (request: Request) =>
    request.headers.get('x-test-user') === owner.userId
      ? { userId: owner.userId, emailVerified: true, sessionId: owner.sessionId }
      : null;
  return createApp({ readiness: async () => true, account: { db: database, resolveSession } });
}

describe('onboarding API', () => {
  it('returns an incomplete state for an account that has not completed onboarding', async () => {
    const owner = await createOwner();
    const response = await appFor(owner).request('/api/v1/onboarding', {
      headers: { 'x-test-user': owner.userId },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ completedAt: null });
  });

  it('preserves the first completion timestamp when a device retries', async () => {
    const owner = await createOwner();
    const app = appFor(owner);
    const headers = { 'x-test-user': owner.userId };
    const first = await app.request('/api/v1/onboarding/complete', { method: 'POST', headers });
    expect(first.status).toBe(200);
    const firstState = (await first.json()) as { completedAt: string };

    const retry = await app.request('/api/v1/onboarding/complete', { method: 'POST', headers });
    expect(retry.status).toBe(200);
    const retryState = (await retry.json()) as { completedAt: string };
    expect(firstState.completedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(retryState.completedAt).toBe(firstState.completedAt);

    const stored = await pool.query<{ completedAt: Date | null }>(
      `SELECT onboarding_completed_at AT TIME ZONE 'UTC' AS "completedAt"
       FROM "user" WHERE id=$1`,
      [owner.userId]
    );
    expect(stored.rows[0]?.completedAt?.toISOString()).toBe(firstState.completedAt);
  });

  it('requires a session and keeps completion isolated to its account', async () => {
    const firstOwner = await createOwner();
    const secondOwner = await createOwner();
    const firstApp = appFor(firstOwner);
    const unauthorizedGet = await firstApp.request('/api/v1/onboarding');
    const unauthorizedPost = await firstApp.request('/api/v1/onboarding/complete', {
      method: 'POST',
    });
    expect(unauthorizedGet.status).toBe(401);
    expect(unauthorizedPost.status).toBe(401);

    const completed = await firstApp.request('/api/v1/onboarding/complete', {
      method: 'POST',
      headers: { 'x-test-user': firstOwner.userId },
    });
    expect(completed.status).toBe(200);

    const otherAccount = await appFor(secondOwner).request('/api/v1/onboarding', {
      headers: { 'x-test-user': secondOwner.userId },
    });
    expect(otherAccount.status).toBe(200);
    expect(await otherAccount.json()).toEqual({ completedAt: null });
  });
});
