import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAppRead, useAppRepository, useAppWrite } from '@/lib/api/query';
import { useAppData } from '@/lib/data/provider';
import {
  createIdempotencyKey,
  createStableActionKey,
  getAiConsentStatus,
} from '@/lib/profile/profile';
import { createScanActionState, createScanActions } from '@/lib/food/scan-actions';
import { getPhotoPermissionFallback } from '@/lib/food/permissions';
import { cachePhotoUri, resolvePhotoMimeType } from '@/lib/food/photo-media';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as React from 'react';
import { ActivityIndicator, Image, ScrollView, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import {
  AlertCircle,
  Camera,
  Image as ImageIcon,
  Info,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  Utensils,
  X,
} from 'lucide-react-native';

type PhotoDraft = { id: string; uri: string; mimeType: string };
type PermissionFallback = {
  message: string;
  showSettings: boolean;
  alternateSource: 'camera' | 'gallery';
};

export default function Capture() {
  const router = useRouter();
  const repository = useAppRepository();
  const { connectivity } = useAppData();
  const meQuery = useAppRead('getMe', {});
  const legalQuery = useAppRead('getLegalRegistry', {});
  const saveConsent = useAppWrite('setAiConsent');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [cameraOpen, setCameraOpen] = React.useState(false);
  const cameraRef = React.useRef<CameraView>(null);
  const [photo, setPhoto] = React.useState<PhotoDraft | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [permissionFallback, setPermissionFallback] = React.useState<PermissionFallback | null>(
    null
  );
  const [consentChecked, setConsentChecked] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [consentKeys] = React.useState(() => createStableActionKey());
  const [actionState] = React.useState(() => createScanActionState());
  const actions = React.useMemo(
    () =>
      repository
        ? createScanActions(
            {
              uploadPhoto: (input) => repository.write('uploadPhoto', input),
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
    }
  };

  const openCamera = async () => {
    setMessage(null);
    setPermissionFallback(null);
    const permission = cameraPermission?.granted
      ? cameraPermission
      : await requestCameraPermission();
    if (!permission.granted) {
      setPermissionFallback({
        ...getPhotoPermissionFallback('camera', permission.canAskAgain),
        alternateSource: 'gallery',
      });
      return;
    }
    setCameraOpen(true);
  };

  const takePhoto = async () => {
    const image = await cameraRef.current?.takePictureAsync({ quality: 0.9 });
    if (image?.uri) {
      setPhoto({ id: createIdempotencyKey(), uri: image.uri, mimeType: 'image/jpeg' });
      setCameraOpen(false);
    }
  };

  const grantConsent = async () => {
    if (!legal || legalQuery.data?.stale || !consentChecked) return;
    try {
      const latestLegal = await legalQuery.refetch();
      if (!latestLegal.isSuccess || latestLegal.data.stale) {
        setMessage('Dokumen persetujuan terbaru belum dapat dimuat. Coba lagi sebelum menyetujui.');
        return;
      }
      const body = { version: latestLegal.data.data.aiProcessing.version, granted: true };
      await saveConsent.mutateAsync({
        headers: { 'Idempotency-Key': consentKeys.forPayload(body) },
        body,
      });
      consentKeys.clear();
      setConsentChecked(false);
      await meQuery.refetch();
      setMessage('Persetujuan tersimpan. Tekan Analisis makanan untuk melanjutkan.');
    } catch {
      setMessage('Persetujuan belum tersimpan. Periksa koneksi lalu coba lagi.');
    }
  };

  const analyze = async () => {
    if (!photo || !actions || busy) return;
    setMessage(null);
    setBusy(true);
    try {
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
      const response = await fetch(photo.uri);
      const blob = await response.blob();
      const typedBlob = new Blob([blob], { type: photo.mimeType });
      const job = await actions.start(typedBlob, photo.id, consentIsCurrent);
      cachePhotoUri(job.id, photo.uri);
      if (job.scanId) {
        cachePhotoUri(job.scanId, photo.uri);
      }
      router.replace({ pathname: '/food/analysis/[id]', params: { id: job.id, photoUri: photo.uri } });
    } catch (error) {
      setMessage(
        error instanceof Error && /persetujuan/i.test(error.message)
          ? 'Setujui pemrosesan AI versi terbaru sebelum analisis dimulai.'
          : 'Foto belum berhasil dianalisis. Periksa koneksi lalu coba lagi.'
      );
    } finally {
      setBusy(false);
    }
  };

  if (cameraOpen) {
    return (
      <View className="flex-1 bg-black">
        <CameraView ref={cameraRef} className="flex-1" facing="back" />
        <View className="gap-3 border-t border-border bg-background px-5 py-5">
          <Button
            variant="tactile"
            onPress={takePhoto}
            accessibilityLabel="Ambil foto makanan">
            <Icon as={Camera} size={20} className="mr-2 text-primary-foreground" />
            <Text>Ambil foto</Text>
          </Button>
          <Button
            variant="outline"
            className="rounded-[20px]"
            onPress={() => setCameraOpen(false)}>
            <Icon as={X} size={18} className="mr-1.5 text-foreground" />
            <Text>Tutup kamera</Text>
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerClassName="gap-5 px-5 py-8">
        <View className="gap-2">
          <View className="flex-row items-center gap-2.5">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-carin-olive-soft">
              <Icon as={Camera} size={20} className="text-primary" />
            </View>
            <Text variant="h1">Foto Makanan</Text>
          </View>
          <Text variant="muted">
            Ambil foto makanan untuk melihat perkiraan komponen dan kandungan gizi. Hasil analisis foto ini tidak langsung mencatat konsumsi makananmu.
          </Text>
        </View>

        {photo ? (
          <View className="gap-3">
            <View className="overflow-hidden rounded-[20px] border border-border bg-card shadow-sm">
              <Image
                source={{ uri: photo.uri }}
                resizeMode="cover"
                accessibilityLabel="Pratinjau foto makanan"
                className="h-72 w-full"
              />
            </View>
            <Button
              variant="outline"
              className="rounded-[20px]"
              onPress={() => setPhoto(null)}>
              <Icon as={RotateCcw} size={16} className="mr-1.5 text-foreground" />
              <Text>Pilih foto lain</Text>
            </Button>
          </View>
        ) : (
          <View className="gap-4 rounded-[20px] border border-border bg-card p-5 shadow-sm">
            <View className="gap-1">
              <Text variant="large">Pilih Sumber Foto</Text>
              <Text variant="muted">
                Foto makanan yang masih tersedia di piring atau kemasan untuk perkiraan gizi.
              </Text>
            </View>
            <View className="gap-3">
              <Button
                variant="tactile"
                onPress={openCamera}
                accessibilityLabel="Buka kamera">
                <Icon as={Camera} size={20} className="mr-2 text-primary-foreground" />
                <Text>Buka kamera</Text>
              </Button>
              <Button
                variant="tactile-secondary"
                onPress={selectFromGallery}
                accessibilityLabel="Pilih dari galeri">
                <Icon as={ImageIcon} size={20} className="mr-2 text-secondary-foreground" />
                <Text>Pilih dari galeri</Text>
              </Button>
            </View>
          </View>
        )}

        {permissionFallback ? (
          <View
            className="gap-3 rounded-[20px] border border-border bg-card p-4 shadow-sm"
            accessibilityRole="alert">
            <View className="flex-row items-center gap-2">
              <Icon as={AlertCircle} size={20} className="text-muted-foreground" />
              <Text className="flex-1 font-medium">{permissionFallback.message}</Text>
            </View>
            <View className="gap-2">
              {permissionFallback.showSettings ? (
                <Button
                  variant="outline"
                  className="rounded-[16px]"
                  onPress={() => void Linking.openSettings()}>
                  <Icon as={Settings} size={16} className="mr-1.5 text-foreground" />
                  <Text>Buka Settings</Text>
                </Button>
              ) : null}
              {permissionFallback.alternateSource === 'gallery' ? (
                <Button
                  variant="outline"
                  className="rounded-[16px]"
                  onPress={() => void selectFromGallery()}>
                  <Icon as={ImageIcon} size={16} className="mr-1.5 text-foreground" />
                  <Text>Coba galeri</Text>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="rounded-[16px]"
                  onPress={() => void openCamera()}>
                  <Icon as={Camera} size={16} className="mr-1.5 text-foreground" />
                  <Text>Coba kamera</Text>
                </Button>
              )}
            </View>
          </View>
        ) : null}

        {!consentCurrent && photo ? (
          <View className="gap-3 rounded-[20px] border border-border bg-card p-5 shadow-sm">
            <View className="flex-row items-center gap-2.5">
              <View className="h-8 w-8 items-center justify-center rounded-full bg-carin-butter">
                <Icon as={ShieldCheck} size={18} className="text-foreground" />
              </View>
              <Text variant="large">Persetujuan Pemrosesan AI</Text>
            </View>
            <Text variant="muted">
              Foto makanan akan diproses untuk menyiapkan estimasi porsi dan komponen gizi. Persetujuan
              ini terpisah dari syarat penggunaan dan dapat kamu sesuaikan kapan saja di Pengaturan.
            </Text>
            <Button
              variant="outline"
              className="rounded-[16px]"
              onPress={() => router.push('/legal/ai-processing')}>
              <Icon as={Info} size={16} className="mr-1.5 text-foreground" />
              <Text>Baca penjelasan pemrosesan AI</Text>
            </Button>
            <Button
              variant={consentChecked ? 'tactile-secondary' : 'outline'}
              className="rounded-[16px]"
              onPress={() => setConsentChecked(!consentChecked)}>
              <Icon
                as={ShieldCheck}
                size={18}
                className={consentChecked ? 'mr-1.5 text-secondary-foreground' : 'mr-1.5 text-foreground'}
              />
              <Text>
                {consentChecked ? 'Persetujuan dipilih' : 'Saya menyetujui pemrosesan AI'}
              </Text>
            </Button>
            {consentChecked ? (
              <Button
                variant="tactile"
                onPress={grantConsent}
                disabled={!legal || !!legalQuery.data?.stale || saveConsent.isPending}>
                <Text>{saveConsent.isPending ? 'Menyimpan…' : 'Simpan persetujuan'}</Text>
              </Button>
            ) : null}
            {legalQuery.isPending ? (
              <ActivityIndicator accessibilityLabel="Memuat dokumen persetujuan" />
            ) : null}
          </View>
        ) : null}

        {message ? (
          <View className="rounded-[16px] border border-border bg-muted/60 p-3">
            <Text accessibilityRole="alert" className="text-sm text-foreground">
              {message}
            </Text>
          </View>
        ) : null}

        {photo && consentCurrent ? (
          <Button
            variant="tactile"
            onPress={analyze}
            disabled={busy || connectivity === 'offline'}
            accessibilityLabel="Mulai analisis makanan">
            {busy ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Icon as={Sparkles} size={20} className="mr-2 text-primary-foreground" />
                <Text>Mulai Analisis Makanan</Text>
              </>
            )}
          </Button>
        ) : null}

        {connectivity === 'offline' && photo ? (
          <Text variant="muted" className="text-center text-xs">
            Koneksi internet diperlukan untuk memulai analisis foto makanan.
          </Text>
        ) : null}

        <Button
          variant="ghost"
          className="mt-1 rounded-[16px] py-3"
          onPress={openManual}>
          <Icon as={Utensils} size={16} className="mr-1.5 text-muted-foreground" />
          <Text variant="muted">Makanan sudah dimakan? Catat secara manual</Text>
        </Button>
      </ScrollView>
    </View>
  );
}
