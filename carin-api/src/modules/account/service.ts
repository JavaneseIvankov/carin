import { createHash } from 'node:crypto';
import { and, desc, eq, gt, lt, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { consentEvent, idempotencyRecord, session, user } from '../../db/schema/index.js';

export class AccountNotFoundError extends Error {}
export class AccountRevisionConflict extends Error {}
export class AccountIdempotencyConflict extends Error {}
export class InvalidTimezoneError extends Error {}
export class InactiveAccountSessionError extends Error {}

type MeUpdate = {
  userId: string;
  sessionId: string;
  key: string;
  expectedRevision: number;
  timezone: string;
};

function isIanaTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function updateHash(input: Pick<MeUpdate, 'expectedRevision' | 'timezone'>): string {
  return createHash('sha256')
    .update(JSON.stringify({ expectedRevision: input.expectedRevision, timezone: input.timezone }))
    .digest('hex');
}

export async function getMe(db: Database, userId: string) {
  const [account] = await db
    .select({
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      name: user.name,
      birthDate: user.birthDate,
      timezone: user.timezone,
      settingsRevision: user.settingsRevision,
      acceptedTermsVersion: user.acceptedTermsVersion,
      acceptedPrivacyVersion: user.acceptedPrivacyVersion,
    })
    .from(user)
    .where(eq(user.id, userId));
  if (!account) throw new AccountNotFoundError();

  const [latestAiConsent] = await db
    .select({
      version: consentEvent.version,
      granted: consentEvent.granted,
      updatedAt: consentEvent.createdAt,
    })
    .from(consentEvent)
    .where(
      and(
        eq(consentEvent.userId, userId),
        eq(consentEvent.kind, 'ai_processing'),
      ),
    )
    .orderBy(desc(consentEvent.createdAt), desc(consentEvent.id))
    .limit(1);

  return {
    ...account,
    emailVerified: true as const,
    aiConsent: {
      version: latestAiConsent?.version ?? null,
      granted: latestAiConsent?.granted ?? false,
      updatedAt: latestAiConsent?.updatedAt?.toISOString() ?? null,
    },
  };
}

export async function updateMe(db: Database, input: MeUpdate) {
  if (!isIanaTimezone(input.timezone)) throw new InvalidTimezoneError();
  if (!input.sessionId) throw new InactiveAccountSessionError();

  return db.transaction(async (tx) => {
    const [account] = await tx
      .select({
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        name: user.name,
        birthDate: user.birthDate,
        timezone: user.timezone,
        settingsRevision: user.settingsRevision,
        acceptedTermsVersion: user.acceptedTermsVersion,
        acceptedPrivacyVersion: user.acceptedPrivacyVersion,
      })
      .from(user)
      .where(eq(user.id, input.userId))
      .for('update');
    if (!account) throw new AccountNotFoundError();

    const [activeSession] = await tx
      .select({ id: session.id })
      .from(session)
      .where(and(
        eq(session.id, input.sessionId),
        eq(session.userId, input.userId),
        gt(session.expiresAt, new Date()),
      ));
    if (!activeSession) throw new InactiveAccountSessionError();

    await tx.delete(idempotencyRecord).where(and(
      eq(idempotencyRecord.userId, input.userId),
      eq(idempotencyRecord.sessionId, input.sessionId),
      eq(idempotencyRecord.actionScope, 'account:update-me'),
      eq(idempotencyRecord.key, input.key),
      lt(idempotencyRecord.expiresAt, sql`now()`),
    ));
    const [reservation] = await tx
      .insert(idempotencyRecord)
      .values({
        userId: input.userId,
        sessionId: input.sessionId,
        actionScope: 'account:update-me',
        key: input.key,
        requestHash: updateHash(input),
      })
      .onConflictDoNothing()
      .returning({ id: idempotencyRecord.id });
    if (!reservation) {
      const [prior] = await tx
        .select()
        .from(idempotencyRecord)
        .where(and(
          eq(idempotencyRecord.userId, input.userId),
          eq(idempotencyRecord.sessionId, input.sessionId),
          eq(idempotencyRecord.actionScope, 'account:update-me'),
          eq(idempotencyRecord.key, input.key),
        ))
        .for('update');
      if (!prior || prior.requestHash !== updateHash(input) || prior.responseStatus !== 200 || !prior.responseBody)
        throw new AccountIdempotencyConflict();
      return prior.responseBody;
    }

    if (account.settingsRevision !== input.expectedRevision)
      throw new AccountRevisionConflict();

    let updatedAccount = account;
    if (account.timezone !== input.timezone) {
      const [updated] = await tx
        .update(user)
        .set({
          timezone: input.timezone,
          settingsRevision: account.settingsRevision + 1,
          updatedAt: sql`clock_timestamp()`,
        })
        .where(and(eq(user.id, input.userId), eq(user.settingsRevision, input.expectedRevision)))
        .returning({
          id: user.id,
          email: user.email,
          emailVerified: user.emailVerified,
          name: user.name,
          birthDate: user.birthDate,
          timezone: user.timezone,
          settingsRevision: user.settingsRevision,
          acceptedTermsVersion: user.acceptedTermsVersion,
          acceptedPrivacyVersion: user.acceptedPrivacyVersion,
        });
      if (!updated) throw new AccountRevisionConflict();
      updatedAccount = updated;
    }

    const [latestAiConsent] = await tx
      .select({ version: consentEvent.version, granted: consentEvent.granted, updatedAt: consentEvent.createdAt })
      .from(consentEvent)
      .where(and(eq(consentEvent.userId, input.userId), eq(consentEvent.kind, 'ai_processing')))
      .orderBy(desc(consentEvent.createdAt), desc(consentEvent.id))
      .limit(1);
    const result = {
      ...updatedAccount,
      emailVerified: true as const,
      aiConsent: {
        version: latestAiConsent?.version ?? null,
        granted: latestAiConsent?.granted ?? false,
        updatedAt: latestAiConsent?.updatedAt?.toISOString() ?? null,
      },
    };
    await tx
      .update(idempotencyRecord)
      .set({ responseStatus: 200, responseBody: result, resourceId: input.userId })
      .where(eq(idempotencyRecord.id, reservation.id));
    return result;
  });
}
