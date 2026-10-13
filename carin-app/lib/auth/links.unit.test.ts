import { describe, expect, it } from 'vitest';
import { buildPasswordResetLandingUrl, parsePasswordResetLink } from './links';

describe('parsePasswordResetLink', () => {
  it('extracts a token only from the expected environment scheme and route', () => {
    expect(
      parsePasswordResetLink('carin-staging://auth/reset?token=one%2Btwo%26three', 'carin-staging')
    ).toEqual({ valid: true, token: 'one+two&three' });
  });

  it.each([
    ['missing token', 'carin-dev://auth/reset'],
    ['empty token', 'carin-dev://auth/reset?token='],
    ['duplicate token parameters', 'carin-dev://auth/reset?token=first&token=second'],
    ['wrong scheme', 'carin://auth/reset?token=private-token'],
    ['wrong route', 'carin-dev://auth/verify?token=private-token'],
    ['trailing slash route', 'carin-dev://auth/reset/?token=private-token'],
    ['normalized dot-segment route', 'carin-dev://auth/other/../reset?token=private-token'],
    ['wrong host', 'carin-dev://evil.example/reset?token=private-token'],
  ])('rejects %s without returning token content', (_case, link) => {
    const result = parsePasswordResetLink(link, 'carin-dev');
    expect(result).toMatchObject({ valid: false });
    expect(JSON.stringify(result)).not.toContain('private-token');
    expect(JSON.stringify(result)).not.toContain('first');
    expect(JSON.stringify(result)).not.toContain('second');
  });

  it('rejects malformed URLs without echoing the input', () => {
    const result = parsePasswordResetLink('not a URL private-token', 'carin-dev');
    expect(result).toMatchObject({ valid: false });
    expect(JSON.stringify(result)).not.toContain('private-token');
  });

  it('uses only the fixed HTTPS backend reset landing path', () => {
    expect(
      buildPasswordResetLandingUrl('https://api.example.test/v1?returnTo=https://evil.test')
    ).toBe('https://api.example.test/auth/reset');
    expect(buildPasswordResetLandingUrl('http://localhost:3000')).toBeNull();
    expect(buildPasswordResetLandingUrl('https://user:secret@api.example.test')).toBeNull();
  });
});
