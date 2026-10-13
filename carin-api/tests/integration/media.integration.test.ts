import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { createDatabase } from '../../src/db/client.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createMediaGrant } from '../../src/modules/media/grants.js';
import { createMediaRepository } from '../../src/modules/media/repository.js';
import { createMediaService } from '../../src/modules/media/service.js';
import type { MediaObjectStore } from '../../src/modules/media/storage.js';
import type { SessionResolver } from '../../src/http/access.js';

const container = `carin-t17-media-${randomUUID()}`;
const ownerA = randomUUID();
const ownerB = randomUUID();
const sessionA = randomUUID();
const sessionB = randomUUID();
let pool: Pool;
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
  const port = execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8' })
    .trim().split(':').at(-1);
  pool = new Pool({ connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres` });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await pool.query('SELECT 1'); break; }
    catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  await applyMigrations(pool);
  for (const [id, name] of [[ownerA, 'Owner A'], [ownerB, 'Owner B']]) {
    await pool.query(
      'INSERT INTO "user" (id,name,email,email_verified,birth_date,accepted_terms_version,accepted_privacy_version,accepted_at) VALUES ($1,$2,$3,true,$4,$5,$5,now())',
      [id, name, `${id}@example.invalid`, '1996-01-01', 'test-v1'],
    );
  }
  for (const [id, userId] of [[sessionA, ownerA], [sessionB, ownerB]]) {
    await pool.query(
      'INSERT INTO session (id,expires_at,token,created_at,updated_at,user_id) VALUES ($1,now()+interval \'1 day\',$2,now(),now(),$3)',
      [id, `session-${id}`, userId],
    );
  }
}, 120_000);

afterAll(async () => {
  await pool?.end();
  if (containerStarted) execFileSync('docker', ['rm', '-f', container], { stdio: 'pipe' });
});

function makeMediaContext() {
  const database = createDatabase(pool);
  const objects = new Map<string, Buffer>();
  const store: MediaObjectStore = {
    putObject: vi.fn(async ({ key, bytes }) => { objects.set(key, Buffer.from(bytes)); }),
    readObject: vi.fn(async (key) => {
      const bytes = objects.get(key);
      if (!bytes) throw new Error('object missing');
      return bytes;
    }),
    removeObject: vi.fn(async (key) => { objects.delete(key); }),
    presignRead: vi.fn(async (key, expires) =>
      `http://minio:9000/carin/${key}?X-Amz-Expires=${expires}&X-Amz-Signature=private`),
  };
  const repository = createMediaRepository(database);
  const resolveSession: SessionResolver = async (request) => {
    const supplied = request.headers.get('x-test-session');
    if (supplied === sessionA) return { userId: ownerA, emailVerified: true, sessionId: sessionA };
    if (supplied === sessionB) return { userId: ownerB, emailVerified: true, sessionId: sessionB };
    return null;
  };
  const log: Array<{ method: string; status: number; durationMs: number; requestId: string }> = [];
  const media = {
    repository,
    store,
    resolveSession,
    environment: 'dev' as const,
    signingSecret: 'private-media-secret-with-at-least-32-bytes',
    publicApiOrigin: 'http://127.0.0.1:3000',
    minioEndpoint: 'http://minio:9000',
    minioBucket: 'carin',
  };
  const app = createApp({ readiness: async () => true, media, log: (entry) => log.push(entry) });
  const service = createMediaService({ ...media });
  return { app, service, store, objects, log };
}

async function jpeg(background: { r: number; g: number; b: number } = { r: 120, g: 70, b: 30 }) {
  return sharp({
    create: { width: 32, height: 24, channels: 3, background },
  }).jpeg().toBuffer();
}

