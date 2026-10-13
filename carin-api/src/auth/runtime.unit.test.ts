import { describe, expect, it } from 'vitest';
import type { Database } from '../db/client.js';
import { loadConfig } from '../config.js';
import {
  createAuthRuntime,
  createResetLandingUrl,
  createVerificationLandingUrl,
} from './runtime.js';

describe('Better Auth runtime', () => {
  it('exposes a handler, verified-session resolver, and injectable mail sender', () => {
    const runtime = createAuthRuntime({
      db: undefined as unknown as Database,
      baseURL: 'http://test.local',
      secret: 'test-secret-that-is-long-enough-for-auth',
      trustedOrigins: ['carin-dev://'],
      appEnv: 'dev',
      sendEmail: async () => undefined,
    });

    expect(runtime.auth.handler).toBeTypeOf('function');
    expect(runtime.resolveSession).toBeTypeOf('function');
  });

  it.each([
    { appEnv: 'dev', cookiePrefix: 'carin-dev', appLinkScheme: 'carin-dev' },
    { appEnv: 'staging', cookiePrefix: 'carin-staging', appLinkScheme: 'carin-staging' },
    { appEnv: 'prod', cookiePrefix: 'carin-prod', appLinkScheme: 'carin' },
  ])('uses the $appEnv cookie prefix while preserving auth options', ({ appEnv, cookiePrefix, appLinkScheme }) => {
    const config = loadConfig({
      APP_ENV: appEnv,
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/carin',
      BETTER_AUTH_SECRET: 'test-secret-that-is-long-enough-for-auth',
      BETTER_AUTH_URL: appEnv === 'dev' ? 'http://localhost:3000' : 'https://api.example.test',
      AUTH_TRUSTED_ORIGINS: `${appLinkScheme}://`,
      APP_LINK_SCHEME: appLinkScheme,
    });
    const trustedOrigin = `${appLinkScheme}://`;
    const runtime = createAuthRuntime({
      db: undefined as unknown as Database,
      baseURL: 'http://test.local',
      secret: 'test-secret-that-is-long-enough-for-auth',
      trustedOrigins: config.authTrustedOrigins ?? [],
      appEnv: config.appEnv,
      sendEmail: async () => undefined,
    });

    expect(runtime.auth.options.advanced).toMatchObject({
      cookiePrefix,
      database: { generateId: 'uuid' },
      disableOriginCheck: false,
    });
    expect(runtime.auth.options.trustedOrigins).toEqual([trustedOrigin]);
  });

  it('pins verification and reset links to the fixed HTTPS landing routes', () => {
    const base = 'https://api.example.test';
    const verification = createVerificationLandingUrl(
      'https://api.example.test/api/auth/verify-email?token=opaque&callbackURL=https%3A%2F%2Fevil.example',
      base,
    );
    expect(new URL(verification).searchParams.get('callbackURL')).toBe('https://api.example.test/auth/verified');
    expect(() => createVerificationLandingUrl(
      'https://api.example.test/api/auth/verify-email?token=opaque',
      'https://attacker.example',
    )).toThrow(/AUTH_VERIFICATION_LINK_INVALID/);
    expect(createResetLandingUrl('token+/=', base)).toBe('https://api.example.test/auth/reset?token=token%2B%2F%3D');
  });
});
