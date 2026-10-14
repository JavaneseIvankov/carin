import { OnlineIndicator } from '@/components/app/online-indicator';
import { ServiceError } from '@/components/app/service-error';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAppRepository } from '@/lib/api/query';
import { formatLocalDateTime } from '@/lib/consumptions/consumption';
import { getConsumptionDetailPresentation } from '@/lib/consumptions/attention-presentation';
import {
  CONSUMPTION_HISTORY_PAGE_LIMIT,
  createConsumptionHistoryPageInput,
  getConsumptionHistoryItems,
  getHistoryDateRange,
  getNextConsumptionCursor,
  type ConsumptionHistoryFilter,
} from '@/lib/consumptions/history';
import { useAppData } from '@/lib/data/provider';
import { scopeKey } from '@/lib/data/scope';
import {
  createScanHistoryPageInput,
  getNextScanCursor,
  getScanHistoryItems,
  getScanHistoryPresentation,
  SCAN_HISTORY_PAGE_LIMIT,
} from '@/lib/food/history';
import { useInfiniteQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import * as React from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, View } from 'react-native';

type HistoryTab = 'consumption' | 'analysis';
const filters: { value: ConsumptionHistoryFilter; label: string }[] = [
  { value: 'all', label: 'Semua' },
  { value: '7d', label: '7 hari' },
  { value: '30d', label: '30 hari' },
];

export default function History() {
  const router = useRouter();
  const { connectivity, scope } = useAppData();
  const repository = useAppRepository();
  const queryClient = useQueryClient();
  const [tab, setTab] = React.useState<HistoryTab>('consumption');
  const [filter, setFilter] = React.useState<ConsumptionHistoryFilter>('all');
  const [filterNow, setFilterNow] = React.useState(() => new Date());
  const range = getHistoryDateRange(filter, filterNow);
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

  return (
    <View className="flex-1 bg-background">
      <OnlineIndicator connectivity={connectivity} />
      <ScrollView contentContainerClassName="gap-5 px-5 pb-10 pt-7">
        <View className="gap-2">
          <Text variant="h2">Riwayat</Text>
          <Text variant="muted">Konsumsi dan hasil analisis merupakan catatan yang berbeda.</Text>
          <Button className="min-h-12" onPress={() => router.push('/consumptions/new' as Href)}>
            <Text>Catat makanan secara manual</Text>
          </Button>
        </View>
        <View className="flex-row gap-2" accessibilityRole="tablist">
          {(
            [
              { value: 'consumption', label: 'Konsumsi' },
              { value: 'analysis', label: 'Analisis' },
            ] as const
          ).map((entry) => (
            <Pressable
              key={entry.value}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === entry.value }}
              onPress={() => setTab(entry.value)}
              className={`min-h-12 flex-1 items-center justify-center rounded-xl border p-3 ${tab === entry.value ? 'border-primary bg-primary' : 'border-border bg-card'}`}>
              <Text className={tab === entry.value ? 'text-primary-foreground' : ''}>
                {entry.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {tab === 'consumption' ? (
          <View className="gap-3">
            <View className="flex-row gap-2" accessibilityLabel="Filter waktu konsumsi">
              {filters.map((entry) => (
                <Pressable
                  key={entry.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: filter === entry.value }}
                  onPress={() => {
                    setFilterNow(new Date());
                    setFilter(entry.value);
                  }}
                  className={`min-h-11 flex-1 items-center justify-center rounded-lg border p-2 ${filter === entry.value ? 'border-primary' : 'border-border'}`}>
                  <Text>{entry.label}</Text>
                </Pressable>
              ))}
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
                    className="min-h-16 gap-1 rounded-xl border border-border bg-card p-4"
                    accessibilityRole="button"
                    accessibilityLabel={`Buka catatan ${foods.join(', ') || 'konsumsi'} tanggal ${local.date}`}
                    onPress={() =>
                      router.push({
                        pathname: '/consumptions/[id]',
                        params: { id: item.id },
                      } as Href)
                    }>
                    <Text variant="large">{foods.join(' · ') || 'Catatan konsumsi'}</Text>
                    <Text variant="muted">
                      {local.date} · {local.time} ({item.timezone})
                    </Text>
                    <Text variant="muted">
                      {item.source === 'manual' ? 'Catatan manual' : 'Konfirmasi dari foto'} ·{' '}
                      {attention}
                    </Text>
                    {item.source === 'photo_confirmation' && !item.photoAvailable ? (
                      <Text variant="muted">Foto sumber telah dihapus</Text>
                    ) : null}
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
              <View className="gap-2 rounded-xl border border-dashed border-border p-4">
                <Text variant="large">Belum ada konsumsi tercatat</Text>
                <Text variant="muted">
                  Hasil analisis foto tidak otomatis menjadi catatan makan.
                </Text>
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
                  <View key={scan.id} className="gap-2 rounded-xl border border-border bg-card p-4">
                    <Text variant="large">
                      Analisis foto · {new Date(scan.createdAt).toLocaleDateString('id-ID')}
                    </Text>
                    <Text variant="muted">
                      {jobQuery?.isPending ? 'Memuat status analisis…' : presentation.statusLabel}
                    </Text>
                    {jobQuery?.data?.data.status === 'failed' && jobQuery.data.data.error ? (
                      <Text variant="muted">{jobQuery.data.data.error.message}</Text>
                    ) : null}
                    <Text variant="muted">{presentation.consumptionLabel}</Text>
                    {scan.photoId === null ? (
                      <Text variant="muted">Foto sumber telah dihapus</Text>
                    ) : null}
                    {jobQuery?.error ? (
                      <ServiceError
                        error={jobQuery.error}
                        onRetry={() => void jobQuery.refetch()}
                      />
                    ) : null}
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
                  </View>
                );
              })
            ) : scanQuery.isPending ? (
              <ActivityIndicator accessibilityLabel="Memuat riwayat analisis" />
            ) : scanQuery.error ? (
              <ServiceError error={scanQuery.error} onRetry={() => void scanQuery.refetch()} />
            ) : (
              <View className="gap-2 rounded-xl border border-dashed border-border p-4">
                <Text variant="large">Belum ada analisis foto</Text>
                <Text variant="muted">Analisis makanan baru akan tampil di sini.</Text>
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
    </View>
  );
}
