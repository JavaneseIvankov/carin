import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('environment configuration', () => {
  const valid = { APP_ENV: 'dev', DATABASE_URL: 'postgresql://user:pass@localhost:5432/carin' };

  it('loads the minimum required server configuration', () => {
    expect(loadConfig(valid)).toEqual({ appEnv: 'dev', databaseUrl: valid.DATABASE_URL, port: 3000 });
    expect(loadConfig({ ...valid, APP_ENV: 'staging', PORT: '4321' }).port).toBe(4321);
    expect(loadConfig({ ...valid, APP_ENV: 'prod' }).appEnv).toBe('prod');
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
