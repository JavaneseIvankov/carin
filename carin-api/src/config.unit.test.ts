import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('environment configuration', () => {
  const valid = { APP_ENV: 'dev', DATABASE_URL: 'postgresql://user:pass@localhost:5432/carin' };

  it('loads the minimum required server configuration', () => {
    expect(loadConfig(valid)).toEqual({ appEnv: 'dev', aiMode: 'real', databaseUrl: valid.DATABASE_URL, port: 3000, aiServiceAllowedHosts: [] });
    expect(loadConfig({ ...valid, APP_ENV: 'staging', PORT: '4321' }).port).toBe(4321);
    expect(loadConfig({ ...valid, APP_ENV: 'prod' }).appEnv).toBe('prod');
  });

  it('validates auth secrets, app link scheme, and exact trusted origins together', () => {
    const auth = {
      ...valid,
      BETTER_AUTH_SECRET: 'local-development-secret-with-at-least-32-chars',
      BETTER_AUTH_URL: 'http://localhost:3000',
      AUTH_TRUSTED_ORIGINS: 'carin://,https://app.example.test',
      APP_LINK_SCHEME: 'carin',
    };
    expect(loadConfig(auth)).toMatchObject({
      betterAuthUrl: 'http://localhost:3000',
      authTrustedOrigins: ['carin://', 'https://app.example.test'],
      appLinkScheme: 'carin',
    });
    expect(() => loadConfig({ ...auth, BETTER_AUTH_SECRET: 'short' })).toThrow(/32 characters/);
    expect(() => loadConfig({ ...auth, AUTH_TRUSTED_ORIGINS: 'https://app.example.test' })).toThrow(/APP_LINK_SCHEME/);
    expect(() => loadConfig({ ...auth, AUTH_TRUSTED_ORIGINS: 'https://*.example.test,carin://' })).toThrow(/exact HTTP/);
    expect(() => loadConfig({ ...auth, AUTH_TRUSTED_ORIGINS: 'carin://,https://app.example.test/path' })).toThrow(/exact HTTP/);
    expect(() => loadConfig({ ...auth, BETTER_AUTH_URL: undefined })).toThrow(/configured together/);
    expect(() => loadConfig({ ...auth, APP_ENV: 'staging' })).toThrow(/HTTPS/);
    expect(loadConfig({ ...auth, APP_ENV: 'prod', BETTER_AUTH_URL: 'https://api.example.test' }).betterAuthUrl).toBe('https://api.example.test');
    expect(() => loadConfig({ ...auth, APP_ENV: 'staging', BETTER_AUTH_URL: 'https://api.example.test', AUTH_TRUSTED_ORIGINS: 'carin://,http://app.example.test' })).toThrow(/HTTPS/);
    expect(() => loadConfig({ ...auth, APP_ENV: 'prod', BETTER_AUTH_URL: 'https://api.example.test', AUTH_TRUSTED_ORIGINS: 'carin://,http://app.example.test' })).toThrow(/HTTPS/);
    expect(() => loadConfig({ ...auth, BETTER_AUTH_TRUSTED_ORIGINS: '*' })).toThrow(/BETTER_AUTH_TRUSTED_ORIGINS/);
    expect(() => loadConfig({ ...auth, APP_LINK_SCHEME: 'https', AUTH_TRUSTED_ORIGINS: 'https://,https://app.example.test' })).toThrow(/valid URI scheme/);
  });

  it('allows fixture mode only in dev and fails closed in staging and prod', () => {
    expect(loadConfig({ ...valid, AI_MODE: 'fixture' }).aiMode).toBe('fixture');
    expect(() => loadConfig({ ...valid, APP_ENV: 'staging', AI_MODE: 'fixture' })).toThrow(/AI_MODE/);
    expect(() => loadConfig({ ...valid, APP_ENV: 'prod', AI_MODE: 'fixture' })).toThrow(/AI_MODE/);
  });

  it('requires a configured approved internal host for real AI service URLs', () => {
    expect(() => loadConfig({ ...valid, AI_SERVICE_URL: 'https://public.example', AI_SERVICE_KEY: 'secret' })).toThrow(/allowlist/);
    expect(() => loadConfig({
      ...valid,
      AI_SERVICE_URL: 'https://example.com',
      AI_SERVICE_KEY: 'secret',
      AI_SERVICE_ALLOWED_HOSTS: 'example.com',
    })).toThrow(/internal host/);
    expect(() => loadConfig({
      ...valid,
      AI_SERVICE_URL: 'http://ai-service:8000',
      AI_SERVICE_KEY: 'secret',
      AI_SERVICE_ALLOWED_HOSTS: 'ai-service',
    })).not.toThrow();
    expect(loadConfig({
      ...valid,
      AI_SERVICE_URL: 'http://127.0.0.1:8000',
      AI_SERVICE_KEY: 'secret',
      AI_SERVICE_ALLOWED_HOSTS: '127.0.0.1',
    }).aiServiceUrl).toBe('http://127.0.0.1:8000');
    for (const host of ['169.254.169.254', '[fe80::1]']) {
      expect(() => loadConfig({
        ...valid,
        AI_SERVICE_URL: `http://${host}:8000`,
        AI_SERVICE_KEY: 'secret',
        AI_SERVICE_ALLOWED_HOSTS: host,
      })).toThrow(/internal host/);
    }
  });

  it.each([
    {}, { ...valid, APP_ENV: 'preview' }, { ...valid, DATABASE_URL: '' },
    { ...valid, DATABASE_URL: 'https://localhost/carin' },
    { ...valid, DATABASE_URL: 'postgresql://localhost' },
    { ...valid, PORT: '0' }, { ...valid, PORT: '65536' }, { ...valid, PORT: '3000.5' },
  ])('rejects incomplete or invalid required settings: %j', (env) => {
    expect(() => loadConfig(env)).toThrow();
  });
});
