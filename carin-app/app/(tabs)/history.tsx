import { HeaderPattern } from '@/components/app/header-pattern';
import { OnlineIndicator } from '@/components/app/online-indicator';
import { serviceErrorMessage } from '@/components/app/presentation';
import { ScanDeletionControl } from '@/components/food/scan-deletion-control';
import { PhotoThumbnail } from '@/components/food/photo-thumbnail';
import { ServiceError } from '@/components/app/service-error';
import { ConsumptionForm } from '@/components/consumptions/consumption-form';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { Text } from '@/components/ui/text';
import { useAppRead, useAppRepository, useAppWrite } from '@/lib/api/query';
import {
  buildManualConsumptionInput,
  createEmptyManualConsumptionDraft,
  formatLocalDateTime,
  MANUAL_CONSUMPTION_CREATE_DRAFT_NAME,
  type ManualConsumptionDraft,
  type SavedManualConsumptionDraft,
} from '@/lib/consumptions/consumption';
import { getConsumptionDetailPresentation } from '@/lib/consumptions/attention-presentation';
import {
  CONSUMPTION_HISTORY_PAGE_LIMIT,
  createConsumptionHistoryPageInput,
  getConsumptionHistoryItems,
  getHistoryDateRange,
  getNextConsumptionCursor,
  type ConsumptionHistoryFilter,
} from '@/lib/consumptions/history';
import { createManualConsumptionActions } from '@/lib/consumptions/manual-actions';
import { createDraftStore } from '@/lib/data/drafts';
import { useAppData } from '@/lib/data/provider';
import { scopeKey } from '@/lib/data/scope';
import {
  createScanHistoryPageInput,
  getNextScanCursor,
  getScanHistoryItems,
  getScanHistoryPresentation,
  SCAN_HISTORY_PAGE_LIMIT,
} from '@/lib/food/history';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useInfiniteQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import * as React from 'react';
import { Icon } from '@/components/ui/icon';
import { Camera, ChevronRight, Utensils } from 'lucide-react-native';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type HistoryTab = 'consumption' | 'analysis';
const filters: { value: ConsumptionHistoryFilter; label: string }[] = [
  { value: 'all', label: 'Semua' },
  { value: '7d', label: '7 hari' },
  { value: '30d', label: '30 hari' },
];

