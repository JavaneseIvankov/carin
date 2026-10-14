import { randomUUID } from 'node:crypto';
import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  lte,
  gt,
  notExists,
  or,
  sql,
} from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { deletionTask, photo, photoUploadOperation, user } from '../../db/schema/index.js';
import type { MediaObjectStore } from './storage.js';
import { logEvent } from '../../logging.js';

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
  accountsPurged: number;
  deferred: number;
};

function parsePhotoKeys(value: unknown, allowEmpty = false): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) throw new Error('Invalid photo cleanup task');
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
        notExists(db.select({ id: photoUploadOperation.photoId }).from(photoUploadOperation).where(and(
          eq(photoUploadOperation.photoId, photo.id),
          eq(photoUploadOperation.state, 'in_flight'),
          gt(photoUploadOperation.fenceUntil, now),
        ))),
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
      .innerJoin(user, eq(deletionTask.userId, user.id))
      .where(and(
        eq(deletionTask.kind, 'photo'),
        eq(user.deletionStatus, 'active'),
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
      .for('update', { of: deletionTask, skipLocked: true });
    const tasks: CleanupTask[] = [];
    for (const task of due) {
      const keys = parsePhotoKeys(task.objectKeys);
      const activeOperation = await tx.select({ photoId: photoUploadOperation.photoId })
        .from(photoUploadOperation).where(and(
          eq(photoUploadOperation.userId, task.userId),
          eq(photoUploadOperation.state, 'in_flight'),
          gt(photoUploadOperation.fenceUntil, now),
          inArray(photoUploadOperation.objectKey, keys),
        )).limit(1);
      if (activeOperation.length) continue;
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

async function claimAccountTasks(db: Database, now: Date, batchSize: number): Promise<CleanupTask[]> {
  return db.transaction(async (tx) => {
    const due = await tx.select({
      id: deletionTask.id,
      userId: deletionTask.userId,
      objectKeys: deletionTask.objectKeys,
      attempts: deletionTask.attempts,
    }).from(deletionTask).innerJoin(user, eq(deletionTask.userId, user.id)).where(and(
      eq(deletionTask.kind, 'account'),
      eq(user.deletionStatus, 'deleting'),
      or(
        and(inArray(deletionTask.status, ['queued', 'failed']), lte(deletionTask.nextAttemptAt, now)),
        and(eq(deletionTask.status, 'processing'), isNotNull(deletionTask.leaseExpiresAt), lte(deletionTask.leaseExpiresAt, now)),
      ),
    )).orderBy(asc(deletionTask.nextAttemptAt), asc(deletionTask.createdAt))
      .limit(batchSize).for('update', { of: deletionTask, skipLocked: true });
    const tasks: CleanupTask[] = [];
    for (const task of due) {
      const leaseToken = randomUUID();
      const [claimed] = await tx.update(deletionTask).set({
        status: 'processing',
        attempts: sql`${deletionTask.attempts} + 1`,
        leaseToken,
        leaseExpiresAt: new Date(now.getTime() + CLEANUP_LEASE_MS),
      }).where(eq(deletionTask.id, task.id)).returning({ attempts: deletionTask.attempts });
      if (claimed) tasks.push({ ...task, attempts: claimed.attempts, leaseToken });
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
    const [owner] = await tx.select({ id: user.id }).from(user)
      .where(eq(user.id, task.userId)).for('update');
    if (!owner) return;
    const photos = await tx.select({ id: photo.id }).from(photo).where(and(
      eq(photo.userId, task.userId), inArray(photo.objectKey, keys), eq(photo.lifecycle, 'deleting'),
    )).for('update');
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
    for (const row of photos) await tx.update(photo)
      .set({ lifecycle: 'deleted', deletedAt: now }).where(eq(photo.id, row.id));
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

async function accountCleanupKeys(db: Database, task: CleanupTask, now: Date) {
  const keys = new Set<string>(parsePhotoKeys(task.objectKeys, true));
  const [photos, photoTasks, operations] = await Promise.all([
    db.select({ objectKey: photo.objectKey }).from(photo).where(eq(photo.userId, task.userId)),
    db.select({ objectKeys: deletionTask.objectKeys }).from(deletionTask).where(and(
      eq(deletionTask.userId, task.userId), eq(deletionTask.kind, 'photo'),
    )),
    db.select({ objectKey: photoUploadOperation.objectKey, state: photoUploadOperation.state, fenceUntil: photoUploadOperation.fenceUntil })
      .from(photoUploadOperation).where(eq(photoUploadOperation.userId, task.userId)),
  ]);
  for (const row of photos) keys.add(row.objectKey);
  for (const row of photoTasks) for (const key of parsePhotoKeys(row.objectKeys)) keys.add(key);
  for (const row of operations) keys.add(row.objectKey);
  for (const key of keys) if (!PHOTO_KEY_PATTERN.test(key)) throw new Error('Invalid account cleanup object key');
  const uploadInFlight = operations.some((row) => row.state === 'in_flight' && row.fenceUntil > now);
  return { keys: [...keys], uploadInFlight };
}

async function deferAccountTask(db: Database, task: CleanupTask, now: Date): Promise<void> {
  await db.update(deletionTask).set({
    status: 'queued',
    nextAttemptAt: new Date(now.getTime() + 15_000),
    leaseToken: null,
    leaseExpiresAt: null,
  }).where(and(
    eq(deletionTask.id, task.id), eq(deletionTask.status, 'processing'), eq(deletionTask.leaseToken, task.leaseToken),
  ));
}

async function finalizeAccountTask(
  db: Database,
  task: CleanupTask,
  removedKeys: Set<string>,
  now: Date,
): Promise<'purged' | 'deferred' | 'stale'> {
  return db.transaction(async (tx) => {
    const [account] = await tx.select({ deletionStatus: user.deletionStatus }).from(user)
      .where(eq(user.id, task.userId)).for('update');
    if (!account || account.deletionStatus !== 'deleting') return 'stale';
    const [current] = await tx.select({ id: deletionTask.id }).from(deletionTask).where(and(
      eq(deletionTask.id, task.id), eq(deletionTask.kind, 'account'),
      eq(deletionTask.status, 'processing'), eq(deletionTask.leaseToken, task.leaseToken),
    )).for('update');
    if (!current) return 'stale';

    const activeUploads = await tx.select({ photoId: photoUploadOperation.photoId }).from(photoUploadOperation)
      .where(and(
        eq(photoUploadOperation.userId, task.userId),
        eq(photoUploadOperation.state, 'in_flight'),
        gt(photoUploadOperation.fenceUntil, now),
      )).limit(1);
    if (activeUploads.length) return 'deferred';
    const remainingPhotos = await tx.select({ objectKey: photo.objectKey }).from(photo)
      .where(eq(photo.userId, task.userId));
    if (remainingPhotos.some((row) => !removedKeys.has(row.objectKey))) return 'deferred';
    const photoTasks = await tx.select({ objectKeys: deletionTask.objectKeys }).from(deletionTask).where(and(
      eq(deletionTask.userId, task.userId), eq(deletionTask.kind, 'photo'),
    ));
    for (const row of photoTasks) {
      const missingKey = parsePhotoKeys(row.objectKeys).some((key) => !removedKeys.has(key));
      if (missingKey) return 'deferred';
    }

    await tx.delete(user).where(eq(user.id, task.userId));
    return 'purged';
  });
}

/** Schedules expired uploads and processes durable photo and account cleanup rows. */
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
  const accountTasks = await claimAccountTasks(db, now, batchSize);
  let removed = 0;
  let failed = 0;
  let accountsPurged = 0;
  let deferred = 0;
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
  for (const task of accountTasks) {
    try {
      const state = await accountCleanupKeys(db, task, now);
      if (state.uploadInFlight) {
        await deferAccountTask(db, task, now);
        deferred++;
        continue;
      }
      for (const key of state.keys) await store.removeObject(key);
      const outcome = await finalizeAccountTask(db, task, new Set(state.keys), now);
      if (outcome === 'purged') {
        accountsPurged++;
        removed++;
      } else if (outcome === 'deferred') {
        await deferAccountTask(db, task, now);
        deferred++;
      }
    } catch {
      await persistPhotoRetry(db, task, now);
      failed++;
    }
  }
  return { scheduled, removed, failed, accountsPurged, deferred };
}

export async function runPhotoCleanupWorker(
  db: Database,
  store: Pick<MediaObjectStore, 'removeObject'>,
  options: { signal?: AbortSignal; pollIntervalMs?: number; onError?: (error: unknown) => void } = {},
): Promise<void> {
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 50)
    throw new RangeError('Cleanup worker poll interval must be at least 50 milliseconds');
  while (!options.signal?.aborted) {
    try {
      const result = await runPhotoCleanupBatch(db, store);
      if (result.scheduled || result.removed || result.failed || result.accountsPurged || result.deferred) {
        logEvent(result.failed ? 'warn' : 'info', 'worker.photo_cleanup.batch_finished', result);
      }
    } catch (error) {
      options.onError?.(error);
    }
    if (options.signal?.aborted) break;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}
