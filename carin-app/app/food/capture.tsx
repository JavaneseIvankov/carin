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
import { resolvePhotoMimeType } from '@/lib/food/photo-media';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as React from 'react';
import { ActivityIndicator, Image, ScrollView, View } from 'react-native';

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
      router.replace({ pathname: '/food/analysis/[id]', params: { id: job.id } });
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
        <View className="gap-3 bg-background px-5 py-5">
          <Button onPress={takePhoto} accessibilityLabel="Ambil foto makanan">
            <Text>Ambil foto</Text>
          </Button>
          <Button variant="outline" onPress={() => setCameraOpen(false)}>
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
          <Text variant="h2">Analisis sebelum makan</Text>
          <Text variant="muted">
            Ambil foto makanan yang masih tersedia. Hasil analisis tidak mencatat konsumsi.
          </Text>
        </View>

        {photo ? (
          <View className="gap-4">
            <Image
              source={{ uri: photo.uri }}
              resizeMode="cover"
              accessibilityLabel="Pratinjau foto makanan"
              className="h-72 w-full rounded-xl bg-muted"
            />
            <Button variant="outline" onPress={() => setPhoto(null)}>
              <Text>Pilih foto lain</Text>
            </Button>
          </View>
        ) : (
          <View className="gap-3 rounded-xl border border-border bg-card p-5">
            <Text variant="large">Pilih foto makanan</Text>
            <Button onPress={openCamera}>
              <Text>Buka kamera</Text>
            </Button>
            <Button variant="outline" onPress={selectFromGallery}>
              <Text>Pilih dari galeri</Text>
            </Button>
          </View>
        )}

        {permissionFallback ? (
          <View className="gap-2 rounded-lg border border-border p-4" accessibilityRole="alert">
            <Text>{permissionFallback.message}</Text>
            {permissionFallback.showSettings ? (
              <Button variant="outline" onPress={() => void Linking.openSettings()}>
                <Text>Buka Settings</Text>
              </Button>
            ) : null}
            {permissionFallback.alternateSource === 'gallery' ? (
              <Button variant="outline" onPress={() => void selectFromGallery()}>
                <Text>Coba galeri</Text>
              </Button>
            ) : (
              <Button variant="outline" onPress={() => void openCamera()}>
                <Text>Coba kamera</Text>
              </Button>
            )}
            <Button variant="ghost" onPress={openManual}>
              <Text>Catat makanan yang sudah dimakan</Text>
            </Button>
          </View>
        ) : null}

        {!consentCurrent && photo ? (
          <View className="gap-3 rounded-xl border border-border p-4">
            <Text variant="large">Persetujuan pemrosesan AI</Text>
            <Text variant="muted">
              Foto makanan akan diproses untuk menyiapkan estimasi dan hasil analisis. Persetujuan
              ini terpisah dari syarat penggunaan dan dapat dicabut di Pengaturan.
            </Text>
            <Button variant="outline" onPress={() => router.push('/legal/ai-processing')}>
              <Text>Baca penjelasan pemrosesan AI</Text>
            </Button>
            <Button
              variant={consentChecked ? 'default' : 'outline'}
              onPress={() => setConsentChecked(!consentChecked)}>
              <Text>
                {consentChecked ? 'Persetujuan dipilih' : 'Saya menyetujui pemrosesan AI'}
              </Text>
            </Button>
            {consentChecked ? (
              <Button
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

        {message ? <Text accessibilityRole="alert">{message}</Text> : null}

        {photo && consentCurrent ? (
          <Button onPress={analyze} disabled={busy || connectivity === 'offline'}>
            {busy ? <ActivityIndicator color="white" /> : <Text>Analisis makanan</Text>}
          </Button>
        ) : null}
        <Button variant="ghost" onPress={openManual}>
          <Text>Makanan sudah dimakan? Catat secara manual</Text>
        </Button>
      </ScrollView>
    </View>
  );
}
