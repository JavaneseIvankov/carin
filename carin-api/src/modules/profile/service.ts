import { createHash } from 'node:crypto';
import { and, eq, lt, sql } from 'drizzle-orm';
import type { components } from '../../contracts/generated/app-api.js';
import type { Database } from '../../db/client.js';
import { idempotencyRecord } from '../../db/schema/index.js';
import {
  compareAndSwapProfile,
  hasActiveProfileSession,
  insertStoredProfile,
  lockProfileOwner,
  readProfileContext,
  type StoredProfile,
} from './repository.js';
import {
  calculateProfilePersonalization,
  emptyCapabilityProvider,
  validateProfileFields,
  type ProfileCapabilityProvider,
  type ProfileCapabilityManifest,
  type ProfileFields,
} from './validation.js';

export class ProfileAccountNotFoundError extends Error {}
export class ProfileRevisionConflictError extends Error {}
export class ProfileIdempotencyConflictError extends Error {}
export class InactiveProfileSessionError extends Error {}

export type ProfileUpdateInput = {
  userId: string;
  sessionId: string;
  key: string;
  expectedVersion: number;
  fields: ProfileFields;
};

type Profile = components['schemas']['Profile'];

const emptyFields: ProfileFields = {
  heightCm: null,
  weightKg: null,
  sexForReference: null,
  diagnoses: { state: 'not_provided', entries: [] },
  familyHistory: { state: 'not_provided', entries: [] },
  allergies: { state: 'not_provided', entries: [] },
  clinicianNotes: null,
  activity: null,
  smoking: null,
};

function numberFromNumeric(value: string | null): number | null {
  if (value === null) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new RangeError('Stored profile measurement is not a finite number');
  return number;
}

function fieldsFromRow(row: StoredProfile | null): ProfileFields {
  if (!row) return emptyFields;
  return {
    heightCm: numberFromNumeric(row.heightCm),
    weightKg: numberFromNumeric(row.weightKg),
    sexForReference: row.sexForReference as ProfileFields['sexForReference'],
    diagnoses: {
      state: row.diagnosisState as ProfileFields['diagnoses']['state'],
      entries: row.conditions as ProfileFields['diagnoses']['entries'],
    },
    familyHistory: {
      state: row.familyHistoryState as ProfileFields['familyHistory']['state'],
      entries: row.familyHistory as ProfileFields['familyHistory']['entries'],
    },
    allergies: {
      state: row.allergyState as ProfileFields['allergies']['state'],
      entries: row.allergies as ProfileFields['allergies']['entries'],
    },
    clinicianNotes: row.clinicianNotes,
    activity: row.activity as ProfileFields['activity'],
    smoking: row.smoking as ProfileFields['smoking'],
  };
}

async function readManifest(
  provider: ProfileCapabilityProvider = emptyCapabilityProvider,
): Promise<ProfileCapabilityManifest | null> {
  try {
    return await provider.getManifest();
  } catch {
    // Profile reads and saves remain available if optional capability data is not.
    return null;
  }
}

function makeProfile(
  row: StoredProfile | null,
  owner: { birthDate: string; timezone: string },
  manifest: ProfileCapabilityManifest | null,
  now: Date,
): Profile {
  const fields = fieldsFromRow(row);
  return {
    version: row?.version ?? 0,
    updatedAt: row?.updatedAt.toISOString() ?? null,
    fields,
    personalization: calculateProfilePersonalization(fields, {
      birthDate: owner.birthDate,
      timezone: owner.timezone,
      manifest,
      now,
    }),
  };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function profileRequestHash(input: Pick<ProfileUpdateInput, 'expectedVersion' | 'fields'>): string {
  return createHash('sha256')
    .update(canonicalJson({ expectedVersion: input.expectedVersion, fields: input.fields }))
    .digest('hex');
}

async function reserveIdempotency(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  input: ProfileUpdateInput,
  requestHash: string,
) {
  const actionScope = 'profile:update';
  await tx.delete(idempotencyRecord).where(and(
    eq(idempotencyRecord.userId, input.userId),
    eq(idempotencyRecord.sessionId, input.sessionId),
    eq(idempotencyRecord.actionScope, actionScope),
    eq(idempotencyRecord.key, input.key),
    lt(idempotencyRecord.expiresAt, sql`clock_timestamp()`),
  ));
  const [reservation] = await tx
    .insert(idempotencyRecord)
    .values({
      userId: input.userId,
      sessionId: input.sessionId,
      actionScope,
      key: input.key,
      requestHash,
    })
    .onConflictDoNothing()
    .returning({ id: idempotencyRecord.id });
  if (reservation) return { reservationId: reservation.id, replay: null };

  const [prior] = await tx
    .select()
    .from(idempotencyRecord)
    .where(and(
      eq(idempotencyRecord.userId, input.userId),
      eq(idempotencyRecord.sessionId, input.sessionId),
      eq(idempotencyRecord.actionScope, actionScope),
      eq(idempotencyRecord.key, input.key),
    ))
    .for('update');
  if (
    !prior ||
    prior.requestHash !== requestHash ||
    prior.responseStatus !== 200 ||
    !prior.responseBody
  ) {
    throw new ProfileIdempotencyConflictError();
  }
  return { reservationId: null, replay: prior.responseBody as Profile };
}

export async function getProfile(
  db: Database,
  input: {
    userId: string;
    capabilityProvider?: ProfileCapabilityProvider;
    now?: Date;
  },
): Promise<Profile> {
  const context = await readProfileContext(db, input.userId);
  if (!context) throw new ProfileAccountNotFoundError();
  const manifest = await readManifest(input.capabilityProvider);
  return makeProfile(
    context.profile,
    { birthDate: context.birthDate, timezone: context.timezone },
    manifest,
    input.now ?? new Date(),
  );
}

export async function replaceProfile(
  db: Database,
  input: ProfileUpdateInput,
  capabilityProvider?: ProfileCapabilityProvider,
): Promise<Profile> {
  validateProfileFields(input.fields);
  if (!input.sessionId) throw new InactiveProfileSessionError();
  const requestHash = profileRequestHash(input);
  const manifest = await readManifest(capabilityProvider);

  return db.transaction(async (tx) => {
    const owner = await lockProfileOwner(tx, input.userId);
    if (!owner) throw new ProfileAccountNotFoundError();
    if (!(await hasActiveProfileSession(tx, input.userId, input.sessionId)))
      throw new InactiveProfileSessionError();
    if (
      !Number.isSafeInteger(input.expectedVersion) ||
      input.expectedVersion < 0 ||
      input.expectedVersion >= 2_147_483_647
    ) {
      throw new ProfileRevisionConflictError();
    }

    const idempotency = await reserveIdempotency(tx, input, requestHash);
    if (idempotency.replay) return idempotency.replay;

    let profile: StoredProfile | null;
    if (input.expectedVersion === 0) {
      profile = await insertStoredProfile(tx, input.userId, input.fields);
    } else {
      // The predicate is the compare-and-swap guard; the account row lock also
      // serializes an absent profile's first insert with concurrent writers.
      profile = await compareAndSwapProfile(
        tx,
        input.userId,
        input.expectedVersion,
        input.fields,
      );
    }
    if (!profile) throw new ProfileRevisionConflictError();

    const result = makeProfile(profile, owner, manifest, new Date());
    await tx
      .update(idempotencyRecord)
      .set({
        responseStatus: 200,
        responseBody: result,
        resourceId: input.userId,
      })
      .where(eq(idempotencyRecord.id, idempotency.reservationId!));
    return result;
  });
}
