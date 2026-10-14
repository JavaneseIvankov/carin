import { ServiceError } from '@/components/app/service-error';
import { ReadState } from '@/components/app/read-state';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { ExaminationSeriesChart } from '@/components/exams/ExaminationSeriesChart';
import { useAppRead, useAppRepository } from '@/lib/api/query';
import type { components } from '@/lib/api/generated/app-api';
import {
  formatMeasuredAt,
  formatMeasurement,
  localizedSeriesLabel,
  recordTitle,
} from '@/lib/exams/model';
import { Link, useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { ChevronRight, FlaskConical } from 'lucide-react-native';
import { useAppData } from '@/lib/data/provider';
import { useInfiniteQuery } from '@tanstack/react-query';
import { scopeKey } from '@/lib/data/scope';

type Examination = components['schemas']['Examination'];
type ExamType = Examination['record']['type'];
const filters: { value: ExamType | null; label: string }[] = [
  { value: null, label: 'Semua' },
  { value: 'pressure', label: 'Tekanan darah' },
  { value: 'glucose', label: 'Gula darah' },
  { value: 'cholesterol', label: 'Kolesterol' },
];

function recordValue(record: Examination['record']) {
  if (record.type === 'pressure') {
    return `${formatMeasurement(record.systolic)} / ${formatMeasurement(record.diastolic)} ${record.unit}`;
  }
  return `${formatMeasurement(record.value)} ${record.unit}`;
}

export default function Exams() {
  const router = useRouter();
  const { connectivity, scope } = useAppData();
  const repository = useAppRepository();
  const [type, setType] = React.useState<ExamType | null>(null);
  const [seriesKey, setSeriesKey] = React.useState<string | null>(null);
  const list = useInfiniteQuery({
    queryKey: scope
      ? scopeKey(scope, 'listExaminations', { type, seriesKey })
      : ['carin', 'no-session', 'listExaminations', type, seriesKey],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      repository!.read('listExaminations', {
        query: {
          limit: 30,
          cursor: pageParam,
          type: type ?? undefined,
          seriesKey: seriesKey ?? undefined,
        },
      }),
    getNextPageParam: (lastPage) => lastPage.data.nextCursor ?? undefined,
    enabled: !!repository,
    networkMode: 'always',
  });
  const series = useAppRead('getExaminationSeries', {});
  const items = React.useMemo(
    () => list.data?.pages.flatMap(({ data }) => data.items) ?? [],
    [list.data]
  );
  const readState = list.data?.pages[0];

  const changeFilter = (nextType: ExamType | null) => {
    setType(nextType);
    setSeriesKey(null);
  };
  const changeSeries = (nextKey: string | null) => {
    setSeriesKey(nextKey);
    setType(null);
  };

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-5 p-5 pb-10">
      <View className="flex-row items-start justify-between gap-4">
        <View className="flex-1 gap-1">
          <Text variant="h1">Pemeriksaan</Text>
          <Text variant="muted">Simpan hasil pengukuran untuk dilihat kembali.</Text>
        </View>
        <Button
          tactile
          onPress={() => router.push('/exams/new')}
          accessibilityLabel="Catat pemeriksaan baru">
          <Text>Tambah</Text>
        </Button>
      </View>

      {readState && (
        <ReadState
          updatedAt={readState.updatedAt}
          stale={readState.stale}
          connectivity={connectivity}
        />
      )}

      <View className="gap-2">
        <Text className="font-semibold text-foreground">Filter jenis</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2">
          {filters.map((filter) => {
            const selected = type === filter.value && !seriesKey;
            return (
              <Pressable
                key={filter.label}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => changeFilter(filter.value)}
                className={`min-h-11 justify-center rounded-full border px-4 py-2 ${
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
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {(series.data?.data?.length ?? 0) > 0 && (
        <View className="gap-2">
          <Text className="font-semibold text-foreground">Seri sebanding</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2">
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: !seriesKey }}
              onPress={() => changeSeries(null)}
              className={`min-h-11 justify-center rounded-full border px-4 py-2 ${
                !seriesKey
                  ? 'border-primary/40 bg-carin-olive-soft'
                  : 'border-border/60 bg-card'
              }`}>
              <Text
                className={`text-xs ${
                  !seriesKey
                    ? 'font-semibold text-foreground'
                    : 'font-medium text-muted-foreground'
                }`}>
                Semua seri
              </Text>
            </Pressable>
            {series.data!.data.map((item) => {
              const selected = seriesKey === item.key;
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => changeSeries(selected ? null : item.key)}
                  className={`min-h-11 justify-center rounded-full border px-4 py-2 ${
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
                    {localizedSeriesLabel(item)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {series.isPending ? (
        <View className="gap-3 rounded-summary border border-border/60 bg-card p-4">
          <Text variant="muted">Memuat ringkasan seri…</Text>
        </View>
      ) : series.error ? (
        <ServiceError error={series.error} onRetry={() => void series.refetch()} />
      ) : (series.data?.data.length ?? 0) > 0 ? (
        <View className="gap-3">
          <Text variant="h3">Ringkasan pengukuran</Text>
          {series.data!.data.map((item) => (
            <ExaminationSeriesChart key={item.key} series={item} />
          ))}
        </View>
      ) : null}

      {list.isPending && items.length === 0 ? (
        <View className="gap-3 rounded-summary border border-border/60 bg-card p-5">
          <Text variant="large">Memuat pemeriksaan…</Text>
          <View className="h-2 rounded-full bg-muted" />
          <View className="h-2 w-2/3 rounded-full bg-muted" />
        </View>
      ) : list.error && items.length === 0 ? (
        <ServiceError error={list.error} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
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
            <Icon as={FlaskConical} className="text-primary" size={26} />
          </View>
          <Text variant="h3" className="text-center font-bold">
            Belum ada catatan pemeriksaan
          </Text>
          <Text className="text-center text-muted-foreground">
            Tambahkan hasil tekanan darah, gula darah, atau kolesterol untuk menyimpannya dengan tanggal pengukuran.
          </Text>
          <Button
            tactile
            className="mt-2 min-h-12"
            onPress={() => router.push('/exams/new')}>
            <Text>Catat pemeriksaan baru</Text>
          </Button>
        </View>
      ) : (
        <View className="gap-3">
          <Text variant="h3">Catatan pemeriksaan</Text>
          {list.error && <ServiceError error={list.error} onRetry={() => void list.refetch()} />}
          {items.map((item) => (
            <Link key={item.id} href={{ pathname: '/exams/[id]', params: { id: item.id } }} asChild>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${recordTitle(item.record)}, ${recordValue(item.record)}, ${formatMeasuredAt(item.record)}`}
                className="gap-2.5 rounded-summary border border-border/60 bg-card p-4 active:bg-accent/30">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1 gap-0.5">
                    <Text variant="h4" className="font-bold text-foreground">
                      {recordTitle(item.record)}
                    </Text>
                    <Text variant="caption" className="text-muted-foreground">
                      Diukur {formatMeasuredAt(item.record)}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1 mt-0.5">
                    <Icon as={ChevronRight} size={16} className="text-muted-foreground" />
                  </View>
                </View>
                <Text variant="metric" className="text-foreground">
                  {recordValue(item.record)}
                </Text>
                {!!item.record.note && (
                  <View className="rounded-control bg-muted/40 p-2.5">
                    <Text variant="caption" className="text-muted-foreground" numberOfLines={2}>
                      {item.record.note}
                    </Text>
                  </View>
                )}
              </Pressable>
            </Link>
          ))}
          {list.hasNextPage && (
            <Button
              variant="outline"
              disabled={list.isFetchingNextPage}
              onPress={() => void list.fetchNextPage()}>
              <Text>{list.isFetchingNextPage ? 'Memuat…' : 'Muat catatan sebelumnya'}</Text>
            </Button>
          )}
        </View>
      )}
    </ScrollView>
  );
}