export default function History() {
  const router = useRouter();
  const { width, fontScale } = useWindowDimensions();
  const pageGutter = width < 360 ? 16 : 20;
  const stackHeader = width < 360 || fontScale > 1.2;
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const { connectivity, scope } = useAppData();
  const repository = useAppRepository();
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = React.useState<HistoryTab>('consumption');
  const tab: HistoryTab = tabParam === 'analysis' ? 'analysis' : selectedTab;
  const [filter, setFilter] = React.useState<ConsumptionHistoryFilter>('all');
  const [filterNow, setFilterNow] = React.useState(() => new Date());
  const range = getHistoryDateRange(filter, filterNow);

  const refreshVisible = React.useCallback(() => {
    setFilterNow(new Date());
    if (scope) void queryClient.invalidateQueries({ queryKey: scopeKey(scope) });
  }, [queryClient, scope]);

  useFocusEffect(
    React.useCallback(() => {
      if (repository) refreshVisible();
    }, [repository, refreshVisible])
  );
  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && repository) refreshVisible();
    });
    return () => subscription.remove();
  }, [repository, refreshVisible]);

  const meQuery = useAppRead('getMe', {});
  const createMutation = useAppWrite('createConsumption');
  const updateMutation = useAppWrite('updateConsumption');
  const deleteMutation = useAppWrite('deleteConsumption');
  const createConsumption = createMutation.mutateAsync;
  const updateConsumption = updateMutation.mutateAsync;
  const deleteConsumption = deleteMutation.mutateAsync;

  const [isCreateDrawerOpen, setIsCreateDrawerOpen] = React.useState(false);
  const [createSubmitError, setCreateSubmitError] = React.useState<string | null>(null);
  const [isSubmittingCreate, setIsSubmittingCreate] = React.useState(false);

  const draftStore = React.useMemo(() => createDraftStore(AsyncStorage), []);
  const manualActions = React.useMemo(
    () =>
      scope
        ? createManualConsumptionActions({
            scope,
            storage: AsyncStorage,
            api: {
              create: createConsumption,
              update: updateConsumption,
              delete: deleteConsumption,
            },
          })
        : null,
    [scope, createConsumption, updateConsumption, deleteConsumption]
  );

  const [draftLoadState, setDraftLoadState] = React.useState<
    | { scopeId: string; status: 'loaded'; record: SavedManualConsumptionDraft }
    | { scopeId: string; status: 'error'; error: unknown }
    | null
  >(null);
  const recordRef = React.useRef<SavedManualConsumptionDraft | null>(null);
  const persistQueue = React.useRef<Promise<void>>(Promise.resolve());

  const scopeId = scope
    ? `${encodeURIComponent(scope.environment)}:${encodeURIComponent(scope.userId)}`
    : null;
  const currentLoadState = draftLoadState?.scopeId === scopeId ? draftLoadState : null;
  const draftRecord = currentLoadState?.status === 'loaded' ? currentLoadState.record : null;
  const draftLoadError = currentLoadState?.status === 'error' ? currentLoadState.error : null;
  const defaultTimeZone = meQuery.data?.data.timezone ?? 'Asia/Jakarta';
  const canLoadDraft = !!scope && (!!meQuery.data || !meQuery.isPending);

  React.useEffect(() => {
    if (!isCreateDrawerOpen || !scope || !scopeId || !canLoadDraft) return;
    let active = true;
    void draftStore
      .load<SavedManualConsumptionDraft>(scope, MANUAL_CONSUMPTION_CREATE_DRAFT_NAME)
      .then((saved) => {
        if (!active) return;
        const next = saved ?? createEmptyManualConsumptionDraft(defaultTimeZone);
        recordRef.current = next;
        setDraftLoadState({ scopeId, status: 'loaded', record: next });
      })
      .catch((error: unknown) => {
        if (active) setDraftLoadState({ scopeId, status: 'error', error });
      });
    return () => {
      active = false;
    };
  }, [isCreateDrawerOpen, scope, scopeId, canLoadDraft, defaultTimeZone, draftStore]);

  const updateDraftForm = (form: ManualConsumptionDraft) => {
    if (!scope || !recordRef.current) return;
    const next = { ...recordRef.current, form };
    recordRef.current = next;
    if (scopeId) setDraftLoadState({ scopeId, status: 'loaded', record: next });
    persistQueue.current = persistQueue.current
      .catch(() => {})
      .then(() => draftStore.save(scope, MANUAL_CONSUMPTION_CREATE_DRAFT_NAME, next));
  };

  const closeCreateDrawer = () => {
    setIsCreateDrawerOpen(false);
    setCreateSubmitError(null);
  };

  const submitCreate = async (form: ManualConsumptionDraft) => {
    const current = recordRef.current;
    if (!current || !scope || !manualActions || isSubmittingCreate) return;
    setCreateSubmitError(null);
    const payload = buildManualConsumptionInput(form, current.timeZone);
    if ('error' in payload) {
      setCreateSubmitError(payload.error);
      return;
    }
    setIsSubmittingCreate(true);
    try {
      await persistQueue.current;
      await manualActions.create(current.draftId, payload.value);
      try {
        await draftStore.remove(scope, MANUAL_CONSUMPTION_CREATE_DRAFT_NAME);
        await manualActions.clearCreate(current.draftId);
      } catch {
        // acknowledged
      }
      recordRef.current = null;
      setDraftLoadState(null);
      setIsCreateDrawerOpen(false);
      refreshVisible();
    } catch (error) {
      setCreateSubmitError(serviceErrorMessage(error));
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const consumptionQuery = useInfiniteQuery({
    queryKey: scope
      ? scopeKey(scope, 'listConsumptions', {
          query: { limit: CONSUMPTION_HISTORY_PAGE_LIMIT, ...(range ?? {}) },
        })
      : ['carin', 'no-session', 'listConsumptions'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      repository!.read(
        'listConsumptions',
        createConsumptionHistoryPageInput(pageParam, filter, filterNow)
      ),
    getNextPageParam: (lastPage) => getNextConsumptionCursor(lastPage.data),
    enabled: !!repository && tab === 'consumption',
    networkMode: 'always',
  });
  const scanQuery = useInfiniteQuery({
    queryKey: scope
      ? scopeKey(scope, 'listScans', { query: { limit: SCAN_HISTORY_PAGE_LIMIT } })
      : ['carin', 'no-session', 'listScans'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      repository!.read('listScans', createScanHistoryPageInput(pageParam)),
    getNextPageParam: (lastPage) => getNextScanCursor(lastPage.data),
    enabled: !!repository && tab === 'analysis',
    networkMode: 'always',
  });
  const consumptions = getConsumptionHistoryItems(consumptionQuery.data?.pages);
  const scans = getScanHistoryItems(scanQuery.data?.pages);
  const jobQueries = useQueries({
    queries: scans.map((scan) => ({
      queryKey: scope
        ? scopeKey(scope, 'getAnalysisJob', { path: { id: scan.latestJobId } })
        : ['carin', 'no-session', 'getAnalysisJob', scan.latestJobId],
      queryFn: () => repository!.read('getAnalysisJob', { path: { id: scan.latestJobId } }),
      enabled: !!repository && tab === 'analysis',
      networkMode: 'always' as const,
      refetchInterval: (query: { state: { data?: { data?: { status?: string } } } }) =>
        tab === 'analysis' &&
        (query.state.data?.data?.status === 'queued' ||
          query.state.data?.data?.status === 'processing')
          ? 4_000
          : false,
    })),
  });

  return (
    <SafeAreaView className="flex-1 bg-carin-olive-soft" edges={['top', 'left', 'right']}>
      <OnlineIndicator connectivity={connectivity} />
      <ScrollView
        className="flex-1 bg-background"
        contentInsetAdjustmentBehavior="never"
        contentContainerClassName="gap-5 pb-10"
        contentContainerStyle={{ paddingHorizontal: pageGutter }}
        showsVerticalScrollIndicator={false}>
        <View
          className={`relative items-start gap-4 overflow-hidden rounded-b-[28px] bg-carin-olive-soft pb-6 pt-4 ${stackHeader ? '' : 'flex-row justify-between'}`}
          style={{ marginHorizontal: -pageGutter, paddingHorizontal: pageGutter }}>
          <HeaderPattern />
          <View className={stackHeader ? 'w-full gap-1' : 'min-w-0 flex-1 gap-1'}>
            <Text variant="h1">Riwayat</Text>
            <Text variant="muted">Konsumsi dan hasil analisis merupakan catatan yang berbeda.</Text>
          </View>
          <Button
            tactile
            size="sm"
            className="min-h-11 shrink-0 self-start"
            onPress={() =>
              tab === 'consumption'
                ? setIsCreateDrawerOpen(true)
                : router.push('/food/capture' as Href)
            }
            accessibilityLabel={
              tab === 'consumption' ? 'Catat makanan manual' : 'Ambil foto makanan'
            }>
            <Icon as={tab === 'consumption' ? Utensils : Camera} size={16} />
            <Text>{tab === 'consumption' ? 'Catat' : 'Foto'}</Text>
          </Button>
        </View>
        <View
          className="flex-row rounded-full border border-border/60 bg-muted/40 p-1"
          accessibilityRole="tablist">
          {(
            [
              { value: 'consumption', label: 'Konsumsi' },
              { value: 'analysis', label: 'Analisis' },
            ] as const
          ).map((entry) => {
            const selected = tab === entry.value;
            return (
              <Pressable
                key={entry.value}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => {
                  setSelectedTab(entry.value);
                  if (tabParam) router.setParams({ tab: undefined });
                }}
                className={`min-h-11 flex-1 items-center justify-center rounded-full px-4 py-2 ${
                  selected ? 'shadow-xs bg-card' : 'bg-transparent'
                }`}>
                <Text
                  className={`text-sm ${
                    selected ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground'
                  }`}>
                  {entry.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {tab === 'consumption' ? (
          <View className="gap-3">
            <View className="flex-row gap-2" accessibilityLabel="Filter waktu konsumsi">
              {filters.map((entry) => {
                const selected = filter === entry.value;
                return (
                  <Pressable
                    key={entry.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setFilterNow(new Date());
                      setFilter(entry.value);
                    }}
                    className={`min-h-11 flex-1 items-center justify-center rounded-full border px-3 py-2 ${
                      selected
                        ? 'border-primary/40 bg-carin-olive-soft'
                        : 'border-border/60 bg-card'
                    }`}>
                    <Text
                      className={`text-xs ${
                        selected
                          ? 'font-semibold text-foreground'
                          : 'font-medium text-muted-foreground'
                      }`}>
                      {entry.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {consumptions.length ? (
              consumptions.map((item) => {
                const local = formatLocalDateTime(new Date(item.consumedAt), item.timezone);
                const attention = getConsumptionDetailPresentation(item).attention.title;
                const foods = item.snapshot.components
                  .slice(0, 2)
                  .map((component) => component.displayName);
                return (
                  <Pressable
                    key={item.id}
                    className="min-h-16 gap-2.5 rounded-summary border border-border/60 bg-card p-4 active:bg-accent/30"
                    accessibilityRole="button"
                    accessibilityLabel={`Buka catatan ${foods.join(', ') || 'konsumsi'} tanggal ${local.date}`}
                    onPress={() =>
                      router.push({
                        pathname: '/consumptions/[id]',
                        params: { id: item.id },
                      } as Href)
                    }>
                    <View className="flex-row items-start justify-between gap-2">
                      <Text variant="h4" className="flex-1 font-bold text-foreground">
                        {foods.join(' · ') || 'Catatan konsumsi'}
                      </Text>
                      <View className="flex-row items-center gap-1">
                        <Text variant="caption" className="text-muted-foreground">
                          {local.time}
                        </Text>
                        <Icon as={ChevronRight} size={16} className="text-muted-foreground" />
                      </View>
                    </View>
                    <Text variant="caption" className="text-muted-foreground">
                      {local.date} ({item.timezone})
                    </Text>
                    <View className="flex-row flex-wrap items-center gap-1.5 pt-0.5">
                      <View className="rounded-full bg-carin-olive-soft px-2.5 py-0.5">
                        <Text className="text-xs font-semibold text-foreground">
                          {item.source === 'manual' ? 'Catatan manual' : 'Konfirmasi dari foto'}
                        </Text>
                      </View>
                      {attention ? (
                        <View className="rounded-full bg-muted/80 px-2.5 py-0.5">
                          <Text className="text-xs text-muted-foreground">{attention}</Text>
                        </View>
                      ) : null}
                      {item.source === 'photo_confirmation' && !item.photoAvailable ? (
                        <View className="rounded-full bg-destructive/10 px-2.5 py-0.5">
                          <Text className="text-xs text-destructive">Foto sumber dihapus</Text>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })
            ) : consumptionQuery.isPending ? (
              <ActivityIndicator accessibilityLabel="Memuat riwayat konsumsi" />
            ) : consumptionQuery.error ? (
              <ServiceError
                error={consumptionQuery.error}
                onRetry={() => void consumptionQuery.refetch()}
              />
            ) : (
              <View className="items-center gap-3 rounded-summary border border-border/60 bg-card p-6 py-8">
                <View
                  className="items-center justify-center bg-carin-butter"
                  style={{
                    borderTopLeftRadius: 25,
                    borderTopRightRadius: 31,
                    borderBottomRightRadius: 23,
                    borderBottomLeftRadius: 29,
                    width: 68,
                    height: 68,
                  }}>
                  <Icon as={Utensils} className="text-primary" size={26} />
                </View>
                <Text variant="h3" className="text-center font-bold">
                  Belum ada konsumsi tercatat
                </Text>
                <Text className="text-center text-muted-foreground">
                  Hasil analisis foto tidak otomatis menjadi catatan makan. Catat makanan setelah
                  kamu memakannya.
                </Text>
                <Button
                  tactile
                  className="mt-2 min-h-12"
                  onPress={() => setIsCreateDrawerOpen(true)}>
                  <Text>Catat makanan manual</Text>
                </Button>
              </View>
            )}
            {consumptions.length && consumptionQuery.error ? (
              <ServiceError
                error={consumptionQuery.error}
                onRetry={() => void consumptionQuery.refetch()}
              />
            ) : null}
            {consumptionQuery.hasNextPage ? (
              <Button
                variant="outline"
                className="min-h-12"
                disabled={consumptionQuery.isFetchingNextPage}
                onPress={() => void consumptionQuery.fetchNextPage()}>
                {consumptionQuery.isFetchingNextPage ? (
                  <ActivityIndicator />
                ) : (
                  <Text>Muat catatan lebih lama</Text>
                )}
              </Button>
            ) : null}
            {consumptionQuery.data?.pages.some((page) => page.stale) ? (
              <Text variant="muted">
                Data terakhir tersimpan ditampilkan. Muat ulang saat online.
              </Text>
            ) : null}
          </View>
        ) : (
          <View className="gap-3">
            <Text variant="muted">Analisis foto belum berarti makanan sudah dimakan.</Text>
            {scans.length ? (
              scans.map((scan, index) => {
                const jobQuery = jobQueries[index];
                const presentation = getScanHistoryPresentation(scan, jobQuery?.data?.data ?? null);
                return (
                  <View
                    key={scan.id}
                    className="gap-3 rounded-summary border border-border/60 bg-card p-4">
                    <View className="flex-row items-start justify-between gap-2">
                      <View className="flex-1 gap-0.5">
                        <Text variant="h4" className="font-bold text-foreground">
                          Analisis foto
                        </Text>
                        <Text variant="caption" className="text-muted-foreground">
                          {new Date(scan.createdAt).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </Text>
                      </View>
                      <View className="rounded-full bg-carin-olive-soft px-2.5 py-0.5">
                        <Text className="text-xs font-semibold text-foreground">
                          {jobQuery?.isPending ? 'Memuat status…' : presentation.statusLabel}
                        </Text>
                      </View>
                    </View>
                    {jobQuery?.data?.data.status === 'failed' && jobQuery.data.data.error ? (
                      <Text variant="caption" className="text-destructive">
                        {jobQuery.data.data.error.message}
                      </Text>
                    ) : null}
                    <View className="flex-row items-center gap-3">
                      <PhotoThumbnail
                        photoId={scan.photoId}
                        accessibilityLabel={
                          scan.photoId === null
                            ? 'Foto sumber telah dihapus'
                            : 'Thumbnail foto makanan yang dianalisis'
                        }
                        fallbackLabel={scan.photoId === null ? 'Foto dihapus' : undefined}
                      />
                      <View className="flex-1 gap-1">
                        <Text variant="muted">{presentation.consumptionLabel}</Text>
                        {scan.photoId === null ? (
                          <Text variant="caption" className="text-muted-foreground">
                            Foto sumber telah dihapus
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    {jobQuery?.error ? (
                      <ServiceError
                        error={jobQuery.error}
                        onRetry={() => void jobQuery.refetch()}
                      />
                    ) : null}
                    <View className="gap-2 pt-1">
                      <Button
                        variant="outline"
                        className="min-h-12"
                        disabled={!!jobQuery?.error}
                        onPress={() =>
                          router.push({
                            pathname: '/food/analysis/[id]',
                            params: { id: scan.latestJobId },
                          } as Href)
                        }>
                        <Text>
                          {jobQuery?.data?.data.status === 'failed'
                            ? 'Buka analisis dan coba lagi'
                            : 'Buka analisis'}
                        </Text>
                      </Button>
                      {scan.defaultConsumptionId ? (
                        <Button
                          variant="outline"
                          className="min-h-12"
                          onPress={() =>
                            router.push({
                              pathname: '/consumptions/[id]',
                              params: { id: scan.defaultConsumptionId! },
                            } as Href)
                          }>
                          <Text>Buka catatan konsumsi</Text>
                        </Button>
                      ) : null}
                      <ScanDeletionControl
                        scanId={scan.id}
                        jobId={scan.latestJobId}
                        photoId={scan.photoId}
                      />
                    </View>
                  </View>
                );
              })
            ) : scanQuery.isPending ? (
              <ActivityIndicator accessibilityLabel="Memuat riwayat analisis" />
            ) : scanQuery.error ? (
              <ServiceError error={scanQuery.error} onRetry={() => void scanQuery.refetch()} />
            ) : (
              <View className="items-center gap-3 rounded-summary border border-border/60 bg-card p-6 py-8">
                <View
                  className="items-center justify-center bg-carin-butter"
                  style={{
                    borderTopLeftRadius: 25,
                    borderTopRightRadius: 31,
                    borderBottomRightRadius: 23,
                    borderBottomLeftRadius: 29,
                    width: 68,
                    height: 68,
                  }}>
                  <Icon as={Camera} className="text-primary" size={26} />
                </View>
                <Text variant="h3" className="text-center font-bold">
                  Belum ada analisis foto
                </Text>
                <Text className="text-center text-muted-foreground">
                  Ambil foto makanan sebelum makan untuk memeriksa perkiraan komponen gizinya.
                </Text>
                <Button
                  tactile
                  className="mt-2 min-h-12"
                  onPress={() => router.push('/food/capture' as Href)}>
                  <Text>Ambil foto makanan</Text>
                </Button>
              </View>
            )}
            {scans.length && scanQuery.error ? (
              <ServiceError error={scanQuery.error} onRetry={() => void scanQuery.refetch()} />
            ) : null}
            {scanQuery.hasNextPage ? (
              <Button
                variant="outline"
                className="min-h-12"
                disabled={scanQuery.isFetchingNextPage}
                onPress={() => void scanQuery.fetchNextPage()}>
                {scanQuery.isFetchingNextPage ? (
                  <ActivityIndicator />
                ) : (
                  <Text>Muat analisis lebih lama</Text>
                )}
              </Button>
            ) : null}
            {scanQuery.data?.pages.some((page) => page.stale) ? (
              <Text variant="muted">
                Data terakhir tersimpan ditampilkan. Muat ulang saat online.
              </Text>
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* In-place Meal Logging Drawer */}
      <Drawer
        isOpen={isCreateDrawerOpen}
        onClose={closeCreateDrawer}
        title="Catat makanan manual"
        description="Catatan manual tidak memerlukan foto atau analisis kamera."
        maxHeightRatio={0.92}>
        {draftLoadError ? (
          <View className="gap-4 py-4" accessibilityRole="alert">
            <View className="gap-2 rounded-summary border border-destructive/30 bg-destructive/10 p-5">
              <Text variant="h3" className="text-destructive">
                Draft belum dapat dibuka
              </Text>
              <Text className="text-foreground">{serviceErrorMessage(draftLoadError)}</Text>
            </View>
            <Button variant="outline" className="min-h-12 w-full" onPress={closeCreateDrawer}>
              <Text>Tutup</Text>
            </Button>
          </View>
        ) : draftRecord ? (
          <ConsumptionForm
            isDrawer
            draft={draftRecord.form}
            timeZone={draftRecord.timeZone}
            title="Catat yang sudah dimakan"
            description="Catatan manual tidak memerlukan foto atau analisis kamera."
            submitLabel="Simpan catatan"
            isSubmitting={isSubmittingCreate}
            submitError={createSubmitError}
            onChange={updateDraftForm}
            onSubmit={(form) => void submitCreate(form)}
            onBack={closeCreateDrawer}
          />
        ) : (
          <View className="items-center justify-center gap-3 py-12">
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
              <ActivityIndicator size="small" accessibilityLabel="Membuka draft konsumsi" />
            </View>
            <Text variant="caption" className="text-muted-foreground">
              Membuka draft konsumsi…
            </Text>
          </View>
        )}
      </Drawer>
    </SafeAreaView>
  );
}
