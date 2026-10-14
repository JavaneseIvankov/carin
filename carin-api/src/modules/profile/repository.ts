import { and, eq, gt, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import {
  healthProfile,
  session,
  user,
} from '../../db/schema/index.js';
import type { ProfileFields } from './validation.js';

export type ProfileTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export type ProfileOwner = {
  birthDate: string;
  timezone: string;
};

export type StoredProfile = typeof healthProfile.$inferSelect;

function valuesFromFields(fields: ProfileFields) {
  return {
    heightCm: fields.heightCm === null ? null : String(fields.heightCm),
    weightKg: fields.weightKg === null ? null : String(fields.weightKg),
    sexForReference: fields.sexForReference,
    clinicianNotes: fields.clinicianNotes,
    activity: fields.activity,
    smoking: fields.smoking,
    diagnosisState: fields.diagnoses.state,
    conditions: fields.diagnoses.entries,
    familyHistoryState: fields.familyHistory.state,
    familyHistory: fields.familyHistory.entries,
    allergyState: fields.allergies.state,
    allergies: fields.allergies.entries,
  };
}

export async function readProfileContext(
  db: Database | ProfileTransaction,
  userId: string,
) {
  const [context] = await db
    .select({
      ownerId: user.id,
      birthDate: user.birthDate,
      timezone: user.timezone,
      profile: healthProfile,
    })
    .from(user)
    .leftJoin(healthProfile, eq(healthProfile.userId, user.id))
    .where(eq(user.id, userId));
  return context ?? null;
}

export async function lockProfileOwner(
  tx: ProfileTransaction,
  userId: string,
): Promise<ProfileOwner | null> {
  const [owner] = await tx
    .select({ birthDate: user.birthDate, timezone: user.timezone })
    .from(user)
    .where(eq(user.id, userId))
    .for('update');
  return owner ?? null;
}

export async function hasActiveProfileSession(
  tx: ProfileTransaction,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const [active] = await tx
    .select({ id: session.id })
    .from(session)
    .where(and(
      eq(session.id, sessionId),
      eq(session.userId, userId),
      gt(session.expiresAt, sql`clock_timestamp()`),
    ));
  return Boolean(active);
}

export async function insertStoredProfile(
  tx: ProfileTransaction,
  userId: string,
  fields: ProfileFields,
): Promise<StoredProfile | null> {
  const [profile] = await tx
    .insert(healthProfile)
    .values({
      userId,
      version: 1,
      ...valuesFromFields(fields),
      createdAt: sql`clock_timestamp()`,
      updatedAt: sql`clock_timestamp()`,
    })
    .onConflictDoNothing({ target: healthProfile.userId })
    .returning();
  return profile ?? null;
}

export async function compareAndSwapProfile(
  tx: ProfileTransaction,
  userId: string,
  expectedVersion: number,
  fields: ProfileFields,
): Promise<StoredProfile | null> {
  const [profile] = await tx
    .update(healthProfile)
    .set({
      ...valuesFromFields(fields),
      version: expectedVersion + 1,
      updatedAt: sql`clock_timestamp()`,
    })
    .where(and(
      eq(healthProfile.userId, userId),
      eq(healthProfile.version, expectedVersion),
    ))
    .returning();
  return profile ?? null;
}
