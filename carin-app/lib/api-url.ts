// Development devices must reach the API on the machine running Expo.
export function resolveDevelopmentApiUrl(baseUrl: string, developmentHost?: string | null) {
  const normalizedUrl = baseUrl.replace(/\/+$/, '');
  if (!normalizedUrl || !developmentHost) return normalizedUrl;
  const url = new URL(normalizedUrl);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return normalizedUrl;
  url.hostname = new URL(`http://${developmentHost}`).hostname;
  return url.toString().replace(/\/$/, '');
}
