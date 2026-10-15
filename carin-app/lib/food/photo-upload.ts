export type PhotoUploadStage =
  | 'prepare-native-photo-file'
  | 'fetch-local-photo'
  | 'read-local-photo-blob'
  | 'normalize-local-photo-blob';

type PhotoUploadSource = { uri: string; mimeType: string };
export type NativePhotoFile = PhotoUploadSource & { kind: 'native-file' };
export type PhotoUploadPayload = Blob | NativePhotoFile;
type PhotoUploadOptions = {
  platform: 'native' | 'web';
  fetchLocal?: typeof fetch;
  onStage?: (stage: PhotoUploadStage) => void;
};

/** Uses Expo's native file upload on device and browser Blob conversion on web. */
export async function createPhotoUploadPayload(
  photo: PhotoUploadSource,
  options: PhotoUploadOptions
): Promise<PhotoUploadPayload> {
  if (options.platform === 'native') {
    options.onStage?.('prepare-native-photo-file');
    return { kind: 'native-file', ...photo };
  }

  options.onStage?.('fetch-local-photo');
  const response = await (options.fetchLocal ?? fetch)(photo.uri);
  options.onStage?.('read-local-photo-blob');
  const blob = await response.blob();
  options.onStage?.('normalize-local-photo-blob');
  return new Blob([blob], { type: photo.mimeType });
}
