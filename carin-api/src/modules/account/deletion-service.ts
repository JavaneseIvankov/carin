import { and, eq, inArray, or, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import {
  account,
  analysisJob,
  consentEvent,
  consumption,
  deletionTask,
  emailTask,
  photo,
  scan,
  session,
  user,
  verification,
} from '../../db/schema/index.js';

export class AccountDeletionSessionError extends Error {}
export class AccountDeletionDataError extends Error {}

const PHOTO_KEY = /^photos\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parsePhotoKeys(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((key) => typeof key === 'string' && PHOTO_KEY.test(key))) {
    throw new AccountDeletionDataError('Account cleanup contains an invalid object key');
  }
  return value as string[];
}

async function databaseNow(tx: Parameters<Parameters<Database['transaction']>[0]>[0]): Promise<Date> {
  const result = await tx.execute(sql`SELECT clock_timestamp() AS now`);
  const value = (result.rows[0] as { now?: Date | string } | undefined)?.now;
  const now = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
  if (!now || !Number.isFinite(now.getTime())) throw new Error('Database clock unavailable');
  return now;
}

/** Makes access unavailable and records all private objects for restart-safe purge. */
export async function acceptAccountDeletion(
  db: Database,
  input: { userId: string; sessionId: string; idempotencyKey: string; requestHash: string },
): Promise<{ status: 'deletion_pending'; acceptedAt: string; accessRevoked: true }> {
  return db.transaction(async (tx) => {
    const now = await databaseNow(tx);
    const [accountRow] = await tx.select({
      id: user.id,
      email: user.email,
      deletionStatus: user.deletionStatus,
    }).from(user).where(eq(user.id, input.userId)).for('update');
    if (!accountRow || accountRow.deletionStatus !== 'active') throw new AccountDeletionSessionError();

    const [activeSession] = await tx.select({ id: session.id }).from(session).where(and(
      eq(session.id, input.sessionId), eq(session.userId, input.userId), sql`${session.expiresAt} > ${now}`,
    )).for('update');
    if (!activeSession) throw new AccountDeletionSessionError();

    const photos = await tx.select({ objectKey: photo.objectKey }).from(photo)
      .where(eq(photo.userId, input.userId)).for('update');
    const oldPhotoTasks = await tx.select({ id: deletionTask.id, objectKeys: deletionTask.objectKeys })
      .from(deletionTask).where(and(
        eq(deletionTask.userId, input.userId), eq(deletionTask.kind, 'photo'),
      )).for('update');
    const keys = new Set<string>(photos.map((row) => row.objectKey));
    for (const task of oldPhotoTasks) for (const key of parsePhotoKeys(task.objectKeys)) keys.add(key);
    for (const key of keys) if (!PHOTO_KEY.test(key)) throw new AccountDeletionDataError('Account has an invalid photo object key');

    await tx.update(scan).set({
      generation: sql`${scan.generation} + 1`,
      lifecycle: 'deleting',
      deletedAt: now,
      updatedAt: now,
    }).where(eq(scan.userId, input.userId));
    await tx.update(consumption).set({ generation: sql`${consumption.generation} + 1`, updatedAt: now })
      .where(eq(consumption.userId, input.userId));
    await tx.update(analysisJob).set({
      status: 'cancelled',
      leaseToken: null,
      leaseExpiresAt: null,
      finishedAt: now,
      updatedAt: now,
    }).where(and(
      eq(analysisJob.userId, input.userId), inArray(analysisJob.status, ['queued', 'processing']),
    ));
    await tx.update(photo).set({ lifecycle: 'deleting', deletedAt: now })
      .where(eq(photo.userId, input.userId));

    await tx.insert(deletionTask).values({
      userId: input.userId,
      kind: 'account',
      objectKeys: [...keys],
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      status: 'queued',
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
    });
    await tx.delete(deletionTask).where(and(
      eq(deletionTask.userId, input.userId), eq(deletionTask.kind, 'photo'),
    ));
    await tx.delete(emailTask).where(eq(emailTask.userId, input.userId));
    await tx.delete(account).where(eq(account.userId, input.userId));
    await tx.delete(verification).where(or(
      eq(verification.identifier, accountRow.email),
      eq(verification.value, input.userId),
    ));
    await tx.delete(consentEvent).where(eq(consentEvent.userId, input.userId));
    await tx.delete(session).where(eq(session.userId, input.userId));

    await tx.update(user).set({
      deletionStatus: 'deleting',
      name: 'Deleted account',
      email: `${input.userId}@deleted.invalid`,
      emailVerified: false,
      image: null,
      birthDate: '1900-01-01',
      acceptedTermsVersion: 'deleted',
      acceptedPrivacyVersion: 'deleted',
      acceptedAt: now,
      timezone: 'Asia/Jakarta',
      settingsRevision: sql`${user.settingsRevision} + 1`,
      updatedAt: now,
    }).where(eq(user.id, input.userId));

    return { status: 'deletion_pending', acceptedAt: now.toISOString(), accessRevoked: true };
  });
}
