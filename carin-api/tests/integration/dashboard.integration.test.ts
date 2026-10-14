import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/db/client.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createApp } from '../../src/app.js';
import { getLegalRegistry } from '../../src/modules/legal/registry.js';
import type { components as AiComponents } from '../../src/contracts/generated/ai-service.js';

const containerName = `carin-c26-dashboard-${randomUUID()}`;
const completed = JSON.parse(readFileSync(new URL('../../fixtures/ai/analysis-complete.json', import.meta.url), 'utf8')) as Record<string, unknown>;
let pool: Pool;
let database: ReturnType<typeof createDatabase>;
let containerStarted = false;

type Owner = { userId: string; sessionId: string };

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
  database = createDatabase(pool);
}, 120_000);

afterAll(async () => {
  await pool?.end();
  if (containerStarted) execFileSync('docker', ['rm', '-f', containerName], { stdio: 'pipe' });
});

async function createOwner(timezone = 'America/New_York'): Promise<Owner> {
  const userId = randomUUID();
  const sessionId = randomUUID();
  const legal = getLegalRegistry();
  await pool.query(
    `INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at,birth_date,timezone,accepted_terms_version,accepted_privacy_version,accepted_at)
     VALUES ($1,'C26 test',$2,true,now(),now(),'1995-01-01',$3,$4,$5,now())`,
    [userId, `${userId}@example.invalid`, timezone, legal.terms.version, legal.privacy.version],
  );
  await pool.query(
    `INSERT INTO session (id,expires_at,token,created_at,updated_at,user_id)
     VALUES ($1,now()+interval '1 day',$2,now(),now(),$3)`,
    [sessionId, randomUUID(), userId],
  );
  return { userId, sessionId };
}

function appFor(owner: Owner) {
  const resolveSession = async (request: Request) => request.headers.get('x-test-user') === owner.userId
    ? { userId: owner.userId, emailVerified: true, sessionId: owner.sessionId }
    : null;
  return createApp({ readiness: async () => true, dashboard: { db: database, resolveSession } });
}

async function seedConsumption(
  owner: Owner,
  input: {
    consumedAt: string;
    state: 'completed' | 'pending' | 'failed' | 'not_requested';
    attentions?: Array<{ ruleId: string; conditionId: string; componentIds: string[]; reason: string; adjustments: string[] }>;
  },
): Promise<string> {
  const consumptionId = randomUUID();
  const snapshotId = randomUUID();
  const profileSnapshotId = randomUUID();
  const snapshot = {
    ...completed,
    operationId: randomUUID(),
    inputKind: 'manual',
    attentions: input.attentions ?? [],
  };
  await pool.query(
    `INSERT INTO profile_snapshot (id,user_id,profile_version,context) VALUES ($1,$2,0,'{}')`,
    [profileSnapshotId, owner.userId],
  );
  await pool.query(
    `INSERT INTO consumption (id,user_id,source,consumed_at,timezone) VALUES ($1,$2,'manual',$3,'America/New_York')`,
    [consumptionId, owner.userId, input.consumedAt],
  );
  await pool.query(
    `INSERT INTO consumption_snapshot (id,user_id,consumption_id,revision,profile_snapshot_id,snapshot)
     VALUES ($1,$2,$3,1,$4,$5)`,
    [snapshotId, owner.userId, consumptionId, profileSnapshotId, JSON.stringify(snapshot)],
  );
  await pool.query('UPDATE consumption SET current_snapshot_id=$2 WHERE id=$1', [consumptionId, snapshotId]);
  await pool.query(
    `INSERT INTO consumption_evaluation (user_id,consumption_id,revision,snapshot_id,state)
     VALUES ($1,$2,1,$3,$4)`,
    [owner.userId, consumptionId, snapshotId, input.state],
  );
  return consumptionId;
}

