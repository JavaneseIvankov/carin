import { describe, expect, it } from 'vitest';
import {
  cachePhotoUri,
  clearPhotoUriCache,
  getCachedPhotoUri,
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
    expect(resolvePhotoMimeType('image/jpeg;not-a-parameter', 'content://media/123', 'meal.png')).toBeNull();
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
