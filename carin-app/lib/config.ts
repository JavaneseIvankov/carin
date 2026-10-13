export const apiEnvironment = {
  name: process.env.EXPO_PUBLIC_ENV ?? 'development',
  baseUrl: process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ?? '',
};

export function requireApiUrl() {
  if (!apiEnvironment.baseUrl) {
    throw new Error('EXPO_PUBLIC_API_URL belum dikonfigurasi.');
  }
  return apiEnvironment.baseUrl;
}
