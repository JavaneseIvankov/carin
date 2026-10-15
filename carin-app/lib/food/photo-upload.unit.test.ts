import { describe, expect, it, vi } from 'vitest';
import { createPhotoUploadPayload } from './photo-upload';

describe('photo upload payload', () => {
  it('passes Android file URIs through for the native upload transport', async () => {
    const localFetch = vi.fn();

    const result = await createPhotoUploadPayload(
      { uri: 'file:///cache/photo.jpg', mimeType: 'image/jpeg' },
      { platform: 'native', fetchLocal: localFetch }
    );

    expect(result).toEqual({
      kind: 'native-file',
      uri: 'file:///cache/photo.jpg',
      mimeType: 'image/jpeg',
    });
    expect(localFetch).not.toHaveBeenCalled();
  });

  it('keeps web photo conversion on the browser Blob path', async () => {
    const localFetch = vi.fn(async () => new Response(new Blob(['photo'])));

    const result = await createPhotoUploadPayload(
      { uri: 'blob:https://carin.local/photo', mimeType: 'image/png' },
      { platform: 'web', fetchLocal: localFetch }
    );

    expect(result).toBeInstanceOf(Blob);
    expect((result as Blob).type).toBe('image/png');
    expect(localFetch).toHaveBeenCalledOnce();
  });
});
