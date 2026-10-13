import { ServiceError } from '@/components/app/service-error';
import { ReadState } from '@/components/app/read-state';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { ExaminationSeriesChart } from '@/components/exams/ExaminationSeriesChart';
import { useAppRead, useAppRepository } from '@/lib/api/query';
import type { components } from '@/lib/api/generated/app-api';
import { formatMeasuredAt, formatMeasurement, recordTitle } from '@/lib/exams/model';
import { Link, useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
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
          <Text variant="h3">Pemeriksaan</Text>
          <Text variant="muted">Simpan hasil pengukuran untuk dilihat kembali.</Text>
        </View>
        <Button
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
        <Text className="font-medium">Filter jenis</Text>
        <View className="flex-row flex-wrap gap-2">
          {filters.map((filter) => {
            const selected = type === filter.value && !seriesKey;
            return (
              <Pressable
                key={filter.label}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => changeFilter(filter.value)}
                className={`min-h-11 justify-center rounded-full border px-4 ${selected ? 'border-primary bg-accent' : 'border-border bg-card'}`}>
                <Text className={selected ? 'font-semibold text-accent-foreground' : ''}>
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {(series.data?.data?.length ?? 0) > 0 && (
        <View className="gap-2">
          <Text className="font-medium">Seri sebanding</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2">
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: !seriesKey }}
              onPress={() => changeSeries(null)}
              className={`min-h-11 justify-center rounded-full border px-4 ${!seriesKey ? 'border-primary bg-accent' : 'border-border bg-card'}`}>
              <Text>Semua seri</Text>
            </Pressable>
            {series.data!.data.map((item) => (
              <Pressable
                key={item.key}
                accessibilityRole="radio"
                accessibilityState={{ selected: seriesKey === item.key }}
                onPress={() => changeSeries(seriesKey === item.key ? null : item.key)}
                className={`min-h-11 justify-center rounded-full border px-4 ${seriesKey === item.key ? 'border-primary bg-accent' : 'border-border bg-card'}`}>
                <Text>{item.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {series.isPending ? (
        <View className="gap-3 rounded-xl border border-border bg-card p-4">
          <Text variant="muted">Memuat ringkasan seri…</Text>
        </View>
      ) : series.error ? (
        <ServiceError error={series.error} onRetry={() => void series.refetch()} />
      ) : (series.data?.data.length ?? 0) > 0 ? (
        <View className="gap-3">
          <Text variant="h4">Ringkasan pengukuran</Text>
          {series.data!.data.map((item) => (
            <ExaminationSeriesChart key={item.key} series={item} />
          ))}
        </View>
      ) : null}

      {list.isPending && items.length === 0 ? (
        <View className="gap-2 rounded-xl border border-border bg-card p-5">
          <Text variant="large">Memuat pemeriksaan…</Text>
          <View className="h-2 rounded bg-muted" />
          <View className="h-2 w-2/3 rounded bg-muted" />
        </View>
      ) : list.error && items.length === 0 ? (
        <ServiceError error={list.error} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <View className="items-start gap-3 rounded-xl border border-border bg-card p-5">
          <Text variant="large">Belum ada catatan pemeriksaan</Text>
          <Text variant="muted">
            Tambahkan hasil tekanan darah, gula darah, atau kolesterol untuk menyimpannya dengan
            tanggal pengukuran.
          </Text>
          <Button variant="outline" onPress={() => router.push('/exams/new')}>
            <Text>Catat pemeriksaan</Text>
          </Button>
        </View>
      ) : (
        <View className="gap-3">
          <Text variant="h4">Catatan pemeriksaan</Text>
          {list.error && <ServiceError error={list.error} onRetry={() => void list.refetch()} />}
          {items.map((item) => (
            <Link key={item.id} href={{ pathname: '/exams/[id]', params: { id: item.id } }} asChild>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${recordTitle(item.record)}, ${recordValue(item.record)}, ${formatMeasuredAt(item.record)}`}
                className="gap-2 rounded-xl border border-border bg-card p-4">
                <View className="flex-row items-start justify-between gap-3">
                  <Text className="flex-1 font-semibold">{recordTitle(item.record)}</Text>
                  <Text variant="muted">Buka</Text>
                </View>
                <Text variant="large">{recordValue(item.record)}</Text>
                <Text variant="muted">Diukur {formatMeasuredAt(item.record)}</Text>
                {!!item.record.note && (
                  <Text variant="muted" numberOfLines={2}>
                    {item.record.note}
                  </Text>
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
