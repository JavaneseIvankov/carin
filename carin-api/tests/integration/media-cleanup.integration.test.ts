import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/db/client.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { runPhotoCleanupBatch } from '../../src/modules/media/cleanup.js';
import type { MediaObjectStore } from '../../src/modules/media/storage.js';

const container = `carin-t17-cleanup-${randomUUID()}`;
const userId = randomUUID();
const photoId = randomUUID();
const key = `photos/${randomUUID()}`;
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
  await pool.query(
    'INSERT INTO "user" (id,name,email,email_verified,birth_date,accepted_terms_version,accepted_privacy_version,accepted_at) VALUES ($1,$2,$3,true,$4,$5,$5,now())',
    [userId, 'Synthetic', `${userId}@example.invalid`, '1996-01-01', 'test-v1'],
  );
}, 120_000);

afterAll(async () => {
  await pool?.end();
  if (containerStarted) execFileSync('docker', ['rm', '-f', container], { stdio: 'pipe' });
});

describe('durable orphan photo cleanup', () => {
  it('schedules after one hour, persists a failed deletion, and retries after a fresh runner call', async () => {
    const now = new Date('2026-10-14T04:00:00.000Z');
    const expiredAt = new Date(now.getTime() - 60 * 60 * 1000 - 1000);
    await pool.query(
      'INSERT INTO photo (id,user_id,object_key,checksum,mime_type,size_bytes,lifecycle,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [photoId, userId, key, 'a'.repeat(64), 'image/jpeg', 100, 'uploaded', expiredAt],
    );
    const state = { failuresLeft: 1, removed: [] as string[] };
    const makeStore = (): MediaObjectStore => ({
      putObject: async () => undefined,
      readObject: async () => Buffer.alloc(0),
      presignRead: async () => 'http://minio:9000/carin/object?X-Amz-Signature=valid',
      removeObject: async (objectKey) => {
        if (state.failuresLeft > 0) {
          state.failuresLeft--;
          throw new Error('MinIO unavailable');
        }
        state.removed.push(objectKey);
      },
    });

    const first = await runPhotoCleanupBatch(createDatabase(pool), makeStore(), { now });
    expect(first).toMatchObject({ scheduled: 1, removed: 0, failed: 1 });
    const afterFailure = await pool.query(
      'SELECT lifecycle FROM photo WHERE id=$1', [photoId],
    );
    expect(afterFailure.rows[0].lifecycle).toBe('deleting');
    const retryRow = await pool.query(
      'SELECT status,attempts,next_attempt_at,object_keys FROM deletion_task WHERE kind=$1 AND user_id=$2',
      ['photo', userId],
    );
    expect(retryRow.rows).toHaveLength(1);
    expect(retryRow.rows[0]).toMatchObject({ status: 'failed', attempts: 1, object_keys: [key] });
    const retryAt = new Date(retryRow.rows[0].next_attempt_at);

    const early = await runPhotoCleanupBatch(createDatabase(pool), makeStore(), {
      now: new Date(retryAt.getTime() - 1),
    });
    expect(early.removed).toBe(0);
    const afterRestart = await runPhotoCleanupBatch(createDatabase(pool), makeStore(), {
      now: new Date(retryAt.getTime() + 1),
    });

    expect(afterRestart).toMatchObject({ scheduled: 0, removed: 1, failed: 0 });
    expect(state.removed).toEqual([key]);
    expect((await pool.query('SELECT lifecycle FROM photo WHERE id=$1', [photoId])).rows[0].lifecycle)
      .toBe('deleted');
    expect((await pool.query('SELECT id FROM deletion_task WHERE user_id=$1', [userId])).rows)
      .toHaveLength(0);
  });
});
