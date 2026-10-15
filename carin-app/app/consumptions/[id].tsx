import { OnlineIndicator } from '@/components/app/online-indicator';
import { serviceErrorMessage } from '@/components/app/presentation';
import { ServiceError } from '@/components/app/service-error';
import { ConsumptionDetail } from '@/components/consumptions/consumption-detail';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAppRead, useAppWrite } from '@/lib/api/query';
import { createManualConsumptionActions } from '@/lib/consumptions/manual-actions';
import { useAppData } from '@/lib/data/provider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import * as React from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ConsumptionDetailScreen() {
  const { id: routeId } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(routeId) ? routeId[0] : routeId;
  const router = useRouter();
  const { scope, connectivity } = useAppData();
  const consumptionQuery = useAppRead(
    'getConsumption',
    { path: { id: id ?? '' } },
    { enabled: !!id }
  );
  const createMutation = useAppWrite('createConsumption');
  const updateMutation = useAppWrite('updateConsumption');
  const deleteMutation = useAppWrite('deleteConsumption');
  const createConsumption = createMutation.mutateAsync;
  const updateConsumption = updateMutation.mutateAsync;
  const deleteConsumption = deleteMutation.mutateAsync;
  const refetchConsumption = consumptionQuery.refetch;
  const [focused, setFocused] = React.useState(true);
  const [foreground, setForeground] = React.useState(AppState.currentState === 'active');
  const [deleteConfirmation, setDeleteConfirmation] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const deletePending = React.useRef(false);
  const consumption = consumptionQuery.data?.data;
  const actions = React.useMemo(
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

  useFocusEffect(
    React.useCallback(() => {
      setFocused(true);
      if (id) void refetchConsumption();
      return () => setFocused(false);
    }, [id, refetchConsumption])
  );

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const active = state === 'active';
      setForeground(active);
      if (active && id) void refetchConsumption();
    });
    return () => subscription.remove();
  }, [id, refetchConsumption]);

  React.useEffect(() => {
    if (
      !id ||
      !focused ||
      !foreground ||
      connectivity !== 'online' ||
      consumption?.attentionState !== 'pending'
    ) {
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refetchConsumption();
      if (!cancelled) timer = setTimeout(() => void poll(), 4_000);
    };
    timer = setTimeout(() => void poll(), 2_000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, focused, foreground, connectivity, consumption?.attentionState, refetchConsumption]);

  const confirmDelete = async () => {
    if (!id || !actions || deletePending.current) return;
    deletePending.current = true;
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await actions.delete(id);
      try {
        await actions.clearDelete(id);
      } catch {
        // The server acknowledged deletion; a retained key can safely replay the same command.
      }
      router.replace('/(tabs)/history' as Href);
    } catch (error) {
      setDeleteError(serviceErrorMessage(error));
    } finally {
      deletePending.current = false;
      setIsDeleting(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} className="flex-1 bg-background">
      <OnlineIndicator connectivity={connectivity} />
      {consumptionQuery.isPending && !consumption ? (
        <View className="flex-1 items-center justify-center gap-3 bg-background p-8">
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
            <ActivityIndicator size="small" accessibilityLabel="Memuat catatan konsumsi" />
          </View>
          <Text variant="caption" className="text-muted-foreground">
            Memuat catatan…
          </Text>
        </View>
      ) : consumptionQuery.error && !consumption ? (
        <View className="flex-1 gap-4 p-6">
          <Text variant="h2">Detail konsumsi</Text>
          <ServiceError
            error={consumptionQuery.error}
            onRetry={() => void consumptionQuery.refetch()}
          />
        </View>
      ) : consumption ? (
        <ConsumptionDetail
          consumption={consumption}
          isStale={!!consumptionQuery.data?.stale || !!consumptionQuery.error}
          isDeleting={isDeleting}
          deleteConfirmation={deleteConfirmation}
          deleteError={deleteError}
          onBack={() => router.back()}
          onEdit={() =>
            router.push({
              pathname: '/consumptions/[id]/edit',
              params: { id: consumption.id },
            } as Href)
          }
          onRequestDelete={() => {
            setDeleteError(null);
            setDeleteConfirmation(true);
          }}
          onCancelDelete={() => setDeleteConfirmation(false)}
          onConfirmDelete={() => void confirmDelete()}
          onRefresh={() => void consumptionQuery.refetch()}
        />
      ) : (
        <View className="flex-1 items-center justify-center gap-4 p-8">
          <View className="w-full max-w-sm gap-2 rounded-summary border border-border/70 bg-card p-5">
            <Text variant="h3">Catatan tidak ditemukan</Text>
            <Text className="text-muted-foreground">Catatan ini tidak tersedia atau sudah dihapus.</Text>
          </View>
          <Button variant="outline" className="min-h-12 w-full max-w-sm" onPress={() => router.back()}>
            <Text>Kembali</Text>
          </Button>
        </View>
      )}
    </SafeAreaView>
  );
}
