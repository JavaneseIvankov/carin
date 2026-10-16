import { describe, expect, it, vi } from 'vitest';
import {
  deriveIdempotencyKey,
  demoCredentialConfigurationMessage,
  parseDemoSeedEnvironment,
  signInDemoAccount,
} from './api-client.js';

describe('demo seed environment', () => {
  it('provides a safe actionable message when login secrets are missing', () => {
    expect(demoCredentialConfigurationMessage({})).toContain('DEMO_EMAIL dan DEMO_PASSWORD');
    expect(demoCredentialConfigurationMessage({ DEMO_EMAIL: 'showcase@example.test' })).toContain('DEMO_PASSWORD');
    expect(demoCredentialConfigurationMessage({
      DEMO_EMAIL: 'showcase@example.test',
      DEMO_PASSWORD: 'secret-value',
    })).toBeNull();
  });

  it('requires the seed target to be the account used to sign in', () => {
    expect(() => parseDemoSeedEnvironment({
      DEMO_API_URL: 'http://localhost:3000',
      DEMO_EMAIL: 'owner@example.test',
      DEMO_PASSWORD: 'secret-value',
      DEMO_SEED_TARGET_EMAIL: 'other@example.test',
      DATABASE_URL: 'postgresql://localhost/carin',
      APP_ENV: 'dev',
    })).toThrow('DEMO_SEED_TARGET_MISMATCH');
  });

  it('uses the production auth URL and login email when explicit seed values are omitted', () => {
    expect(parseDemoSeedEnvironment({
      BETTER_AUTH_URL: 'https://api.example.test/',
      DEMO_EMAIL: 'showcase@example.test',
      DEMO_PASSWORD: 'secret-value',
      DATABASE_URL: 'postgresql://localhost/carin',
      APP_ENV: 'prod',
      AI_MODE: 'real',
    })).toMatchObject({
      baseUrl: 'https://api.example.test',
      email: 'showcase@example.test',
      targetEmail: 'showcase@example.test',
    });
  });

  it('prefers explicit API URL and target email values when provided', () => {
    expect(parseDemoSeedEnvironment({
      DEMO_API_URL: 'https://seed-api.example.test',
      BETTER_AUTH_URL: 'https://public-api.example.test',
      DEMO_EMAIL: 'showcase@example.test',
      DEMO_PASSWORD: 'secret-value',
      DEMO_SEED_TARGET_EMAIL: 'showcase@example.test',
      DATABASE_URL: 'postgresql://localhost/carin',
      APP_ENV: 'prod',
    })).toMatchObject({ baseUrl: 'https://seed-api.example.test' });
  });

  it('rejects non-http API origins without echoing credentials', () => {
    expect(() => parseDemoSeedEnvironment({
      DEMO_API_URL: 'file:///tmp/api',
      DEMO_EMAIL: 'owner@example.test',
      DEMO_PASSWORD: 'secret-value',
      DEMO_SEED_TARGET_EMAIL: 'owner@example.test',
      DATABASE_URL: 'postgresql://localhost/carin',
      APP_ENV: 'dev',
    })).toThrow('DEMO_API_URL_INVALID');
  });

  it('derives stable UUID idempotency keys for the same operation', () => {
    const first = deriveIdempotencyKey('user-1', 'v1', 'profile:v1', 'update');
    expect(first).toBe(deriveIdempotencyKey('user-1', 'v1', 'profile:v1', 'update'));
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(first).not.toBe(deriveIdempotencyKey('user-1', 'v1', 'profile:v1', 'different'));
  });
});

describe('demo account sign-in', () => {
  it('forwards the session cookie and never includes the response body in an error', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'sensitive-response-body' }), {
        status: 200,
        headers: { 'set-cookie': 'carin-dev.session=opaque; Path=/; HttpOnly' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'AUTH_REQUIRED', message: 'private details' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }));

    const client = await signInDemoAccount({
      baseUrl: 'http://localhost:3000',
      email: 'owner@example.test',
      password: 'secret-value',
      fetchImpl,
    });
    await expect(client.get('/api/v1/me')).rejects.toMatchObject({
      message: 'GET /api/v1/me failed (401 AUTH_REQUIRED)',
    });
    const sentHeaders = fetchImpl.mock.calls[1]?.[1]?.headers as Headers;
    expect(sentHeaders.get('cookie')).toContain('carin-dev.session=opaque');
    expect(fetchImpl.mock.calls[1]?.[1]?.body).toBeUndefined();
  });
});
