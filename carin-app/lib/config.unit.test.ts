import { describe, expect, it } from 'vitest';
import { requireApiUrl, apiEnvironment } from './config';

describe('requireApiUrl', () => {
  it('returns baseUrl when configured', () => {
    if (apiEnvironment.baseUrl) {
      expect(requireApiUrl()).toBe(apiEnvironment.baseUrl);
    } else {
      expect(() => requireApiUrl()).toThrow('EXPO_PUBLIC_API_URL belum dikonfigurasi.');
    }
  });
});

