import { BackButton } from '@/components/app/back-button';
import { Button } from '@/components/ui/button';
import { ScanDeletionControl } from '@/components/food/scan-deletion-control';
import { PhotoThumbnail } from '@/components/food/photo-thumbnail';
import {
  AnalysisDisclosure,
  AnalysisResultContent,
} from '@/components/food/analysis-result-content';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { useAppRead, useAppRepository } from '@/lib/api/query';
import type { components } from '@/lib/api/generated/app-api';
import { useAppData } from '@/lib/data/provider';
import { canConfirmSelectedScanResult, isCurrentScanResult } from '@/lib/food/correction';
import { getResultScreenActions } from '@/lib/food/correction-screen';
import {
  getPhotoConfirmationActions,
  refreshAnalysisReads,
} from '@/lib/food/photo-confirmation-actions';
import {
  createLatestAnalysisSnapshotRefreshCoordinator,
  getActiveCorrectionStatus,
  getCorrectionPollingStatus,
  readLatestAnalysisSnapshot,
  refreshAnalysisStateOnReconnect,
  type ActiveCorrectionStatus,
} from '@/lib/food/analysis-refresh';
import {
  getAnalysisFailurePresentation,
  getAnalysisPresentation,
} from '@/lib/food/analysis-presentation';
import { startAnalysisPolling } from '@/lib/food/analysis-polling';
import { createScanActionState, createScanActions } from '@/lib/food/scan-actions';
import { Icon } from '@/components/ui/icon';
import { AlertCircle, Check, RefreshCw } from 'lucide-react-native';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import * as React from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { cachePhotoUri, getCachedPhotoUri } from '@/lib/food/photo-media';

const MASCOT = require('../../../assets/images/carin-mascot.png');

const statusText = {
  queued: 'Menunggu analisis',
  processing: 'Menganalisis foto',
  completed: 'Analisis selesai',
  failed: 'Analisis gagal',
  cancelled: 'Analisis dibatalkan',
} as const;

type AnalysisActionSnapshot = {
  scan: components['schemas']['Scan'];
  latestJob: components['schemas']['AnalysisJob'];
};

