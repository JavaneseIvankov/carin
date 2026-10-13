import { expoClient } from '@better-auth/expo/client';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';
import { requireApiUrl } from '@/lib/config';
import { getAuthEnvironmentConfig } from './environment';

const authEnvironment = getAuthEnvironmentConfig(process.env.EXPO_PUBLIC_ENV ?? 'development');

export const authClient = createAuthClient({
  baseURL: `${requireApiUrl()}/api/auth`,
  plugins: [
    expoClient({
      scheme: authEnvironment.scheme,
      storagePrefix: authEnvironment.storagePrefix,
      cookiePrefix: authEnvironment.cookiePrefix,
      storage: SecureStore,
    }),
  ],
});
