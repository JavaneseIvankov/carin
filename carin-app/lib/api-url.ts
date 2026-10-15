// Development devices must reach the API on the machine running Expo.
export function resolveDevelopmentApiUrl(baseUrl: string, developmentHost?: string | null) {
  if (!baseUrl || !developmentHost) return baseUrl;
  const url = new URL(baseUrl);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return baseUrl;
  url.hostname = new URL(`http://${developmentHost}`).hostname;
  return url.toString().replace(/\/$/, '');
}

export function resolveDevelopmentMediaUrl(
  mediaUrl: string | null | undefined,
  apiBaseUrl: string,
  environment: string
): string | null {
  if (!mediaUrl) return null;
  if (environment !== 'development') return mediaUrl;

  try {
    const media = new URL(mediaUrl);
    const api = new URL(apiBaseUrl);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(media.hostname)) return mediaUrl;
    return new URL(`${media.pathname}${media.search}${media.hash}`, api.origin).toString();
  } catch {
    return mediaUrl;
  }
}
