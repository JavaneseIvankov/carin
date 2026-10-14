import Constants from 'expo-constants';
import { resolveDevelopmentApiUrl } from './api-url';

const environment = process.env.EXPO_PUBLIC_ENV ?? 'development';
const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ?? '';

export const apiEnvironment = {
  name: environment,
  baseUrl:
    environment === 'development'
      ? resolveDevelopmentApiUrl(configuredUrl, Constants.expoConfig?.hostUri)
      : configuredUrl,
};

export function requireApiUrl() {
  if (!apiEnvironment.baseUrl) {
    throw new Error('EXPO_PUBLIC_API_URL belum dikonfigurasi.');
  }
  return apiEnvironment.baseUrl;
}
