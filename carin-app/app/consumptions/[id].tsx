import { ConsumptionDetail } from '@/components/consumptions/consumption-detail';
import { OnlineIndicator } from '@/components/app/online-indicator';
import { serviceErrorMessage } from '@/components/app/presentation';
import { ServiceError } from '@/components/app/service-error';
import { Text } from '@/components/ui/text';
import { useAppRead, useAppWrite } from '@/lib/api/query';
import { useAppData } from '@/lib/data/provider';
import { createManualConsumptionActions } from '@/lib/consumptions/manual-actions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import * as React from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';

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
    <View className="flex-1 bg-background">
      <OnlineIndicator connectivity={connectivity} />
      {consumptionQuery.isPending && !consumption ? (
        <View className="flex-1 items-center justify-center gap-3 p-8">
          <ActivityIndicator accessibilityLabel="Memuat catatan konsumsi" />
          <Text variant="muted">Memuat catatan…</Text>
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
          <Text variant="h3">Catatan konsumsi tidak ditemukan</Text>
          <Text variant="muted">Catatan ini tidak tersedia atau sudah dihapus.</Text>
        </View>
      )}
    </View>
  );
}
