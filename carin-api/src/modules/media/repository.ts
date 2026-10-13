import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import {
  deletionTask,
  idempotencyRecord,
  photo,
  session,
  user,
} from '../../db/schema/index.js';

export type MediaMimeType = 'image/jpeg' | 'image/png';

export type PhotoResponse = {
  id: string;
  mimeType: MediaMimeType;
  sizeBytes: number;
  width: number;
  height: number;
  createdAt: string;
};

export type MediaPhotoRecord = {
  id: string;
  userId: string;
  objectKey: string;
  checksum: string;
  mimeType: MediaMimeType;
  sizeBytes: number;
  createdAt: Date;
};

export type ReservePhotoUpload = {
  userId: string;
  sessionId: string;
  idempotencyKey: string;
  requestHash: string;
  photoId: string;
  objectKey: string;
  reservationToken: string;
  checksum: string;
  mimeType: MediaMimeType;
  sizeBytes: number;
  createdAt: Date;
};

export type UploadReservation =
  | { state: 'upload'; photoId: string; objectKey: string; createdAt: Date; reservationToken: string }
  | { state: 'in-progress' }
  | { state: 'replay'; photo: PhotoResponse };

export class MediaIdempotencyConflict extends Error {}
export class MediaUploadInProgress extends Error {}

const RESERVATION_LEASE_MS = 5 * 60 * 1000;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
type ReservationLease = { version: 'photo-upload-v1'; token: string; expiresAt: string };

function reservationLease(token: string, createdAt: Date): ReservationLease {
  return {
    version: 'photo-upload-v1',
    token,
    expiresAt: new Date(createdAt.getTime() + RESERVATION_LEASE_MS).toISOString(),
  };
}

function parseReservationLease(value: unknown): ReservationLease | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== 'photo-upload-v1' ||
    typeof candidate.token !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate.token) ||
    typeof candidate.expiresAt !== 'string' || !Number.isFinite(Date.parse(candidate.expiresAt))
  ) return null;
  return candidate as ReservationLease;
}

export type MediaRepository = {
  reserveUpload(input: ReservePhotoUpload): Promise<UploadReservation>;
  completeUpload(input: {
    userId: string;
    sessionId: string;
    idempotencyKey: string;
    requestHash: string;
    reservationToken: string;
    objectKey: string;
    photo: PhotoResponse;
    now: Date;
  }): Promise<boolean>;
  recordUploadFailure(input: {
    userId: string;
    sessionId: string;
    idempotencyKey: string;
    requestHash: string;
    reservationToken: string;
    photoId: string;
    objectKey: string;
    objectMayExist: boolean;
    now: Date;
  }): Promise<void>;
  findActiveOwnedPhoto(photoId: string, userId: string): Promise<MediaPhotoRecord | null>;
};

