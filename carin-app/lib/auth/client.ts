import { Platform } from 'react-native';
import { expoClient } from '@better-auth/expo/client';
import { createAuthClient } from 'better-auth/react';
import { createRequestId } from '@/lib/request-id';
import * as SecureStore from 'expo-secure-store';
import { requireApiUrl } from '@/lib/config';
import { errorLogDetails, logAppEvent } from '@/lib/logging';
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
const requestStarts = new Map<string, number>();

export const authClient = createAuthClient({
  baseURL: `${requireApiUrl()}/api/auth`,
  fetchOptions: {
    onRequest: (context) => {
      const requestId = createRequestId();
      context.headers.set('x-request-id', requestId);
      const url = new URL(context.url.toString(), `${requireApiUrl()}/api/auth`);
      const route = url.pathname.split('/api/auth/')[1] ?? 'root';
      requestStarts.set(requestId, Date.now());
      logAppEvent('info', 'auth.request.started', {
        requestId,
        operation: route,
        method: context.method,
      });
      return context;
    },
    onResponse: ({ response, request }) => {
      const requestId = request.headers.get('x-request-id') ?? 'unknown';
      const url = new URL(request.url.toString(), `${requireApiUrl()}/api/auth`);
      const operation = url.pathname.split('/api/auth/')[1] ?? 'root';
      const startedAt = requestStarts.get(requestId);
      requestStarts.delete(requestId);
      logAppEvent(response.ok ? 'info' : 'warn', 'auth.response.received', {
        requestId: response.headers.get('x-request-id') ?? requestId,
        operation,
        method: request.method,
        status: response.status,
        ...(startedAt ? { durationMs: Date.now() - startedAt } : {}),
      });
    },
    onError: ({ error, request }) => {
      const requestId = request.headers.get('x-request-id') ?? 'unknown';
      const url = new URL(request.url.toString(), `${requireApiUrl()}/api/auth`);
      const operation = url.pathname.split('/api/auth/')[1] ?? 'root';
      const startedAt = requestStarts.get(requestId);
      requestStarts.delete(requestId);
      logAppEvent('error', 'auth.request.failed', {
        requestId,
        operation,
        method: request.method,
        ...(startedAt ? { durationMs: Date.now() - startedAt } : {}),
        ...errorLogDetails(error),
      });
    },
  },
  plugins: [
    expoClient({
      scheme: authEnvironment.scheme,
      storagePrefix: authEnvironment.storagePrefix,
      cookiePrefix: authEnvironment.cookiePrefix,
      storage,
    }),
  ],
});
