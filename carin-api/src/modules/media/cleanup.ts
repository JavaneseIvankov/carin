import { randomUUID } from 'node:crypto';
import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { deletionTask, photo, user } from '../../db/schema/index.js';
import type { MediaObjectStore } from './storage.js';

export const ORPHAN_PHOTO_RETENTION_MS = 60 * 60 * 1000;
const PHOTO_KEY_PATTERN = /^photos\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLEANUP_LEASE_MS = 60 * 1000;
const MAX_RETRY_DELAY_MS = 60 * 60 * 1000;

type CleanupTask = {
  id: string;
  userId: string;
  objectKeys: unknown;
  attempts: number;
  leaseToken: string;
};

export type PhotoCleanupResult = {
  scheduled: number;
  removed: number;
  failed: number;
};

function parsePhotoKeys(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('Invalid photo cleanup task');
  if (!value.every((item) => typeof item === 'string' && PHOTO_KEY_PATTERN.test(item)))
    throw new Error('Invalid photo cleanup task');
  return [...new Set(value as string[])];
}

export function photoCleanupRetryAt(now: Date, attempt: number): Date {
  if (!Number.isSafeInteger(attempt) || attempt < 1)
    throw new Error('Cleanup attempt must be a positive integer');
  const delay = Math.min(30_000 * (2 ** (attempt - 1)), MAX_RETRY_DELAY_MS);
  return new Date(now.getTime() + delay);
}

async function scheduleExpiredPhotos(db: Database, now: Date, batchSize: number): Promise<number> {
  const cutoff = new Date(now.getTime() - ORPHAN_PHOTO_RETENTION_MS);
  return db.transaction(async (tx) => {
    const expired = await tx
      .select({ id: photo.id, userId: photo.userId, objectKey: photo.objectKey })
      .from(photo)
      .innerJoin(user, eq(photo.userId, user.id))
      .where(and(
        eq(photo.lifecycle, 'uploaded'),
        eq(user.deletionStatus, 'active'),
        lte(photo.createdAt, cutoff),
      ))
      .orderBy(asc(photo.createdAt), asc(photo.id))
      .limit(batchSize)
      .for('update', { of: photo, skipLocked: true });
    let scheduled = 0;
    for (const row of expired) {
      const [transitioned] = await tx
        .update(photo)
        .set({ lifecycle: 'deleting', deletedAt: now })
        .where(and(eq(photo.id, row.id), eq(photo.lifecycle, 'uploaded')))
        .returning({ id: photo.id });
      if (!transitioned) continue;
      await tx.insert(deletionTask).values({
        userId: row.userId,
        kind: 'photo',
        objectKeys: [row.objectKey],
        status: 'queued',
        attempts: 0,
        nextAttemptAt: now,
        createdAt: now,
      });
      scheduled++;
    }
    return scheduled;
  });
}

async function claimPhotoTasks(db: Database, now: Date, batchSize: number): Promise<CleanupTask[]> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select({
        id: deletionTask.id,
        userId: deletionTask.userId,
        objectKeys: deletionTask.objectKeys,
        attempts: deletionTask.attempts,
      })
      .from(deletionTask)
      .where(and(
        eq(deletionTask.kind, 'photo'),
        or(
          and(inArray(deletionTask.status, ['queued', 'failed']), lte(deletionTask.nextAttemptAt, now)),
          and(
            eq(deletionTask.status, 'processing'),
            isNotNull(deletionTask.leaseExpiresAt),
            lte(deletionTask.leaseExpiresAt, now),
          ),
        ),
      ))
      .orderBy(asc(deletionTask.nextAttemptAt), asc(deletionTask.createdAt))
      .limit(batchSize)
      .for('update', { skipLocked: true });
    const tasks: CleanupTask[] = [];
    for (const task of due) {
      const leaseToken = randomUUID();
      const [claimed] = await tx
        .update(deletionTask)
        .set({
          status: 'processing',
          attempts: sql`${deletionTask.attempts} + 1`,
          leaseToken,
          leaseExpiresAt: new Date(now.getTime() + CLEANUP_LEASE_MS),
        })
        .where(eq(deletionTask.id, task.id))
        .returning({ attempts: deletionTask.attempts });
      if (!claimed) continue;
      tasks.push({ ...task, attempts: claimed.attempts, leaseToken });
    }
    return tasks;
  });
}

async function completePhotoTask(
  db: Database,
  task: CleanupTask,
  keys: string[],
  now: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: deletionTask.id })
      .from(deletionTask)
      .where(and(
        eq(deletionTask.id, task.id),
        eq(deletionTask.status, 'processing'),
        eq(deletionTask.leaseToken, task.leaseToken),
      ))
      .for('update');
    if (!current) return;
    for (const key of keys) {
      await tx
        .update(photo)
        .set({ lifecycle: 'deleted', deletedAt: now })
        .where(and(
          eq(photo.userId, task.userId),
          eq(photo.objectKey, key),
          eq(photo.lifecycle, 'deleting'),
        ));
    }
    await tx.delete(deletionTask).where(and(
      eq(deletionTask.id, task.id),
      eq(deletionTask.leaseToken, task.leaseToken),
    ));
  });
}

async function persistPhotoRetry(
  db: Database,
  task: CleanupTask,
  now: Date,
): Promise<void> {
  await db
    .update(deletionTask)
    .set({
      status: 'failed',
      nextAttemptAt: photoCleanupRetryAt(now, task.attempts),
      leaseToken: null,
      leaseExpiresAt: null,
    })
    .where(and(
      eq(deletionTask.id, task.id),
      eq(deletionTask.status, 'processing'),
      eq(deletionTask.leaseToken, task.leaseToken),
    ));
}

/** Schedules expired uploads and processes durable photo cleanup rows for C29's worker loop. */
export async function runPhotoCleanupBatch(
  db: Database,
  store: Pick<MediaObjectStore, 'removeObject'>,
  options: { now?: Date; batchSize?: number } = {},
): Promise<PhotoCleanupResult> {
  const now = options.now ?? new Date();
  const batchSize = options.batchSize ?? 100;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000)
    throw new Error('Photo cleanup batch size must be from 1 to 1000');
  const scheduled = await scheduleExpiredPhotos(db, now, batchSize);
  const tasks = await claimPhotoTasks(db, now, batchSize);
  let removed = 0;
  let failed = 0;
  for (const task of tasks) {
    try {
      const keys = parsePhotoKeys(task.objectKeys);
      for (const key of keys) await store.removeObject(key);
      await completePhotoTask(db, task, keys, now);
      removed++;
    } catch {
      await persistPhotoRetry(db, task, now);
      failed++;
    }
  }
  return { scheduled, removed, failed };
}
