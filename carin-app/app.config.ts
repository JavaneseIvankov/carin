import type { ConfigContext, ExpoConfig } from 'expo/config';

// Expo transpiles this entry file; Node needs the explicit suffix to resolve the TypeScript helper.
const environmentModule =
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Expo needs the .ts suffix.
  require('./lib/auth/environment.ts') as typeof import('./lib/auth/environment');
const { getAuthEnvironmentConfig } = environmentModule;

export default ({ config }: ConfigContext): ExpoConfig => {
  const environment = process.env.EXPO_PUBLIC_ENV ?? 'development';
  const authEnvironment = getAuthEnvironmentConfig(environment);

  // ConfigContext marks static fields optional even though app.json supplies them.
  return {
    ...config,
    scheme: authEnvironment.scheme,
  } as ExpoConfig;
};
