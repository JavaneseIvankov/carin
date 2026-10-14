const supportedPhotoMimeTypes = new Set(['image/jpeg', 'image/png']);

const photoUriCache = new Map<string, string>();

export function cachePhotoUri(key: string, uri: string): void {
  if (key && uri) {
    photoUriCache.set(key, uri);
  }
}

export function getCachedPhotoUri(key: string): string | undefined {
  if (!key) return undefined;
  return photoUriCache.get(key);
}

export function clearPhotoUriCache(): void {
  photoUriCache.clear();
}

export function resolvePhotoMimeType(
  mimeType: string | null | undefined,
  uri: string,
  fileName?: string | null
): 'image/jpeg' | 'image/png' | null {
  if (mimeType !== null && mimeType !== undefined) {
    const normalizedMimeType = mimeType.trim().toLowerCase();
    return supportedPhotoMimeTypes.has(normalizedMimeType)
      ? (normalizedMimeType as 'image/jpeg' | 'image/png')
      : null;
  }

  const paths = [fileName, uri.split(/[?#]/, 1)[0]];
  const extensions = paths.map((path) => path?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase());
  if (extensions.includes('png')) return 'image/png';
  if (extensions.includes('jpg') || extensions.includes('jpeg')) return 'image/jpeg';
  return null;
}
