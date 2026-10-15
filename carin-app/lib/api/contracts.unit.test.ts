import { describe, expect, it } from 'vitest';
import { prepareAppRequest } from './contracts';

describe('resource consumer serialization', () => {
  it('uses the resource route and percent-encodes path and query values', () => {
    expect(prepareAppRequest('getPhotoView', { path: { id: 'a/b' } })).toEqual({
      method: 'GET',
      path: '/api/v1/photos/a%2Fb/view',
      headers: {},
      body: undefined,
    });
    expect(prepareAppRequest('searchFoods', { query: { q: 'nasi & ayam', limit: 10 } }).path).toBe(
      '/api/v1/catalog/foods?q=nasi+%26+ayam&limit=10'
    );
  });
  it('serializes JSON and leaves multipart boundaries to the transport', () => {
    const input = { expectedRevision: 1, timezone: 'Asia/Jakarta' };
    const result = prepareAppRequest('updateMe', {
      headers: { 'Idempotency-Key': 'id' },
      body: input,
    });
    expect(result).toEqual({
      method: 'PATCH',
      path: '/api/v1/me',
      headers: { 'Idempotency-Key': 'id', 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const file = new Blob(['jpeg'], { type: 'image/jpeg' });
    const photo = prepareAppRequest('uploadPhoto', {
      headers: { 'Idempotency-Key': 'id' },
      body: { file },
    });
    expect(photo.body).toBeInstanceOf(FormData);
    expect(photo.headers['content-type']).toBeUndefined();
    expect((photo.body as FormData).get('file')).toBeInstanceOf(Blob);
  });
  it('fails on missing path values and unknown operations instead of guessing routes', () => {
    expect(() => prepareAppRequest('getPhotoView', {} as never)).toThrow('Missing path parameter');
    expect(() => prepareAppRequest('analyzePhoto' as never, {} as never)).toThrow(
      'Unknown app operation'
    );
  });
});
