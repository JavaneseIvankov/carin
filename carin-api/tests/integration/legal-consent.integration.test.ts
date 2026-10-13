import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { createDatabase } from "../../src/db/client.js";
import { applyMigrations } from "../../src/db/migrations.js";
import {
  ConsentVersionConflict,
  lockAndCheckCurrentAiConsent,
  recordMandatoryConsent,
} from "../../src/modules/legal/consent-service.js";
import { getLegalRegistry } from "../../src/modules/legal/registry.js";

const containerName = `carin-t7-test-${randomUUID()}`;
const userId = randomUUID();
const sessionId = randomUUID();
const profileSnapshotId = randomUUID();
const photoId = randomUUID();
const scanId = randomUUID();
const jobId = randomUUID();
const evaluationJobId = randomUUID();
const consumptionId = randomUUID();
const consumptionSnapshotId = randomUUID();
let pool: Pool;
let app: ReturnType<typeof createApp>;
let containerStarted = false;

beforeAll(async () => {
  execFileSync(
    "docker",
    [
      "run",
      "-d",
      "--rm",
      "--name",
      containerName,
      "-e",
      `POSTGRES_PASSWORD=${randomUUID()}`,
      "-e",
      "POSTGRES_HOST_AUTH_METHOD=trust",
      "-p",
      "127.0.0.1::5432",
      "postgres:18.3-alpine@sha256:54451ecb8ab38c24c3ec123f2fd501303a3a1856a5c66e98cecf2460d5e1e9d7",
    ],
    { stdio: "pipe" },
  );
  containerStarted = true;
  const port = execFileSync("docker", ["port", containerName, "5432/tcp"], {
    encoding: "utf8",
  })
    .trim()
    .split(":")
    .at(-1);
  pool = new Pool({
    connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres`,
    connectionTimeoutMillis: 1000,
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await pool.query("SELECT 1");
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  await applyMigrations(pool);
  await pool.query(
    `INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at,birth_date,accepted_terms_version,accepted_privacy_version,accepted_at)
     VALUES ($1,'Test account',$2,true,now(),now(),'1995-01-01',$3,$4,now())`,
    [
      userId,
      `${userId}@example.invalid`,
      getLegalRegistry().terms.version,
      getLegalRegistry().privacy.version,
    ],
  );
  await pool.query(
    `INSERT INTO session (id,expires_at,token,created_at,updated_at,user_id) VALUES ($1,now()+interval '1 day',$2,now(),now(),$3)`,
    [sessionId, randomUUID(), userId],
  );
  await pool.query(
    `INSERT INTO profile_snapshot (id,user_id,profile_version,context) VALUES ($1,$2,0,'{}')`,
    [profileSnapshotId, userId],
  );
  await pool.query(
    `INSERT INTO photo (id,user_id,object_key,checksum,mime_type,size_bytes) VALUES ($1,$2,$3,'test','image/jpeg',100)`,
    [photoId, userId, randomUUID()],
  );
  await pool.query(
    `INSERT INTO scan (id,user_id,photo_id,profile_snapshot_id) VALUES ($1,$2,$3,$4)`,
    [scanId, userId, photoId, profileSnapshotId],
  );
  await pool.query(
    `INSERT INTO analysis_job (id,user_id,operation_id,kind,input_snapshot,profile_snapshot_id,scan_id,target_revision)
     VALUES ($1,$2,$3,'photo_analysis','{}',$4,$5,1)`,
    [jobId, userId, randomUUID(), profileSnapshotId, scanId],
  );
  await pool.query(
    `INSERT INTO consumption (id,user_id,source,consumed_at) VALUES ($1,$2,'manual',now())`,
    [consumptionId, userId],
  );
  await pool.query(
    `INSERT INTO consumption_snapshot (id,user_id,consumption_id,revision,profile_snapshot_id,snapshot)
     VALUES ($1,$2,$3,1,$4,'{}')`,
    [consumptionSnapshotId, userId, consumptionId, profileSnapshotId],
  );
  await pool.query(
    "UPDATE consumption SET current_snapshot_id=$1 WHERE id=$2",
    [consumptionSnapshotId, consumptionId],
  );
  await pool.query(
    `INSERT INTO analysis_job (id,user_id,operation_id,kind,input_snapshot,profile_snapshot_id,consumption_id,target_revision)
     VALUES ($1,$2,$3,'consumption_evaluation','{}',$4,$5,1)`,
    [evaluationJobId, userId, randomUUID(), profileSnapshotId, consumptionId],
  );
  await pool.query(
    `INSERT INTO consumption_evaluation (user_id,consumption_id,revision,snapshot_id,state,job_id)
     VALUES ($1,$2,1,$3,'pending',$4)`,
    [userId, consumptionId, consumptionSnapshotId, evaluationJobId],
  );
  const db = createDatabase(pool);
  app = createApp({
    readiness: async () => true,
    legalConsent: {
      db,
      resolveSession: async () => ({ userId, sessionId, emailVerified: true }),
    },
  });
}, 120_000);

afterAll(async () => {
  await pool?.end();
  if (containerStarted)
    execFileSync("docker", ["rm", "-f", containerName], { stdio: "pipe" });
});

describe("legal registry and consent API", () => {
  it("serves the current draft document registry from the public contract", async () => {
    const response = await app.request("/api/v1/legal");
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual(getLegalRegistry());
    expect(body.terms.contentMarkdown).toContain("DRAF");
    expect(body.privacy.contentMarkdown).toContain("DRAF");
    expect(body.aiProcessing.contentMarkdown).toContain("DRAF");
  });

  it("records mandatory terms and privacy versions during signup and rejects stale versions", async () => {
    const signupUserId = randomUUID();
    const current = getLegalRegistry();
    await pool.query(
      `INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at,birth_date,accepted_terms_version,accepted_privacy_version,accepted_at)
       VALUES ($1,'Signup account',$2,false,now(),now(),'1994-04-01',$3,$4,now())`,
      [
        signupUserId,
        `${signupUserId}@example.invalid`,
        current.terms.version,
        current.privacy.version,
      ],
    );
    const db = createDatabase(pool);
    await db.transaction((tx) =>
      recordMandatoryConsent(tx, signupUserId, {
        terms: current.terms.version,
        privacy: current.privacy.version,
      }),
    );
    const recorded = await pool.query(
      "SELECT kind,version,granted,created_at FROM consent_event WHERE user_id=$1 ORDER BY kind",
      [signupUserId],
    );
    expect(recorded.rows).toHaveLength(2);
    expect(
      recorded.rows.map((row) => [row.kind, row.version, row.granted]),
    ).toEqual([
      ["privacy", current.privacy.version, true],
      ["terms", current.terms.version, true],
    ]);
    await expect(
      db.transaction((tx) =>
        recordMandatoryConsent(tx, signupUserId, {
          terms: "stale",
          privacy: current.privacy.version,
        }),
      ),
    ).rejects.toBeInstanceOf(ConsentVersionConflict);
    expect(
      (
        await pool.query("SELECT id FROM consent_event WHERE user_id=$1", [
          signupUserId,
        ])
      ).rowCount,
    ).toBe(2);
  });

  it("rejects stale AI consent versions without recording an event", async () => {
    const response = await app.request("/api/v1/consents/ai-processing", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "idempotency-key": randomUUID(),
      },
      body: JSON.stringify({ version: "stale-version", granted: true }),
    });
    expect(response.status).toBe(409);
    expect(
      (
        await pool.query("SELECT id FROM consent_event WHERE user_id=$1", [
          userId,
        ])
      ).rowCount,
    ).toBe(0);
  });

  it("treats AI consent as absent until the user explicitly grants it", async () => {
    await pool.query("INSERT INTO health_profile (user_id) VALUES ($1)", [
      userId,
    ]);
    await pool.query(
      `INSERT INTO examination (user_id,type,context,series_key,measured_on,timezone,value,unit)
       VALUES ($1,'glucose','unknown','glucose:unknown','2026-10-14','Asia/Jakarta',95,'mg/dL')`,
      [userId],
    );
    expect(
      (
        await pool.query("SELECT id FROM consumption WHERE user_id=$1", [
          userId,
        ])
      ).rowCount,
    ).toBe(1);
    expect(
      (
        await pool.query(
          "SELECT user_id FROM health_profile WHERE user_id=$1",
          [userId],
        )
      ).rowCount,
    ).toBe(1);
    expect(
      (
        await pool.query("SELECT id FROM examination WHERE user_id=$1", [
          userId,
        ])
      ).rowCount,
    ).toBe(1);
    const active = await createDatabase(pool).transaction((tx) =>
      lockAndCheckCurrentAiConsent(tx, userId),
    );
    expect(active).toBe(false);
    expect(
      (
        await pool.query(
          "SELECT id FROM consent_event WHERE user_id=$1 AND kind='ai_processing'",
          [userId],
        )
      ).rowCount,
    ).toBe(0);
  });

  it("keeps AI consent optional and records a current grant with database time", async () => {
    const before = Date.now();
    const version = getLegalRegistry().aiProcessing.version;
    const response = await app.request("/api/v1/consents/ai-processing", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "idempotency-key": randomUUID(),
      },
      body: JSON.stringify({ version, granted: true }),
    });
    const rows = await pool.query(
      "SELECT kind,version,granted,created_at FROM consent_event WHERE user_id=$1",
      [userId],
    );
    expect(response.status).toBe(200);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({
      kind: "ai_processing",
      version,
      granted: true,
    });
    expect(new Date(rows.rows[0].created_at).getTime()).toBeGreaterThanOrEqual(
      before - 1000,
    );
  });

  it("replays an idempotent consent grant and rejects key reuse with a different payload", async () => {
    const key = randomUUID();
    const version = getLegalRegistry().aiProcessing.version;
    const send = (granted: boolean, reverseFields = false) =>
      app.request("/api/v1/consents/ai-processing", {
        method: "PUT",
        headers: { "content-type": "application/json", "idempotency-key": key },
        body: reverseFields
          ? JSON.stringify({ granted, version })
          : JSON.stringify({ version, granted }),
      });
    expect((await send(true)).status).toBe(200);
    expect((await send(true, true)).status).toBe(200);
    expect((await send(false)).status).toBe(409);
    expect(
      (
        await pool.query("SELECT id FROM consent_event WHERE user_id=$1", [
          userId,
        ])
      ).rowCount,
    ).toBe(2);
  });

  it("records revocation and cancels queued AI work in the same transaction", async () => {
    const version = getLegalRegistry().aiProcessing.version;
    const response = await app.request("/api/v1/consents/ai-processing", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "idempotency-key": randomUUID(),
      },
      body: JSON.stringify({ version, granted: false }),
    });
    const event = await pool.query(
      "SELECT granted,created_at FROM consent_event WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1",
      [userId],
    );
    const job = await pool.query(
      "SELECT status FROM analysis_job WHERE id=$1",
      [jobId],
    );
    const evaluation = await pool.query(
      "SELECT state,limitations FROM consumption_evaluation WHERE job_id=$1",
      [evaluationJobId],
    );
    expect(response.status).toBe(200);
    expect(event.rows[0].granted).toBe(false);
    expect(event.rows[0].created_at).toBeInstanceOf(Date);
    expect(job.rows[0].status).toBe("cancelled");
    expect(evaluation.rows[0].state).toBe("not_requested");
    expect(evaluation.rows[0].limitations).toContain("ai_consent_withdrawn");
  });
});
