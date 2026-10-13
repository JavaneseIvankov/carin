import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import type { MediaRepository } from './repository.js';
import type { MediaObjectStore } from './storage.js';
import { MediaServiceUnavailable, createMediaService } from './service.js';

const userId = '686c455b-2a40-4b4b-9f73-c327a3b41ffb';
const photoId = 'c5961351-8c24-44b4-a95a-293bb4b8906f';
const sessionId = '4fc5e89b-77d7-4515-a44a-f0399745951e';
const objectKey = 'photos/480225c0-d3e7-4c10-8c40-6118afe5a8fb';
const now = new Date('2026-10-14T04:00:00.000Z');

function serviceWith(repository: MediaRepository, store: MediaObjectStore) {
  return createMediaService({
    repository,
    store,
    environment: 'dev',
    signingSecret: 'private-media-secret-with-at-least-32-bytes',
    publicApiOrigin: 'http://127.0.0.1:3000',
    minioEndpoint: 'http://minio:9000',
    minioBucket: 'carin',
    now: () => now,
    newId: () => photoId,
    newObjectKey: () => objectKey,
  });
}

function repository(overrides: Partial<MediaRepository> = {}): MediaRepository {
  return {
    reserveUpload: vi.fn().mockResolvedValue({
      state: 'upload', photoId, objectKey, createdAt: now,
    }),
    completeUpload: vi.fn().mockResolvedValue(true),
    recordUploadFailure: vi.fn().mockResolvedValue(undefined),
    findActiveOwnedPhoto: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function objectStore(overrides: Partial<MediaObjectStore> = {}): MediaObjectStore {
  return {
    putObject: vi.fn().mockResolvedValue(undefined),
    readObject: vi.fn().mockResolvedValue(Buffer.from('normalized image')),
    removeObject: vi.fn().mockResolvedValue(undefined),
    presignRead: vi.fn().mockResolvedValue(
      `http://minio:9000/carin/${objectKey}?X-Amz-Signature=private`,
    ),
    ...overrides,
  };
}

describe('media upload service', () => {
  it('does not write to MinIO when the durable photo/idempotency insert fails', async () => {
    const repo = repository({ reserveUpload: vi.fn().mockRejectedValue(new Error('database unavailable')) });
    const store = objectStore();
    const bytes = await sharp({
      create: { width: 8, height: 6, channels: 3, background: 'red' },
    }).jpeg().toBuffer();
    const service = serviceWith(repo, store);

    await expect(service.upload({ userId, sessionId, idempotencyKey: photoId, bytes, declaredMime: 'image/jpeg' }))
      .rejects.toBeInstanceOf(MediaServiceUnavailable);
    expect(store.putObject).not.toHaveBeenCalled();
  });

  it('removes a possibly partial MinIO object and persists cleanup when removal fails', async () => {
    const repo = repository();
    const store = objectStore({
      putObject: vi.fn().mockRejectedValue(new Error('storage failed')),
      removeObject: vi.fn().mockRejectedValue(new Error('storage cleanup failed')),
    });
    const bytes = await sharp({
      create: { width: 8, height: 6, channels: 3, background: 'blue' },
    }).jpeg().toBuffer();
    const service = serviceWith(repo, store);

    await expect(service.upload({ userId, sessionId, idempotencyKey: photoId, bytes, declaredMime: 'image/jpeg' }))
      .rejects.toBeInstanceOf(MediaServiceUnavailable);
    expect(store.removeObject).toHaveBeenCalledWith(objectKey);
    expect(repo.recordUploadFailure).toHaveBeenCalledWith(expect.objectContaining({
      userId,
      photoId,
      objectKey,
      objectMayExist: true,
    }));
  });

  it('removes the stored object and records cleanup when the completion write fails', async () => {
    const repo = repository({
      completeUpload: vi.fn().mockRejectedValue(new Error('database unavailable')),
    });
    const store = objectStore();
    const bytes = await sharp({
      create: { width: 8, height: 6, channels: 3, background: 'yellow' },
    }).jpeg().toBuffer();

    await expect(serviceWith(repo, store).upload({
      userId, sessionId, idempotencyKey: photoId, bytes, declaredMime: 'image/jpeg',
    })).rejects.toBeInstanceOf(MediaServiceUnavailable);
    expect(store.putObject).toHaveBeenCalledWith(expect.objectContaining({ key: objectKey }));
    expect(store.removeObject).toHaveBeenCalledWith(objectKey);
    expect(repo.recordUploadFailure).toHaveBeenCalledWith(expect.objectContaining({
      photoId,
      objectKey,
      objectMayExist: false,
    }));
  });

  it('replays a completed idempotent upload without storing a second object', async () => {
    const photo = {
      id: photoId,
      mimeType: 'image/jpeg' as const,
      sizeBytes: 200,
      width: 8,
      height: 6,
      createdAt: now.toISOString(),
    };
    const repo = repository({ reserveUpload: vi.fn().mockResolvedValue({ state: 'replay', photo }) });
    const store = objectStore();
    const bytes = await sharp({
      create: { width: 8, height: 6, channels: 3, background: 'green' },
    }).jpeg().toBuffer();

    await expect(serviceWith(repo, store).upload({
      userId, sessionId, idempotencyKey: photoId, bytes, declaredMime: 'image/jpeg',
    })).resolves.toEqual(photo);
    expect(store.putObject).not.toHaveBeenCalled();
  });
});
