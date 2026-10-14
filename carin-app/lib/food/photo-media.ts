const supportedPhotoMimeTypes = new Set(['image/jpeg', 'image/png']);

export function resolvePhotoMimeType(
  mimeType: string | null | undefined,
  uri: string,
  fileName?: string | null
): 'image/jpeg' | 'image/png' | null {
  const normalizedMimeType = mimeType?.split(';', 1)[0]?.trim().toLowerCase();
  if (normalizedMimeType) {
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
