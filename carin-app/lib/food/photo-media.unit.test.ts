import { describe, expect, it } from 'vitest';
import {
  cachePhotoUri,
  clearPhotoUriCache,
  getCachedPhotoUri,
  resolvePhotoDisplayUri,
  resolvePhotoMimeType,
} from './photo-media';

describe('photo MIME type resolution', () => {
  it('infers a supported image type from the selected asset extension when MIME is null', () => {
    expect(resolvePhotoMimeType(null, 'file:///photos/meal.PNG?token=abc')).toBe('image/png');
    expect(resolvePhotoMimeType(null, 'content://media/123', 'meal.jpg')).toBe('image/jpeg');
  });

  it('rejects unknown image bytes instead of labeling them as JPEG', () => {
    expect(resolvePhotoMimeType(null, 'file:///photos/meal')).toBeNull();
    expect(resolvePhotoMimeType('image/heic', 'file:///photos/meal')).toBeNull();
    expect(resolvePhotoMimeType('image/heic', 'content://media/123', 'meal.jpg')).toBeNull();
    expect(resolvePhotoMimeType('', 'content://media/123', 'meal.jpg')).toBeNull();
    expect(resolvePhotoMimeType('  ', 'content://media/123', 'meal.jpg')).toBeNull();
    expect(resolvePhotoMimeType(';foo', 'content://media/123', 'meal.jpg')).toBeNull();
    expect(
      resolvePhotoMimeType('image/jpeg;not-a-parameter', 'content://media/123', 'meal.png')
    ).toBeNull();
    expect(resolvePhotoMimeType('image/png;=', 'content://media/123', 'meal.jpg')).toBeNull();
  });
});

describe('photo URI cache', () => {
  it('stores and retrieves photo URIs by key', () => {
    clearPhotoUriCache();
    expect(getCachedPhotoUri('job-123')).toBeUndefined();
    cachePhotoUri('job-123', 'file:///photos/meal.jpg');
    expect(getCachedPhotoUri('job-123')).toBe('file:///photos/meal.jpg');
  });

  it('handles empty keys safely', () => {
    expect(getCachedPhotoUri('')).toBeUndefined();
  });
});

describe('photo display source', () => {
  it('prefers the selected local photo and falls back to a private view URL', () => {
    expect(
      resolvePhotoDisplayUri(
        'file:///photos/current.jpg',
        'https://api.test/private.jpg?token=short-lived'
      )
    ).toBe('file:///photos/current.jpg');
    expect(resolvePhotoDisplayUri(null, 'https://api.test/private.jpg?token=short-lived')).toBe(
      'https://api.test/private.jpg?token=short-lived'
    );
  });

  it('returns no source when the photo is unavailable', () => {
    expect(resolvePhotoDisplayUri(null, null)).toBeNull();
    expect(resolvePhotoDisplayUri('  ', '  ')).toBeNull();
  });
});
