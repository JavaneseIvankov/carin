import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { demoSeedResource } from '../db/schema/demo-seed.js';

export type SeedResource = {
  seedKey: string;
  resourceKind: string;
  payloadHash: string;
};

export type SeedReservation = {
  state: 'pending' | 'complete';
  resourceId: string | null;
};

export class SeedPayloadConflictError extends Error {
  constructor() { super('DEMO_SEED_PAYLOAD_CHANGED'); }
}

export class SeedResourceNotFoundError extends Error {
  constructor() { super('DEMO_SEED_RESOURCE_NOT_FOUND'); }
}

export async function reserveSeedResource(
  db: Database,
  userId: string,
  resource: SeedResource,
  options: { allowPayloadUpdate?: boolean } = {},
): Promise<SeedReservation> {
  await db.insert(demoSeedResource).values({ userId, ...resource, state: 'pending' }).onConflictDoNothing();
  const [current] = await db.select().from(demoSeedResource).where(and(
    eq(demoSeedResource.userId, userId),
    eq(demoSeedResource.seedKey, resource.seedKey),
  )).limit(1);
  if (!current) throw new SeedResourceNotFoundError();
  if (current.resourceKind !== resource.resourceKind) throw new SeedPayloadConflictError();
  if (current.payloadHash !== resource.payloadHash) {
    if (!options.allowPayloadUpdate) throw new SeedPayloadConflictError();
    const [updated] = await db.update(demoSeedResource).set({
      payloadHash: resource.payloadHash,
      resourceId: null,
      state: 'pending',
      updatedAt: new Date(),
    }).where(and(
      eq(demoSeedResource.userId, userId),
      eq(demoSeedResource.seedKey, resource.seedKey),
    )).returning();
    if (!updated) throw new SeedResourceNotFoundError();
    return { state: 'pending', resourceId: null };
  }
  return { state: current.state as SeedReservation['state'], resourceId: current.resourceId };
}

export async function saveSeedResourceId(
  db: Database,
  userId: string,
  seedKey: string,
  resourceId: string,
): Promise<void> {
  const rows = await db.update(demoSeedResource).set({ resourceId, updatedAt: new Date() }).where(and(
    eq(demoSeedResource.userId, userId),
    eq(demoSeedResource.seedKey, seedKey),
    eq(demoSeedResource.state, 'pending'),
  )).returning({ id: demoSeedResource.id });
  if (!rows.length) throw new SeedResourceNotFoundError();
}

export async function completeSeedResource(
  db: Database,
  userId: string,
  seedKey: string,
  resourceId: string | null,
): Promise<void> {
  const rows = await db.update(demoSeedResource).set({
    resourceId,
    state: 'complete',
    updatedAt: new Date(),
  }).where(and(
    eq(demoSeedResource.userId, userId),
    eq(demoSeedResource.seedKey, seedKey),
  )).returning({ id: demoSeedResource.id });
  if (!rows.length) throw new SeedResourceNotFoundError();
}

export async function getOrCreateSeedAnchor(
  db: Database,
  userId: string,
  today: string,
): Promise<string> {
  const key = 'dataset-anchor:v1';
  const payloadHash = 'initial-demo-seed-date:v1';
  await db.insert(demoSeedResource).values({
    userId,
    seedKey: key,
    resourceKind: 'anchor',
    payloadHash,
    resourceId: today,
    state: 'complete',
  }).onConflictDoNothing();
  const [row] = await db.select().from(demoSeedResource).where(and(
    eq(demoSeedResource.userId, userId),
    eq(demoSeedResource.seedKey, key),
  )).limit(1);
  if (!row || row.resourceKind !== 'anchor' || row.payloadHash !== payloadHash || !row.resourceId) {
    throw new SeedPayloadConflictError();
  }
  return row.resourceId;
}
