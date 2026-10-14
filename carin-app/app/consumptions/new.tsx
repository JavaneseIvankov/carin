import { OnlineIndicator } from '@/components/app/online-indicator';
import { Text } from '@/components/ui/text';
import { ConsumptionForm } from '@/components/consumptions/consumption-form';
import { serviceErrorMessage } from '@/components/app/presentation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import * as React from 'react';
import { useAppRead, useAppWrite } from '@/lib/api/query';
import { useAppData } from '@/lib/data/provider';
import { createDraftStore } from '@/lib/data/drafts';
import { createManualConsumptionActions } from '@/lib/consumptions/manual-actions';
import {
  buildManualConsumptionInput,
  formatLocalDateTime,
  type ManualConsumptionDraft,
} from '@/lib/consumptions/consumption';
import { createIdempotencyKey } from '@/lib/profile/profile';

const DRAFT_NAME = 'manual-consumption:create';

type SavedManualDraft = {
  draftId: string;
  timeZone: string;
  form: ManualConsumptionDraft;
};

type ManualDraftLoadState =
  | { scopeId: string; status: 'loaded'; record: SavedManualDraft }
  | { scopeId: string; status: 'error'; error: unknown };

function createEmptyDraft(timeZone: string): SavedManualDraft {
  const local = formatLocalDateTime(new Date(), timeZone);
  return {
    draftId: createIdempotencyKey(),
    timeZone,
    form: {
      consumedDate: local.date,
      consumedTime: local.time,
      catalogVersion: 'unavailable',
      components: [],
      activeComponent: null,
      editingComponentId: null,
    },
  };
}

export default function NewConsumption() {
  const router = useRouter();
  const { scope, connectivity } = useAppData();
  const meQuery = useAppRead('getMe', {});
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
  const [draftLoadState, setDraftLoadState] = React.useState<ManualDraftLoadState | null>(null);
  const recordRef = React.useRef<SavedManualDraft | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const persistQueue = React.useRef<Promise<void>>(Promise.resolve());
  const scopeId = scope
    ? `${encodeURIComponent(scope.environment)}:${encodeURIComponent(scope.userId)}`
    : null;
  const currentLoadState = draftLoadState?.scopeId === scopeId ? draftLoadState : null;
  const record = currentLoadState?.status === 'loaded' ? currentLoadState.record : null;
  const loadError = currentLoadState?.status === 'error' ? currentLoadState.error : null;
  const defaultTimeZone = meQuery.data?.data.timezone ?? 'Asia/Jakarta';
  const canLoad = !!scope && (!!meQuery.data || !meQuery.isPending);

  React.useEffect(() => {
    if (!scope || !scopeId || !canLoad) return;
    let active = true;
    void store
      .load<SavedManualDraft>(scope, DRAFT_NAME)
      .then((saved) => {
        if (!active) return;
        const next = saved ?? createEmptyDraft(defaultTimeZone);
        recordRef.current = next;
        setDraftLoadState({ scopeId, status: 'loaded', record: next });
      })
      .catch((error: unknown) => {
        if (active) setDraftLoadState({ scopeId, status: 'error', error });
      });
    return () => {
      active = false;
    };
  }, [scope, scopeId, canLoad, defaultTimeZone, store]);

  const updateForm = (form: ManualConsumptionDraft) => {
    if (!scope || !recordRef.current) return;
    const next = { ...recordRef.current, form };
    recordRef.current = next;
    if (scopeId) setDraftLoadState({ scopeId, status: 'loaded', record: next });
    persistQueue.current = persistQueue.current
      .catch(() => {})
      .then(() => store.save(scope, DRAFT_NAME, next));
  };

  const submit = async (form: ManualConsumptionDraft) => {
    const current = recordRef.current;
    if (!current || !scope || !actions || isSubmitting) return;
    setSubmitError(null);
    const payload = buildManualConsumptionInput(form, current.timeZone);
    if ('error' in payload) {
      setSubmitError(payload.error);
      return;
    }
    setIsSubmitting(true);
    try {
      await persistQueue.current;
      const saved = await actions.create(current.draftId, payload.value);
      try {
        await store.remove(scope, DRAFT_NAME);
        await actions.clearCreate(current.draftId);
      } catch {
        // The server acknowledged the save; retaining the key makes a reopened draft safe to replay.
      }
      recordRef.current = null;
      router.replace({ pathname: '/consumptions/[id]', params: { id: saved.id } } as Href);
    } catch (error) {
      setSubmitError(serviceErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View className="flex-1 bg-background">
      <OnlineIndicator connectivity={connectivity} />
      {loadError ? (
        <View className="flex-1 items-center justify-center gap-3 p-6" accessibilityRole="alert">
          <Text variant="h3">Draft belum dapat dibuka</Text>
          <Text>{serviceErrorMessage(loadError)}</Text>
        </View>
      ) : record ? (
        <ConsumptionForm
          draft={record.form}
          timeZone={record.timeZone}
          title="Catat yang sudah dimakan"
          description="Catatan manual tidak memerlukan foto atau analisis kamera."
          submitLabel="Simpan catatan"
          isSubmitting={isSubmitting}
          submitError={submitError}
          onChange={updateForm}
          onSubmit={(form) => void submit(form)}
          onBack={() => router.back()}
        />
      ) : (
        <View className="flex-1 items-center justify-center gap-3 bg-background p-8">
          <ActivityIndicator accessibilityLabel="Membuka draft konsumsi" />
          <Text variant="muted">Membuka draft…</Text>
        </View>
      )}
    </View>
  );
}
