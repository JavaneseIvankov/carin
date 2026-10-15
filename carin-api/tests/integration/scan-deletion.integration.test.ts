import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createDatabase } from '../../src/db/client.js';
import { applyMigrations } from '../../src/db/migrations.js';
import type { SessionResolver } from '../../src/http/access.js';

const containerName = `carin-c29-scan-delete-${randomUUID()}`;
const ownerId = randomUUID();
const sessionId = randomUUID();
const photoId = randomUUID();
const scanId = randomUUID();
const profileSnapshotId = randomUUID();
const resultId = randomUUID();
const consumptionId = randomUUID();
const consumptionSnapshotId = randomUUID();
const photoObjectKey = `photos/${randomUUID()}`;
let pool: Pool;
let database: ReturnType<typeof createDatabase>;
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
  const port = execFileSync('docker', ['port', containerName, '5432/tcp'], { encoding: 'utf8' })
    .trim().split(':').at(-1);
  pool = new Pool({ connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres`, connectionTimeoutMillis: 1_000 });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await pool.query('SELECT 1'); break; }
    catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  await applyMigrations(pool);
  database = createDatabase(pool);
  await seedScan();
}, 120_000);

afterAll(async () => {
  await pool?.end();
  if (containerStarted) execFileSync('docker', ['rm', '-f', containerName], { stdio: 'pipe' });
});

async function seedScan(): Promise<void> {
  await pool.query(
    `INSERT INTO "user" (id,name,email,email_verified,birth_date,accepted_terms_version,accepted_privacy_version,accepted_at)
     VALUES ($1,'C29 scan owner',$2,true,'1990-01-01','terms-v1','privacy-v1',now())`,
    [ownerId, `${ownerId}@example.invalid`],
  );
  await pool.query(
    `INSERT INTO session (id,expires_at,token,created_at,updated_at,user_id)
     VALUES ($1,now()+interval '1 day',$2,now(),now(),$3)`,
    [sessionId, randomUUID(), ownerId],
  );
  await pool.query(
    'INSERT INTO profile_snapshot (id,user_id,profile_version,context) VALUES ($1,$2,1,$3)',
    [profileSnapshotId, ownerId, JSON.stringify({ profileVersion: 1 })],
  );
  await pool.query(
    `INSERT INTO photo (id,user_id,object_key,checksum,mime_type,size_bytes,lifecycle)
     VALUES ($1,$2,$3,'checksum','image/jpeg',128,'attached')`,
    [photoId, ownerId, photoObjectKey],
  );
  await pool.query(
    'INSERT INTO scan (id,user_id,photo_id,profile_snapshot_id) VALUES ($1,$2,$3,$4)',
    [scanId, ownerId, photoId, profileSnapshotId],
  );
  await pool.query(
    `INSERT INTO analysis_job (id,user_id,operation_id,kind,input_snapshot,profile_snapshot_id,scan_id,target_revision,status,finished_at)
     VALUES ($1,$2,$3,'photo_analysis','{}',$4,$5,1,'completed',now())`,
    [randomUUID(), ownerId, randomUUID(), profileSnapshotId, scanId],
  );
  await pool.query(
    `INSERT INTO analysis_result (id,user_id,job_id,profile_snapshot_id,catalog_version,rule_version,output)
     VALUES ($1,$2,(SELECT id FROM analysis_job WHERE scan_id=$3),$4,'synthetic-test','rule-test','{}')`,
    [resultId, ownerId, scanId, profileSnapshotId],
  );
  await pool.query(
    'UPDATE scan SET current_result_id=$1,latest_job_id=(SELECT id FROM analysis_job WHERE scan_id=$2) WHERE id=$2',
    [resultId, scanId],
  );
  await pool.query(
    `INSERT INTO consumption (id,user_id,source,confirmation_mode,scan_id,source_analysis_result_id,photo_available,consumed_at,timezone)
     VALUES ($1,$2,'photo_confirmation','default',$3,$4,true,now(),'Asia/Jakarta')`,
    [consumptionId, ownerId, scanId, resultId],
  );
  await pool.query(
    `INSERT INTO consumption_snapshot (id,user_id,consumption_id,revision,profile_snapshot_id,snapshot)
     VALUES ($1,$2,$3,1,$4,$5)`,
    [consumptionSnapshotId, ownerId, consumptionId, profileSnapshotId, JSON.stringify({ nutrition: { energyKcal: 125 } })],
  );
  await pool.query('UPDATE consumption SET current_snapshot_id=$1 WHERE id=$2', [consumptionSnapshotId, consumptionId]);
}

describe('scan deletion', () => {
  it('replays idempotently, removes the scan, and preserves its confirmed nutrition snapshot', async () => {
    const resolveSession: SessionResolver = async (request) =>
      request.headers.get('x-test-session') === sessionId
        ? { userId: ownerId, emailVerified: true, sessionId }
        : null;
    const app = createApp({ readiness: async () => true, scans: { db: database, resolveSession } });
    const key = randomUUID();
    const remove = () => app.request(`/api/v1/scans/${scanId}`, {
      method: 'DELETE',
      headers: { 'x-test-session': sessionId, 'Idempotency-Key': key },
    });

    expect((await remove()).status).toBe(204);
    expect((await remove()).status).toBe(204);
    expect((await app.request(`/api/v1/scans/${scanId}`, {
      method: 'DELETE',
      headers: { 'x-test-session': sessionId, 'Idempotency-Key': randomUUID() },
    })).status).toBe(404);

    const state = await pool.query(
      `SELECT c.scan_id,c.source_analysis_result_id,c.photo_available,c.source,
              s.snapshot AS saved_snapshot,p.lifecycle,t.kind,t.object_keys
       FROM consumption c
       JOIN consumption_snapshot s ON s.id=c.current_snapshot_id
       JOIN photo p ON p.id=$2
       JOIN deletion_task t ON t.user_id=c.user_id AND t.kind='photo'
       WHERE c.id=$1`,
      [consumptionId, photoId],
    );
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0]).toMatchObject({
      scan_id: null,
      source_analysis_result_id: null,
      photo_available: false,
      source: 'photo_confirmation',
      saved_snapshot: { nutrition: { energyKcal: 125 } },
      lifecycle: 'deleting',
      kind: 'photo',
      object_keys: [photoObjectKey],
    });
    expect((await pool.query('SELECT id FROM scan WHERE id=$1', [scanId])).rowCount).toBe(0);
  });
});
