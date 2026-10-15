import { Icon } from '@/components/ui/icon';
import { apiEnvironment } from '@/lib/config';
import { useAppRead } from '@/lib/api/query';
import {
  resolvePhotoDisplayUri,
  shouldRefreshPhotoAfterImageError,
} from '@/lib/food/photo-media';
import { resolveDevelopmentMediaUrl } from '@/lib/api-url';
import { Image as ImageIcon } from 'lucide-react-native';
import * as React from 'react';
import { ActivityIndicator, Image, View } from 'react-native';
import { Text } from '@/components/ui/text';

export function PhotoThumbnail({
  photoId,
  localUri,
  accessibilityLabel,
  fallbackLabel = 'Foto tidak tersedia',
  className = 'h-16 w-16',
  resizeMode = 'cover',
}: {
  photoId: string | null;
  localUri?: string | null;
  accessibilityLabel: string;
  fallbackLabel?: string;
  className?: string;
  resizeMode?: 'cover' | 'contain';
}) {
  const viewQuery = useAppRead(
    'getPhotoView',
    { path: { id: photoId ?? '' } },
    { enabled: !!photoId && !localUri }
  );
  const privateViewUrl = resolveDevelopmentMediaUrl(
    viewQuery.data?.data.url,
    apiEnvironment.baseUrl,
    apiEnvironment.name
  );
  const expiresAt = viewQuery.data?.data.expiresAt;
  const refetchView = viewQuery.refetch;
  const uri = resolvePhotoDisplayUri(localUri, privateViewUrl);
  const [failedUri, setFailedUri] = React.useState<string | null>(null);
  const [refreshedPhotoId, setRefreshedPhotoId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!photoId || localUri || !expiresAt) return;
    const expirationTime = Date.parse(expiresAt);
    if (!Number.isFinite(expirationTime)) return;
    const refreshDelay = Math.max(0, expirationTime - Date.now() - 15_000);
    const timeout = setTimeout(() => void refetchView(), refreshDelay);
    return () => clearTimeout(timeout);
  }, [photoId, localUri, expiresAt, refetchView]);

  const handleImageError = () => {
    if (!uri) return;
    if (localUri || !shouldRefreshPhotoAfterImageError(photoId, refreshedPhotoId)) {
      setFailedUri(uri);
      return;
    }
    setRefreshedPhotoId(photoId);
    void refetchView().then((result) => {
      if (!result.data) setFailedUri(uri);
    });
  };

  return (
    <View
      className={`items-center justify-center overflow-hidden rounded-[16px] border border-border/70 bg-muted ${className}`}>
      {uri && failedUri !== uri ? (
        <Image
          key={uri}
          source={{ uri }}
          resizeMode={resizeMode}
          className="h-full w-full"
          accessibilityLabel={accessibilityLabel}
          onError={handleImageError}
        />
      ) :
      photoId && (viewQuery.isPending || (viewQuery.isFetching && !viewQuery.data)) ? (
        <ActivityIndicator accessibilityLabel="Memuat foto makanan" />
      ) : (
        <View className="items-center gap-0.5 px-1">
          <Icon as={ImageIcon} size={18} className="text-muted-foreground" />
          <Text variant="caption" className="text-center text-muted-foreground">
            {fallbackLabel}
          </Text>
        </View>
      )}
    </View>
  );
}
