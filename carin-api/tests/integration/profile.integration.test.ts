import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createDatabase } from '../../src/db/client.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { getLegalRegistry } from '../../src/modules/legal/registry.js';

const containerName = `carin-c12-profile-${randomUUID()}`;
const ownerId = randomUUID();
const ownerSessionId = randomUUID();
const otherId = randomUUID();
const otherSessionId = randomUUID();
const raceId = randomUUID();
const raceSessionId = randomUUID();
const snapshotId = randomUUID();
let pool: Pool;
let app: ReturnType<typeof createApp>;
let containerStarted = false;

beforeAll(async () => {
  execFileSync('docker', [
    'run', '-d', '--rm', '--name', containerName,
    '-e', `POSTGRES_PASSWORD=${randomUUID()}`,
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
    '-p', '127.0.0.1::5432',
    'postgres:18.3-alpine@sha256:54451ecb8ab38c24c3ec123f2fd501303a3a1856a5c66e98cecf2460d5e1e9d7',
  ], { stdio: 'pipe' });
  containerStarted = true;
  const port = execFileSync('docker', ['port', containerName, '5432/tcp'], { encoding: 'utf8' }).trim().split(':').at(-1);
  pool = new Pool({ connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres`, connectionTimeoutMillis: 1000 });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { await pool.query('SELECT 1'); break; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  await applyMigrations(pool);
  const legal = getLegalRegistry();
  for (const [userId, sessionId] of [
    [ownerId, ownerSessionId],
    [otherId, otherSessionId],
    [raceId, raceSessionId],
  ]) {
    await pool.query(
      `INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at,birth_date,accepted_terms_version,accepted_privacy_version,accepted_at)
       VALUES ($1,'Profile test',$2,true,now(),now(),'1995-01-01',$3,$4,now())`,
      [userId, `${userId}@example.invalid`, legal.terms.version, legal.privacy.version],
    );
    await pool.query(
      'INSERT INTO session (id,expires_at,token,created_at,updated_at,user_id) VALUES ($1,now()+interval \'1 day\',$2,now(),now(),$3)',
      [sessionId, randomUUID(), userId],
    );
  }
  await pool.query(
    `INSERT INTO profile_snapshot (id,user_id,profile_version,context) VALUES ($1,$2,0,'{"frozen":true}')`,
    [snapshotId, ownerId],
  );
  const db = createDatabase(pool);
  app = createApp({
    readiness: async () => true,
    account: {
      db,
      resolveSession: async (request) => {
        if (request.headers.get('x-unauth') === 'true') return null;
        const requestedUserId = request.headers.get('x-test-user');
        const userId = requestedUserId === otherId || requestedUserId === raceId ? requestedUserId : ownerId;
        return {
          userId,
          sessionId: userId === ownerId ? ownerSessionId : userId === otherId ? otherSessionId : raceSessionId,
          emailVerified: true,
        };
      },
    },
  });
}, 120_000);

afterAll(async () => {
  await pool?.end();
  if (containerStarted) execFileSync('docker', ['rm', '-f', containerName], { stdio: 'pipe' });
});

function request(path: string, init: RequestInit = {}, userId = ownerId) {
  const headers = new Headers(init.headers);
  headers.set('x-test-user', userId);
  return app.request(path, {
    ...init,
    headers,
  });
}

const emptyFields = {
  heightCm: null,
  weightKg: null,
  sexForReference: null,
  diagnoses: { state: 'not_provided', entries: [] },
  familyHistory: { state: 'not_provided', entries: [] },
  allergies: { state: 'not_provided', entries: [] },
  clinicianNotes: null,
  activity: null,
  smoking: null,
};

describe('profile API', () => {
  it('returns an empty version-zero profile without creating a database row', async () => {
    const response = await request('/api/v1/profile');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      version: 0,
      updatedAt: null,
      fields: emptyFields,
      personalization: { missingFields: [], unsupportedConditions: [] },
    });
    expect((await pool.query('SELECT 1 FROM health_profile WHERE user_id=$1', [ownerId])).rowCount).toBe(0);
  });

  it('requires a verified session for profile reads', async () => {
    const response = await app.request('/api/v1/profile', { headers: { 'x-unauth': 'true' } });
    expect(response.status).toBe(401);
  });

  it('stores a full profile replacement at version one and preserves unsupported entries and snapshots', async () => {
    const key = randomUUID();
    const fields = {
      ...emptyFields,
      heightCm: 172.123456789,
      weightKg: 68.987654321,
      sexForReference: 'female',
      diagnoses: {
        state: 'reported',
        entries: [
          { id: randomUUID(), conditionId: 'unimported-condition', label: 'Free text condition' },
          { id: randomUUID(), conditionId: null, label: 'Migrated diagnosis' },
        ],
      },
      familyHistory: { state: 'reported', entries: [{ conditionId: 'legacy-condition', label: 'Family free text', relation: 'maternal aunt' }] },
      allergies: { state: 'reported', entries: ['Peanuts', 'Unknown brand medication'] },
      clinicianNotes: 'User-provided note',
      activity: 'moderate',
      smoking: 'former',
    };
    const response = await request('/api/v1/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'idempotency-key': key },
      body: JSON.stringify({ expectedVersion: 0, fields }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.version).toBe(1);
    expect(body.updatedAt).toEqual(expect.any(String));
    expect(body.fields).toEqual(fields);
    expect(body.personalization).toEqual({ missingFields: [], unsupportedConditions: ['Free text condition', 'Migrated diagnosis'] });
    const replay = await request('/api/v1/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'idempotency-key': key },
      body: JSON.stringify({ expectedVersion: 0, fields }),
    });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(body);
    const snapshot = await pool.query('SELECT profile_version,context FROM profile_snapshot WHERE id=$1', [snapshotId]);
    expect(snapshot.rows[0]).toEqual({ profile_version: 0, context: { frozen: true } });
  });

  it('rejects a stale profile version without overwriting the stored fields', async () => {
    const response = await request('/api/v1/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
      body: JSON.stringify({ expectedVersion: 0, fields: emptyFields }),
    });
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('REVISION_CONFLICT');
    const stored = await pool.query('SELECT version,clinician_notes FROM health_profile WHERE user_id=$1', [ownerId]);
    expect(stored.rows[0]).toEqual({ version: 1, clinician_notes: 'User-provided note' });
  });

  it('serializes concurrent first writes so only one version-zero update succeeds', async () => {
    const update = {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
      body: JSON.stringify({ expectedVersion: 0, fields: { ...emptyFields, clinicianNotes: 'winner' } }),
    };
    const [first, second] = await Promise.all([
      request('/api/v1/profile', update, raceId),
      request('/api/v1/profile', { ...update, headers: { ...update.headers, 'idempotency-key': randomUUID() } }, raceId),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect((await pool.query('SELECT version FROM health_profile WHERE user_id=$1', [raceId])).rows).toEqual([{ version: 1 }]);
  });

  it('does not reveal another account profile', async () => {
    await pool.query(
      `INSERT INTO health_profile (user_id,height_cm) VALUES ($1,180)`,
      [otherId],
    );
    const response = await request('/api/v1/profile', {}, otherId);
    expect(response.status).toBe(200);
    expect((await response.json()).fields.heightCm).toBe(180);
  });

  it('rejects inconsistent knowledge state and list combinations', async () => {
    const fields = {
      ...emptyFields,
      diagnoses: { state: 'reported', entries: [] },
    };
    const response = await request('/api/v1/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
      body: JSON.stringify({ expectedVersion: 1, fields }),
    });
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe('INVALID_INPUT');
  });

  it('updates timezone with settings revision and replays an identical idempotent request', async () => {
    const key = randomUUID();
    const init = {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'idempotency-key': key },
      body: JSON.stringify({ expectedRevision: 1, timezone: 'America/New_York' }),
    };
    const first = await request('/api/v1/me', init);
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody).toMatchObject({ timezone: 'America/New_York', settingsRevision: 2 });

    const replay = await request('/api/v1/me', init);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(firstBody);

    const conflictingReplay = await request('/api/v1/me', {
      ...init,
      body: JSON.stringify({ expectedRevision: 1, timezone: 'America/Chicago' }),
    });
    expect(conflictingReplay.status).toBe(409);
    expect((await conflictingReplay.json()).error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('rejects invalid timezones and stale settings revisions', async () => {
    const invalid = await request('/api/v1/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
      body: JSON.stringify({ expectedRevision: 2, timezone: 'Mars/Olympus' }),
    });
    expect(invalid.status).toBe(422);

    const stale = await request('/api/v1/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
      body: JSON.stringify({ expectedRevision: 1, timezone: 'America/Chicago' }),
    });
    expect(stale.status).toBe(409);
    expect((await stale.json()).error.code).toBe('REVISION_CONFLICT');
  });

  it('returns a contract error for malformed settings JSON', async () => {
    const response = await request('/api/v1/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
      body: '{',
    });
    expect(response.status).toBe(422);
  });

  it('does not increment settings revision when the timezone is unchanged', async () => {
    const response = await request('/api/v1/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
      body: JSON.stringify({ expectedRevision: 2, timezone: 'America/New_York' }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).settingsRevision).toBe(2);
  });
});
