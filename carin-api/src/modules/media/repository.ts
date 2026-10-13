import { and, eq, gt, inArray, lt } from 'drizzle-orm';
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
  checksum: string;
  mimeType: MediaMimeType;
  sizeBytes: number;
  createdAt: Date;
};

export type UploadReservation =
  | { state: 'upload'; photoId: string; objectKey: string; createdAt: Date }
  | { state: 'replay'; photo: PhotoResponse };

export class MediaIdempotencyConflict extends Error {}

export type MediaRepository = {
  reserveUpload(input: ReservePhotoUpload): Promise<UploadReservation>;
  completeUpload(input: {
    userId: string;
    sessionId: string;
    idempotencyKey: string;
    requestHash: string;
    photo: PhotoResponse;
  }): Promise<void>;
  recordUploadFailure(input: {
    userId: string;
    sessionId: string;
    idempotencyKey: string;
    requestHash: string;
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
        const [activeSession] = await tx
          .select({ id: session.id })
          .from(session)
          .innerJoin(user, eq(user.id, session.userId))
          .where(and(
            eq(session.id, input.sessionId),
            eq(session.userId, input.userId),
            gt(session.expiresAt, input.createdAt),
            eq(user.deletionStatus, 'active'),
          ));
        if (!activeSession) throw new Error('Media account or session is no longer active');

        await tx.delete(idempotencyRecord).where(and(
          eq(idempotencyRecord.userId, input.userId),
          eq(idempotencyRecord.sessionId, input.sessionId),
          eq(idempotencyRecord.actionScope, 'photo:upload'),
          eq(idempotencyRecord.key, input.idempotencyKey),
          lt(idempotencyRecord.expiresAt, input.createdAt),
        ));
        const [createdIdempotency] = await tx
          .insert(idempotencyRecord)
          .values({
            userId: input.userId,
            sessionId: input.sessionId,
            actionScope: 'photo:upload',
            key: input.idempotencyKey,
            requestHash: input.requestHash,
            resourceId: input.photoId,
            createdAt: input.createdAt,
          })
          .onConflictDoNothing()
          .returning({ id: idempotencyRecord.id });

        if (createdIdempotency) {
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
          return {
            state: 'upload',
            photoId: input.photoId,
            objectKey: input.objectKey,
            createdAt: input.createdAt,
          } as const;
        }

        const [previous] = await tx
          .select()
          .from(idempotencyRecord)
          .where(and(
            eq(idempotencyRecord.userId, input.userId),
            eq(idempotencyRecord.sessionId, input.sessionId),
            eq(idempotencyRecord.actionScope, 'photo:upload'),
            eq(idempotencyRecord.key, input.idempotencyKey),
          ))
          .for('update');
        if (!previous || previous.requestHash !== input.requestHash)
          throw new MediaIdempotencyConflict();
        if (
          previous.responseStatus === 201 && previous.responseBody &&
          typeof previous.responseBody === 'object' && !Array.isArray(previous.responseBody)
        ) {
          return { state: 'replay', photo: previous.responseBody as PhotoResponse } as const;
        }
        if (previous.responseStatus === null && previous.resourceId) {
          const [pending] = await tx
            .select({
              id: photo.id,
              objectKey: photo.objectKey,
              createdAt: photo.createdAt,
            })
            .from(photo)
            .where(and(
              eq(photo.id, previous.resourceId),
              eq(photo.userId, input.userId),
              eq(photo.lifecycle, 'uploaded'),
            ));
          if (pending)
            return {
              state: 'upload',
              photoId: pending.id,
              objectKey: pending.objectKey,
              createdAt: pending.createdAt,
            } as const;
        }
        throw new MediaIdempotencyConflict();
      });
    },

    async completeUpload(input) {
      const [updated] = await db
        .update(idempotencyRecord)
        .set({
          responseStatus: 201,
          responseBody: input.photo,
          resourceId: input.photo.id,
        })
        .where(and(
          eq(idempotencyRecord.userId, input.userId),
          eq(idempotencyRecord.sessionId, input.sessionId),
          eq(idempotencyRecord.actionScope, 'photo:upload'),
          eq(idempotencyRecord.key, input.idempotencyKey),
          eq(idempotencyRecord.requestHash, input.requestHash),
          eq(idempotencyRecord.resourceId, input.photo.id),
        ))
        .returning({ id: idempotencyRecord.id });
      if (!updated) throw new Error('Photo upload reservation changed before completion');
    },

    async recordUploadFailure(input) {
      await db.transaction(async (tx) => {
        const lifecycle = input.objectMayExist ? 'deleting' : 'deleted';
        const [updated] = await tx
          .update(photo)
          .set({ lifecycle, deletedAt: input.now })
          .where(and(
            eq(photo.id, input.photoId),
            eq(photo.userId, input.userId),
            eq(photo.objectKey, input.objectKey),
            eq(photo.lifecycle, 'uploaded'),
          ))
          .returning({ id: photo.id });
        if (updated && input.objectMayExist) {
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
        await tx.delete(idempotencyRecord).where(and(
          eq(idempotencyRecord.userId, input.userId),
          eq(idempotencyRecord.sessionId, input.sessionId),
          eq(idempotencyRecord.actionScope, 'photo:upload'),
          eq(idempotencyRecord.key, input.idempotencyKey),
          eq(idempotencyRecord.requestHash, input.requestHash),
          eq(idempotencyRecord.resourceId, input.photoId),
        ));
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
