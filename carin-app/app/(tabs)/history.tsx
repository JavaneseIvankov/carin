import { OnlineIndicator } from '@/components/app/online-indicator';
import { ServiceError } from '@/components/app/service-error';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAppRead } from '@/lib/api/query';
import { formatLocalDateTime } from '@/lib/consumptions/consumption';
import { getConsumptionDetailPresentation } from '@/lib/consumptions/attention-presentation';
import { useAppData } from '@/lib/data/provider';
import { useRouter, type Href } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

export default function History() {
  const router = useRouter();
  const { connectivity } = useAppData();
  const consumptionQuery = useAppRead('listConsumptions', { query: { limit: 20 } });
  const page = consumptionQuery.data?.data;

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

        <View className="gap-3">
          <Text variant="h3">Konsumsi</Text>
          {page?.items.length ? (
            page.items.map((item) => {
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
                    router.push({ pathname: '/consumptions/[id]', params: { id: item.id } } as Href)
                  }>
                  <Text variant="large">{foods.join(' · ') || 'Catatan konsumsi'}</Text>
                  <Text variant="muted">
                    {local.date} · {local.time} ({item.timezone})
                  </Text>
                  <Text variant="muted">
                    {item.source === 'manual' ? 'Catatan manual' : 'Konfirmasi dari foto'} ·{' '}
                    {attention}
                  </Text>
                </Pressable>
              );
            })
          ) : consumptionQuery.isPending ? (
            <View className="flex-row items-center gap-3">
              <ActivityIndicator accessibilityLabel="Memuat riwayat konsumsi" />
              <Text variant="muted">Memuat riwayat konsumsi…</Text>
            </View>
          ) : consumptionQuery.error ? (
            <ServiceError
              error={consumptionQuery.error}
              onRetry={() => void consumptionQuery.refetch()}
            />
          ) : (
            <View className="gap-2 rounded-xl border border-dashed border-border p-4">
              <Text variant="large">Belum ada konsumsi tercatat</Text>
              <Text variant="muted">Catatan manual tidak memerlukan foto atau hasil analisis.</Text>
            </View>
          )}
          {consumptionQuery.data?.stale || consumptionQuery.error ? (
            <Text variant="muted">
              Data terakhir tersimpan ditampilkan. Muat ulang saat online.
            </Text>
          ) : null}
        </View>

        <View className="gap-2 rounded-xl border border-border p-4">
          <Text variant="h4">Analisis makanan</Text>
          <Text variant="muted">
            Hasil analisis foto ditampilkan terpisah dari konsumsi yang sudah disimpan.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
