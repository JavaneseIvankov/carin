import { ServiceError } from '@/components/app/service-error';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAppRead } from '@/lib/api/query';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import * as React from 'react';
import { AppState, View } from 'react-native';

export function AnalysisConsumptionStatus({
  consumptionId,
  scanId,
  resultId,
}: {
  consumptionId: string;
  scanId: string;
  resultId: string | null;
}) {
  const router = useRouter();
  const query = useAppRead('getConsumption', { path: { id: consumptionId } });
  const refetch = query.refetch;
  useFocusEffect(
    React.useCallback(() => {
      void refetch();
    }, [refetch])
  );
  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refetch();
    });
    return () => subscription.remove();
  }, [refetch]);

  const consumption = query.data?.data;
  const matching = consumption?.scanId === scanId ? consumption : null;
  const date = matching ? new Date(matching.consumedAt) : null;
  const foodNames = matching?.snapshot.components
    .map((component) => component.displayName)
    .join(' · ');

  return (
    <View className="gap-1 border-b border-border pb-4">
      <Text variant="label">Catatan makan terkait</Text>
      {matching && date ? (
        <>
          <Text>
            {date.toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              timeZone: matching.timezone,
            })}
            {' · '}
            {date.toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: matching.timezone,
            })}
          </Text>
          {foodNames ? (
            <Text variant="caption" className="text-muted-foreground">
              {foodNames}
            </Text>
          ) : null}
          <Text variant="caption" className="text-muted-foreground">
            {matching.timezone}
          </Text>
          {query.data?.stale || query.error ? (
            <Text variant="caption" className="text-muted-foreground">
              Waktu terakhir tersimpan ditampilkan.
            </Text>
          ) : null}
          {resultId && matching.sourceAnalysisResultId !== resultId ? (
            <Text variant="caption" className="text-muted-foreground">
              Konsumsi dicatat dari versi hasil analisis yang berbeda.
            </Text>
          ) : null}
          <Button
            variant="link"
            size="sm"
            className="min-h-11 self-start px-0"
            onPress={() =>
              router.push({ pathname: '/consumptions/[id]', params: { id: matching.id } } as Href)
            }>
            <Text>Lihat catatan makan</Text>
          </Button>
        </>
      ) : query.isPending ? (
        <Text variant="muted">Memuat waktu konsumsi…</Text>
      ) : query.error ? (
        <ServiceError error={query.error} onRetry={() => void refetch()} />
      ) : (
        <Text variant="muted">Belum ada catatan makan untuk hasil foto ini.</Text>
      )}
    </View>
  );
}
