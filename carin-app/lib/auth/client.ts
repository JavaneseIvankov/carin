import { Platform } from 'react-native';
import { expoClient } from '@better-auth/expo/client';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';
import { requireApiUrl } from '@/lib/config';
import { getAuthEnvironmentConfig } from './environment';

const authEnvironment = getAuthEnvironmentConfig(process.env.EXPO_PUBLIC_ENV ?? 'development');

const memoryStore = new Map<string, string>();

const webStorage = {
  getItem: (key: string): string | null => {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
    return memoryStore.get(key) ?? null;
  },
  getItemAsync: async (key: string): Promise<string | null> => {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
    return memoryStore.get(key) ?? null;
  },
  setItem: (key: string, value: string): void => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    } else {
      memoryStore.set(key, value);
    }
  },
  setItemAsync: async (key: string, value: string): Promise<void> => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    } else {
      memoryStore.set(key, value);
    }
  },
};

const storage = Platform.OS === 'web' ? webStorage : SecureStore;

export const authClient = createAuthClient({
  baseURL: `${requireApiUrl()}/api/auth`,
  plugins: [
    expoClient({
      scheme: authEnvironment.scheme,
      storagePrefix: authEnvironment.storagePrefix,
      cookiePrefix: authEnvironment.cookiePrefix,
      storage,
    }),
  ],
});
