import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/db/client.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { getLegalRegistry } from '../../src/modules/legal/registry.js';
import {
  completeSeedResource,
  reserveSeedResource,
  saveSeedResourceId,
  SeedPayloadConflictError,
} from '../../src/demo/seed-state.js';

const containerName = `carin-demo-seed-${randomUUID()}`;
let pool: Pool;
let containerStarted = false;
let userId: string;
let database: ReturnType<typeof createDatabase>;

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
  pool = new Pool({ connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres`, connectionTimeoutMillis: 1_000 });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await pool.query('SELECT 1'); break; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  await applyMigrations(pool);
  const legal = getLegalRegistry();
  userId = randomUUID();
  await pool.query(
    `INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at,birth_date,accepted_terms_version,accepted_privacy_version,accepted_at)
     VALUES ($1,'Seed test',$2,true,now(),now(),'1995-01-01',$3,$4,now())`,
    [userId, `${userId}@example.invalid`, legal.terms.version, legal.privacy.version],
  );
  database = createDatabase(pool);
}, 120_000);

afterAll(async () => {
  await pool?.end();
  if (containerStarted) execFileSync('docker', ['rm', '-f', containerName], { stdio: 'pipe' });
});

describe('demo seed registry', () => {
  it('resumes pending work and marks a validated resource complete', async () => {
    const resource = { seedKey: 'exam:pressure:2026-10-08', resourceKind: 'examination', payloadHash: 'payload-hash' };
    expect(await reserveSeedResource(database, userId, resource)).toEqual({ state: 'pending', resourceId: null });
    await saveSeedResourceId(database, userId, resource.seedKey, 'measurement-id');
    expect(await reserveSeedResource(database, userId, resource)).toEqual({ state: 'pending', resourceId: 'measurement-id' });
    await completeSeedResource(database, userId, resource.seedKey, 'measurement-id');
    expect(await reserveSeedResource(database, userId, resource)).toEqual({ state: 'complete', resourceId: 'measurement-id' });
  });

  it('rejects a changed payload under an existing stable key', async () => {
    const resource = { seedKey: 'meal:stable', resourceKind: 'consumption', payloadHash: 'first-hash' };
    await reserveSeedResource(database, userId, resource);
    await expect(reserveSeedResource(database, userId, { ...resource, payloadHash: 'changed-hash' }))
      .rejects.toBeInstanceOf(SeedPayloadConflictError);
  });
});
