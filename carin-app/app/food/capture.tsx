import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { PhotoThumbnail } from '@/components/food/photo-thumbnail';
import { useAppRead, useAppRepository, useAppWrite } from '@/lib/api/query';
import { useAppData } from '@/lib/data/provider';
import { getPhotoPermissionFallback } from '@/lib/food/permissions';
import { cachePhotoUri, resolvePhotoMimeType } from '@/lib/food/photo-media';
import { createPhotoUploadPayload, type PhotoUploadStage } from '@/lib/food/photo-upload';
import {
  createScanActions,
  createScanActionState,
  type ScanActionStage,
} from '@/lib/food/scan-actions';
import {
  createIdempotencyKey,
  createStableActionKey,
  getAiConsentStatus,
} from '@/lib/profile/profile';
import { cn } from '@/lib/utils';
import { errorLogDetails, logAppEvent } from '@/lib/logging';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import {
  AlertCircle,
  Camera,
  Check,
  Image as ImageIcon,
  Info,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  Utensils,
  X,
  Zap,
  ZapOff,
} from 'lucide-react-native';
import * as React from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type PhotoDraft = { id: string; uri: string; mimeType: string };
type PermissionFallback = {
  message: string;
  showSettings: boolean;
  alternateSource: 'camera' | 'gallery';
};

