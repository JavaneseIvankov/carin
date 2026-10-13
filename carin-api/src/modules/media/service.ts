import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  createMediaGrant,
  MEDIA_GRANT_TTL_MS,
  verifyMediaGrant,
} from './grants.js';
import { normalizePhoto, type NormalizedPhoto } from './image.js';
import {
  MediaIdempotencyConflict,
  type MediaPhotoRecord,
  type MediaRepository,
  type PhotoResponse,
} from './repository.js';
import {
  AI_MEDIA_URL_TTL_SECONDS,
  assertMinioObjectUrl,
  type MediaObjectStore,
  parseMinioEndpoint,
} from './storage.js';

export class MediaPhotoNotFound extends Error {}
export class MediaServiceUnavailable extends Error {}

export type MediaServiceOptions = {
  repository: MediaRepository;
  store: MediaObjectStore;
  environment: 'dev' | 'staging' | 'prod';
  signingSecret: string;
  publicApiOrigin: string;
  minioEndpoint: string;
  minioBucket: string;
  now?: () => Date;
  newId?: () => string;
  newObjectKey?: () => string;
};

function publicOrigin(input: string, environment: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('MEDIA_SIGNED_URL_BASE must be a valid API origin');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
    url.search || url.hash || !['', '/'].includes(url.pathname) ||
    (environment !== 'dev' && url.protocol !== 'https:')
  ) throw new Error('MEDIA_SIGNED_URL_BASE must be an API origin');
  return url.origin;
}

function requestHash(bytes: Uint8Array, declaredMime: string): string {
  return createHash('sha256')
    .update(declaredMime, 'utf8')
    .update('\0', 'utf8')
    .update(bytes)
    .digest('hex');
}

function constantTimeHexEqual(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export function createMediaService(options: MediaServiceOptions) {
  const now = options.now ?? (() => new Date());
  const newId = options.newId ?? randomUUID;
  const newObjectKey = options.newObjectKey ?? (() => `photos/${randomUUID()}`);
  const apiOrigin = publicOrigin(options.publicApiOrigin, options.environment);
  const minioEndpoint = parseMinioEndpoint(options.minioEndpoint);
  if (!options.minioBucket) throw new Error('MINIO_BUCKET is required');

  async function findOwnedPhoto(photoId: string, userId: string): Promise<MediaPhotoRecord> {
    let record: MediaPhotoRecord | null;
    try {
      record = await options.repository.findActiveOwnedPhoto(photoId, userId);
    } catch {
      throw new MediaServiceUnavailable();
    }
    if (!record) throw new MediaPhotoNotFound();
    return record;
  }

  async function discardFailedUpload(input: {
    userId: string;
    sessionId: string;
    idempotencyKey: string;
    requestHash: string;
    photoId: string;
    objectKey: string;
    objectMayExist: boolean;
  }): Promise<void> {
    let objectMayExist = input.objectMayExist;
    if (objectMayExist) {
      try {
        await options.store.removeObject(input.objectKey);
        objectMayExist = false;
      } catch {
        objectMayExist = true;
      }
    }
    try {
      await options.repository.recordUploadFailure({
        ...input,
        objectMayExist,
        now: now(),
      });
    } catch {
      // The staged uploaded row remains eligible for the durable one-hour orphan sweep.
    }
  }

  async function upload(input: {
    userId: string;
    sessionId: string;
    idempotencyKey: string;
    bytes: Uint8Array;
    declaredMime: string;
  }): Promise<PhotoResponse> {
    const normalized: NormalizedPhoto = await normalizePhoto(input.bytes, input.declaredMime);
    const createdAt = now();
    const hash = requestHash(input.bytes, input.declaredMime);
    const newPhotoId = newId();
    const proposedObjectKey = newObjectKey();
    let reservation;
    try {
      reservation = await options.repository.reserveUpload({
        userId: input.userId,
        sessionId: input.sessionId,
        idempotencyKey: input.idempotencyKey,
        requestHash: hash,
        photoId: newPhotoId,
        objectKey: proposedObjectKey,
        checksum: normalized.checksum,
        mimeType: normalized.mimeType,
        sizeBytes: normalized.bytes.length,
        createdAt,
      });
    } catch (error) {
      if (error instanceof MediaIdempotencyConflict) throw error;
      throw new MediaServiceUnavailable();
    }
    if (reservation.state === 'replay') return reservation.photo;

    const response: PhotoResponse = {
      id: reservation.photoId,
      mimeType: normalized.mimeType,
      sizeBytes: normalized.bytes.length,
      width: normalized.width,
      height: normalized.height,
      createdAt: reservation.createdAt.toISOString(),
    };
    const cleanupInput = {
      userId: input.userId,
      sessionId: input.sessionId,
      idempotencyKey: input.idempotencyKey,
      requestHash: hash,
      photoId: reservation.photoId,
      objectKey: reservation.objectKey,
      objectMayExist: true,
    };

    try {
      await options.store.putObject({
        key: reservation.objectKey,
        bytes: normalized.bytes,
        mimeType: normalized.mimeType,
        checksum: normalized.checksum,
      });
      await options.repository.completeUpload({
        userId: input.userId,
        sessionId: input.sessionId,
        idempotencyKey: input.idempotencyKey,
        requestHash: hash,
        photo: response,
      });
    } catch {
      await discardFailedUpload(cleanupInput);
      throw new MediaServiceUnavailable();
    }
    return response;
  }

  async function issueViewUrl(userId: string, photoId: string) {
    await findOwnedPhoto(photoId, userId);
    const issuedAt = now();
    const token = createMediaGrant({ photoId, userId, environment: options.environment }, options.signingSecret, issuedAt.getTime());
    const url = new URL(`/media/photos/${photoId}`, apiOrigin);
    url.searchParams.set('token', token);
    return {
      url: url.toString(),
      expiresAt: new Date(issuedAt.getTime() + MEDIA_GRANT_TTL_MS).toISOString(),
    };
  }

  async function readGrantedPhoto(photoId: string, token: string) {
    const claims = verifyMediaGrant(token, options.signingSecret, now().getTime(), options.environment);
    if (!claims || claims.photoId !== photoId) throw new MediaPhotoNotFound();
    const record = await findOwnedPhoto(photoId, claims.userId);
    try {
      const bytes = await options.store.readObject(record.objectKey);
      const checksum = createHash('sha256').update(bytes).digest('hex');
      if (bytes.length !== record.sizeBytes || !constantTimeHexEqual(checksum, record.checksum))
        throw new Error('Stored media checksum mismatch');
      return { bytes, mimeType: record.mimeType };
    } catch {
      throw new MediaServiceUnavailable();
    }
  }

  async function createAiPhotoUrl(userId: string, photoId: string): Promise<string> {
    const record = await findOwnedPhoto(photoId, userId);
    try {
      const candidate = await options.store.presignRead(record.objectKey, AI_MEDIA_URL_TTL_SECONDS);
      return assertMinioObjectUrl(candidate, minioEndpoint, options.minioBucket, record.objectKey).toString();
    } catch {
      throw new MediaServiceUnavailable();
    }
  }

  return { upload, issueViewUrl, readGrantedPhoto, createAiPhotoUrl };
}

export type MediaService = ReturnType<typeof createMediaService>;