async function seedEvaluationResult(
  owner: Owner,
  consumptionId: string,
  attentions: AiComponents['schemas']['Attention'][],
): Promise<void> {
  const rows = await pool.query<{ snapshotId: string; profileSnapshotId: string }>(
    `SELECT id AS "snapshotId", profile_snapshot_id AS "profileSnapshotId"
     FROM consumption_snapshot WHERE consumption_id=$1 AND user_id=$2`,
    [consumptionId, owner.userId],
  );
  const snapshot = rows.rows[0];
  if (!snapshot) throw new Error('Missing consumption snapshot for evaluation fixture');
  const jobId = randomUUID();
  const resultId = randomUUID();
  const output = { ...completed, operationId: randomUUID(), attentions };
  await pool.query(
    `INSERT INTO analysis_job
       (id,user_id,operation_id,kind,input_snapshot,target_revision,profile_snapshot_id,consumption_id,status,finished_at)
     VALUES ($1,$2,$3,'consumption_evaluation','{}',1,$4,$5,'completed',now())`,
    [jobId, owner.userId, randomUUID(), snapshot.profileSnapshotId, consumptionId],
  );
  await pool.query(
    `INSERT INTO analysis_result
       (id,user_id,job_id,profile_snapshot_id,catalog_version,rule_version,output)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [resultId, owner.userId, jobId, snapshot.profileSnapshotId, completed.catalogVersion, completed.ruleSetVersion, JSON.stringify(output)],
  );
  await pool.query(
    `UPDATE consumption_evaluation SET job_id=$1,result_id=$2
     WHERE user_id=$3 AND snapshot_id=$4 AND state='completed'`,
    [jobId, resultId, owner.userId, snapshot.snapshotId],
  );
}

function attention(ruleId: string, conditionId = 'fixture-condition'): AiComponents['schemas']['Attention'] {
  const fixtureAttention = (completed.attentions as AiComponents['schemas']['Attention'][])[0]!;
  return { ...fixtureAttention, ruleId, conditionId };
}

describe('dashboard API', () => {
  it('returns null totals and zero coverage for an empty selected local day', async () => {
    const owner = await createOwner();
    const response = await appFor(owner).request('/api/v1/dashboard?date=2026-03-08', {
      headers: { 'x-test-user': owner.userId },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      date: '2026-03-08',
      timezone: 'America/New_York',
      consumptionWindow: { startAt: '2026-03-08T05:00:00.000Z', endAt: '2026-03-09T04:00:00.000Z' },
      attentionWindow: { startDate: '2026-03-02', endDate: '2026-03-08' },
      consumptionCount: 0,
      componentCount: 0,
      recurringAttentions: [],
      latestExaminations: [],
    });
    expect(body.totals.energyKcal).toBeNull();
    expect(body.coverage.energyKcal).toEqual({ knownComponentCount: 0, totalComponentCount: 0 });
  });

  it('includes only active daily snapshots and groups completed attention once per consumption', async () => {
    const owner = await createOwner();
    const first = await seedConsumption(owner, {
      consumedAt: '2026-03-08T05:00:00.000Z',
      state: 'completed',
      attentions: [attention('fixture-rule-001'), attention('fixture-rule-001')],
    });
    const second = await seedConsumption(owner, {
      consumedAt: '2026-03-09T03:59:59.999Z',
      state: 'completed',
      attentions: [attention('fixture-rule-001')],
    });
    await seedConsumption(owner, {
      consumedAt: '2026-03-09T04:00:00.000Z',
      state: 'completed',
      attentions: [attention('fixture-rule-001')],
    });
    await seedConsumption(owner, {
      consumedAt: '2026-03-08T12:00:00.000Z',
      state: 'pending',
      attentions: [attention('pending-rule')],
    });

    const response = await appFor(owner).request('/api/v1/dashboard?date=2026-03-08', {
      headers: { 'x-test-user': owner.userId },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.consumptionCount).toBe(3);
    expect(body.componentCount).toBe(3);
    expect(body.recurringAttentions).toEqual([{
      ruleId: 'fixture-rule-001',
      conditionId: 'fixture-condition',
      count: 2,
      consumptionIds: expect.arrayContaining([first, second]),
    }]);
    await pool.query('UPDATE consumption SET deleted_at=now() WHERE id=$1', [first]);
    const afterDelete = await appFor(owner).request('/api/v1/dashboard?date=2026-03-08', {
      headers: { 'x-test-user': owner.userId },
    });
    expect((await afterDelete.json()).consumptionCount).toBe(2);
  });

  it('includes completed evaluation output linked by the current evaluation result', async () => {
    const owner = await createOwner();
    const first = await seedConsumption(owner, {
      consumedAt: '2026-03-08T06:00:00.000Z',
      state: 'completed',
    });
    const second = await seedConsumption(owner, {
      consumedAt: '2026-03-08T07:00:00.000Z',
      state: 'completed',
    });
    await seedEvaluationResult(owner, first, [attention('evaluated-rule')]);
    await seedEvaluationResult(owner, second, [attention('evaluated-rule')]);

    const response = await appFor(owner).request('/api/v1/dashboard?date=2026-03-08', {
      headers: { 'x-test-user': owner.userId },
    });

    expect(response.status).toBe(200);
    expect((await response.json()).recurringAttentions).toEqual([{
      ruleId: 'evaluated-rule',
      conditionId: 'fixture-condition',
      count: 2,
      consumptionIds: expect.arrayContaining([first, second]),
    }]);
  });

  it('isolates owner data and selects the latest historical examination per series', async () => {
    const owner = await createOwner();
    const other = await createOwner();
    await seedConsumption(owner, { consumedAt: '2026-03-08T12:00:00.000Z', state: 'not_requested' });
    await seedConsumption(other, { consumedAt: '2026-03-08T12:00:00.000Z', state: 'not_requested' });
    const oldPressureId = randomUUID();
    const laterNewYorkClockId = randomUUID();
    const laterLosAngelesClockId = randomUUID();
    const newerLocalDateButEarlierInstantId = randomUUID();
    const latestPressureId = randomUUID();
    const olderTimedGlucoseId = randomUUID();
    const newerDateOnlyGlucoseId = randomUUID();
    const cholesterolId = randomUUID();
    await pool.query(
      `INSERT INTO examination (id,user_id,revision,type,subtype,context,series_key,measured_on,measured_time,timezone,value,systolic,diastolic,unit)
       VALUES
       ($1,$2,1,'pressure',NULL,NULL,'pressure','2026-03-07','23:00','America/New_York',NULL,120,80,'mmHg'),
       ($3,$2,1,'pressure',NULL,NULL,'pressure','2026-03-08','13:00','America/New_York',NULL,118,78,'mmHg'),
       ($4,$2,1,'pressure',NULL,NULL,'pressure','2026-03-08','11:00','America/Los_Angeles',NULL,117,77,'mmHg'),
       ($5,$2,1,'pressure',NULL,NULL,'pressure','2026-03-09','00:30','Asia/Tokyo',NULL,116,76,'mmHg'),
       ($6,$2,1,'pressure',NULL,NULL,'pressure','2026-03-08','23:30','America/Los_Angeles',NULL,115,75,'mmHg'),
       ($7,$2,1,'glucose',NULL,'fasting','["glucose","fasting","mg/dL"]','2026-03-08','12:00','Asia/Jakarta',100,NULL,NULL,'mg/dL'),
       ($8,$2,1,'glucose',NULL,'fasting','["glucose","fasting","mg/dL"]','2026-03-09',NULL,'Asia/Jakarta',105,NULL,NULL,'mg/dL'),
       ($9,$2,1,'cholesterol','total',NULL,'["cholesterol","total","mg/dL"]','2026-03-06',NULL,'America/New_York',200,NULL,NULL,'mg/dL')`,
      [oldPressureId, owner.userId, laterNewYorkClockId, laterLosAngelesClockId, newerLocalDateButEarlierInstantId, latestPressureId, olderTimedGlucoseId, newerDateOnlyGlucoseId, cholesterolId],
    );
    const response = await appFor(owner).request('/api/v1/dashboard?date=2026-03-08', {
      headers: { 'x-test-user': owner.userId },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.consumptionCount).toBe(1);
    expect(body.latestExaminations.map((item: { id: string }) => item.id)).toEqual([
      latestPressureId,
      newerDateOnlyGlucoseId,
      cholesterolId,
    ]);
  });
});