export default function Capture() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const repository = useAppRepository();
  const { connectivity } = useAppData();
  const meQuery = useAppRead('getMe', {});
  const legalQuery = useAppRead('getLegalRegistry', {});
  const saveConsent = useAppWrite('setAiConsent');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = React.useRef<CameraView>(null);
  const [cameraReady, setCameraReady] = React.useState(false);
  const [torch, setTorch] = React.useState(false);
  const [photo, setPhoto] = React.useState<PhotoDraft | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [permissionFallback, setPermissionFallback] = React.useState<PermissionFallback | null>(
    null
  );
  const [consentChecked, setConsentChecked] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [takingPhoto, setTakingPhoto] = React.useState(false);
  const [consentKeys] = React.useState(() => createStableActionKey());
  const [actionState] = React.useState(() => createScanActionState());
  const actions = React.useMemo(
    () =>
      repository
        ? createScanActions(
            {
              uploadPhoto: (input) => repository.write('uploadPhoto', input),
              uploadPhotoFile: (input, file) => repository.uploadPhotoFile(input, file),
              createPhotoAnalysis: (input) => repository.write('createPhotoAnalysis', input),
              retryAnalysisJob: (input) => repository.write('retryAnalysisJob', input),
            },
            undefined,
            actionState
          )
        : null,
    [repository, actionState]
  );

  const account = meQuery.data?.data;
  const legal = legalQuery.data?.data;
  const consentCurrent =
    getAiConsentStatus(
      account?.aiConsent ?? { version: null, granted: false },
      legal && !legalQuery.data?.stale ? legal.aiProcessing.version : null
    ) === 'active';

  // Request camera permission on mount if needed
  React.useEffect(() => {
    if (cameraPermission && !cameraPermission.granted && cameraPermission.canAskAgain) {
      void requestCameraPermission();
    }
  }, [cameraPermission, requestCameraPermission]);

  const openManual = () => router.push('/consumptions/new');

  const selectFromGallery = async () => {
    setMessage(null);
    setPermissionFallback(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPermissionFallback({
        ...getPhotoPermissionFallback('gallery', permission.canAskAgain),
        alternateSource: 'camera',
      });
      return;
    }
    const selection = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.9,
    });
    const asset = selection.canceled ? null : selection.assets[0];
    if (asset) {
      const mimeType = resolvePhotoMimeType(asset.mimeType, asset.uri, asset.fileName);
      if (!mimeType) {
        setPhoto(null);
        setMessage('Format foto belum didukung. Pilih foto JPEG atau PNG.');
        return;
      }
      setPhoto({
        id: createIdempotencyKey(),
        uri: asset.uri,
        mimeType,
      });
      setTorch(false);
    }
  };

  const takePhoto = async () => {
    if (busy || takingPhoto) return;
    const camera = cameraRef.current;
    if (!cameraReady || !camera) {
      setMessage('Kamera sedang disiapkan. Coba lagi sebentar.');
      return;
    }

    setMessage(null);
    setTakingPhoto(true);
    try {
      const image = await camera.takePictureAsync({ quality: 0.9 });
      if (image?.uri) {
        setPhoto({ id: createIdempotencyKey(), uri: image.uri, mimeType: 'image/jpeg' });
        setTorch(false);
      } else {
        setMessage('Foto belum berhasil diambil. Silakan coba lagi.');
      }
    } catch {
      setMessage('Gagal mengambil foto. Silakan coba lagi.');
    } finally {
      setTakingPhoto(false);
    }
  };

  const retakePhoto = () => {
    if (busy) return;
    setPhoto(null);
    setMessage(null);
  };

  const analyze = async () => {
    if (!photo || !actions || busy) return;
    setMessage(null);
    setBusy(true);
    let failureStage: 'refresh-consent' | PhotoUploadStage | ScanActionStage = 'refresh-consent';
    try {
      let isConsentActive = consentCurrent;
      if (!isConsentActive && consentChecked) {
        const latestLegal = await legalQuery.refetch();
        if (!latestLegal.isSuccess || latestLegal.data.stale) {
          setMessage(
            'Dokumen persetujuan terbaru belum dapat dimuat. Coba lagi sebelum menyetujui.'
          );
          setBusy(false);
          return;
        }
        const body = { version: latestLegal.data.data.aiProcessing.version, granted: true };
        await saveConsent.mutateAsync({
          headers: { 'Idempotency-Key': consentKeys.forPayload(body) },
          body,
        });
        consentKeys.clear();
        await meQuery.refetch();
        isConsentActive = true;
      }

      const [latestAccount, latestLegal] = await Promise.all([
        meQuery.refetch(),
        legalQuery.refetch(),
      ]);
      const consentIsCurrent =
        latestAccount.isSuccess &&
        !latestAccount.data.stale &&
        latestLegal.isSuccess &&
        !latestLegal.data.stale &&
        getAiConsentStatus(
          latestAccount.data.data.aiConsent,
          latestLegal.data.data.aiProcessing.version
        ) === 'active';
      if (!consentIsCurrent) {
        setConsentChecked(false);
        setMessage('Persetujuan pemrosesan AI versi terbaru diperlukan sebelum analisis dimulai.');
        return;
      }
      const typedBlob = await createPhotoUploadPayload(photo, {
        platform: Platform.OS === 'web' ? 'web' : 'native',
        onStage: (stage) => {
          failureStage = stage;
        },
      });
      const job = await actions.start(typedBlob, photo.id, consentIsCurrent, (stage) => {
        failureStage = stage;
      });
      cachePhotoUri(job.id, photo.uri);
      if (job.scanId) {
        cachePhotoUri(job.scanId, photo.uri);
      }
      router.replace({
        pathname: '/food/analysis/[id]',
        params: { id: job.id, photoUri: photo.uri },
      });
    } catch (error) {
      logAppEvent('error', 'food.photo_analysis.start_failed', {
        stage: failureStage,
        ...errorLogDetails(error),
      });
      setMessage(
        error instanceof Error && /persetujuan/i.test(error.message)
          ? 'Setujui pemrosesan AI versi terbaru sebelum analisis dimulai.'
          : 'Foto belum berhasil dianalisis. Periksa koneksi lalu coba lagi.'
      );
    } finally {
      setBusy(false);
    }
  };

  // State 1: Photo captured or selected -> Viewfinder background with slide-up Drawer
  if (photo) {
    return (
      <View className="flex-1 bg-background">
        <Drawer
          isOpen={Boolean(photo)}
          onClose={retakePhoto}
          title="Foto siap dianalisis"
          showCloseButton={!busy}
          footer={
            <View className="gap-2">
              <Button
                variant="tactile"
                onPress={analyze}
                disabled={
                  busy || connectivity === 'offline' || (!consentCurrent && !consentChecked)
                }
                accessibilityLabel="Analisis makanan sekarang">
                {busy ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <Icon as={Sparkles} size={20} className="mr-2 text-primary-foreground" />
                    <Text>
                      {!consentCurrent && consentChecked
                        ? 'Setujui & Analisis Sekarang'
                        : 'Analisis Makanan Sekarang'}
                    </Text>
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                onPress={retakePhoto}
                disabled={busy}
                accessibilityLabel="Ambil ulang foto">
                <Icon as={RotateCcw} size={16} className="mr-1.5 text-muted-foreground" />
                <Text variant="muted">Ambil ulang foto</Text>
              </Button>
            </View>
          }>
          <View className="gap-3 py-1">
            <View className="flex-row items-center gap-3.5 rounded-summary border border-border/70 bg-muted/30 p-3">
              <PhotoThumbnail
                photoId={null}
                localUri={photo.uri}
                accessibilityLabel="Thumbnail foto yang akan dikirim untuk analisis AI"
                className="h-24 w-24"
                resizeMode="contain"
              />
              <View className="flex-1 gap-1">
                <Text className="font-semibold text-foreground">Foto yang akan dikirim</Text>
                <Text variant="caption" className="text-muted-foreground">
                  Pastikan makanan terlihat jelas sebelum memulai analisis.
                </Text>
              </View>
            </View>

            {!consentCurrent ? (
              <View className="gap-3 rounded-summary border border-border/80 bg-card p-4">
                <View className="flex-row items-center gap-2.5">
                  <View className="h-8 w-8 items-center justify-center rounded-full bg-carin-butter">
                    <Icon as={ShieldCheck} size={18} className="text-foreground" />
                  </View>
                  <Text variant="large">Persetujuan Pemrosesan AI</Text>
                </View>
                <Text variant="muted">
                  Foto makanan akan diproses untuk menyiapkan estimasi porsi dan komponen gizi.
                  Persetujuan ini terpisah dari syarat penggunaan dan dapat kamu sesuaikan kapan
                  saja di Pengaturan.
                </Text>

                <Pressable
                  onPress={() => router.push('/legal/ai-processing')}
                  accessibilityRole="button"
                  accessibilityLabel="Baca penjelasan pemrosesan AI"
                  className="flex-row items-center gap-1.5 self-start py-1 active:opacity-75">
                  <Icon as={Info} size={15} className="text-primary" />
                  <Text className="text-xs font-semibold text-primary underline underline-offset-2">
                    Baca penjelasan pemrosesan AI
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: consentChecked }}
                  accessibilityLabel="Saya menyetujui pemrosesan AI"
                  onPress={() => setConsentChecked(!consentChecked)}
                  className="flex-row items-center gap-3 rounded-control border border-border/60 bg-muted/20 p-3 active:bg-muted/40">
                  <View
                    className={`h-5 w-5 items-center justify-center rounded border ${
                      consentChecked ? 'border-primary bg-primary' : 'border-border/80 bg-card'
                    }`}>
                    {consentChecked ? (
                      <Icon as={Check} size={14} className="text-primary-foreground" />
                    ) : null}
                  </View>
                  <Text className="flex-1 text-sm font-medium text-foreground">
                    Saya menyetujui pemrosesan AI
                  </Text>
                </Pressable>

                {legalQuery.isPending ? (
                  <ActivityIndicator accessibilityLabel="Memuat dokumen persetujuan" />
                ) : null}
              </View>
            ) : (
              <View className="flex-row items-center gap-3 rounded-summary border border-border/50 bg-muted/40 p-3.5">
                <View className="h-10 w-10 items-center justify-center rounded-full bg-carin-olive-soft">
                  <Icon as={Utensils} size={20} className="text-primary" />
                </View>
                <View className="flex-1">
                  <Text className="font-semibold text-foreground">
                    AI siap menganalisis makanan
                  </Text>
                  <Text variant="caption" className="mt-0.5 text-muted-foreground">
                    Pastikan seluruh bagian makanan terlihat jelas di dalam piring.
                  </Text>
                </View>
              </View>
            )}

            {message ? (
              <View className="rounded-[16px] border border-border bg-muted/60 p-3">
                <Text accessibilityRole="alert" className="text-sm text-foreground">
                  {message}
                </Text>
              </View>
            ) : null}

            {connectivity === 'offline' ? (
              <Text variant="muted" className="text-center text-xs">
                Koneksi internet diperlukan untuk memulai analisis foto makanan.
              </Text>
            ) : null}
          </View>
        </Drawer>
      </View>
    );
  }

  // State 2: Camera permissions loading
  if (!cameraPermission) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <ActivityIndicator size="large" color="white" />
      </View>
    );
  }

  // State 3: Camera permission denied -> friendly fallback
  if (!cameraPermission.granted) {
    return (
      <View className="flex-1 bg-background">
        <View
          style={{ paddingTop: Math.max(insets.top, 16) }}
          className="flex-row items-center px-5 pb-2">
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Kembali"
            hitSlop={12}
            className="h-10 w-10 items-center justify-center rounded-full bg-muted/50 active:bg-muted">
            <Icon as={X} size={20} className="text-foreground" />
          </Pressable>
        </View>

        <ScrollView
          contentContainerClassName="flex-1 items-center justify-center px-6 py-6"
          keyboardShouldPersistTaps="handled">
          <View className="w-full max-w-sm items-center gap-5 rounded-[24px] border border-border bg-card p-6 shadow-sm">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-carin-olive-soft">
              <Icon as={Camera} size={32} className="text-primary" />
            </View>

            <View className="items-center gap-1.5">
              <Text variant="h2" className="text-center">
                Akses Kamera Diperlukan
              </Text>
              <Text variant="muted" className="text-center">
                {getPhotoPermissionFallback('camera', cameraPermission.canAskAgain).message}
              </Text>
            </View>

            <View className="w-full gap-2.5 pt-2">
              {!cameraPermission.canAskAgain ? (
                <Button
                  variant="tactile"
                  onPress={() => void Linking.openSettings()}
                  accessibilityLabel="Buka pengaturan">
                  <Icon as={Settings} size={18} className="mr-2 text-primary-foreground" />
                  <Text>Buka Pengaturan</Text>
                </Button>
              ) : (
                <Button
                  variant="tactile"
                  onPress={() => void requestCameraPermission()}
                  accessibilityLabel="Izinkan akses kamera">
                  <Icon as={Camera} size={18} className="mr-2 text-primary-foreground" />
                  <Text>Izinkan Akses Kamera</Text>
                </Button>
              )}

              <Button
                variant="tactile-secondary"
                onPress={() => void selectFromGallery()}
                accessibilityLabel="Pilih dari galeri">
                <Icon as={ImageIcon} size={18} className="mr-2 text-secondary-foreground" />
                <Text>Pilih dari Galeri</Text>
              </Button>
            </View>

            <Button
              variant="ghost"
              onPress={openManual}
              className="mt-1"
              accessibilityLabel="Catat makanan secara manual">
              <Icon as={Utensils} size={16} className="mr-1.5 text-muted-foreground" />
              <Text variant="muted">Makanan sudah dimakan? Catat manual</Text>
            </Button>
          </View>

          {message ? (
            <View className="mt-4 w-full max-w-sm rounded-[16px] border border-border bg-muted/60 p-3">
              <Text accessibilityRole="alert" className="text-center text-sm text-foreground">
                {message}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
    );
  }

  // State 4: Live viewfinder (Default when permission granted)
  return (
    <View className="flex-1 bg-black">
      <CameraView
        ref={cameraRef}
        style={{ flex: 1 }}
        facing="back"
        enableTorch={torch}
        onCameraReady={() => setCameraReady(true)}
        onMountError={({ message: errorMessage }) =>
          setMessage(`Kamera gagal dimulai: ${errorMessage}`)
        }
      />

      {/* Viewfinder Overlays */}
      <View className="absolute inset-0 justify-between">
        {/* Top bar: ✕ Back/Close button (left), Flash/Torch toggle button (right) */}
        <View
          style={{ paddingTop: Math.max(insets.top, 16) }}
          className="flex-row items-center justify-between px-6 pb-4">
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Tutup kamera"
            hitSlop={12}
            className="h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/40 active:bg-black/60">
            <Icon as={X} size={20} className="text-white" />
          </Pressable>

          <Pressable
            onPress={() => setTorch((t) => !t)}
            accessibilityRole="button"
            accessibilityLabel={torch ? 'Matikan lampu kilat' : 'Nyalakan lampu kilat'}
            hitSlop={12}
            className={cn(
              'h-11 w-11 items-center justify-center rounded-full border active:opacity-80',
              torch ? 'border-amber-300 bg-amber-400' : 'border-white/20 bg-black/40'
            )}>
            <Icon
              as={torch ? Zap : ZapOff}
              size={20}
              className={torch ? 'text-black' : 'text-white'}
            />
          </Pressable>
        </View>

        {/* Food framing guide: corner brackets + helper text */}
        <View pointerEvents="none" className="items-center justify-center px-8">
          <View className="relative h-64 max-h-[75vw] w-64 max-w-[75vw] items-center justify-center">
            <View className="absolute left-0 top-0 h-8 w-8 rounded-tl-2xl border-l-[3px] border-t-[3px] border-white/90" />
            <View className="absolute right-0 top-0 h-8 w-8 rounded-tr-2xl border-r-[3px] border-t-[3px] border-white/90" />
            <View className="absolute bottom-0 left-0 h-8 w-8 rounded-bl-2xl border-b-[3px] border-l-[3px] border-white/90" />
            <View className="absolute bottom-0 right-0 h-8 w-8 rounded-br-2xl border-b-[3px] border-r-[3px] border-white/90" />
          </View>
          <View className="mt-5 rounded-full bg-black/60 px-4 py-1.5 backdrop-blur-md">
            <Text className="text-center text-xs font-medium text-white/90">
              Posisikan makanan di tengah bingkai
            </Text>
          </View>
        </View>

        {/* Bottom action bar */}
        <View
          style={{ paddingBottom: Math.max(insets.bottom, 20) }}
          className="bg-black/30 px-6 pt-4 backdrop-blur-sm">
          <View className="flex-row items-center justify-between px-4">
            {/* Gallery picker */}
            <Pressable
              onPress={() => void selectFromGallery()}
              accessibilityRole="button"
              accessibilityLabel="Pilih dari galeri"
              className="h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-black/40 active:scale-95">
              <Icon as={ImageIcon} size={22} className="text-white" />
            </Pressable>

            {/* Shutter button */}
            <Pressable
              onPress={() => void takePhoto()}
              disabled={!cameraReady || takingPhoto}
              accessibilityRole="button"
              accessibilityLabel={takingPhoto ? 'Mengambil foto' : 'Ambil foto makanan'}
              accessibilityState={{ disabled: !cameraReady || takingPhoto }}
              className="h-20 w-20 items-center justify-center rounded-full border-4 border-white shadow-lg active:scale-95 disabled:opacity-60">
              <View className="h-16 w-16 items-center justify-center rounded-full bg-white">
                {takingPhoto ? <ActivityIndicator color="#303526" /> : null}
              </View>
            </Pressable>

            {/* Manual log button */}
            <Pressable
              onPress={openManual}
              accessibilityRole="button"
              accessibilityLabel="Catat makanan secara manual"
              className="h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-black/40 active:scale-95">
              <Icon as={Utensils} size={20} className="text-white" />
            </Pressable>
          </View>

          {/* Subtle link below */}
          <Pressable
            onPress={openManual}
            accessibilityRole="button"
            accessibilityLabel="Catat manual tanpa foto"
            className="mt-3 items-center py-1 active:opacity-70">
            <Text className="text-xs font-medium text-white/75">
              Makanan sudah dimakan? Catat secara manual
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Gallery error or message fallback if any */}
      {permissionFallback ? (
        <View
          style={{ top: Math.max(insets.top + 60, 76) }}
          className="absolute left-4 right-4 z-20 gap-3 rounded-[20px] border border-border bg-card/95 p-4 shadow-xl backdrop-blur-md"
          accessibilityRole="alert">
          <View className="flex-row items-center gap-2">
            <Icon as={AlertCircle} size={20} className="text-muted-foreground" />
            <Text className="flex-1 font-medium text-foreground">{permissionFallback.message}</Text>
            <Pressable onPress={() => setPermissionFallback(null)} hitSlop={8}>
              <Icon as={X} size={16} className="text-muted-foreground" />
            </Pressable>
          </View>
          {permissionFallback.showSettings ? (
            <Button
              variant="outline"
              className="rounded-[16px]"
              onPress={() => void Linking.openSettings()}>
              <Icon as={Settings} size={16} className="mr-1.5 text-foreground" />
              <Text>Buka Settings</Text>
            </Button>
          ) : null}
        </View>
      ) : null}

      {message ? (
        <View
          style={{ top: Math.max(insets.top + 60, 76) }}
          className="absolute left-4 right-4 z-20 rounded-[16px] border border-border bg-card/95 p-3 shadow-xl backdrop-blur-md">
          <Text accessibilityRole="alert" className="text-sm text-foreground">
            {message}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
