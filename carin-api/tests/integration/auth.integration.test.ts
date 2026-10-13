import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createAuthRuntime, type AuthMail } from '../../src/auth/runtime.js';
import { createDatabase } from '../../src/db/client.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { getLegalRegistry } from '../../src/modules/legal/registry.js';

const name = `carin-t8-auth-${randomUUID()}`;
let pool: Pool;
let app: ReturnType<typeof createApp>;
let containerStarted = false;
const mail: AuthMail[] = [];

beforeAll(async () => {
  execFileSync('docker', [
    'run', '-d', '--rm', '--name', name,
    '-e', `POSTGRES_PASSWORD=${randomUUID()}`,
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
    '-p', '127.0.0.1::5432',
    'postgres:18.3-alpine@sha256:54451ecb8ab38c24c3ec123f2fd501303a3a1856a5c66e98cecf2460d5e1e9d7',
  ], { stdio: 'pipe' });
  containerStarted = true;
  const port = execFileSync('docker', ['port', name, '5432/tcp'], { encoding: 'utf8' }).trim().split(':').at(-1);
  pool = new Pool({ connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres`, connectionTimeoutMillis: 1000 });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { await pool.query('SELECT 1'); break; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  await applyMigrations(pool);
  const db = createDatabase(pool);
  const runtime = createAuthRuntime({
    db,
    baseURL: 'http://test.local',
    secret: 'test-secret-that-is-long-enough-for-auth',
    sendEmail: async (message) => { mail.push(message); },
  });
  app = createApp({
    readiness: async () => true,
    auth: runtime.auth,
    account: { db, resolveSession: runtime.resolveSession },
    legalConsent: { db, resolveSession: runtime.resolveSession },
  });
}, 120_000);

afterAll(async () => {
  await pool?.end();
  if (containerStarted) execFileSync('docker', ['rm', '-f', name], { stdio: 'pipe' });
});

describe('Better Auth registration boundary', () => {
  async function register(email: string, birthDate: string) {
    await pool.query('DELETE FROM rate_limit');
    const current = getLegalRegistry();
    const response = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': randomUUID() },
      body: JSON.stringify({ name: 'Existing User', email, password: 'password123', birthDate, acceptedTermsVersion: current.terms.version, acceptedPrivacyVersion: current.privacy.version }),
    });
    expect(response.status).toBe(200);
    return response;
  }

  async function verifyAndSignIn(email: string) {
    const message = mail.filter((item) => item.to === email).at(-1);
    expect(message?.kind).toBe('verification');
    const verification = new URL(message!.url);
    const verified = await app.request(`/api/auth/verify-email?token=${encodeURIComponent(verification.searchParams.get('token')!)}`);
    expect(verified.status).toBeLessThan(400);
    const signedIn = await app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123' }),
    });
    expect(signedIn.status).toBe(200);
    return signedIn.headers.get('set-cookie')!;
  }

  it('persists mandatory consent atomically and sends verification through the seam', async () => {
    const current = getLegalRegistry();
    const email = `${randomUUID()}@example.invalid`;
    const response = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Signup User',
        email,
        password: 'password123',
        birthDate: '1976-10-14',
        acceptedTermsVersion: current.terms.version,
        acceptedPrivacyVersion: current.privacy.version,
        acceptedAt: '2000-01-01T00:00:00.000Z',
      }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).token).toBeNull();
    const user = await pool.query('SELECT id,accepted_at,email_verified FROM "user" WHERE email=$1', [email]);
    expect(user.rowCount).toBe(1);
    expect(new Date(user.rows[0].accepted_at).getUTCFullYear()).toBeGreaterThan(2025);
    const consent = await pool.query('SELECT kind,version,granted FROM consent_event WHERE user_id=$1 ORDER BY kind', [user.rows[0].id]);
    expect(consent.rows).toEqual([
      { kind: 'privacy', version: current.privacy.version, granted: true },
      { kind: 'terms', version: current.terms.version, granted: true },
    ]);
    expect(mail.at(-1)).toMatchObject({ kind: 'verification', to: email });
  });

  it('rejects raw signup admission bypasses without creating an account', async () => {
    const current = getLegalRegistry();
    const email = `${randomUUID()}@example.invalid`;
    const response = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Too Young', email, password: 'password123', birthDate: '2008-10-15', acceptedTermsVersion: current.terms.version, acceptedPrivacyVersion: current.privacy.version }),
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect((await pool.query('SELECT id FROM "user" WHERE email=$1', [email])).rowCount).toBe(0);
  });

  it('rolls back the account when mandatory legal versions are stale', async () => {
    const email = `${randomUUID()}@example.invalid`;
    const response = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Stale Consent',
        email,
        password: 'password123',
        birthDate: '1976-10-14',
        acceptedTermsVersion: 'stale',
        acceptedPrivacyVersion: getLegalRegistry().privacy.version,
      }),
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect((await pool.query('SELECT id FROM "user" WHERE email=$1', [email])).rowCount).toBe(0);
  });

  it('rolls back both Better Auth rows when mandatory consent cannot be inserted', async () => {
    const email = `${randomUUID()}@example.invalid`;
    const accountCount = Number((await pool.query('SELECT count(*)::int AS count FROM account')).rows[0].count);
    await pool.query(`CREATE FUNCTION carin_test_reject_consent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'consent write blocked'; END; $$`);
    await pool.query('CREATE TRIGGER carin_test_reject_consent_trigger BEFORE INSERT ON consent_event FOR EACH ROW EXECUTE FUNCTION carin_test_reject_consent()');
    try {
      const current = getLegalRegistry();
      const response = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Consent Failure', email, password: 'password123', birthDate: '1976-10-14', acceptedTermsVersion: current.terms.version, acceptedPrivacyVersion: current.privacy.version }),
      });
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect((await pool.query('SELECT id FROM "user" WHERE email=$1', [email])).rowCount).toBe(0);
      expect(Number((await pool.query('SELECT count(*)::int AS count FROM account')).rows[0].count)).toBe(accountCount);
    } finally {
      await pool.query('DROP TRIGGER carin_test_reject_consent_trigger ON consent_event');
      await pool.query('DROP FUNCTION carin_test_reject_consent()');
    }
  });

  it('requires verification before sign-in, then exposes a verified session and /me', async () => {
    const email = `${randomUUID()}@example.invalid`;
    await register(email, '1976-10-14');
    const blocked = await app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123' }),
    });
    expect(blocked.status).toBeGreaterThanOrEqual(400);
    const cookie = await verifyAndSignIn(email);
    const me = await app.request('/api/v1/me', { headers: { cookie } });
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual(expect.objectContaining({ email, emailVerified: true, birthDate: '1976-10-14', aiConsent: { version: null, granted: false, updatedAt: null } }));
    const bypass = await app.request('/api/auth/update-user', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ birthDate: '2000-01-01', acceptedTermsVersion: 'forged' }),
    });
    expect(bypass.status).toBeGreaterThanOrEqual(400);
    expect((await pool.query('SELECT birth_date,accepted_terms_version FROM "user" WHERE email=$1', [email])).rows[0]).toEqual({ birth_date: '1976-10-14', accepted_terms_version: getLegalRegistry().terms.version });
    const signedOut = await app.request('/api/auth/sign-out', { method: 'POST', headers: { cookie } });
    expect(signedOut.status).toBe(200);
    expect((await app.request('/api/v1/me', { headers: { cookie } })).status).toBe(401);
  });

  it('allows an existing account to sign in after it becomes 51', async () => {
    const email = `${randomUUID()}@example.invalid`;
    await register(email, '1976-10-14');
    const user = await pool.query('SELECT id FROM "user" WHERE email=$1', [email]);
    await pool.query('UPDATE "user" SET email_verified=true WHERE id=$1', [user.rows[0].id]);
    await pool.query('ALTER TABLE "user" DISABLE TRIGGER user_registration_metadata_immutable');
    await pool.query('UPDATE "user" SET birth_date=$1 WHERE id=$2', ['1975-10-14', user.rows[0].id]);
    await pool.query('ALTER TABLE "user" ENABLE TRIGGER user_registration_metadata_immutable');
    const signedIn = await app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123' }),
    });
    expect(signedIn.status).toBe(200);
  });

  it('rejects a server session after its expiry', async () => {
    const email = `${randomUUID()}@example.invalid`;
    await register(email, '1976-10-14');
    const cookie = await verifyAndSignIn(email);
    const user = await pool.query('SELECT id FROM "user" WHERE email=$1', [email]);
    await pool.query('UPDATE session SET expires_at=now()-interval \'1 second\' WHERE user_id=$1', [user.rows[0].id]);
    expect((await app.request('/api/v1/me', { headers: { cookie } })).status).toBe(401);
  });

  it('rejects an active cookie session when the account becomes unverified', async () => {
    const email = `${randomUUID()}@example.invalid`;
    await register(email, '1976-10-14');
    const cookie = await verifyAndSignIn(email);
    await pool.query('UPDATE "user" SET email_verified=false WHERE email=$1', [email]);
    expect((await app.request('/api/v1/me', { headers: { cookie } })).status).toBe(403);
  });
});
