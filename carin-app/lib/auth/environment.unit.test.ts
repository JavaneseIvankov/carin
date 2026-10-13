import { describe, expect, it } from 'vitest';
import { getAuthEnvironmentConfig } from './environment';

describe('auth environment mapping', () => {
  it.each(['development', 'dev'])('maps %s to development auth prefixes', (environment) => {
    expect(getAuthEnvironmentConfig(environment)).toEqual({
      scheme: 'carin-dev',
      storagePrefix: 'carin-dev',
      cookiePrefix: 'carin-dev',
    });
  });

  it('maps staging to staging auth prefixes', () => {
    expect(getAuthEnvironmentConfig('staging')).toEqual({
      scheme: 'carin-staging',
      storagePrefix: 'carin-staging',
      cookiePrefix: 'carin-staging',
    });
  });

  it.each(['prod', 'production'])('maps %s to production auth prefixes', (environment) => {
    expect(getAuthEnvironmentConfig(environment)).toEqual({
      scheme: 'carin',
      storagePrefix: 'carin-prod',
      cookiePrefix: 'carin-prod',
    });
  });

  it('rejects an unknown environment', () => {
    expect(() => getAuthEnvironmentConfig('preview')).toThrow('Unknown auth environment');
  });
});
