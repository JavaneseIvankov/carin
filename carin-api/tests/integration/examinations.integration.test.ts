import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createDatabase } from '../../src/db/client.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { getLegalRegistry } from '../../src/modules/legal/registry.js';

const containerName = `carin-c24-exams-${randomUUID()}`;
const ownerId = randomUUID();
const ownerSessionId = randomUUID();
const otherId = randomUUID();
const otherSessionId = randomUUID();
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
  for (const [userId, sessionId] of [[ownerId, ownerSessionId], [otherId, otherSessionId]]) {
    await pool.query(
      `INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at,birth_date,accepted_terms_version,accepted_privacy_version,accepted_at)
       VALUES ($1,'Exam test',$2,true,now(),now(),'1995-01-01',$3,$4,now())`,
      [userId, `${userId}@example.invalid`, legal.terms.version, legal.privacy.version],
    );
    await pool.query(
      "INSERT INTO session (id,expires_at,token,created_at,updated_at,user_id) VALUES ($1,now()+interval '1 day',$2,now(),now(),$3)",
      [sessionId, randomUUID(), userId],
    );
  }
  const db = createDatabase(pool);
  app = createApp({
    readiness: async () => true,
    examinations: {
      db,
      cursorSecret: 'test-only-secret-for-examination-cursors',
      resolveSession: async (request) => {
        if (request.headers.get('x-unauth') === 'true') return null;
        const userId = request.headers.get('x-test-user') === otherId ? otherId : ownerId;
        return { userId, sessionId: userId === ownerId ? ownerSessionId : otherSessionId, emailVerified: true };
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
  return app.request(path, { ...init, headers });
}

function create(record: unknown, key = randomUUID(), userId = ownerId) {
  return request('/api/v1/examinations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': key },
    body: JSON.stringify(record),
  }, userId);
}

const glucose = (overrides: Record<string, unknown> = {}) => ({
  measuredOn: '2025-02-01', measuredTime: null, timezone: 'Asia/Jakarta', note: null,
  type: 'glucose', unit: 'mg/dL', context: 'fasting', value: 90.123456789123,
  ...overrides,
});

describe('examination API', () => {
  it('persists multiple measurements and does not let a backdated create replace the latest series value', async () => {
    const latest = await create(glucose({ measuredOn: '2025-03-01' }));
    expect(latest.status).toBe(201);
    const latestBody = await latest.json();
    const earlier = await create(glucose({ measuredOn: '2024-11-01', value: 88 }));
    expect(earlier.status).toBe(201);
    const seriesResponse = await request('/api/v1/examination-series');
    expect(seriesResponse.status).toBe(200);
    const series = await seriesResponse.json();
    expect(series).toHaveLength(1);
    expect(series[0].items).toHaveLength(2);
    expect(series[0].latestExaminationId).toBe(latestBody.id);
    const list = await request('/api/v1/examinations?limit=1');
    expect(list.status).toBe(200);
    const page = await list.json();
    expect(page.items[0].record.measuredOn).toBe('2025-03-01');
    expect(page.nextCursor).toEqual(expect.any(String));
  });

  it('keeps date-only rows deterministic by createdAt/id without assigning a measured time', async () => {
    const first = await create(glucose({ measuredOn: '2023-03-03' }));
    await new Promise((resolve) => setTimeout(resolve, 15));
    const second = await create(glucose({ measuredOn: '2023-03-03', value: 91 }));
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const page = await (await request('/api/v1/examinations?limit=10&type=glucose')).json();
    const sameDay = page.items.filter((item: { record: { measuredOn: string } }) => item.record.measuredOn === '2023-03-03');
    expect(sameDay.map((item: { record: { measuredTime: string | null } }) => item.record.measuredTime)).toEqual([null, null]);
    expect(sameDay[0].id).toBe((await second.json()).id);
  });

  it('separates glucose contexts and cholesterol subtypes into distinct series', async () => {
    await create(glucose());
    await create(glucose({ context: 'random', value: 101 }));
    await create({ ...glucose(), type: 'cholesterol', context: undefined, subtype: 'total', value: 180 });
    await create({ ...glucose(), type: 'cholesterol', context: undefined, subtype: 'ldl', value: 100 });
    const series = await (await request('/api/v1/examination-series')).json();
    expect(series).toHaveLength(4);
    expect(new Set(series.map((entry: { key: string }) => entry.key)).size).toBe(4);
  });

  it('replays an identical create and rejects changed payload reuse', async () => {
    const key = randomUUID();
    const body = glucose({ measuredOn: '2022-01-01' });
    const first = await create(body, key);
    const firstBody = await first.json();
    const replay = await create(body, key);
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(firstBody);
    const conflict = await create({ ...body, value: 99 }, key);
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('replaces records with revision checks and removes only the deleted row from latest/series', async () => {
    const older = await create(glucose({ measuredOn: '2020-01-01' }));
    const newer = await create(glucose({ measuredOn: '2021-01-01', value: 95 }));
    const oldRecord = await older.json();
    const newRecord = await newer.json();
    const update = await request(`/api/v1/examinations/${oldRecord.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
      body: JSON.stringify({ expectedRevision: 1, record: glucose({ measuredOn: '2022-01-01', value: 97 }) }),
    });
    expect(update.status).toBe(200);
    expect((await update.json()).revision).toBe(2);
    const stale = await request(`/api/v1/examinations/${oldRecord.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
      body: JSON.stringify({ expectedRevision: 1, record: glucose({ value: 98 }) }),
    });
    expect(stale.status).toBe(409);
    expect((await stale.json()).error.code).toBe('REVISION_CONFLICT');
    const deletion = await request(`/api/v1/examinations/${oldRecord.id}`, {
      method: 'DELETE', headers: { 'idempotency-key': randomUUID() },
    });
    expect(deletion.status).toBe(204);
    expect((await request(`/api/v1/examinations/${oldRecord.id}`)).status).toBe(404);
    const series = await (await request('/api/v1/examination-series')).json();
    expect(series[0].items.map((item: { id: string }) => item.id)).toEqual([newRecord.id]);
    expect(series[0].latestExaminationId).toBe(newRecord.id);
  });

  it('hides foreign-owned IDs and requires authentication', async () => {
    const created = await create(glucose({ measuredOn: '2019-01-01' }), randomUUID(), otherId);
    const { id } = await created.json();
    const foreignRead = await request(`/api/v1/examinations/${id}`);
    const foreignDelete = await request(`/api/v1/examinations/${id}`, { method: 'DELETE', headers: { 'idempotency-key': randomUUID() } });
    expect(foreignRead.status).toBe(404);
    expect(foreignDelete.status).toBe(404);
    expect((await app.request('/api/v1/examinations', { headers: { 'x-unauth': 'true' } })).status).toBe(401);
  });

  it('rejects invalid, non-positive, and future measurements while allowing broad positive values', async () => {
    for (const bad of [
      glucose({ value: 0 }),
      glucose({ value: Number.POSITIVE_INFINITY }),
      glucose({ measuredOn: '2099-01-01' }),
      glucose({ measuredOn: '2025-02-01', measuredTime: '25:00' }),
      glucose({ timezone: 'Mars/Olympus' }),
      { measuredOn: '2025-02-01', measuredTime: null, timezone: 'UTC', note: null, type: 'pressure', unit: 'mmHg', systolic: 120.5, diastolic: 80 },
    ]) {
      const response = await create(bad);
      expect([400, 422]).toContain(response.status);
    }
    const broad = await create(glucose({ measuredOn: '2018-01-01', value: 0.000000000123456789 }));
    expect(broad.status).toBe(201);
    expect((await broad.json()).record.value).toBe(0.000000000123456789);
  });

  it('binds opaque cursors to the authenticated owner and filters', async () => {
    await create(glucose({ measuredOn: '2017-01-01' }));
    await create(glucose({ measuredOn: '2016-01-01' }));
    const first = await (await request('/api/v1/examinations?limit=1&type=glucose')).json();
    expect(first.nextCursor).toEqual(expect.any(String));
    const wrongFilter = await request(`/api/v1/examinations?limit=1&type=pressure&cursor=${encodeURIComponent(first.nextCursor)}`);
    expect(wrongFilter.status).toBe(400);
    const wrongOwner = await request(`/api/v1/examinations?limit=1&type=glucose&cursor=${encodeURIComponent(first.nextCursor)}`, {}, otherId);
    expect(wrongOwner.status).toBe(400);
  });
});