export function createMediaRepository(db: Database): MediaRepository {
  return {
    async reserveUpload(input) {
      return db.transaction(async (tx) => {
        const [account] = await tx
          .select({ id: user.id, deletionStatus: user.deletionStatus })
          .from(user)
          .where(eq(user.id, input.userId))
          .for('update');
        if (!account || account.deletionStatus !== 'active')
          throw new Error('Media account is no longer active');
        const [activeSession] = await tx
          .select({ id: session.id })
          .from(session)
          .where(and(
            eq(session.id, input.sessionId),
            eq(session.userId, input.userId),
            gt(session.expiresAt, input.createdAt),
          ));
        if (!activeSession) throw new Error('Media account or session is no longer active');

        const idempotencyScope = and(
          eq(idempotencyRecord.userId, input.userId),
          eq(idempotencyRecord.sessionId, input.sessionId),
          eq(idempotencyRecord.actionScope, 'photo:upload'),
          eq(idempotencyRecord.key, input.idempotencyKey),
        );
        const [observed] = await tx
          .select()
          .from(idempotencyRecord)
          .where(idempotencyScope);

        const insertPhoto = async () => {
          await tx.insert(photo).values({
            id: input.photoId,
            userId: input.userId,
            objectKey: input.objectKey,
            checksum: input.checksum,
            mimeType: input.mimeType,
            sizeBytes: input.sizeBytes,
            lifecycle: 'uploaded',
            createdAt: input.createdAt,
          });
        };
        const uploadReservation = () => ({
          state: 'upload' as const,
          photoId: input.photoId,
          objectKey: input.objectKey,
          createdAt: input.createdAt,
          reservationToken: input.reservationToken,
        });
        const lease = reservationLease(input.reservationToken, input.createdAt);
        const retentionExpiresAt = new Date(input.createdAt.getTime() + IDEMPOTENCY_TTL_MS);

        if (!observed) {
          await tx.insert(idempotencyRecord).values({
            userId: input.userId,
            sessionId: input.sessionId,
            actionScope: 'photo:upload',
            key: input.idempotencyKey,
            requestHash: input.requestHash,
            resourceId: input.photoId,
            responseStatus: null,
            responseBody: lease,
            createdAt: input.createdAt,
            expiresAt: retentionExpiresAt,
          });
          await insertPhoto();
          return uploadReservation();
        }

        if (observed.resourceId) {
          await tx
            .select({ id: photo.id })
            .from(photo)
            .where(eq(photo.id, observed.resourceId))
            .for('update');
        }
        const [previous] = await tx
          .select()
          .from(idempotencyRecord)
          .where(idempotencyScope)
          .for('update');
        if (!previous) throw new MediaIdempotencyConflict();

        const expired = previous.expiresAt <= input.createdAt;
        if (!expired && previous.requestHash !== input.requestHash)
          throw new MediaIdempotencyConflict();

        if (expired) {
          await tx.update(idempotencyRecord)
            .set({
              requestHash: input.requestHash,
              responseStatus: null,
              responseBody: lease,
              resourceId: input.photoId,
              createdAt: input.createdAt,
              expiresAt: retentionExpiresAt,
            })
            .where(eq(idempotencyRecord.id, previous.id));
          await insertPhoto();
          return uploadReservation();
        }

        if (
          previous.responseStatus === 201 && previous.responseBody &&
          typeof previous.responseBody === 'object' && !Array.isArray(previous.responseBody)
        ) {
          return { state: 'replay', photo: previous.responseBody as PhotoResponse } as const;
        }
        if (previous.responseStatus !== null) throw new MediaIdempotencyConflict();

        const previousLease = parseReservationLease(previous.responseBody);
        if (!previousLease) throw new MediaIdempotencyConflict();
        if (Date.parse(previousLease.expiresAt) > input.createdAt.getTime())
          return { state: 'in-progress' } as const;

        await tx.update(idempotencyRecord)
          .set({ responseBody: lease, resourceId: input.photoId })
          .where(eq(idempotencyRecord.id, previous.id));
        await insertPhoto();
        return uploadReservation();
      });
    },

    async completeUpload(input) {
      return db.transaction(async (tx) => {
        const [account] = await tx
          .select({ id: user.id, deletionStatus: user.deletionStatus })
          .from(user)
          .where(eq(user.id, input.userId))
          .for('update');
        const [photoRow] = await tx
          .select({ id: photo.id, lifecycle: photo.lifecycle })
          .from(photo)
          .where(and(
            eq(photo.id, input.photo.id),
            eq(photo.userId, input.userId),
            eq(photo.objectKey, input.objectKey),
          ))
          .for('update');
        const [reservation] = await tx
          .select()
          .from(idempotencyRecord)
          .where(and(
            eq(idempotencyRecord.userId, input.userId),
            eq(idempotencyRecord.sessionId, input.sessionId),
            eq(idempotencyRecord.actionScope, 'photo:upload'),
            eq(idempotencyRecord.key, input.idempotencyKey),
          ))
          .for('update');
        const lease = parseReservationLease(reservation?.responseBody);
        const ownsReservation = Boolean(
          reservation && reservation.responseStatus === null &&
          reservation.requestHash === input.requestHash &&
          reservation.resourceId === input.photo.id &&
          lease?.token === input.reservationToken &&
          lease.expiresAt && Date.parse(lease.expiresAt) > input.now.getTime()
        );
        if (
          account?.deletionStatus === 'active' && photoRow?.lifecycle === 'uploaded' &&
          ownsReservation
        ) {
          await tx.update(idempotencyRecord)
            .set({ responseStatus: 201, responseBody: input.photo })
            .where(eq(idempotencyRecord.id, reservation!.id));
          return true;
        }

        if (photoRow?.lifecycle === 'uploaded') {
          await tx.update(photo)
            .set({ lifecycle: 'deleting', deletedAt: input.now })
            .where(eq(photo.id, photoRow.id));
        }
        if (account) {
          const [pendingCleanup] = await tx
            .select({ id: deletionTask.id })
            .from(deletionTask)
            .where(and(
              eq(deletionTask.userId, input.userId),
              eq(deletionTask.kind, 'photo'),
              inArray(deletionTask.status, ['queued', 'failed']),
              sql`${deletionTask.objectKeys} @> ${JSON.stringify([input.objectKey])}::jsonb`,
            ))
            .for('update');
          if (pendingCleanup) {
            await tx.update(deletionTask)
              .set({ status: 'queued', attempts: 0, nextAttemptAt: input.now, leaseToken: null, leaseExpiresAt: null })
              .where(eq(deletionTask.id, pendingCleanup.id));
          } else {
            await tx.insert(deletionTask).values({
              userId: input.userId,
              kind: 'photo',
              objectKeys: [input.objectKey],
              status: 'queued',
              attempts: 0,
              nextAttemptAt: input.now,
              createdAt: input.now,
            });
          }
        }
        return false;
      });
    },

    async recordUploadFailure(input) {
      await db.transaction(async (tx) => {
        const [account] = await tx
          .select({ id: user.id })
          .from(user)
          .where(eq(user.id, input.userId))
          .for('update');
        const [photoRow] = await tx
          .select({ id: photo.id, lifecycle: photo.lifecycle })
          .from(photo)
          .where(and(
            eq(photo.id, input.photoId),
            eq(photo.userId, input.userId),
            eq(photo.objectKey, input.objectKey),
          ))
          .for('update');
        const [reservation] = await tx
          .select({ id: idempotencyRecord.id })
          .from(idempotencyRecord)
          .where(and(
            eq(idempotencyRecord.userId, input.userId),
            eq(idempotencyRecord.sessionId, input.sessionId),
            eq(idempotencyRecord.actionScope, 'photo:upload'),
            eq(idempotencyRecord.key, input.idempotencyKey),
            eq(idempotencyRecord.requestHash, input.requestHash),
            eq(idempotencyRecord.resourceId, input.photoId),
            sql`${idempotencyRecord.responseBody}->>'token' = ${input.reservationToken}`,
          ))
          .for('update');

        if (photoRow?.lifecycle === 'uploaded') {
          await tx.update(photo)
            .set({
              lifecycle: input.objectMayExist ? 'deleting' : 'deleted',
              deletedAt: input.now,
            })
            .where(eq(photo.id, photoRow.id));
        } else if (photoRow?.lifecycle === 'deleting' && !input.objectMayExist) {
          await tx.update(photo)
            .set({ lifecycle: 'deleted', deletedAt: input.now })
            .where(eq(photo.id, photoRow.id));
        }

        if (account && input.objectMayExist) {
          const [pendingCleanup] = await tx
            .select({ id: deletionTask.id })
            .from(deletionTask)
            .where(and(
              eq(deletionTask.userId, input.userId),
              eq(deletionTask.kind, 'photo'),
              inArray(deletionTask.status, ['queued', 'failed']),
              sql`${deletionTask.objectKeys} @> ${JSON.stringify([input.objectKey])}::jsonb`,
            ))
            .for('update');
          if (pendingCleanup) {
            await tx.update(deletionTask)
              .set({ status: 'queued', attempts: 0, nextAttemptAt: input.now, leaseToken: null, leaseExpiresAt: null })
              .where(eq(deletionTask.id, pendingCleanup.id));
          } else {
            await tx.insert(deletionTask).values({
              userId: input.userId,
              kind: 'photo',
              objectKeys: [input.objectKey],
              status: 'queued',
              attempts: 0,
              nextAttemptAt: input.now,
              createdAt: input.now,
            });
          }
        }
        if (reservation) await tx.delete(idempotencyRecord).where(eq(idempotencyRecord.id, reservation.id));
      });
    },

    async findActiveOwnedPhoto(photoId, userId) {
      const [record] = await db
        .select({
          id: photo.id,
          userId: photo.userId,
          objectKey: photo.objectKey,
          checksum: photo.checksum,
          mimeType: photo.mimeType,
          sizeBytes: photo.sizeBytes,
          createdAt: photo.createdAt,
        })
        .from(photo)
        .innerJoin(user, eq(photo.userId, user.id))
        .where(and(
          eq(photo.id, photoId),
          eq(photo.userId, userId),
          eq(user.deletionStatus, 'active'),
          inArray(photo.lifecycle, ['uploaded', 'attached']),
        ));
      return record ? { ...record, mimeType: record.mimeType as MediaMimeType } : null;
    },
  };
}
