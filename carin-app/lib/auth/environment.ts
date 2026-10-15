export type AuthEnvironmentConfig = {
  scheme: string;
  storagePrefix: string;
  cookiePrefix: string;
};

const authEnvironments: Record<string, AuthEnvironmentConfig> = {
  development: {
    scheme: 'carin-dev',
    storagePrefix: 'carin-dev',
    cookiePrefix: 'carin-dev',
  },
  dev: {
    scheme: 'carin-dev',
    storagePrefix: 'carin-dev',
    cookiePrefix: 'carin-dev',
  },
  staging: {
    scheme: 'carin-staging',
    storagePrefix: 'carin-staging',
    cookiePrefix: 'carin-staging',
  },
  prod: {
    scheme: 'carin',
    storagePrefix: 'carin-prod',
    cookiePrefix: 'carin-prod',
  },
  production: {
    scheme: 'carin',
    storagePrefix: 'carin-prod',
    cookiePrefix: 'carin-prod',
  },
};

export function getAuthEnvironmentConfig(environment: string): AuthEnvironmentConfig {
  const config = authEnvironments[environment];
  if (!config) {
    throw new Error(`Unknown auth environment: ${environment}`);
  }

  return config;
}
