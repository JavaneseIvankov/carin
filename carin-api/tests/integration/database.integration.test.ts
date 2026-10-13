import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/db/client.js';
import { user } from '../../src/db/schema/index.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { postgresReadinessRepository } from '../../src/health/postgres-repository.js';
import { createApp } from '../../src/app.js';
import { createReadinessService } from '../../src/health/readiness.js';

// Every run owns a fresh, ephemeral container. No existing DATABASE_URL is read.
const name = `carin-t3-test-${randomUUID()}`;
let pool: Pool;
let containerStarted = false;
const owner = randomUUID();
const other = randomUUID();
const profile = randomUUID();
const photo = randomUUID();
const scan = randomUUID();
const job = randomUUID();
const result = randomUUID();
const consumption = randomUUID();
const snapshot = randomUUID();

beforeAll(async () => {
  execFileSync(
    'docker',
    [
      'run',
      '-d',
      '--rm',
      '--name',
      name,
      '-e',
      `POSTGRES_PASSWORD=${randomUUID()}`,
      '-e',
      'POSTGRES_HOST_AUTH_METHOD=trust',
      '-p',
      '127.0.0.1::5432',
      'postgres:18.3-alpine@sha256:54451ecb8ab38c24c3ec123f2fd501303a3a1856a5c66e98cecf2460d5e1e9d7',
    ],
    { stdio: 'pipe' },
  );
  containerStarted = true;
  const port = execFileSync('docker', ['port', name, '5432/tcp'], {
    encoding: 'utf8',
  })
    .trim()
    .split(':')
    .at(-1);
  pool = new Pool({
    connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres`,
    connectionTimeoutMillis: 1000,
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error('Disposable PostgreSQL did not start');
}, 120_000);

afterAll(async () => {
  await pool?.end();
  if (containerStarted)
    execFileSync('docker', ['rm', '-f', name], { stdio: 'pipe' });
});

describe('PostgreSQL baseline', () => {
  it('fails readiness on empty database, migrates atomically and safely repeats deployment', async () => {
    const ready = createReadinessService(postgresReadinessRepository(pool));
    const app = createApp({ readiness: ready });
    expect((await app.request('/health/ready')).status).toBe(503);
    expect(await ready()).toBe(false);
    await Promise.all([applyMigrations(pool), applyMigrations(pool)]);
    expect(await ready()).toBe(true);
    expect((await app.request('/health/ready')).status).toBe(200);
    const before = await pool.query(
      'SELECT * FROM drizzle.__drizzle_migrations ORDER BY id',
    );
    await applyMigrations(pool);
    expect(
      (
        await pool.query(
          'SELECT * FROM drizzle.__drizzle_migrations ORDER BY id',
        )
      ).rows,
    ).toEqual(before.rows);
  });

  it('stores generated auth UUIDs and rejects duplicate profiles and illegal revisions', async () => {
    for (const id of [owner, other])
      await pool.query(
        'INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at,birth_date,accepted_terms_version,accepted_privacy_version,accepted_at) VALUES ($1,$2,$3,true,now(),now(),$4,$5,$5,now())',
        [id, 'Synthetic', `${id}@example.invalid`, '1996-01-01', 'test-v1'],
      );
    expect(
      (await createDatabase(pool).select({ id: user.id }).from(user))
        .map((row) => row.id)
        .sort(),
    ).toEqual([owner, other].sort());
    await pool.query('INSERT INTO health_profile (user_id) VALUES ($1)', [
      owner,
    ]);
    await expect(
      pool.query('INSERT INTO health_profile (user_id) VALUES ($1)', [owner]),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      pool.query('UPDATE health_profile SET version=0 WHERE user_id=$1', [
        owner,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await pool.query(
      'INSERT INTO profile_snapshot (id,user_id,profile_version,context) VALUES ($1,$2,1,$3)',
      [profile, owner, { ageYears: 30 }],
    );
    await pool.query(
      'INSERT INTO photo (id,user_id,object_key,checksum,mime_type,size_bytes) VALUES ($1,$2,$3,$4,$5,100)',
      [photo, owner, randomUUID(), 'synthetic', 'image/jpeg'],
    );
    await pool.query(
      'INSERT INTO scan (id,user_id,photo_id,profile_snapshot_id) VALUES ($1,$2,$3,$4)',
      [scan, owner, photo, profile],
    );
    await pool.query(
      'INSERT INTO analysis_job (id,user_id,operation_id,kind,input_snapshot,target_revision,scan_id,profile_snapshot_id) VALUES ($1,$2,$3,$4,$5,1,$6,$7)',
      [
        job,
        owner,
        randomUUID(),
        'photo_analysis',
        { components: [] },
        scan,
        profile,
      ],
    );
    await pool.query(
      'INSERT INTO analysis_result (id,user_id,job_id,profile_snapshot_id,catalog_version,rule_version,output) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [
        result,
        owner,
        job,
        profile,
        'test-v1',
        'test-v1',
        { nutrition: { energyKcal: 100 } },
      ],
    );
  });

  it('defaults settings revision to one and supports optimistic timezone updates', async () => {
    expect(
      (
        await pool.query('SELECT settings_revision FROM "user" WHERE id=$1', [
          owner,
        ])
      ).rows[0].settings_revision,
    ).toBe(1);
    await expect(
      pool.query('UPDATE "user" SET settings_revision=0 WHERE id=$1', [owner]),
    ).rejects.toMatchObject({ code: '23514' });
    const results = await Promise.all(
      ['UTC', 'Asia/Jakarta'].map((timezone) =>
        pool.query(
          'UPDATE "user" SET timezone=$1,settings_revision=settings_revision+1 WHERE id=$2 AND settings_revision=1 RETURNING settings_revision,timezone',
          [timezone, owner],
        ),
      ),
    );
    expect(results.map((result) => result.rowCount).sort()).toEqual([0, 1]);
    expect(
      (
        await pool.query(
          'SELECT settings_revision,timezone FROM "user" WHERE id=$1',
          [owner],
        )
      ).rows[0],
    ).toMatchObject({
      settings_revision: 2,
      timezone: results.find((result) => result.rowCount === 1)!.rows[0]
        .timezone,
    });
    expect(
      (
        await pool.query('SELECT settings_revision FROM "user" WHERE id=$1', [
          other,
        ])
      ).rows[0].settings_revision,
    ).toBe(1);
  });

  it('permits general/manual snapshots with no health profile and version zero', async () => {
    const emptyProfile = randomUUID();
    const manual = randomUUID();
    expect(
      (
        await pool.query('SELECT * FROM health_profile WHERE user_id=$1', [
          other,
        ])
      ).rowCount,
    ).toBe(0);
    await pool.query(
      'INSERT INTO profile_snapshot (id,user_id,profile_version,context) VALUES ($1,$2,0,$3)',
      [
        emptyProfile,
        other,
        {
          profileVersion: 0,
          diagnosisState: 'not_provided',
          heightCm: null,
          weightKg: null,
        },
      ],
    );
    await pool.query(
      'INSERT INTO scan (user_id,profile_snapshot_id) VALUES ($1,$2)',
      [other, emptyProfile],
    );
    await pool.query(
      'INSERT INTO consumption (id,user_id,source,consumed_at) VALUES ($1,$2,$3,now())',
      [manual, other, 'manual'],
    );
    await pool.query(
      'INSERT INTO consumption_snapshot (user_id,consumption_id,revision,profile_snapshot_id,snapshot) VALUES ($1,$2,1,$3,$4)',
      [
        other,
        manual,
        emptyProfile,
        { nutrition: { energyKcal: null }, profileVersion: 0 },
      ],
    );
  });

  it('rejects cross-owner references for photo, snapshots, jobs, results and consumption', async () => {
    const unboundPhoto = randomUUID();
    await pool.query(
      'INSERT INTO photo (id,user_id,object_key,checksum,mime_type,size_bytes) VALUES ($1,$2,$3,$4,$5,100)',
      [unboundPhoto, owner, randomUUID(), 'synthetic', 'image/jpeg'],
    );
    await expect(
      pool.query(
        'INSERT INTO scan (user_id,photo_id,profile_snapshot_id) VALUES ($1,$2,$3)',
        [other, unboundPhoto, profile],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      pool.query(
        'INSERT INTO analysis_job (user_id,operation_id,kind,input_snapshot,target_revision,scan_id,profile_snapshot_id) VALUES ($1,$2,$3,$4,1,$5,$6)',
        [other, randomUUID(), 'photo_analysis', {}, scan, profile],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    const uncompletedJob = randomUUID();
    await pool.query(
      'INSERT INTO analysis_job (id,user_id,operation_id,kind,input_snapshot,target_revision,scan_id,profile_snapshot_id) VALUES ($1,$2,$3,$4,$5,1,$6,$7)',
      [
        uncompletedJob,
        owner,
        randomUUID(),
        'photo_analysis',
        {},
        scan,
        profile,
      ],
    );
    await expect(
      pool.query(
        'INSERT INTO analysis_result (user_id,job_id,profile_snapshot_id,catalog_version,rule_version,output) VALUES ($1,$2,$3,$4,$5,$6)',
        [other, uncompletedJob, profile, 'test-v1', 'test-v1', {}],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      pool.query(
        'INSERT INTO consumption (user_id,source,scan_id,source_analysis_result_id,consumed_at) VALUES ($1,$2,$3,$4,now())',
        [other, 'photo_confirmation', scan, result],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      pool.query(
        'INSERT INTO scan (user_id,profile_snapshot_id) VALUES ($1,$2)',
        [other, profile],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('allows one result per job and one active default confirmation while allowing explicit occurrences', async () => {
    await expect(
      pool.query(
        'INSERT INTO analysis_result (user_id,job_id,profile_snapshot_id,catalog_version,rule_version,output) VALUES ($1,$2,$3,$4,$5,$6)',
        [owner, job, profile, 'test-v1', 'test-v1', {}],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await pool.query(
      'INSERT INTO consumption (id,user_id,source,scan_id,source_analysis_result_id,consumed_at) VALUES ($1,$2,$3,$4,$5,now())',
      [consumption, owner, 'photo_confirmation', scan, result],
    );
    await expect(
      pool.query(
        'INSERT INTO consumption (user_id,source,scan_id,consumed_at) VALUES ($1,$2,$3,now())',
        [owner, 'photo_confirmation', scan],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await pool.query(
      'INSERT INTO consumption (user_id,source,confirmation_mode,scan_id,consumed_at) VALUES ($1,$2,$3,$4,now())',
      [owner, 'photo_confirmation', 'new_occurrence', scan],
    );
    await pool.query(
      'INSERT INTO consumption_snapshot (id,user_id,consumption_id,revision,profile_snapshot_id,snapshot) VALUES ($1,$2,$3,1,$4,$5)',
      [
        snapshot,
        owner,
        consumption,
        profile,
        {
          nutrition: { energyKcal: 50 },
          provenance: { catalogVersion: 'test-v1' },
        },
      ],
    );
    await pool.query(
      'UPDATE consumption SET current_snapshot_id=$1 WHERE id=$2',
      [snapshot, consumption],
    );
    const repeated = randomUUID();
    await pool.query('UPDATE consumption SET deleted_at=now() WHERE id=$1', [
      consumption,
    ]);
    await pool.query(
      'INSERT INTO consumption (id,user_id,source,scan_id,consumed_at) VALUES ($1,$2,$3,$4,now())',
      [repeated, owner, 'photo_confirmation', scan],
    );
    await pool.query('UPDATE consumption SET deleted_at=now() WHERE id=$1', [
      repeated,
    ]);
    await pool.query('UPDATE consumption SET deleted_at=NULL WHERE id=$1', [
      consumption,
    ]);
    await expect(
      pool.query(
        'INSERT INTO consumption_snapshot (user_id,consumption_id,revision,profile_snapshot_id,snapshot) VALUES ($1,$2,2,$3,$4)',
        [other, consumption, profile, {}],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('enforces knowledge states, finite decimals, measurement units and immutable account metadata', async () => {
    await expect(
      pool.query('UPDATE health_profile SET height_cm=$1 WHERE user_id=$2', [
        'NaN',
        owner,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query(
        'UPDATE health_profile SET diagnosis_state=$1 WHERE user_id=$2',
        ['reported', owner],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await pool.query(
      'UPDATE health_profile SET activity=$1,smoking=$2,clinician_notes=$3 WHERE user_id=$4',
      ['moderate', 'never', 'Synthetic note', owner],
    );
    await expect(
      pool.query('UPDATE "user" SET birth_date=$1 WHERE id=$2', [
        '1990-01-01',
        owner,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query(
        'INSERT INTO examination (user_id,type,context,series_key,measured_on,timezone,value,unit) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          owner,
          'glucose',
          'fasting',
          'glucose:fasting:mg/dL',
          '2026-01-01',
          'Asia/Jakarta',
          'NaN',
          'mg/dL',
        ],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query(
        'INSERT INTO examination (user_id,type,context,series_key,measured_on,timezone,value,unit) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          owner,
          'glucose',
          'fasting',
          'glucose:fasting:mg/dL',
          '2026-01-01',
          'Asia/Jakarta',
          100,
          'mmHg',
        ],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await pool.query(
      'INSERT INTO examination (user_id,type,context,series_key,measured_on,timezone,value,unit) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        owner,
        'glucose',
        'unknown',
        'glucose:unknown:mg/dL',
        '2026-01-01',
        'Asia/Jakarta',
        100,
        'mg/dL',
      ],
    );
    expect(
      (
        await pool.query(
          'SELECT measured_time FROM examination WHERE user_id=$1',
          [owner],
        )
      ).rows[0].measured_time,
    ).toBeNull();
  });

  it('scopes idempotency by owner/session/action/key and retains the original response', async () => {
    const sessionId = randomUUID();
    const key = randomUUID();
    await pool.query(
      "INSERT INTO session (id,user_id,token,expires_at,updated_at) VALUES ($1,$2,$3,now()+interval '7 days',now())",
      [sessionId, owner, randomUUID()],
    );
    await expect(
      pool.query(
        'INSERT INTO idempotency_record (user_id,session_id,action_scope,key,request_hash) VALUES ($1,$2,$3,$4,$5)',
        [other, sessionId, 'consumption:create', key, 'synthetic-hash'],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    await pool.query(
      'INSERT INTO idempotency_record (user_id,session_id,action_scope,key,request_hash,response_status,response_body) VALUES ($1,$2,$3,$4,$5,201,$6)',
      [
        owner,
        sessionId,
        'consumption:create',
        key,
        'synthetic-hash',
        { id: consumption },
      ],
    );
    await expect(
      pool.query(
        'INSERT INTO idempotency_record (user_id,session_id,action_scope,key,request_hash) VALUES ($1,$2,$3,$4,$5)',
        [owner, sessionId, 'consumption:create', key, 'other-hash'],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await pool.query(
      'INSERT INTO idempotency_record (user_id,session_id,action_scope,key,request_hash) VALUES ($1,$2,$3,$4,$5)',
      [owner, sessionId, 'examination:create', key, 'synthetic-hash'],
    );
    expect(
      (
        await pool.query(
          'SELECT response_status,response_body,expires_at-created_at AS retention FROM idempotency_record WHERE response_status=201',
        )
      ).rows[0],
    ).toMatchObject({
      response_status: 201,
      response_body: { id: consumption },
      retention: { days: 1 },
    });
  });

  it('commits revision and current snapshot together, rejecting a mismatched active snapshot', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE consumption SET revision=2 WHERE id=$1', [
        consumption,
      ]);
      await expect(client.query('COMMIT')).rejects.toMatchObject({
        code: '23503',
      });
      await client.query('BEGIN');
      const nextSnapshot = randomUUID();
      await client.query(
        'UPDATE consumption SET revision=2,current_snapshot_id=$1 WHERE id=$2',
        [nextSnapshot, consumption],
      );
      await client.query(
        'INSERT INTO consumption_snapshot (id,user_id,consumption_id,revision,profile_snapshot_id,snapshot) VALUES ($1,$2,$3,2,$4,$5)',
        [
          nextSnapshot,
          owner,
          consumption,
          profile,
          {
            nutrition: { energyKcal: 50 },
            provenance: { catalogVersion: 'test-v1' },
          },
        ],
      );
      await client.query('COMMIT');
      // Restore the test's active revision without modifying either historical row.
      await client.query(
        'UPDATE consumption SET revision=1,current_snapshot_id=$1 WHERE id=$2',
        [snapshot, consumption],
      );
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('keeps historical snapshots immutable through profile/catalog edits and scan purge', async () => {
    await expect(
      pool.query('UPDATE analysis_job SET input_snapshot=$1 WHERE id=$2', [
        { components: ['changed'] },
        job,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await pool.query(
      'UPDATE health_profile SET version=2,weight_kg=70 WHERE user_id=$1',
      [owner],
    );
    await expect(
      pool.query('UPDATE profile_snapshot SET context=$1 WHERE id=$2', [
        { ageYears: 40 },
        profile,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query('UPDATE analysis_result SET output=$1 WHERE id=$2', [
        { nutrition: { energyKcal: 999 } },
        result,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query('UPDATE consumption_snapshot SET snapshot=$1 WHERE id=$2', [
        { nutrition: { energyKcal: 999 } },
        snapshot,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await pool.query(
      'INSERT INTO catalog_food (id,version,display_name,energy_kcal,source_refs) VALUES ($1,$2,$3,$4,$5)',
      ['synthetic-food', 'v1', 'Synthetic', '100.000000', []],
    );
    await pool.query(
      'INSERT INTO catalog_food (id,version,display_name,energy_kcal,source_refs) VALUES ($1,$2,$3,$4,$5)',
      ['synthetic-food', 'v2', 'Synthetic', '200.000000', []],
    );
    await expect(
      pool.query('UPDATE catalog_food SET display_name=$1 WHERE version=$2', [
        'Changed',
        'v1',
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await pool.query('DELETE FROM scan WHERE id=$1', [scan]);
    const row = (
      await pool.query('SELECT * FROM consumption WHERE id=$1', [consumption])
    ).rows[0];
    expect(row).toMatchObject({
      source: 'photo_confirmation',
      scan_id: null,
      source_analysis_result_id: null,
      photo_available: false,
      current_snapshot_id: snapshot,
    });
    expect(
      (
        await pool.query(
          'SELECT snapshot FROM consumption_snapshot WHERE id=$1',
          [snapshot],
        )
      ).rows[0].snapshot.nutrition.energyKcal,
    ).toBe(50);
    expect(
      (
        await pool.query('SELECT context FROM profile_snapshot WHERE id=$1', [
          profile,
        ])
      ).rows[0].context.ageYears,
    ).toBe(30);
  });

  it('fails readiness for altered/missing migration records, then permits complete account purge', async () => {
    const ready = createReadinessService(postgresReadinessRepository(pool));
    await pool.query(
      "UPDATE drizzle.__drizzle_migrations SET hash='altered' WHERE id=1",
    );
    expect(await ready()).toBe(false);
    await pool.query('DELETE FROM "user" WHERE id=$1', [owner]);
    expect(
      (await pool.query('SELECT * FROM consumption WHERE user_id=$1', [owner]))
        .rowCount,
    ).toBe(0);
    expect(
      (
        await pool.query(
          'SELECT * FROM consumption_snapshot WHERE user_id=$1',
          [owner],
        )
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await pool.query('SELECT * FROM profile_snapshot WHERE user_id=$1', [
          owner,
        ])
      ).rowCount,
    ).toBe(0);
    expect(
      (await pool.query('SELECT * FROM consumption WHERE user_id=$1', [other]))
        .rowCount,
    ).toBe(1);
  });
});
