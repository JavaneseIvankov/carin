import { Button } from '@/components/ui/button';
import { ScanDeletionControl } from '@/components/food/scan-deletion-control';
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
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Edit3,
  Info,
  RefreshCw,
  ShieldCheck,
  Utensils,
} from 'lucide-react-native';
import { cn } from '@/lib/utils';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import * as Linking from 'expo-linking';
import * as React from 'react';
import { ActivityIndicator, AppState, Image, ScrollView, View } from 'react-native';
import { cachePhotoUri, getCachedPhotoUri } from '@/lib/food/photo-media';

const MASCOT = require('../../../assets/images/carin-mascot.png');

const statusText = {
  queued: 'Menunggu analisis',
  processing: 'Menganalisis foto',
  completed: 'Analisis selesai',
  failed: 'Analisis gagal',
  cancelled: 'Analisis dibatalkan',
} as const;

const attentionText = {
  considerable: 'Perlu perhatian berdasarkan data tersedia',
  needs_attention: 'Ada hal yang perlu diperhatikan',
  insufficient_information: 'Informasi belum cukup untuk pertimbangan personal',
} as const;

type AnalysisActionSnapshot = {
  scan: components['schemas']['Scan'];
  latestJob: components['schemas']['AnalysisJob'];
};

export default function AnalysisResultScreen() {
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
  const [nutrientsExpanded, setNutrientsExpanded] = React.useState(false);
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
                  <ActivityIndicator size="small" color="#506B35" accessibilityLabel="Menyiapkan analisis" />
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
            <ActivityIndicator size="small" color="#506B35" accessibilityLabel="Memuat status analisis" />
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
          <Button
            variant="tactile"
            onPress={() => void jobQuery.refetch()}>
            <Icon as={RefreshCw} size={18} className="mr-1.5 text-primary-foreground" />
            <Text>Coba muat lagi</Text>
          </Button>
          <Button
            variant="outline"
            className="rounded-[20px]"
            onPress={() => router.back()}>
            <Text>Kembali</Text>
          </Button>
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
          <Text className="text-muted-foreground">Analisis ini tidak ditemukan atau tidak dapat dibuka.</Text>
          <Button
            variant="outline"
            className="rounded-[20px]"
            onPress={() => router.back()}>
            <Text>Kembali</Text>
          </Button>
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

  const energyNutrient = presentation?.nutrients.find((n) => n.key === 'energyKcal');
  const carbNutrient = presentation?.nutrients.find((n) => n.key === 'carbohydrateG');
  const proteinNutrient = presentation?.nutrients.find((n) => n.key === 'proteinG');
  const fatNutrient = presentation?.nutrients.find((n) => n.key === 'fatG');

  const foodTitle =
    presentation?.components.length === 1
      ? presentation.components[0].name
      : presentation?.components.length
        ? presentation.components.map((c) => c.name).join(', ')
        : 'Hasil Analisis Makanan';

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerClassName="gap-5 px-5 py-8">
        <View className="gap-2">
          <View className="flex-row items-center gap-2.5">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-carin-olive-soft">
              <Icon as={Utensils} size={20} className="text-primary" />
            </View>
            <Text variant="h1">Hasil Analisis Makanan</Text>
          </View>
          <Text variant="muted">{statusText[job.status]}</Text>
          {jobQuery.data?.stale ? (
            <Text variant="caption" className="text-muted-foreground">
              Status terakhir tersimpan ditampilkan. Muat ulang saat online.
            </Text>
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
                    <ActivityIndicator size="small" color="#506B35" accessibilityLabel={statusText[job.status]} />
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
                  Kamu dapat menunggu di halaman ini atau kembali nanti. Hasil analisis akan tersimpan di riwayat.
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
              <ActivityIndicator size="small" color="#506B35" accessibilityLabel={statusText[job.status]} />
              <View className="items-center gap-1.5">
                <View className="rounded-full bg-carin-olive-soft px-3 py-1">
                  <Text variant="small" className="font-semibold text-primary">
                    {statusText[job.status]}
                  </Text>
                </View>
                <Text variant="h2" className="text-center">
                  {job.status === 'queued' ? 'Menunggu Antrean Analisis' : 'Menganalisis foto makanan…'}
                </Text>
                <Text variant="muted" className="text-center">
                  Mengidentifikasi bahan, takaran porsi, dan perkiraan gizi.
                </Text>
              </View>
              <View className="rounded-[14px] bg-carin-olive-soft/40 p-3">
                <Text variant="caption" className="text-center text-muted-foreground">
                  Kamu dapat menunggu di halaman ini atau kembali nanti. Hasil analisis akan tersimpan di riwayat.
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
              <Button
                variant="tactile"
                onPress={retry}
                disabled={retrying}>
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
            <Text className="text-muted-foreground">Analisis ini dibatalkan dan hasilnya tidak tersedia.</Text>
          </View>
        ) : null}

        {presentation && result ? (
          <>
            {/* Top Food Result Card with Photo Thumbnail or Butter Pebble */}
            <View className="gap-3.5 rounded-[20px] border border-border bg-card p-5 shadow-sm">
              <View className="flex-row items-center gap-3.5">
                {effectivePhotoUri ? (
                  <View className="h-16 w-16 overflow-hidden rounded-[16px] border border-border/70 bg-muted">
                    <Image
                      source={{ uri: effectivePhotoUri }}
                      resizeMode="cover"
                      className="h-full w-full"
                      accessibilityLabel="Foto makanan yang dianalisis"
                    />
                  </View>
                ) : (
                  <View
                    className="items-center justify-center bg-carin-butter"
                    style={{
                      borderTopLeftRadius: 25,
                      borderTopRightRadius: 31,
                      borderBottomRightRadius: 23,
                      borderBottomLeftRadius: 29,
                      width: 64,
                      height: 64,
                    }}>
                    <Icon as={Utensils} size={28} className="text-primary" />
                  </View>
                )}

                <View className="flex-1 gap-1">
                  <View className="flex-row items-center gap-2">
                    <View className="rounded-full bg-carin-olive-soft px-2.5 py-0.5">
                      <Text variant="caption" className="font-semibold text-primary">
                        {presentation.supportLabel}
                      </Text>
                    </View>
                  </View>
                  <Text variant="h2" numberOfLines={2} className="text-foreground leading-snug">
                    {foodTitle}
                  </Text>
                  {formattedTimestamp ? (
                    <Text variant="caption" className="text-muted-foreground">
                      {formattedTimestamp}
                    </Text>
                  ) : null}
                </View>
              </View>

              {/* Attention status banner within top card */}
              <View
                className={cn(
                  'flex-row items-center gap-2.5 rounded-[14px] p-3',
                  presentation.overallAttention === 'insufficient_information'
                    ? 'bg-carin-olive-soft/40'
                    : 'bg-carin-peach/30'
                )}>
                <Icon as={ShieldCheck} size={18} className="text-foreground" />
                <View className="flex-1">
                  <Text variant="caption" className="font-bold text-foreground">
                    {attentionText[presentation.overallAttention]}
                  </Text>
                </View>
              </View>
            </View>

            <View className="gap-4 rounded-[20px] border border-border bg-card p-5 shadow-sm">
              <View className="flex-row items-center justify-between">
                <Text variant="h3">Rincian Komponen & Porsi</Text>
                <View className="rounded-full bg-carin-olive-soft px-2.5 py-1">
                  <Text variant="caption" className="font-semibold text-primary">
                    {presentation.components.length} komponen
                  </Text>
                </View>
              </View>

              {presentation.components.length ? (
                <View className="gap-2.5">
                  {presentation.components.map((component) => (
                    <View
                      key={component.id}
                      className="gap-1.5 rounded-[16px] border border-border/70 bg-background p-3.5">
                      <View className="flex-row items-start justify-between gap-2">
                        <Text className="flex-1 text-base font-bold text-foreground">
                          {component.name}
                        </Text>
                        <View className="rounded-full bg-carin-olive-soft px-2.5 py-0.5">
                          <Text variant="caption" className="font-semibold text-primary">
                            {component.portion}
                          </Text>
                        </View>
                      </View>
                      {component.portionBasis ? (
                        <Text variant="caption" className="text-muted-foreground">
                          Dasar porsi: {component.portionBasis}
                        </Text>
                      ) : null}
                      {component.grams ? (
                        <Text variant="caption" className="text-muted-foreground">
                          {component.grams}
                        </Text>
                      ) : null}
                      {component.portionSource ? (
                        <Text variant="caption" className="text-muted-foreground">
                          Sumber porsi: {component.portionSource}
                        </Text>
                      ) : null}
                      {component.matchStatus !== 'matched' ? (
                        <View className="mt-0.5 flex-row items-center gap-1.5">
                          <Icon as={Info} size={13} className="text-muted-foreground" />
                          <Text variant="caption" className="text-muted-foreground">
                            Kecocokan makanan belum terverifikasi di katalog.
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : (
                <Text variant="muted">Nama makanan belum tersedia.</Text>
              )}
              <Text variant="caption" className="text-muted-foreground">
                {presentation.dataLabel}
              </Text>
            </View>

            <View
              className={cn(
                'gap-3.5 rounded-[20px] border p-5 shadow-sm',
                presentation.overallAttention === 'insufficient_information'
                  ? 'border-carin-olive-soft bg-carin-olive-soft/40'
                  : 'border-carin-peach/70 bg-carin-peach/30'
              )}>
              <View className="flex-row items-center gap-2.5">
                <View className="h-8 w-8 items-center justify-center rounded-full bg-card">
                  <Icon as={ShieldCheck} size={18} className="text-foreground" />
                </View>
                <View className="flex-1">
                  <Text variant="h3">Perhatian & Cakupan</Text>
                  <Text className="text-sm font-semibold text-foreground">
                    {attentionText[presentation.overallAttention]}
                  </Text>
                </View>
              </View>
              <Text variant="caption" className="text-muted-foreground">
                Pertimbangan ini bersifat informatif berdasarkan data yang tersedia, bukan diagnosis medis atau jaminan keamanan makanan.
              </Text>

              {presentation.attentions.map((attention, index) => (
                <View
                  key={`${attention.conditionId}-${index}`}
                  className="gap-1.5 rounded-[14px] border border-border/50 bg-card/80 p-3.5">
                  <Text className="font-semibold text-foreground">
                    Pertimbangan terkait: {attention.conditionLabel}
                  </Text>
                  {attention.personalizationSupported === false ? (
                    <Text variant="caption" className="text-muted-foreground">
                      Kondisi ini belum didukung untuk personalisasi. Tidak ada aturan khusus yang ditambahkan.
                    </Text>
                  ) : null}
                  <Text className="text-sm text-foreground">{attention.reason}</Text>
                  {attention.adjustments.map((adjustment) => (
                    <Text key={adjustment} variant="caption" className="text-muted-foreground">
                      Penyesuaian: {adjustment}
                    </Text>
                  ))}
                  {attention.limitations.map((limitation) => (
                    <Text key={limitation} variant="caption" className="text-muted-foreground">
                      Keterbatasan: {limitation}
                    </Text>
                  ))}
                  {attention.sources.map((source) => (
                    <Text key={source} variant="caption" className="text-muted-foreground">
                      Sumber: {source}
                    </Text>
                  ))}
                </View>
              ))}

              {result.attentions.length === 0 ? (
                <Text variant="muted">
                  Tidak ada aturan personal yang dapat diterapkan dari data tersedia. Tetap perhatikan kenyamanan tubuhmu.
                </Text>
              ) : null}
            </View>

            <View className="gap-4 rounded-[20px] border border-border bg-card p-5 shadow-sm">
              <View className="flex-row items-center justify-between">
                <Text variant="h3">Estimasi Gizi</Text>
                {energyNutrient ? (
                  <View className="items-end">
                    <Text variant="metric">{energyNutrient.value}</Text>
                    <Text variant="caption" className="text-muted-foreground">
                      {energyNutrient.coverage}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View className="flex-row gap-2.5">
                <View className="flex-1 items-center gap-0.5 rounded-[14px] bg-carin-olive-soft p-2.5">
                  <Text variant="caption" className="font-semibold text-muted-foreground">
                    Karbohidrat
                  </Text>
                  <Text className="text-base font-bold text-foreground">
                    {carbNutrient?.value ?? 'Belum tersedia'}
                  </Text>
                  <Text variant="caption" className="text-[10px] text-muted-foreground">
                    {carbNutrient?.coverage ?? ''}
                  </Text>
                </View>
                <View className="flex-1 items-center gap-0.5 rounded-[14px] bg-carin-olive-soft p-2.5">
                  <Text variant="caption" className="font-semibold text-muted-foreground">
                    Protein
                  </Text>
                  <Text className="text-base font-bold text-foreground">
                    {proteinNutrient?.value ?? 'Belum tersedia'}
                  </Text>
                  <Text variant="caption" className="text-[10px] text-muted-foreground">
                    {proteinNutrient?.coverage ?? ''}
                  </Text>
                </View>
                <View className="flex-1 items-center gap-0.5 rounded-[14px] bg-carin-olive-soft p-2.5">
                  <Text variant="caption" className="font-semibold text-muted-foreground">
                    Lemak
                  </Text>
                  <Text className="text-base font-bold text-foreground">
                    {fatNutrient?.value ?? 'Belum tersedia'}
                  </Text>
                  <Text variant="caption" className="text-[10px] text-muted-foreground">
                    {fatNutrient?.coverage ?? ''}
                  </Text>
                </View>
              </View>

              <Button
                variant="outline"
                className="rounded-[16px]"
                onPress={() => setNutrientsExpanded((prev) => !prev)}>
                <Icon
                  as={nutrientsExpanded ? ChevronUp : ChevronDown}
                  size={16}
                  className="mr-1.5 text-foreground"
                />
                <Text>
                  {nutrientsExpanded ? 'Sembunyikan rincian gizi' : 'Lihat rincian gizi lengkap'}
                </Text>
              </Button>

              {nutrientsExpanded ? (
                <View className="gap-2 border-t border-border pt-3">
                  {presentation.nutrients.map((nutrient) => (
                    <View
                      key={nutrient.key}
                      className="flex-row items-start justify-between border-b border-border/40 py-2">
                      <View className="flex-1 pr-2">
                        <Text className="font-medium text-foreground">{nutrient.label}</Text>
                        <Text variant="caption" className="text-muted-foreground">
                          Cakupan: {nutrient.coverage}
                        </Text>
                        {nutrient.sources.length ? (
                          <Text variant="caption" className="text-[11px] text-muted-foreground">
                            Sumber: {nutrient.sources.join(', ')}
                          </Text>
                        ) : null}
                      </View>
                      <Text className="font-semibold text-foreground">{nutrient.value}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            <View className="gap-3 rounded-[20px] border border-border bg-card p-5 shadow-sm">
              <Text variant="h3">Keterbatasan</Text>
              {presentation.limitations.length ? (
                presentation.limitations.map((limitation, index) => (
                  <View key={`${index}-${limitation}`} className="flex-row items-start gap-2">
                    <Text className="text-muted-foreground">•</Text>
                    <Text className="flex-1 text-sm text-foreground">{limitation}</Text>
                  </View>
                ))
              ) : (
                <Text variant="muted">Tidak ada keterbatasan tambahan yang dilaporkan.</Text>
              )}
            </View>

            <View className="gap-3 rounded-[20px] border border-border bg-card p-5 shadow-sm">
              <Text variant="h3">Sumber Rujukan</Text>
              {presentation.sources.map((source) => (
                <View key={source.id} className="gap-1 border-b border-border/50 pb-3">
                  <Text variant="large">{source.title}</Text>
                  <Text variant="caption" className="text-muted-foreground">
                    {source.kind} · {source.itemRef}
                  </Text>
                  {source.url ? (
                    <Button
                      className="min-h-11 self-start"
                      variant="link"
                      onPress={() => void Linking.openURL(source.url!)}>
                      <Text>Lihat sumber</Text>
                    </Button>
                  ) : null}
                </View>
              ))}
              {presentation.sources.length === 0 ? (
                <Text variant="muted">Sumber belum tersedia.</Text>
              ) : null}
            </View>

            <View className="gap-2 rounded-[18px] border border-carin-butter/60 bg-carin-butter/30 p-4">
              <View className="flex-row items-center gap-2">
                <Icon as={Info} size={18} className="text-foreground" />
                <Text className="font-semibold text-foreground">Batas Analisis & Konsumsi</Text>
              </View>
              <Text variant="caption" className="text-foreground">
                Hasil analisis foto ini tersimpan terpisah dan belum dicatat ke riwayat konsumsi harianmu. Tekan “Sudah dikonsumsi” jika kamu sudah memakannya.
              </Text>
            </View>
          </>
        ) : null}

        {job.status === 'completed' && !result ? (
          <View className="rounded-[16px] border border-border bg-muted/60 p-3">
            <Text accessibilityRole="alert" className="text-sm text-foreground">
              Hasil analisis belum tersedia. Muat status terbaru untuk mencoba lagi.
            </Text>
          </View>
        ) : null}

        {job.scanId ? (
          <View className="gap-3.5 rounded-[20px] border border-border bg-card p-5 shadow-sm">
            <Text variant="h3">Tindakan Hasil</Text>

            {consumptionActions?.primary ? (
              <Button
                variant="tactile"
                onPress={() => router.push(consumptionActions.primary as unknown as Href)}
                accessibilityLabel={consumptionActions.primary.label}>
                <Icon as={Check} size={20} className="mr-2 text-primary-foreground" />
                <Text>{consumptionActions.primary.label}</Text>
              </Button>
            ) : null}

            {result ? (
              <Button
                variant="tactile-secondary"
                disabled={screenActions.correctionDisabled}
                onPress={() =>
                  router.push({
                    pathname: '/food/correction/[id]',
                    params: { id: job.scanId!, sourceJobId: job.id },
                  })
                }
                accessibilityLabel="Koreksi komponen atau porsi">
                <Icon as={Edit3} size={18} className="mr-1.5 text-secondary-foreground" />
                <Text>
                  {correctionIsActive ? 'Koreksi sedang berjalan' : 'Koreksi komponen atau porsi'}
                </Text>
              </Button>
            ) : null}

            {consumptionActions?.secondary ? (
              <Button
                variant="outline"
                className="rounded-[20px]"
                onPress={() => router.push(consumptionActions.secondary as unknown as Href)}>
                <Text>{consumptionActions.secondary.label}</Text>
              </Button>
            ) : null}

            {consumptionActions?.message ? (
              <Text variant="muted" className="text-xs">
                {consumptionActions.message}
              </Text>
            ) : null}

            <ScanDeletionControl
              scanId={job.scanId}
              jobId={job.id}
              photoId={actionScan?.photoId}
              onDeleted={() =>
                router.replace({ pathname: '/(tabs)/history', params: { tab: 'analysis' } })
              }
            />
          </View>
        ) : null}

        <Button
          variant="outline"
          className="rounded-[20px]"
          onPress={() => {
            void refreshAnalysisReads({
              refetchJob: jobQuery.refetch,
              refreshActionSnapshot,
              refetchLatestResult: actionScan?.latestResultId
                ? latestResultQuery.refetch
                : undefined,
            });
          }}
          disabled={jobQuery.isFetching}>
          <Icon as={RefreshCw} size={16} className="mr-1.5 text-foreground" />
          <Text>{jobQuery.isFetching ? 'Memuat…' : 'Muat status terbaru'}</Text>
        </Button>
      </ScrollView>
    </View>
  );
}
