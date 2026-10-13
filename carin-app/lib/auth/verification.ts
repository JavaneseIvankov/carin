export function buildVerificationCallbackUrl(apiBaseUrl: string): string | null {
  try {
    const api = new URL(apiBaseUrl);
    if (api.protocol !== 'https:' || !api.hostname || api.username || api.password) return null;
    return new URL('/auth/verified', api).toString();
  } catch {
    return null;
  }
}
