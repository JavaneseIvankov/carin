import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { createAuthRuntime, type AuthMail } from '../../src/auth/runtime.js';
import { createDatabase } from '../../src/db/client.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { getLegalRegistry } from '../../src/modules/legal/registry.js';
import { enqueueAuthMail } from '../../src/modules/email/outbox.js';

const name = `carin-t8-auth-${randomUUID()}`;
let pool: Pool;
let app: ReturnType<typeof createApp>;
let containerStarted = false;
const mail: AuthMail[] = [];
const authSecret = 'test-secret-that-is-long-enough-for-auth';
let queueFailures = 0;

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
    secret: authSecret,
    trustedOrigins: ['carin-dev://', 'http://test.local'],
    appEnv: 'dev',
    sendEmail: async (message) => {
      mail.push(message);
      await enqueueAuthMail(db, authSecret, message);
    },
    onEmailQueueFailure: () => { queueFailures += 1; },
  });
  app = createApp({
    readiness: async () => true,
    auth: runtime.auth,
    account: {
      db,
      resolveSession: runtime.resolveSession,
      verifyPassword: runtime.verifyPassword,
      deletionSecret: authSecret,
    },
    legalConsent: { db, resolveSession: runtime.resolveSession },
    appLinkScheme: 'carin-dev',
  });
}, 120_000);

afterAll(async () => {
  await pool?.end();
  if (containerStarted) execFileSync('docker', ['rm', '-f', name], { stdio: 'pipe' });
});

