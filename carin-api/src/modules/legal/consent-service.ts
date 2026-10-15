import { createHash } from "node:crypto";
import { and, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import {
  analysisJob,
  consentEvent,
  consumptionEvaluation,
  idempotencyRecord,
  session,
  user,
} from "../../db/schema/index.js";
import { getLegalRegistry } from "./registry.js";

export type ConsentAction = { version: string; granted: boolean };
export type ConsentResult = {
  id: string;
  email: string;
  emailVerified: true;
  name: string;
  birthDate: string;
  timezone: string;
  settingsRevision: number;
  acceptedTermsVersion: string;
  acceptedPrivacyVersion: string;
  aiConsent: {
    version: string | null;
    granted: boolean;
    updatedAt: string | null;
  };
};

export class ConsentVersionConflict extends Error {}
export class IdempotencyConflict extends Error {}

function payloadHash(action: ConsentAction): string {
  return createHash("sha256")
    .update(
      JSON.stringify({ version: action.version, granted: action.granted }),
    )
    .digest("hex");
}

/** Records mandatory signup consent inside the caller's account-creation transaction. */
export async function recordMandatoryConsent(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  userId: string,
  versions: { terms: string; privacy: string },
): Promise<void> {
  const current = getLegalRegistry();
  if (
    versions.terms !== current.terms.version ||
    versions.privacy !== current.privacy.version
  )
    throw new ConsentVersionConflict(
      "Submitted legal version is no longer current",
    );
  const [account] = await tx
    .select({
      acceptedTermsVersion: user.acceptedTermsVersion,
      acceptedPrivacyVersion: user.acceptedPrivacyVersion,
    })
    .from(user)
    .where(eq(user.id, userId))
    .for("update");
  if (
    !account ||
    account.acceptedTermsVersion !== versions.terms ||
    account.acceptedPrivacyVersion !== versions.privacy
  )
    throw new ConsentVersionConflict(
      "Account registration versions do not match current legal documents",
    );
  await tx.insert(consentEvent).values([
    {
      userId,
      kind: "terms",
      version: versions.terms,
      granted: true,
      createdAt: sql`clock_timestamp()`,
    },
    {
      userId,
      kind: "privacy",
      version: versions.privacy,
      granted: true,
      createdAt: sql`clock_timestamp()`,
    },
  ]);
}

/** C16 must call this inside its publication transaction before writing a result. */
export async function lockAndCheckCurrentAiConsent(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  userId: string,
): Promise<boolean> {
  const [account] = await tx
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, userId))
    .for("update");
  if (!account) return false;
  const [latest] = await tx
    .select({ version: consentEvent.version, granted: consentEvent.granted })
    .from(consentEvent)
    .where(
      and(
        eq(consentEvent.userId, userId),
        eq(consentEvent.kind, "ai_processing"),
      ),
    )
    .orderBy(desc(consentEvent.createdAt), desc(consentEvent.id))
    .limit(1);
  return (
    latest?.granted === true &&
    latest.version === getLegalRegistry().aiProcessing.version
  );
}

