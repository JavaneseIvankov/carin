import { describe, expect, it } from 'vitest';
import {
  createMediaGrant,
  MEDIA_GRANT_TTL_MS,
  verifyMediaGrant,
} from './grants.js';

const secret = 'media-signing-secret-with-at-least-32-bytes';
const claims = {
  photoId: 'c5961351-8c24-44b4-a95a-293bb4b8906f',
  userId: '686c455b-2a40-4b4b-9f73-c327a3b41ffb',
  environment: 'dev',
};

describe('media read grants', () => {
  it('binds a signed token to its photo, owner, and environment until the five-minute expiry', () => {
    const issuedAt = 1_800_000_000_000;
    const token = createMediaGrant(claims, secret, issuedAt);

    expect(verifyMediaGrant(token, secret, issuedAt + MEDIA_GRANT_TTL_MS - 1)).toEqual({
      ...claims,
      expiresAt: issuedAt + MEDIA_GRANT_TTL_MS,
    });
    expect(verifyMediaGrant(token, secret, issuedAt + MEDIA_GRANT_TTL_MS)).toBeNull();
  });

  it('rejects tampering, a different secret, malformed tokens, and a different environment', () => {
    const token = createMediaGrant(claims, secret, 1_800_000_000_000);
    const [payload, signature] = token.split('.');
    const tampered = `${payload.slice(0, -1)}A.${signature}`;

    expect(verifyMediaGrant(tampered, secret, 1_800_000_000_001)).toBeNull();
    expect(verifyMediaGrant(token, `${secret}!`, 1_800_000_000_001)).toBeNull();
    expect(verifyMediaGrant('one-part-token', secret, 1_800_000_000_001)).toBeNull();
    expect(verifyMediaGrant(token, secret, 1_800_000_000_001, 'prod')).toBeNull();
  });

  it('requires a high-entropy server secret when issuing a grant', () => {
    expect(() => createMediaGrant(claims, 'short', 1_800_000_000_000)).toThrow();
  });

  it('keeps owner, photo, and environment claims opaque in the bearer token', () => {
    const token = createMediaGrant(claims, secret, 1_800_000_000_000);
    const decodedParts = token.split('.').map((part) => Buffer.from(part, 'base64url').toString('utf8'));

    expect(token).not.toContain(claims.photoId);
    expect(token).not.toContain(claims.userId);
    expect(decodedParts.join(' ')).not.toContain(claims.photoId);
    expect(decodedParts.join(' ')).not.toContain(claims.userId);
    expect(decodedParts.join(' ')).not.toContain('"environment":"dev"');
  });
});
