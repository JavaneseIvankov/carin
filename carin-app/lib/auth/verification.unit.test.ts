import { describe, expect, it } from 'vitest';
import { buildVerificationCallbackUrl } from './verification';

describe('buildVerificationCallbackUrl', () => {
  it('rejects the documented local HTTP API URL', () => {
    expect(buildVerificationCallbackUrl('http://localhost:3000')).toBeNull();
  });

  it('builds the fixed HTTPS backend landing URL', () => {
    expect(buildVerificationCallbackUrl('https://api.example.test/api')).toBe(
      'https://api.example.test/auth/verified'
    );
  });

  it('rejects a malformed API URL', () => {
    expect(buildVerificationCallbackUrl('not a URL')).toBeNull();
  });
});