beforeEach(async () => {
  await pool.query('DELETE FROM rate_limit');
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
    const verified = await app.request(`${verification.pathname}${verification.search}`);
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
    const verification = new URL(mail.at(-1)!.url);
    expect(verification.searchParams.get('callbackURL')).toBe('http://test.local/auth/verified');
    const queued = await pool.query('SELECT payload FROM email_task WHERE user_id=$1', [user.rows[0].id]);
    expect(queued.rows[0].payload).toEqual({ to: email, url: mail.at(-1)!.url });
    expect(queued.rows[0].payload).not.toHaveProperty('token');
  });

  it('does not persist a signup when its verification task cannot be queued', async () => {
    const email = `${randomUUID()}@example.invalid`;
    const beforeFailures = queueFailures;
    await pool.query(`CREATE FUNCTION carin_test_reject_email_task() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'email task write blocked'; END; $$`);
    await pool.query('CREATE TRIGGER carin_test_reject_email_task_trigger BEFORE INSERT ON email_task FOR EACH ROW EXECUTE FUNCTION carin_test_reject_email_task()');
    try {
      const current = getLegalRegistry();
      const response = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Queue Failure', email, password: 'password123', birthDate: '1976-10-14', acceptedTermsVersion: current.terms.version, acceptedPrivacyVersion: current.privacy.version }),
      });
      expect(response.status).toBe(503);
      expect(queueFailures).toBe(beforeFailures + 1);
      expect((await pool.query('SELECT id FROM "user" WHERE email=$1', [email])).rowCount).toBe(0);
      expect((await pool.query('SELECT id FROM email_task WHERE payload->>\'to\'=$1', [email])).rowCount).toBe(0);
    } finally {
      await pool.query('DROP TRIGGER carin_test_reject_email_task_trigger ON email_task');
      await pool.query('DROP FUNCTION carin_test_reject_email_task()');
    }
  });

  it('rejects raw signup admission bypasses without creating an account', async () => {
    const current = getLegalRegistry();
    const email = `${randomUUID()}@example.invalid`;
    const response = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Too Young', email, password: 'password123', birthDate: '2009-10-15', acceptedTermsVersion: current.terms.version, acceptedPrivacyVersion: current.privacy.version }),
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect((await pool.query('SELECT id FROM "user" WHERE email=$1', [email])).rowCount).toBe(0);
  });

  it('rejects authentication requests from an untrusted origin', async () => {
    const current = getLegalRegistry();
    const email = `${randomUUID()}@example.invalid`;
    const response = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://attacker.example' },
      body: JSON.stringify({ name: 'Origin Check', email, password: 'password123', birthDate: '1976-10-14', acceptedTermsVersion: current.terms.version, acceptedPrivacyVersion: current.privacy.version }),
    });
    expect(response.status).toBe(403);
    expect((await pool.query('SELECT id FROM "user" WHERE email=$1', [email])).rowCount).toBe(0);
  });

  it('rejects arbitrary callback origins for verification and password reset', async () => {
    const email = `${randomUUID()}@example.invalid`;
    await register(email, '1976-10-14');
    const before = mail.length;
    const verification = await app.request('/api/auth/send-verification-email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://test.local' },
      body: JSON.stringify({ email, callbackURL: 'https://attacker.example/verified' }),
    });
    const reset = await app.request('/api/auth/request-password-reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://test.local' },
      body: JSON.stringify({ email, redirectTo: 'https://attacker.example/reset' }),
    });
    expect(verification.status).toBe(403);
    expect(reset.status).toBe(403);
    expect(mail).toHaveLength(before);
  });

  it('keeps verification resend generic and rate limited, then queues after the 60-second cooldown', async () => {
    const email = `${randomUUID()}@example.invalid`;
    const unknownEmail = `${randomUUID()}@example.invalid`;
    await register(email, '1976-10-14');
    const user = await pool.query('SELECT id FROM "user" WHERE email=$1', [email]);
    const sendVerification = (target: string) => app.request('/api/auth/send-verification-email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://test.local',
        'x-forwarded-for': '198.51.100.24',
      },
      body: JSON.stringify({ email: target, callbackURL: 'http://test.local/auth/verified' }),
    });
    const taskCount = async () => Number((await pool.query(
      "SELECT count(*)::int AS count FROM email_task WHERE user_id=$1 AND kind='verification'",
      [user.rows[0].id],
    )).rows[0].count);

    expect(await taskCount()).toBe(1);
    const known = await sendVerification(email);
    const knownBody = await known.json();
    const unknown = await sendVerification(unknownEmail);
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await unknown.json()).toEqual(knownBody);
    expect(knownBody).toEqual({ status: true });
    expect(await taskCount()).toBe(1);

    expect((await sendVerification(email)).status).toBe(200);
    const rateLimited = await sendVerification(email);
    expect(rateLimited.status).toBe(429);

    await pool.query("DELETE FROM rate_limit WHERE key NOT LIKE 'carin-email-%'");
    const cooldown = await pool.query(
      "UPDATE rate_limit SET last_request=last_request-60001 WHERE key LIKE 'carin-email-verification-%'",
    );
    expect(cooldown.rowCount).toBe(1);
    const resent = await sendVerification(email);
    expect(resent.status).toBe(200);
    expect(await resent.json()).toEqual(knownBody);
    expect(await taskCount()).toBe(2);
    const resentMail = mail.filter((item) => item.to === email && item.kind === 'verification').at(-1);
    expect(resentMail).toBeDefined();
    const resentUrl = new URL(resentMail!.url);
    expect(resentUrl.searchParams.get('callbackURL')).toBe('http://test.local/auth/verified');
    const verification = await app.request(`${resentUrl.pathname}${resentUrl.search}`);
    expect(verification.status).toBe(302);
    expect(verification.headers.get('location')).toContain('/auth/verified');
    expect((await pool.query('SELECT email_verified FROM "user" WHERE id=$1', [user.rows[0].id])).rows[0].email_verified).toBe(true);
  });

  it('keeps reset responses generic on queue failure and allows a later retry', async () => {
    const email = `${randomUUID()}@example.invalid`;
    await register(email, '1976-10-14');
    const beforeFailures = queueFailures;
    await pool.query(`CREATE FUNCTION carin_test_reject_email_task() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'email task write blocked'; END; $$`);
    await pool.query('CREATE TRIGGER carin_test_reject_email_task_trigger BEFORE INSERT ON email_task FOR EACH ROW EXECUTE FUNCTION carin_test_reject_email_task()');
    let known: Response;
    try {
      known = await app.request('/api/auth/request-password-reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://test.local' },
        body: JSON.stringify({ email, redirectTo: 'http://test.local/auth/reset' }),
      });
    } finally {
      await pool.query('DROP TRIGGER carin_test_reject_email_task_trigger ON email_task');
      await pool.query('DROP FUNCTION carin_test_reject_email_task()');
    }
    const unknown = await app.request('/api/auth/request-password-reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://test.local' },
      body: JSON.stringify({ email: `${randomUUID()}@example.invalid`, redirectTo: 'http://test.local/auth/reset' }),
    });
    expect(known!.status).toBe(unknown.status);
    expect(await known!.json()).toEqual(await unknown.json());
    expect(queueFailures).toBe(beforeFailures + 1);

    const retry = await app.request('/api/auth/request-password-reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://test.local' },
      body: JSON.stringify({ email, redirectTo: 'http://test.local/auth/reset' }),
    });
    expect(retry.status).toBe(200);
    expect((await pool.query("SELECT id FROM email_task WHERE kind='password_reset' AND user_id=(SELECT id FROM \"user\" WHERE email=$1)", [email])).rowCount).toBe(1);
  });

  it('returns a generic reset response and revokes sessions after a valid reset token', async () => {
    const email = `${randomUUID()}@example.invalid`;
    await register(email, '1976-10-14');
    const cookie = await verifyAndSignIn(email);
    const resetRequest = (target: string) => app.request('/api/auth/request-password-reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://test.local' },
      body: JSON.stringify({ email: target, redirectTo: 'http://test.local/auth/reset' }),
    });
    const known = await resetRequest(email);
    const unknown = await resetRequest(`${randomUUID()}@example.invalid`);
    expect(known.status).toBe(200);
    expect(await known.json()).toEqual(await unknown.json());
    const resetMail = mail.filter((item) => item.to === email && item.kind === 'password-reset').at(-1);
    expect(resetMail).toBeDefined();
    const resetUrl = new URL(resetMail!.url);
    expect(resetUrl.origin).toBe('http://test.local');
    expect(resetUrl.pathname).toBe('/auth/reset');
    expect(resetUrl.searchParams.has('callbackURL')).toBe(false);
    const landing = await app.request(`${resetUrl.pathname}${resetUrl.search}`);
    expect(landing.headers.get('referrer-policy')).toBe('no-referrer');
    expect(await landing.text()).toContain('carin-dev://auth/reset?token=');

    const token = resetUrl.searchParams.get('token')!;
    const reset = (newPassword: string) => app.request('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://test.local' },
      body: JSON.stringify({ token, newPassword }),
    });
    expect((await reset('new-password-123')).status).toBe(200);
    expect((await app.request('/api/v1/me', { headers: { cookie } })).status).toBe(401);
    expect((await reset('new-password-456')).status).toBeGreaterThanOrEqual(400);
  });

  it('rejects an expired reset token', async () => {
    const email = `${randomUUID()}@example.invalid`;
    await register(email, '1976-10-14');
    const resetRequest = await app.request('/api/auth/request-password-reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://test.local' },
      body: JSON.stringify({ email, redirectTo: 'http://test.local/auth/reset' }),
    });
    expect(resetRequest.status).toBe(200);
    const resetMail = mail.filter((item) => item.to === email && item.kind === 'password-reset').at(-1);
    expect(resetMail).toBeDefined();
    await pool.query(
      'UPDATE verification SET expires_at=now()-interval \'1 second\' WHERE identifier=$1',
      [`reset-password:${resetMail!.token}`],
    );
    const response = await app.request('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://test.local' },
      body: JSON.stringify({ token: resetMail!.token, newPassword: 'new-password-123' }),
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects an expired verification link without granting verified access', async () => {
    const email = `${randomUUID()}@example.invalid`;
    await register(email, '1976-10-14');
    const verificationMail = mail.filter((item) => item.to === email && item.kind === 'verification').at(-1);
    expect(verificationMail).toBeDefined();
    const tokenPayload = JSON.parse(Buffer.from(verificationMail!.token.split('.')[1]!, 'base64url').toString('utf8')) as { exp: number };
    const verification = new URL(verificationMail!.url);

    vi.setSystemTime(new Date(tokenPayload.exp * 1000 + 1));
    try {
      const rejected = await app.request(`${verification.pathname}${verification.search}`);
      expect(rejected.status).toBe(302);
      expect(rejected.headers.get('location')).toContain('/auth/verified?error=TOKEN_EXPIRED');
      expect((await pool.query('SELECT email_verified FROM "user" WHERE email=$1', [email])).rows[0].email_verified).toBe(false);

      const signIn = await app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'password123' }),
      });
      expect(signIn.status).toBeGreaterThanOrEqual(400);
      expect(signIn.headers.has('set-cookie')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
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
      headers: { cookie, origin: 'carin-dev://', 'content-type': 'application/json' },
      body: JSON.stringify({ birthDate: '2000-01-01', acceptedTermsVersion: 'forged' }),
    });
    expect(bypass.status).toBeGreaterThanOrEqual(400);
    expect((await pool.query('SELECT birth_date,accepted_terms_version FROM "user" WHERE email=$1', [email])).rows[0]).toEqual({ birth_date: '1976-10-14', accepted_terms_version: getLegalRegistry().terms.version });
    const signedOut = await app.request('/api/auth/sign-out', { method: 'POST', headers: { cookie, origin: 'carin-dev://' } });
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

  it('sends verification at most once per email in 60 seconds across client IPs', async () => {
    const email = `${randomUUID()}@example.invalid`;
    await register(email, '1976-10-14');
    const before = mail.filter((item) => item.kind === 'verification' && item.to === email).length;
    for (const ip of [randomUUID(), randomUUID()]) {
      const response = await app.request('/api/auth/send-verification-email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
        body: JSON.stringify({ email }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: true });
    }
    expect(mail.filter((item) => item.kind === 'verification' && item.to === email)).toHaveLength(before);
    const key = `verification-email:${createHash('sha256').update(email).digest('hex')}`;
    await pool.query('UPDATE rate_limit SET last_request=$1 WHERE key=$2', [Date.now() - 59_000, key]);
    const tooSoon = await app.request('/api/auth/send-verification-email', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': randomUUID() },
      body: JSON.stringify({ email }),
    });
    expect(tooSoon.status).toBe(200);
    expect(mail.filter((item) => item.kind === 'verification' && item.to === email)).toHaveLength(before);
    await pool.query("DELETE FROM rate_limit WHERE key NOT LIKE 'verification-email:%'");
    await pool.query('UPDATE rate_limit SET last_request=$1 WHERE key=$2', [Date.now() - 60_000, key]);
    const allowed = await app.request('/api/auth/send-verification-email', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': randomUUID() },
      body: JSON.stringify({ email }),
    });
    expect(allowed.status).toBe(200);
    expect(mail.filter((item) => item.kind === 'verification' && item.to === email)).toHaveLength(before + 1);
  });

  it('releases a verification cooldown claim when delivery fails so the email can be retried', async () => {
    const email = `${randomUUID()}@example.invalid`;
    await register(email, '1976-10-14');
    await pool.query('DELETE FROM rate_limit');
    const failedDelivery = createAuthRuntime({
      db: createDatabase(pool), baseURL: 'http://test.local',
      secret: 'test-secret-that-is-long-enough-for-auth', trustedOrigins: ['carin://'], appEnv: 'dev',
      sendEmail: async () => { throw new Error('test delivery failed'); },
    });
    const failingApp = createApp({ readiness: async () => true, auth: failedDelivery.auth });
    const failed = await failingApp.request('/api/auth/send-verification-email', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }),
    });
    expect(failed.status).toBeGreaterThanOrEqual(400);
    const key = `verification-email:${createHash('sha256').update(email).digest('hex')}`;
    expect((await pool.query('SELECT key FROM rate_limit WHERE key=$1', [key])).rowCount).toBe(0);
    const before = mail.filter((item) => item.kind === 'verification' && item.to === email).length;
    const retried = await app.request('/api/auth/send-verification-email', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }),
    });
    expect(retried.status).toBe(200);
    expect(mail.filter((item) => item.kind === 'verification' && item.to === email)).toHaveLength(before + 1);
  });

  it('rejects expired verification links', async () => {
    const email = `${randomUUID()}@example.invalid`;
    await register(email, '1976-10-14');
    const token = mail.at(-1)!.token;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 3_601_000);
    try {
      const expired = await app.request(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
      expect(expired.status).toBeGreaterThanOrEqual(400);
      expect((await pool.query('SELECT email_verified FROM "user" WHERE email=$1', [email])).rows[0].email_verified).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('disables the vendor delete-user endpoint', async () => {
    const email = `${randomUUID()}@example.invalid`;
    await register(email, '1976-10-14');
    const cookie = await verifyAndSignIn(email);
    const response = await app.request('/api/auth/delete-user', {
      method: 'POST', headers: { cookie, origin: 'carin://', 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'password123' }),
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect((await pool.query('SELECT id FROM "user" WHERE email=$1', [email])).rowCount).toBe(1);
  });

  it('revokes existing sessions when the password is reset', async () => {
    const email = `${randomUUID()}@example.invalid`;
    await register(email, '1976-10-14');
    const cookie = await verifyAndSignIn(email);
    const requested = await app.request('/api/auth/request-password-reset', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }),
    });
    expect(requested.status).toBe(200);
    const token = mail.at(-1)!.token;
    const reset = await app.request('/api/auth/reset-password', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, newPassword: 'replacement123' }),
    });
    expect(reset.status).toBe(200);
    expect((await app.request('/api/v1/me', { headers: { cookie } })).status).toBe(401);
  });

  it('reauthenticates account deletion, scrubs identity immediately, and revokes every session', async () => {
    const email = `${randomUUID()}@example.invalid`;
    await register(email, '1976-10-14');
    const cookie = await verifyAndSignIn(email);
    const user = await pool.query('SELECT id FROM "user" WHERE email=$1', [email]);
    const userId = user.rows[0].id as string;
    const photoId = randomUUID();
    const photoKey = `photos/${randomUUID()}`;
    const pendingKey = `photos/${randomUUID()}`;
    await pool.query(
      'INSERT INTO photo (id,user_id,object_key,checksum,mime_type,size_bytes,lifecycle) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [photoId, userId, photoKey, 'a'.repeat(64), 'image/jpeg', 100, 'uploaded'],
    );
    await pool.query(
      'INSERT INTO deletion_task (user_id,kind,object_keys,status,attempts) VALUES ($1,$2,$3::jsonb,$4,0)',
      [userId, 'photo', JSON.stringify([pendingKey]), 'failed'],
    );
    await pool.query(
      'INSERT INTO session (id,expires_at,token,created_at,updated_at,user_id) VALUES ($1,now()+interval \'1 day\',$2,now(),now(),$3)',
      [randomUUID(), randomUUID(), userId],
    );

    const wrongPassword = await app.request('/api/v1/account-deletion', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', 'Idempotency-Key': randomUUID() },
      body: JSON.stringify({ password: 'incorrect-password', confirmation: 'DELETE_MY_ACCOUNT' }),
    });
    expect(wrongPassword.status).toBe(403);
    expect(await wrongPassword.json()).toMatchObject({ error: { code: 'REAUTHENTICATION_REQUIRED' } });
    expect((await pool.query('SELECT deletion_status,email,name FROM "user" WHERE id=$1', [userId])).rows[0])
      .toEqual({ deletion_status: 'active', email, name: 'Existing User' });

    const accepted = await app.request('/api/v1/account-deletion', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', 'Idempotency-Key': randomUUID() },
      body: JSON.stringify({ password: 'password123', confirmation: 'DELETE_MY_ACCOUNT' }),
    });
    expect(accepted.status).toBe(202);
    expect(await accepted.json()).toMatchObject({ status: 'deletion_pending', accessRevoked: true });
    expect((await pool.query('SELECT deletion_status,email,name,birth_date,accepted_terms_version FROM "user" WHERE id=$1', [userId])).rows[0])
      .toEqual({ deletion_status: 'deleting', email: `${userId}@deleted.invalid`, name: 'Deleted account', birth_date: '1900-01-01', accepted_terms_version: 'deleted' });
    expect((await pool.query('SELECT id FROM session WHERE user_id=$1', [userId])).rows).toHaveLength(0);
    expect((await pool.query('SELECT id FROM account WHERE user_id=$1', [userId])).rows).toHaveLength(0);
    expect((await pool.query('SELECT lifecycle FROM photo WHERE id=$1', [photoId])).rows[0].lifecycle).toBe('deleting');
    const task = (await pool.query('SELECT object_keys,request_hash FROM deletion_task WHERE user_id=$1 AND kind=$2', [userId, 'account'])).rows[0];
    expect(task.object_keys).toEqual(expect.arrayContaining([photoKey, pendingKey]));
    expect(task.request_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(task.request_hash).not.toBe('password123');
    expect((await pool.query('SELECT id FROM deletion_task WHERE user_id=$1 AND kind=$2', [userId, 'photo'])).rows).toHaveLength(0);
    expect((await app.request('/api/v1/me', { headers: { cookie } })).status).toBe(401);
    await expect(pool.query(
      'INSERT INTO session (id,expires_at,token,created_at,updated_at,user_id) VALUES ($1,now()+interval \'1 day\',$2,now(),now(),$3)',
      [randomUUID(), randomUUID(), userId],
    )).rejects.toThrow();
  });
});