export async function setAiConsent(
  db: Database,
  input: {
    userId: string;
    sessionId: string;
    key: string;
    action: ConsentAction;
  },
): Promise<ConsentResult> {
  const currentVersion = getLegalRegistry().aiProcessing.version;
  const requestHash = payloadHash(input.action);
  return db.transaction(async (tx) => {
    // Serialize concurrent grants/revocations for this account before reading consent state.
    const [account] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, input.userId))
      .for("update");
    if (!account) throw new Error("Consent account no longer exists");
    const [authSession] = await tx
      .select({ id: session.id })
      .from(session)
      .where(
        and(
          eq(session.id, input.sessionId),
          eq(session.userId, input.userId),
          gt(session.expiresAt, new Date()),
        ),
      );
    if (!authSession) throw new Error("Session is no longer active");

    await tx
      .delete(idempotencyRecord)
      .where(
        and(
          eq(idempotencyRecord.userId, input.userId),
          eq(idempotencyRecord.sessionId, input.sessionId),
          eq(idempotencyRecord.actionScope, "consent:ai-processing"),
          eq(idempotencyRecord.key, input.key),
          lt(idempotencyRecord.expiresAt, sql`now()`),
        ),
      );
    const [reserved] = await tx
      .insert(idempotencyRecord)
      .values({
        userId: input.userId,
        sessionId: input.sessionId,
        actionScope: "consent:ai-processing",
        key: input.key,
        requestHash,
      })
      .onConflictDoNothing()
      .returning({ id: idempotencyRecord.id });
    if (!reserved) {
      const [prior] = await tx
        .select()
        .from(idempotencyRecord)
        .where(
          and(
            eq(idempotencyRecord.userId, input.userId),
            eq(idempotencyRecord.sessionId, input.sessionId),
            eq(idempotencyRecord.actionScope, "consent:ai-processing"),
            eq(idempotencyRecord.key, input.key),
          ),
        )
        .for("update");
      if (!prior || prior.requestHash !== requestHash)
        throw new IdempotencyConflict();
      if (prior.responseStatus !== 200 || !prior.responseBody)
        throw new IdempotencyConflict();
      return prior.responseBody as ConsentResult;
    }

    if (input.action.version !== currentVersion)
      throw new ConsentVersionConflict();
    await tx.insert(consentEvent).values({
      userId: input.userId,
      kind: "ai_processing",
      version: currentVersion,
      granted: input.action.granted,
      createdAt: sql`clock_timestamp()`,
    });

    if (!input.action.granted) {
      const cancelled = await tx
        .update(analysisJob)
        .set({
          status: "cancelled",
          leaseToken: null,
          leaseExpiresAt: null,
          finishedAt: sql`clock_timestamp()`,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(analysisJob.userId, input.userId),
            inArray(analysisJob.status, ["queued", "processing"]),
          ),
        )
        .returning({ id: analysisJob.id });
      if (cancelled.length) {
        await tx
          .update(consumptionEvaluation)
          .set({
            state: "not_requested",
            limitations: sql`${consumptionEvaluation.limitations} || '["ai_consent_withdrawn"]'::jsonb`,
            updatedAt: sql`now()`,
          })
          .where(
            and(
              eq(consumptionEvaluation.userId, input.userId),
              eq(consumptionEvaluation.state, "pending"),
              inArray(
                consumptionEvaluation.jobId,
                cancelled.map(({ id }) => id),
              ),
            ),
          );
      }
    }

    const [accountRecord] = await tx
      .select()
      .from(user)
      .where(eq(user.id, input.userId));
    const [latest] = await tx
      .select()
      .from(consentEvent)
      .where(
        and(
          eq(consentEvent.userId, input.userId),
          eq(consentEvent.kind, "ai_processing"),
        ),
      )
      .orderBy(desc(consentEvent.createdAt), desc(consentEvent.id))
      .limit(1);
    const result: ConsentResult = {
      id: accountRecord.id,
      email: accountRecord.email,
      emailVerified: true,
      name: accountRecord.name,
      birthDate: accountRecord.birthDate,
      timezone: accountRecord.timezone,
      settingsRevision: accountRecord.settingsRevision,
      acceptedTermsVersion: accountRecord.acceptedTermsVersion,
      acceptedPrivacyVersion: accountRecord.acceptedPrivacyVersion,
      aiConsent: {
        version: latest?.version ?? null,
        granted: latest?.granted ?? false,
        updatedAt: latest?.createdAt.toISOString() ?? null,
      },
    };
    await tx
      .update(idempotencyRecord)
      .set({
        responseStatus: 200,
        responseBody: result,
        resourceId: input.userId,
      })
      .where(eq(idempotencyRecord.id, reserved.id));
    return result;
  });
}
