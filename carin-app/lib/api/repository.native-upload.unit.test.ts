import { describe, expect, it, vi } from 'vitest';
import { createAppRepository } from './repository';
import type { DataScope, StorageAdapter } from '@/lib/data/scope';

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
});
