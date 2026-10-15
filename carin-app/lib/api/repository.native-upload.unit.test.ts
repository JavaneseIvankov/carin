import { describe, expect, it, vi } from 'vitest';
import { createAppRepository } from './repository';
import { OfflineError } from '@/lib/data/network';
import { storageKey, type DataScope, type StorageAdapter } from '@/lib/data/scope';

function memoryStorage(): StorageAdapter {
  return {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
    getAllKeys: async () => [],
  };
}

const scope: DataScope = { environment: 'dev', userId: 'alice' };

describe('repository native file upload', () => {
  it('uses the native file transport while preserving auth and idempotency headers', async () => {
    const uploadFile = vi.fn(
      async (_url, _uri, _options) =>
        new Response(JSON.stringify({ id: 'photo-1' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
    );
    const fetcher = vi.fn<typeof fetch>();
    const repository = createAppRepository({
      scope,
      storage: memoryStorage(),
      connectivity: () => 'online',
      onUnauthorized: async () => {},
      getCookie: async () => 'carin-dev.session=secret',
      nativeFileUploader: uploadFile,
      fetcher: fetcher as unknown as typeof fetch,
      baseUrl: 'https://api.test',
    });

    const response = await repository.uploadPhotoFile(
      { headers: { 'Idempotency-Key': 'upload-1' } },
      { uri: 'file:///cache/photo.jpg', mimeType: 'image/jpeg' }
    );

    expect(response).toEqual({ id: 'photo-1' });
    expect(uploadFile).toHaveBeenCalledOnce();
    expect(uploadFile).toHaveBeenCalledWith(
      'https://api.test/api/v1/photos',
      'file:///cache/photo.jpg',
      expect.objectContaining({
        fieldName: 'file',
        mimeType: 'image/jpeg',
        headers: expect.objectContaining({
          Cookie: 'carin-dev.session=secret',
          'Idempotency-Key': 'upload-1',
          'x-request-id': expect.any(String),
        }),
      })
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not persist a short-lived private photo view URL', async () => {
    const values = new Map<string, string>();
    const storage: StorageAdapter = {
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => {
        values.set(key, value);
      },
      removeItem: async (key) => {
        values.delete(key);
      },
      getAllKeys: async () => [...values.keys()],
    };
    const repository = createAppRepository({
      scope,
      storage,
      connectivity: () => 'online',
      onUnauthorized: async () => {},
      fetcher: (async () =>
        new Response(
          JSON.stringify({
            url: 'https://api.test/media/photo?token=short-lived',
            expiresAt: '2026-10-15T09:05:00.000Z',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )) as typeof fetch,
      baseUrl: 'https://api.test',
    });

    await repository.read('getPhotoView', { path: { id: 'photo-1' } });

    expect(await storage.getAllKeys()).toEqual([]);
  });

  it('does not serve or retain a persisted private photo view URL while offline', async () => {
    const values = new Map<string, string>();
    const cacheKey = storageKey(scope, 'read', '/api/v1/photos/photo-2/view');
    values.set(
      cacheKey,
      JSON.stringify({
        data: {
          url: 'https://api.test/media/photo?token=expired',
          expiresAt: '2026-10-15T09:05:00.000Z',
        },
        updatedAt: 1,
      })
    );
    const storage: StorageAdapter = {
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => {
        values.set(key, value);
      },
      removeItem: async (key) => {
        values.delete(key);
      },
      getAllKeys: async () => [...values.keys()],
    };
    const repository = createAppRepository({
      scope,
      storage,
      connectivity: () => 'offline',
      onUnauthorized: async () => {},
      baseUrl: 'https://api.test',
    });

    await expect(
      repository.read('getPhotoView', { path: { id: 'photo-2' } })
    ).rejects.toBeInstanceOf(OfflineError);
    expect(await storage.getItem(cacheKey)).toBeNull();
  });
});
