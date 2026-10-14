function getExpoDevHost(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require('expo-constants');
    const config = Constants?.default ?? Constants;
    const hostUri =
      config?.expoConfig?.hostUri ??
      config?.manifest2?.extra?.expoClient?.hostUri;
    if (hostUri && typeof hostUri === 'string') {
      return hostUri.split(':')[0] || null;
    }
    return null;
  } catch {
    return null;
  }
}

export function resolveApiUrl(rawUrl: string, overrideDevHost?: string | null): string {
  const url = rawUrl.replace(/\/+$/, '');
  const devHost = overrideDevHost !== undefined ? overrideDevHost : getExpoDevHost();
  if (process.env.NODE_ENV !== 'production' && url.includes('localhost') && devHost) {
    return url.replace('localhost', devHost);
  }
  return url;
}

export const apiEnvironment = {
  name: process.env.EXPO_PUBLIC_ENV ?? 'development',
  baseUrl: resolveApiUrl(process.env.EXPO_PUBLIC_API_URL ?? ''),
};

export function requireApiUrl() {
  if (!apiEnvironment.baseUrl) {
    throw new Error('EXPO_PUBLIC_API_URL belum dikonfigurasi.');
  }
  return apiEnvironment.baseUrl;
}
