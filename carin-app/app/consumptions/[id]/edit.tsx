import { OnlineIndicator } from '@/components/app/online-indicator';
import { ServiceError } from '@/components/app/service-error';
import { ConsumptionForm } from '@/components/consumptions/consumption-form';
import { Text } from '@/components/ui/text';
import { useAppRead, useAppWrite } from '@/lib/api/query';
import { ApiError } from '@/lib/api/repository';
import { createManualConsumptionActions } from '@/lib/consumptions/manual-actions';
import {
  buildManualConsumptionUpdateInput,
  createManualConsumptionDraftFromRecord,
  type ManualConsumptionDraft,
} from '@/lib/consumptions/consumption';
import { createDraftStore } from '@/lib/data/drafts';
import { useAppData } from '@/lib/data/provider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import * as React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { serviceErrorMessage } from '@/components/app/presentation';
import { createIdempotencyKey } from '@/lib/profile/profile';

type SavedEditDraft = {
  draftId: string;
  timeZone: string;
  expectedRevision: number;
  form: ManualConsumptionDraft;
};

type EditDraftLoadState =
  | { consumptionId: string; status: 'loaded'; draft: SavedEditDraft }
  | { consumptionId: string; status: 'error'; error: unknown };

function editDraftName(id: string) {
  return `manual-consumption:edit:${id}`;
}

export default function EditConsumptionScreen() {
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
  const store = React.useMemo(() => createDraftStore(AsyncStorage), []);
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
  const consumption = consumptionQuery.data?.data;
  const [editDraftLoadState, setEditDraftLoadState] = React.useState<EditDraftLoadState | null>(
    null
  );
  const editDraftRef = React.useRef<SavedEditDraft | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [revisionConflict, setRevisionConflict] = React.useState(false);
  const persistQueue = React.useRef<Promise<void>>(Promise.resolve());
  const currentDraftLoad = editDraftLoadState?.consumptionId === id ? editDraftLoadState : null;
  const editDraft = currentDraftLoad?.status === 'loaded' ? currentDraftLoad.draft : null;
  const editDraftLoadError = currentDraftLoad?.status === 'error' ? currentDraftLoad.error : null;

  React.useEffect(() => {
    if (!id || !scope || !consumption || consumption.source !== 'manual') return;
    let active = true;
    void store
      .load<SavedEditDraft>(scope, editDraftName(id))
      .then((saved) => {
        if (!active) return;
        const next = saved ?? {
          draftId: createIdempotencyKey(),
          timeZone: consumption.timezone,
          expectedRevision: consumption.revision,
          form: createManualConsumptionDraftFromRecord(consumption),
        };
        editDraftRef.current = next;
        setEditDraftLoadState({ consumptionId: id, status: 'loaded', draft: next });
      })
      .catch((error: unknown) => {
        if (active) setEditDraftLoadState({ consumptionId: id, status: 'error', error });
      });
    return () => {
      active = false;
    };
  }, [id, scope, consumption, store]);

  const updateForm = (form: ManualConsumptionDraft) => {
    if (!id || !scope || !editDraftRef.current) return;
    const next = { ...editDraftRef.current, form };
    editDraftRef.current = next;
    if (id) setEditDraftLoadState({ consumptionId: id, status: 'loaded', draft: next });
    persistQueue.current = persistQueue.current
      .catch(() => {})
      .then(() => store.save(scope, editDraftName(id), next));
  };

  const submit = async (form: ManualConsumptionDraft) => {
    const current = editDraftRef.current;
    if (!id || !scope || !actions || !current || isSubmitting) return;
    const payload = buildManualConsumptionUpdateInput(
      form,
      current.timeZone,
      current.expectedRevision
    );
    if ('error' in payload) {
      setSubmitError(payload.error);
      return;
    }
    setSubmitError(null);
    setRevisionConflict(false);
    setIsSubmitting(true);
    try {
      await persistQueue.current;
      await actions.update(id, current.draftId, payload.value);
      try {
        await store.remove(scope, editDraftName(id));
        await actions.clearUpdate(id, current.draftId);
      } catch {
        // The server acknowledged the edit; a retained key keeps any reopened draft safe to replay.
      }
      editDraftRef.current = null;
      router.replace({ pathname: '/consumptions/[id]', params: { id } } as Href);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const latest = await consumptionQuery.refetch();
        const hasNewerRevision =
          !latest.error && !!latest.data && latest.data.data.revision > current.expectedRevision;
        setRevisionConflict(hasNewerRevision);
        setSubmitError(
          hasNewerRevision
            ? 'Catatan berubah sejak dibuka. Draft tersimpan sampai Anda memilih untuk membuangnya.'
            : serviceErrorMessage(error)
        );
      } else {
        setSubmitError(serviceErrorMessage(error));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const restartFromLatestRevision = async () => {
    const current = editDraftRef.current;
    if (!id || !scope || !actions || !current || connectivity !== 'online') return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const latest = await consumptionQuery.refetch();
      if (
        latest.error ||
        !latest.data ||
        latest.data.data.revision <= current.expectedRevision ||
        latest.data.data.source !== 'manual'
      ) {
        throw new Error('Revisi terbaru belum dapat dimuat. Draft Anda tetap tersimpan.');
      }
      await store.remove(scope, editDraftName(id));
      await actions.clearUpdate(id, current.draftId).catch(() => {});
      editDraftRef.current = null;
      router.replace({ pathname: '/consumptions/[id]', params: { id } } as Href);
    } catch (error) {
      setSubmitError(serviceErrorMessage(error));
    } finally {
      setIsSubmitting(false);
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
          <Text variant="h2">Ubah konsumsi</Text>
          <ServiceError
            error={consumptionQuery.error}
            onRetry={() => void consumptionQuery.refetch()}
          />
        </View>
      ) : !consumption ? (
        <View className="flex-1 items-center justify-center p-8">
          <Text>Catatan konsumsi tidak ditemukan.</Text>
        </View>
      ) : consumption.source !== 'manual' ? (
        <View className="flex-1 items-center justify-center gap-3 p-8">
          <Text variant="h3">Catatan ini tidak dapat diubah di sini</Text>
          <Text variant="muted">Kembali ke detail untuk melihat pilihan yang tersedia.</Text>
        </View>
      ) : !editDraft ? (
        <View className="flex-1 items-center justify-center gap-3 p-8">
          {editDraftLoadError ? (
            <Text accessibilityRole="alert">{serviceErrorMessage(editDraftLoadError)}</Text>
          ) : (
            <>
              <ActivityIndicator accessibilityLabel="Membuka draft perubahan" />
              <Text variant="muted">Membuka draft perubahan…</Text>
            </>
          )}
        </View>
      ) : (
        <ConsumptionForm
          draft={editDraft.form}
          timeZone={editDraft.timeZone}
          title="Ubah catatan konsumsi"
          description="Perubahan membuat snapshot gizi baru. Perhatian personal dievaluasi terpisah."
          submitLabel="Simpan perubahan"
          isSubmitting={isSubmitting}
          submitError={submitError}
          revisionConflict={revisionConflict}
          canRestartAfterConflict={connectivity === 'online'}
          onChange={updateForm}
          onSubmit={(form) => void submit(form)}
          onRestartAfterConflict={() => void restartFromLatestRevision()}
          onBack={() => router.back()}
        />
      )}
    </View>
  );
}
