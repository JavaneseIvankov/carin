import * as Crypto from 'expo-crypto';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { ReadState } from '@/components/app/read-state';
import { ServiceError } from '@/components/app/service-error';
import { ExaminationSeriesChart } from '@/components/exams/ExaminationSeriesChart';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAppRead, useAppWrite } from '@/lib/api/query';
import { useAppData } from '@/lib/data/provider';
import { formatMeasuredAt, formatMeasurement, recordTitle } from '@/lib/exams/model';

export default function ExaminationDetail() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { connectivity } = useAppData();
  const examination = useAppRead('getExamination', { path: { id } });
  const series = useAppRead('getExaminationSeries', {});
  const remove = useAppWrite('deleteExamination');
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const idempotencyKey = React.useRef<string | null>(null);
  const item = examination.data?.data;
  const record = item?.record;
  const matchingSeries = series.data?.data.find(({ items }) =>
    items.some(({ id: itemId }) => itemId === id)
  );

  const deleteRecord = async () => {
    idempotencyKey.current ??= Crypto.randomUUID();
    try {
      await remove.mutateAsync({
        path: { id },
        headers: { 'Idempotency-Key': idempotencyKey.current },
      });
      router.replace('/(tabs)/exams');
    } catch {
      // Preserve the key for retry if the acknowledgement was lost.
    }
  };

  if (!item && examination.isPending) {
    return (
      <View className="flex-1 justify-center bg-background p-5">
        <Text variant="muted">Memuat pemeriksaan…</Text>
      </View>
    );
  }
  if (!item && examination.error) {
    return (
      <View className="flex-1 gap-4 bg-background p-5">
        <ServiceError error={examination.error} onRetry={() => void examination.refetch()} />
        <Button variant="outline" onPress={() => router.replace('/(tabs)/exams')}>
          <Text>Kembali ke pemeriksaan</Text>
        </Button>
      </View>
    );
  }
  if (!item || !record) return null;

  const value =
    record.type === 'pressure'
      ? `${formatMeasurement(record.systolic)} / ${formatMeasurement(record.diastolic)} ${record.unit}`
      : `${formatMeasurement(record.value)} ${record.unit}`;

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-5 p-5 pb-10">
      <Link href="/(tabs)/exams" asChild>
        <Pressable accessibilityRole="button" className="min-h-11 justify-center self-start px-0">
          <Text className="font-medium text-primary">‹ Kembali ke pemeriksaan</Text>
        </Pressable>
      </Link>
      {examination.data && (
        <ReadState
          updatedAt={examination.data.updatedAt}
          stale={examination.data.stale}
          connectivity={connectivity}
        />
      )}
      {examination.error && (
        <ServiceError error={examination.error} onRetry={() => void examination.refetch()} />
      )}
      <View className="gap-3 rounded-summary border border-border bg-card p-5">
        <View className="flex-row items-center justify-between">
          <Text variant="h3">{recordTitle(record)}</Text>
          <View className="rounded-full bg-carin-olive-soft px-3 py-1">
            <Text variant="caption" className="font-semibold text-foreground">
              {record.unit}
            </Text>
          </View>
        </View>
        <Text variant="metric" className="text-primary">{value}</Text>
        <View className="gap-1 border-t border-border pt-3">
          <Text variant="body" className="text-foreground">Diukur {formatMeasuredAt(record)}</Text>
          <Text variant="caption" className="text-muted-foreground">Zona waktu pencatatan: {record.timezone}</Text>
          {!!record.note && (
            <View className="mt-2 rounded-control bg-muted/40 p-3">
              <Text variant="body" className="text-foreground">{record.note}</Text>
            </View>
          )}
        </View>
      </View>

      {series.isPending ? (
        <Text variant="muted">Memuat seri sebanding…</Text>
      ) : series.error ? (
        <ServiceError error={series.error} onRetry={() => void series.refetch()} />
      ) : matchingSeries ? (
        <ExaminationSeriesChart series={matchingSeries} />
      ) : null}

      <View className="flex-row flex-wrap gap-3">
        <Button
          variant="outline"
          onPress={() => router.push({ pathname: '/exams/[id]/edit', params: { id } })}>
          <Text>Edit catatan</Text>
        </Button>
        <Button
          variant="destructive"
          onPress={() => setConfirmDelete(true)}
          disabled={remove.isPending}>
          <Text>Hapus catatan</Text>
        </Button>
      </View>

      {confirmDelete && (
        <View
          className="gap-3 rounded-summary border border-destructive/40 bg-card p-5"
          accessibilityRole="alert">
          <Text className="font-semibold text-foreground">Hapus catatan pemeriksaan ini?</Text>
          <Text variant="muted">
            Catatan ini akan dikeluarkan dari daftar dan ringkasan pemeriksaan.
          </Text>
          {remove.error && <ServiceError error={remove.error} />}
          <View className="flex-row flex-wrap gap-2 pt-1">
            <Button
              variant="outline"
              disabled={remove.isPending}
              onPress={() => {
                setConfirmDelete(false);
                if (!remove.error) {
                  idempotencyKey.current = null;
                  remove.reset();
                }
              }}>
              <Text>Batal</Text>
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onPress={() => void deleteRecord()}>
              <Text>{remove.isPending ? 'Menghapus…' : 'Konfirmasi hapus'}</Text>
            </Button>
          </View>
        </View>
      )}
    </ScrollView>
  );
}
