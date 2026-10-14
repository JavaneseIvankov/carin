// Development devices must reach the API on the machine running Expo.
export function resolveDevelopmentApiUrl(baseUrl: string, developmentHost?: string | null) {
  if (!baseUrl || !developmentHost) return baseUrl;
  const url = new URL(baseUrl);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return baseUrl;
  url.hostname = new URL(`http://${developmentHost}`).hostname;
  return url.toString().replace(/\/$/, '');
}