export default function AnalysisResultScreen() {
  const { width } = useWindowDimensions();
  const pageGutter = width < 360 ? 16 : 20;
  const params = useLocalSearchParams<{
    id: string;
    photoUri?: string;
    returningToOldResult?: string;
  }>();
  const routeId = params.id;
  const routePhotoUri = params.photoUri;
  const returnParam = params.returningToOldResult;
  const id = Array.isArray(routeId) ? routeId[0] : routeId;
  const photoUriParam = Array.isArray(routePhotoUri) ? routePhotoUri[0] : routePhotoUri;
  const router = useRouter();
  const repository = useAppRepository();
  const { connectivity } = useAppData();
  const selectedRouteIdRef = React.useRef(id);
  React.useLayoutEffect(() => {
    selectedRouteIdRef.current = id;
  }, [id]);
  const [snapshotRefreshCoordinator] = React.useState(() =>
    createLatestAnalysisSnapshotRefreshCoordinator<AnalysisActionSnapshot>()
  );
  const previousConnectivity = React.useRef(connectivity);
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
  const jobQuery = useAppRead('getAnalysisJob', { path: { id: id ?? '' } }, { enabled: !!id });
  const job = jobQuery.data?.data;
  const [actionSnapshot, setActionSnapshot] = React.useState<AnalysisActionSnapshot | null>(null);
  const [retainedCorrectionStatus, setRetainedCorrectionStatus] =
    React.useState<ActiveCorrectionStatus | null>(null);
  const refreshActionSnapshot = React.useCallback(async () => {
    if (!repository || !id) return null;
    try {
      const snapshot = await snapshotRefreshCoordinator.refresh(
        id,
        () => selectedRouteIdRef.current,
        () =>
          readLatestAnalysisSnapshot(id, {
            readJob: (jobId) => repository.read('getAnalysisJob', { path: { id: jobId } }),
            readScan: (scanId) => repository.read('getScan', { path: { id: scanId } }),
          }),
        (latestSnapshot) => {
          setActionSnapshot(latestSnapshot);
          setRetainedCorrectionStatus(getActiveCorrectionStatus(latestSnapshot.latestJob));
        }
      );
      return snapshot?.latestJob.status ?? null;
    } catch {
      return null;
    }
  }, [id, repository, snapshotRefreshCoordinator]);
  const actionScan = actionSnapshot?.scan;
  const actionLatestJob = actionSnapshot?.latestJob;
  const effectivePhotoUri =
    photoUriParam ||
    (id ? getCachedPhotoUri(id) : undefined) ||
    (actionScan?.id ? getCachedPhotoUri(actionScan.id) : undefined) ||
    (actionScan?.photoId ? getCachedPhotoUri(actionScan.photoId) : undefined) ||
    (job?.scanId ? getCachedPhotoUri(job.scanId) : undefined);

  React.useEffect(() => {
    if (effectivePhotoUri) {
      if (id) cachePhotoUri(id, effectivePhotoUri);
      if (job?.id) cachePhotoUri(job.id, effectivePhotoUri);
      if (job?.scanId) cachePhotoUri(job.scanId, effectivePhotoUri);
      if (actionScan?.id) cachePhotoUri(actionScan.id, effectivePhotoUri);
      if (actionScan?.photoId) cachePhotoUri(actionScan.photoId, effectivePhotoUri);
    }
  }, [effectivePhotoUri, id, job?.id, job?.scanId, actionScan?.id, actionScan?.photoId]);
  const latestResultQuery = useAppRead(
    'getAnalysisResult',
    { path: { id: actionScan?.latestResultId ?? '' } },
    { enabled: !!actionScan?.latestResultId }
  );
  const latestResult = latestResultQuery.data?.data;
  const consumptionActions =
    actionScan && actionLatestJob && id
      ? getPhotoConfirmationActions({
          scan: actionScan,
          selectedJobId: id,
          latestJob: actionLatestJob,
          resultId: latestResult ? (actionScan.latestResultId ?? undefined) : undefined,
          result: latestResultQuery.data?.stale ? undefined : latestResult,
          latestResultLoadError:
            latestResultQuery.isError ||
            (latestResultQuery.data?.stale === true && !latestResultQuery.isFetching),
        })
      : null;
  const activeCorrectionStatus = getCorrectionPollingStatus(
    actionSnapshot,
    retainedCorrectionStatus
  );
  const latestResultIsCurrent = !!actionScan && !!job && isCurrentScanResult(actionScan, job);
  const canConfirm =
    !!actionScan &&
    !!job &&
    !!actionLatestJob &&
    canConfirmSelectedScanResult(actionScan, job, actionLatestJob, returnParam === 'true');
  const correctionIsActive = !!activeCorrectionStatus;
  const screenActions = getResultScreenActions({
    latestResultIsCurrent,
    canConfirm,
    correctionIsActive,
  });
  const conditionsQuery = useAppRead('getConditions', {});
  const [foreground, setForeground] = React.useState(AppState.currentState === 'active');
  const [focused, setFocused] = React.useState(true);
  const [retrying, setRetrying] = React.useState(false);
  const [retryError, setRetryError] = React.useState<string | null>(null);
  const pollStartedAt = React.useRef(0);
  const formattedTimestamp = React.useMemo(() => {
    const rawDate = job?.createdAt || actionScan?.createdAt;
    if (!rawDate) return null;
    const d = new Date(rawDate);
    return `${d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })} pukul ${d.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  }, [job?.createdAt, actionScan?.createdAt]);
  const jobStatus = job?.status;
  const refetchJob = jobQuery.refetch;

  useFocusEffect(
    React.useCallback(() => {
      setFocused(true);
      pollStartedAt.current = Date.now();
      if (id) void refetchJob();
      void refreshActionSnapshot();
      return () => {
        setFocused(false);
        setActionSnapshot(null);
      };
    }, [id, refetchJob, refreshActionSnapshot])
  );

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const active = state === 'active';
      setForeground(active);
      if (active) {
        pollStartedAt.current = Date.now();
        if (id) void refetchJob();
        void refreshActionSnapshot();
      } else {
        setActionSnapshot(null);
      }
    });
    return () => subscription.remove();
  }, [id, refetchJob, refreshActionSnapshot]);

  React.useEffect(() => {
    const wasConnected = previousConnectivity.current;
    previousConnectivity.current = connectivity;
    void refreshAnalysisStateOnReconnect({
      previousConnectivity: wasConnected,
      connectivity,
      focused,
      foreground,
      hasJobId: !!id,
      refetchJob,
      refreshActionSnapshot,
    });
  }, [connectivity, focused, foreground, id, refetchJob, refreshActionSnapshot]);

  React.useEffect(() => {
    if (!jobStatus || !focused || !foreground) return;
    return startAnalysisPolling({
      initialStatus: jobStatus,
      getElapsedMs: () => (pollStartedAt.current ? Date.now() - pollStartedAt.current : 0),
      shouldPoll: () => focused && foreground && connectivity !== 'offline',
      refetch: async () => {
        const response = await refetchJob();
        return response.data?.data.status ?? null;
      },
    });
  }, [jobStatus, focused, foreground, connectivity, refetchJob]);

  React.useEffect(() => {
    if (!activeCorrectionStatus || !focused || !foreground || !id) return;
    return startAnalysisPolling({
      initialStatus: activeCorrectionStatus,
      getElapsedMs: () => (pollStartedAt.current ? Date.now() - pollStartedAt.current : 0),
      shouldPoll: () => focused && foreground && connectivity !== 'offline',
      refetch: refreshActionSnapshot,
    });
  }, [activeCorrectionStatus, connectivity, focused, foreground, id, refreshActionSnapshot]);

  const retry = async () => {
    if (!job || !actions || retrying) return;
    setRetrying(true);
    setRetryError(null);
    try {
      const retryJob = await actions.retry(job.id);
      if (effectivePhotoUri) {
        cachePhotoUri(retryJob.id, effectivePhotoUri);
      }
      router.replace({
        pathname: '/food/analysis/[id]',
        params: { id: retryJob.id, ...(effectivePhotoUri ? { photoUri: effectivePhotoUri } : {}) },
      });
    } catch {
      setRetryError(
        'Permintaan coba lagi belum diterima. Coba lagi dengan kunci permintaan yang sama.'
      );
    } finally {
      setRetrying(false);
    }
  };

  if (jobQuery.isPending && !job) {
    return (
      <View className="flex-1 justify-center bg-background px-5 py-8">
        {effectivePhotoUri ? (
          <View className="overflow-hidden rounded-[20px] border border-border bg-card shadow-sm">
            <View className="relative h-80 w-full justify-end">
              <Image
                source={{ uri: effectivePhotoUri }}
                resizeMode="cover"
                className="absolute inset-0 h-full w-full"
                accessibilityLabel="Foto makanan yang sedang disiapkan"
              />
              <View className="absolute inset-0 bg-black/45" />
              <View className="items-center gap-3 p-6">
                <View className="flex-row items-center gap-2.5 rounded-full bg-background/95 px-4 py-2 shadow-sm">
                  <Image
                    source={MASCOT}
                    resizeMode="contain"
                    className="h-8 w-8"
                    accessibilityLabel="Maskot Carin"
                  />
                  <ActivityIndicator
                    size="small"
                    color="#506B35"
                    accessibilityLabel="Menyiapkan analisis"
                  />
                  <Text variant="small" className="font-semibold text-primary">
                    Menyiapkan analisis…
                  </Text>
                </View>
                <View className="items-center gap-1">
                  <Text variant="h2" className="text-center text-white drop-shadow">
                    Menganalisis foto makanan…
                  </Text>
                  <Text className="text-center text-sm font-medium text-white/90">
                    Mengidentifikasi bahan, takaran porsi, dan perkiraan gizi.
                  </Text>
                </View>
              </View>
            </View>
            <View className="bg-carin-olive-soft/40 p-3.5">
              <Text variant="caption" className="text-center text-muted-foreground">
                Menghubungkan ke layanan analisis Carin. Tunggu sebentar…
              </Text>
            </View>
          </View>
        ) : (
          <View className="items-center gap-4 rounded-[20px] border border-border bg-card p-8 shadow-sm">
            <View
              className="items-center justify-center bg-carin-butter"
              style={{
                borderTopLeftRadius: 25,
                borderTopRightRadius: 31,
                borderBottomRightRadius: 23,
                borderBottomLeftRadius: 29,
                width: 72,
                height: 72,
              }}>
              <Image
                source={MASCOT}
                resizeMode="contain"
                accessibilityLabel="Maskot Carin"
                style={{ width: 64, height: 68 }}
              />
            </View>
            <ActivityIndicator
              size="small"
              color="#506B35"
              accessibilityLabel="Memuat status analisis"
            />
            <Text variant="h2">Menyiapkan Hasil Analisis</Text>
            <Text variant="muted" className="text-center">
              Menghubungkan ke layanan analisis Carin. Tunggu sebentar…
            </Text>
          </View>
        )}
      </View>
    );
  }

  if (jobQuery.error && !job) {
    return (
      <View className="flex-1 justify-center gap-4 bg-background p-6">
        <View className="gap-4 rounded-[20px] border border-border bg-card p-6 shadow-sm">
          <View className="flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <Icon as={AlertCircle} size={22} className="text-destructive" />
            </View>
            <Text variant="h2">Hasil Analisis</Text>
          </View>
          <Text accessibilityRole="alert" className="text-muted-foreground">
            Analisis belum dapat dimuat. Periksa koneksi lalu coba lagi.
          </Text>
          <Button variant="tactile" onPress={() => void jobQuery.refetch()}>
            <Icon as={RefreshCw} size={18} className="mr-1.5 text-primary-foreground" />
            <Text>Coba muat lagi</Text>
          </Button>
          <BackButton href={{ pathname: '/(tabs)/history', params: { tab: 'analysis' } }} />
        </View>
      </View>
    );
  }

  if (!job) {
    return (
      <View className="flex-1 justify-center gap-4 bg-background p-6">
        <View className="gap-4 rounded-[20px] border border-border bg-card p-6 shadow-sm">
          <View className="flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-carin-butter">
              <Icon as={AlertCircle} size={22} className="text-foreground" />
            </View>
            <Text variant="h2">Hasil Analisis</Text>
          </View>
          <Text className="text-muted-foreground">
            Analisis ini tidak ditemukan atau tidak dapat dibuka.
          </Text>
          <BackButton href={{ pathname: '/(tabs)/history', params: { tab: 'analysis' } }} />
        </View>
      </View>
    );
  }

  const result = job.result;
  const conditionIndex = new Map(
    (conditionsQuery.data?.data ?? []).map((condition) => [
      condition.id,
      {
        displayName: condition.displayName,
        personalizationSupported: condition.personalizationSupported,
      },
    ])
  );
  const presentation = result ? getAnalysisPresentation(result, conditionIndex) : null;
  const failure = getAnalysisFailurePresentation(job);

  const needsRefresh =
    job.status !== 'completed' ||
    jobQuery.isError ||
    jobQuery.data?.stale ||
    latestResultQuery.isError ||
    latestResultQuery.data?.stale ||
    !consumptionActions?.primary;
  const refreshResult = () => {
    void refreshAnalysisReads({
      refetchJob: jobQuery.refetch,
      refreshActionSnapshot,
      refetchLatestResult: actionScan?.latestResultId ? latestResultQuery.refetch : undefined,
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView
        contentContainerClassName="gap-5 pb-6 pt-3"
        contentContainerStyle={{ paddingHorizontal: pageGutter }}
        showsVerticalScrollIndicator={false}>
        <BackButton href={{ pathname: '/(tabs)/history', params: { tab: 'analysis' } }} />
        <View className="gap-2">
          <Text variant="h1">Hasil analisis</Text>
          {job.status !== 'completed' ? (
            <Text variant="muted">{statusText[job.status]}</Text>
          ) : null}
          {jobQuery.data?.stale ? (
            <Text variant="caption" className="text-muted-foreground">
              Status terakhir tersimpan ditampilkan. Muat ulang saat online.
            </Text>
          ) : null}
          {consumptionActions?.message ? (
            <Text variant="muted">{consumptionActions.message}</Text>
          ) : null}
        </View>

        {job.status === 'queued' || job.status === 'processing' ? (
          effectivePhotoUri ? (
            <View className="overflow-hidden rounded-[20px] border border-border bg-card shadow-sm">
              <View className="relative h-80 w-full justify-end">
                <Image
                  source={{ uri: effectivePhotoUri }}
                  resizeMode="cover"
                  className="absolute inset-0 h-full w-full"
                  accessibilityLabel="Pratinjau foto makanan yang sedang dianalisis"
                />
                <View className="absolute inset-0 bg-black/45" />
                <View className="items-center gap-3 p-6">
                  <View className="flex-row items-center gap-2.5 rounded-full bg-background/95 px-4 py-2 shadow-sm">
                    <Image
                      source={MASCOT}
                      resizeMode="contain"
                      className="h-8 w-8"
                      accessibilityLabel="Maskot Carin"
                    />
                    <ActivityIndicator
                      size="small"
                      color="#506B35"
                      accessibilityLabel={statusText[job.status]}
                    />
                    <Text variant="small" className="font-semibold text-primary">
                      {statusText[job.status]}
                    </Text>
                  </View>
                  <View className="items-center gap-1">
                    <Text variant="h2" className="text-center text-white drop-shadow">
                      {job.status === 'queued'
                        ? 'Menunggu Antrean Analisis'
                        : 'Menganalisis foto makanan…'}
                    </Text>
                    <Text className="text-center text-sm font-medium text-white/90">
                      Mengidentifikasi bahan, takaran porsi, dan perkiraan gizi.
                    </Text>
                  </View>
                </View>
              </View>
              <View className="bg-carin-olive-soft/40 p-3.5">
                <Text variant="caption" className="text-center text-muted-foreground">
                  Kamu dapat menunggu di halaman ini atau kembali nanti. Hasil analisis akan
                  tersimpan di riwayat.
                </Text>
              </View>
            </View>
          ) : (
            <View className="items-center gap-4 rounded-[20px] border border-border bg-card p-6 shadow-sm">
              <View
                className="items-center justify-center bg-carin-butter"
                style={{
                  borderTopLeftRadius: 25,
                  borderTopRightRadius: 31,
                  borderBottomRightRadius: 23,
                  borderBottomLeftRadius: 29,
                  width: 72,
                  height: 72,
                }}>
                <Image
                  source={MASCOT}
                  resizeMode="contain"
                  accessibilityLabel="Maskot Carin"
                  style={{ width: 64, height: 68 }}
                />
              </View>
              <ActivityIndicator
                size="small"
                color="#506B35"
                accessibilityLabel={statusText[job.status]}
              />
              <View className="items-center gap-1.5">
                <View className="rounded-full bg-carin-olive-soft px-3 py-1">
                  <Text variant="small" className="font-semibold text-primary">
                    {statusText[job.status]}
                  </Text>
                </View>
                <Text variant="h2" className="text-center">
                  {job.status === 'queued'
                    ? 'Menunggu Antrean Analisis'
                    : 'Menganalisis foto makanan…'}
                </Text>
                <Text variant="muted" className="text-center">
                  Mengidentifikasi bahan, takaran porsi, dan perkiraan gizi.
                </Text>
              </View>
              <View className="rounded-[14px] bg-carin-olive-soft/40 p-3">
                <Text variant="caption" className="text-center text-muted-foreground">
                  Kamu dapat menunggu di halaman ini atau kembali nanti. Hasil analisis akan
                  tersimpan di riwayat.
                </Text>
              </View>
            </View>
          )
        ) : null}

        {failure ? (
          <View
            className="gap-3 rounded-[20px] border border-destructive/40 bg-card p-5 shadow-sm"
            accessibilityRole="alert">
            <View className="flex-row items-center gap-2.5">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-destructive/10">
                <Icon as={AlertCircle} size={20} className="text-destructive" />
              </View>
              <Text variant="large" className="text-destructive">
                Analisis belum berhasil
              </Text>
            </View>
            <Text className="text-muted-foreground">{failure.message}</Text>
            {failure.retryable ? (
              <Button variant="tactile" onPress={retry} disabled={retrying}>
                {retrying ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <Icon as={RefreshCw} size={18} className="mr-1.5 text-primary-foreground" />
                    <Text>Coba lagi</Text>
                  </>
                )}
              </Button>
            ) : null}
            {retryError ? (
              <Text accessibilityRole="alert" className="text-sm text-destructive">
                {retryError}
              </Text>
            ) : null}
          </View>
        ) : null}

        {job.status === 'cancelled' ? (
          <View className="rounded-[20px] border border-border bg-card p-5">
            <Text className="text-muted-foreground">
              Analisis ini dibatalkan dan hasilnya tidak tersedia.
            </Text>
          </View>
        ) : null}

        {presentation && result ? (
          <AnalysisResultContent
            key={result.operationId}
            presentation={presentation}
            timestamp={formattedTimestamp}
            photoDeleted={actionScan?.photoId === null}
            photo={
              <PhotoThumbnail
                photoId={actionScan?.photoId ?? null}
                localUri={actionScan?.photoId === null ? null : effectivePhotoUri}
                className="h-20 w-20 shrink-0"
                accessibilityLabel={
                  actionScan?.photoId === null
                    ? 'Foto sumber telah dihapus'
                    : 'Foto makanan yang dianalisis'
                }
                fallbackLabel={actionScan?.photoId === null ? 'Foto dihapus' : undefined}
              />
            }
            onCorrect={
              job.scanId
                ? () =>
                    router.push({
                      pathname: '/food/correction/[id]',
                      params: { id: job.scanId!, sourceJobId: job.id },
                    })
                : undefined
            }
            correctionDisabled={screenActions.correctionDisabled}
            correctionIsActive={correctionIsActive}
          />
        ) : null}

        {job.status === 'completed' && !result ? (
          <View className="rounded-[16px] border border-border bg-muted/60 p-3">
            <Text accessibilityRole="alert" className="text-sm text-foreground">
              Hasil analisis belum tersedia. Muat status terbaru untuk mencoba lagi.
            </Text>
          </View>
        ) : null}

        {job.scanId ? (
          <AnalysisDisclosure title="Tindakan lainnya">
            {consumptionActions?.secondary ? (
              <Button
                variant="outline"
                onPress={() => router.push(consumptionActions.secondary as unknown as Href)}>
                <Text>{consumptionActions.secondary.label}</Text>
              </Button>
            ) : null}
            <ScanDeletionControl
              scanId={job.scanId}
              jobId={job.id}
              photoId={actionScan?.photoId}
              onDeleted={() =>
                router.replace({ pathname: '/(tabs)/history', params: { tab: 'analysis' } })
              }
            />
            {!needsRefresh ? (
              <Button variant="ghost" onPress={refreshResult} disabled={jobQuery.isFetching}>
                <Icon as={RefreshCw} size={16} className="text-foreground" />
                <Text>{jobQuery.isFetching ? 'Memuat…' : 'Muat status terbaru'}</Text>
              </Button>
            ) : null}
          </AnalysisDisclosure>
        ) : null}

        {needsRefresh ? (
          <Button variant="outline" onPress={refreshResult} disabled={jobQuery.isFetching}>
            <Icon as={RefreshCw} size={16} className="text-foreground" />
            <Text>{jobQuery.isFetching ? 'Memuat…' : 'Muat status terbaru'}</Text>
          </Button>
        ) : null}
      </ScrollView>
      {job.scanId && consumptionActions?.primary ? (
        <View
          className="gap-2 border-t border-border bg-background pb-2 pt-3"
          style={{ paddingHorizontal: pageGutter }}>
          <Button
            variant="tactile"
            onPress={() => router.push(consumptionActions.primary as unknown as Href)}
            accessibilityLabel={consumptionActions.primary.label}>
            {consumptionActions.primary.pathname === '/consumptions/from-scan/[scanId]' ? (
              <Icon as={Check} size={20} className="text-primary-foreground" />
            ) : null}
            <Text>{consumptionActions.primary.label}</Text>
          </Button>
          {actionScan?.defaultConsumptionId ? (
            <Text variant="caption" className="text-center text-muted-foreground">
              Sudah masuk catatan konsumsi.
            </Text>
          ) : consumptionActions.primary.pathname === '/consumptions/from-scan/[scanId]' ? (
            <Text variant="caption" className="text-center text-muted-foreground">
              Belum masuk catatan konsumsi.
            </Text>
          ) : null}
        </View>
      ) : null}
    </SafeAreaView>
  );
}
