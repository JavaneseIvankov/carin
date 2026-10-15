import { describe, expect, it } from 'vitest';
import { getPhotoPermissionFallback } from './permissions';

describe('photo permission fallback', () => {
  it('offers another source or manual entry after a camera refusal', () => {
    const fallback = getPhotoPermissionFallback('camera', true);
    expect(fallback.showSettings).toBe(false);
    expect(fallback.message).toContain('sumber foto lain');
    expect(fallback.message).toContain('mencatat makanan');
  });

  it('offers Settings after the operating system blocks gallery permission', () => {
    const fallback = getPhotoPermissionFallback('gallery', false);
    expect(fallback.showSettings).toBe(true);
    expect(fallback.message).toContain('Settings');
    expect(fallback.message).toContain('catatan manual');
  });
});