describe('private photo media routes', () => {
  it('uploads a normalized object, replays an idempotency key, and rejects changed payloads', async () => {
    const { app, store } = makeMediaContext();
    const bytes = await jpeg();
    const upload = async (source: Buffer, key: string) => {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(source)], { type: 'image/jpeg' }), 'meal.jpg');
      return app.request('/api/v1/photos', {
        method: 'POST',
        headers: { 'x-test-session': sessionA, 'Idempotency-Key': key },
        body: form,
      });
    };
    const idempotencyKey = randomUUID();

    const first = await upload(bytes, idempotencyKey);
    expect(first.status).toBe(201);
    const photo = await first.json();
    expect(photo).toMatchObject({ mimeType: 'image/jpeg', width: 32, height: 24 });
    expect(photo.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(store.putObject).toHaveBeenCalledTimes(1);

    const replay = await upload(bytes, idempotencyKey);
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(photo);
    expect(store.putObject).toHaveBeenCalledTimes(1);

    const changed = await upload(await jpeg({ r: 20, g: 190, b: 60 }), idempotencyKey);
    expect(changed.status).toBe(409);
  });

  it('requires an injected verified session for uploads and owner grant issuance', async () => {
    const { app } = makeMediaContext();
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(await jpeg())], { type: 'image/jpeg' }), 'meal.jpg');
    const upload = await app.request('/api/v1/photos', {
      method: 'POST',
      headers: { 'Idempotency-Key': randomUUID() },
      body: form,
    });
    expect(upload.status).toBe(401);
    const view = await app.request(`/api/v1/photos/${randomUUID()}/view`);
    expect(view.status).toBe(401);
  });

  it('rechecks owner/account state for view, signed stream, and worker URL reads', async () => {
    const { app, service } = makeMediaContext();
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(await jpeg())], { type: 'image/jpeg' }), 'meal.jpg');
    const upload = await app.request('/api/v1/photos', {
      method: 'POST',
      headers: { 'x-test-session': sessionA, 'Idempotency-Key': randomUUID() },
      body: form,
    });
    const photo = await upload.json();

    const ownerView = await app.request(`/api/v1/photos/${photo.id}/view`, {
      headers: { 'x-test-session': sessionA },
    });
    expect(ownerView.status).toBe(200);
    const viewBody = await ownerView.json();
    const grant = new URL(viewBody.url).searchParams.get('token');
    expect(grant).toBeTruthy();
    expect(Date.parse(viewBody.expiresAt) - Date.now()).toBeGreaterThan(4 * 60 * 1000);

    const otherView = await app.request(`/api/v1/photos/${photo.id}/view`, {
      headers: { 'x-test-session': sessionB },
    });
    expect(otherView.status).toBe(404);
    await expect(service.createAiPhotoUrl(ownerB, photo.id)).rejects.toThrow();
    const aiUrl = await service.createAiPhotoUrl(ownerA, photo.id);
    expect(new URL(aiUrl).hostname).toBe('minio');
    expect(new URL(aiUrl).searchParams.get('X-Amz-Expires')).toBe('600');

    const read = await app.request(`/media/photos/${photo.id}?token=${encodeURIComponent(grant!)}`);
    expect(read.status).toBe(200);
    expect(read.headers.get('cache-control')).toBe('private, no-store');
    expect(read.headers.get('content-type')).toBe('image/jpeg');
    expect((await sharp(Buffer.from(await read.arrayBuffer())).metadata()).width).toBe(32);

    await pool.query('UPDATE "user" SET deletion_status=$1 WHERE id=$2', ['deleting', ownerA]);
    const deletedView = await app.request(`/api/v1/photos/${photo.id}/view`, {
      headers: { 'x-test-session': sessionA },
    });
    const revokedRead = await app.request(`/media/photos/${photo.id}?token=${encodeURIComponent(grant!)}`);
    expect(deletedView.status).toBe(404);
    expect(revokedRead.status).toBe(404);
  });

  it('returns the same not-found response for invalid and expired grants without logging query tokens', async () => {
    const { app, log } = makeMediaContext();
    const photoId = randomUUID();
    const invalidToken = 'opaque-secret-grant-that-must-not-be-logged';
    const invalid = await app.request(`/media/photos/${photoId}?token=${invalidToken}`);
    const expiredToken = createMediaGrant({ photoId, userId: ownerA, environment: 'dev' }, 'private-media-secret-with-at-least-32-bytes', Date.now() - 6 * 60 * 1000);
    const expired = await app.request(`/media/photos/${photoId}?token=${expiredToken}`);

    expect(invalid.status).toBe(404);
    expect(expired.status).toBe(404);
    const invalidBody = await invalid.json();
    const expiredBody = await expired.json();
    expect(invalidBody.error).toMatchObject({ code: 'RESOURCE_NOT_FOUND', message: 'Resource not found' });
    expect(expiredBody.error).toMatchObject({ code: 'RESOURCE_NOT_FOUND', message: 'Resource not found' });
    expect(JSON.stringify(log)).not.toContain(invalidToken);
    expect(JSON.stringify(log)).not.toContain(expiredToken);
  });
});
