import { OnlineIndicator } from '@/components/app/online-indicator';
import { serviceErrorMessage } from '@/components/app/presentation';
import { ConsumptionForm } from '@/components/consumptions/consumption-form';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAppRepository, useAppWrite } from '@/lib/api/query';
import { createManualConsumptionActions } from '@/lib/consumptions/manual-actions';
import {
  createPhotoConfirmationRouteGuard,
  createPhotoConfirmationFlow,
  type PhotoConfirmationSnapshot,
} from '@/lib/consumptions/photo-confirmation-flow';
import type { PhotoConfirmationOccurrence } from '@/lib/consumptions/photo-confirmation';
import { useAppData } from '@/lib/data/provider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import * as React from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function validOccurrence(value: string | undefined): PhotoConfirmationOccurrence {
  return value === 'new_occurrence' ? 'new_occurrence' : 'default_confirmation';
}

function isCurrentFailedCorrection(state: PhotoConfirmationSnapshot) {
  const { scan, latestJob } = state;
  return !!(
    scan?.latestResultId &&
    latestJob?.status === 'failed' &&
    latestJob.inputKind === 'correction' &&
    latestJob.scanId === scan.id &&
    latestJob.targetType === 'scan' &&
    latestJob.targetId === scan.id &&
    latestJob.targetRevision === scan.revision + 1
  );
}

export default function PhotoConsumptionConfirmation() {
  const params = useLocalSearchParams<{
    scanId?: string | string[];
    occurrence?: string | string[];
    useLastSuccessfulResult?: string | string[];
  }>();
  const scanId = firstParam(params.scanId);
  const occurrence = validOccurrence(firstParam(params.occurrence));
  const useLastSuccessfulResult = firstParam(params.useLastSuccessfulResult) === 'true';
  const router = useRouter();
  const repository = useAppRepository();
  const { scope, connectivity } = useAppData();
  const createMutation = useAppWrite('createConsumption');
  const updateMutation = useAppWrite('updateConsumption');
  const deleteMutation = useAppWrite('deleteConsumption');
  const createConsumption = createMutation.mutateAsync;
  const updateConsumption = updateMutation.mutateAsync;
  const deleteConsumption = deleteMutation.mutateAsync;
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

  const flow = React.useMemo(() => {
    if (!scanId || !scope || !repository || !actions) return null;
    return createPhotoConfirmationFlow({
      scanId,
      occurrence,
      useLastSuccessfulResult,
      scope,
      storage: AsyncStorage,
      api: {
        getMe: () => repository.read('getMe', {}),
        getScan: (id) => repository.read('getScan', { path: { id } }),
        getAnalysisJob: (id) => repository.read('getAnalysisJob', { path: { id } }),
        getAnalysisResult: (id) => repository.read('getAnalysisResult', { path: { id } }),
      },
      actions,
      connectivity: () => connectivity,
    });
  }, [scanId, scope, repository, actions, occurrence, useLastSuccessfulResult, connectivity]);

  type FlowInstance = ReturnType<typeof createPhotoConfirmationFlow>;
  const routeGuard = React.useMemo(() => createPhotoConfirmationRouteGuard(), []);

  const [screenState, setScreenState] = React.useState<{
    owner: FlowInstance | null;
    snapshot: PhotoConfirmationSnapshot;
  }>({ owner: null, snapshot: { availability: 'loading' } });
  const snapshot =
    screenState.owner === flow ? screenState.snapshot : { availability: 'loading' as const };
  const [submittingOwner, setSubmittingOwner] = React.useState<FlowInstance | null>(null);
  const isSubmitting = flow !== null && submittingOwner === flow;

  const commitSnapshot = React.useCallback(
    (owner: FlowInstance, next: PhotoConfirmationSnapshot) => {
      if (routeGuard.isActive(owner)) setScreenState({ owner, snapshot: next });
    },
    [routeGuard]
  );

  const load = React.useCallback(() => {
    const owner = flow;
    if (!owner) return;
    void routeGuard.run(
      owner,
      () => owner.load(),
      (next) => commitSnapshot(owner, next)
    );
  }, [flow, routeGuard, commitSnapshot]);

  useFocusEffect(
    React.useCallback(() => {
      if (!flow) return;
      routeGuard.activate(flow);
      load();
      return () => {
        routeGuard.deactivate(flow);
        flow.invalidate();
        setSubmittingOwner((current) => (current === flow ? null : current));
      };
    }, [flow, load, routeGuard])
  );

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') load();
    });
    return () => subscription.remove();
  }, [load]);

  const updateDraft = (form: NonNullable<typeof snapshot.record>['form']) => {
    const owner = flow;
    if (!owner || !routeGuard.isActive(owner) || screenState.owner !== owner) return;
    void owner.updateDraft(form);
    commitSnapshot(owner, owner.getSnapshot());
  };

  const submit = async (form: NonNullable<typeof snapshot.record>['form']) => {
    const owner = flow;
    if (!owner || !routeGuard.isActive(owner) || screenState.owner !== owner || isSubmitting)
      return;
    setSubmittingOwner(owner);
    await routeGuard.run(
      owner,
      () => owner.submit(form),
      (next) => {
        setSubmittingOwner((current) => (current === owner ? null : current));
        commitSnapshot(owner, next);
        if (next.savedId) openConsumption(next.savedId);
      }
    );
  };

  const restartFromLatestResult = async () => {
    const owner = flow;
    if (!owner || !routeGuard.isActive(owner) || screenState.owner !== owner) return;
    await routeGuard.run(
      owner,
      () => owner.restartFromLatestResult(),
      (next) => commitSnapshot(owner, next)
    );
  };

  const openConsumption = (id: string) => {
    router.replace({ pathname: '/consumptions/[id]', params: { id } } as Href);
  };

  const startNewOccurrence = () => {
    if (!scanId) return;
    router.push({
      pathname: '/consumptions/from-scan/[scanId]',
      params: { scanId, occurrence: 'new_occurrence' },
    } as Href);
  };

  const chooseLastSuccessful = () => {
    if (!scanId) return;
    router.replace({
      pathname: '/consumptions/from-scan/[scanId]',
      params: {
        scanId,
        occurrence,
        useLastSuccessfulResult: 'true',
      },
    } as Href);
  };

  const goBack = () => router.back();

  return (
    <View className="flex-1 bg-background">
      <OnlineIndicator connectivity={connectivity} />
      {snapshot.availability === 'loading' ? (
        <View className="flex-1 items-center justify-center gap-3 p-8">
          <ActivityIndicator accessibilityLabel="Memuat hasil untuk konfirmasi konsumsi" />
          <Text variant="muted">Memuat hasil analisis…</Text>
        </View>
      ) : snapshot.availability === 'confirm' && snapshot.record ? (
        <ConsumptionForm
          draft={snapshot.record.form}
          timeZone={snapshot.record.timeZone}
          title="Konfirmasi konsumsi"
          description="Periksa makanan, sesuaikan jumlah yang benar-benar Anda makan, lalu simpan catatan."
          submitLabel="Simpan konsumsi"
          isSubmitting={isSubmitting}
          submitError={snapshot.submitMessage ?? null}
          onChange={updateDraft}
          onSubmit={(form) => void submit(form)}
          onBack={goBack}
        />
      ) : (
        <View className="flex-1 gap-4 bg-background p-6">
          <Button variant="ghost" className="min-h-12 self-start px-0" onPress={goBack}>
            <Text>Kembali</Text>
          </Button>
          <Text variant="h2">
            {snapshot.availability === 'open_existing'
              ? 'Konsumsi sudah dicatat'
              : 'Konfirmasi konsumsi'}
          </Text>
          {snapshot.availability === 'open_existing' && snapshot.scan?.defaultConsumptionId ? (
            <>
              <Text>Catatan konsumsi default untuk foto ini sudah tersimpan.</Text>
              <Button
                className="min-h-12"
                onPress={() => openConsumption(snapshot.scan!.defaultConsumptionId!)}>
                <Text>Buka catatan konsumsi</Text>
              </Button>
              <Button variant="outline" className="min-h-12" onPress={startNewOccurrence}>
                <Text>Catat sebagai konsumsi baru</Text>
              </Button>
            </>
          ) : snapshot.availability === 'correction_pending' ? (
            <>
              <Text accessibilityRole="alert">
                Perbaikan analisis masih berlangsung. Tunggu sampai selesai sebelum mengonfirmasi
                konsumsi.
              </Text>
              <Button variant="outline" className="min-h-12" onPress={load}>
                <Text>Coba periksa lagi</Text>
              </Button>
            </>
          ) : (
            <>
              <Text accessibilityRole="alert">
                {snapshot.submitMessage ??
                  (snapshot.loadError
                    ? `Hasil analisis belum dapat dimuat. ${serviceErrorMessage(snapshot.loadError)}`
                    : 'Hasil analisis yang dapat dikonfirmasi tidak tersedia.')}
              </Text>
              {snapshot.conflict === 'already_confirmed' && snapshot.scan?.defaultConsumptionId ? (
                <Button
                  className="min-h-12"
                  onPress={() => openConsumption(snapshot.scan!.defaultConsumptionId!)}>
                  <Text>Buka catatan konsumsi</Text>
                </Button>
              ) : null}
              {snapshot.record &&
              snapshot.scan?.latestResultId !== snapshot.record.sourceResultId &&
              snapshot.latestJob?.status === 'completed' ? (
                <>
                  <Text variant="muted">
                    Draft lama tetap tersimpan sampai Anda memilih mengganti makanan dan porsi dari
                    hasil terbaru.
                  </Text>
                  <Button
                    variant="outline"
                    className="min-h-12"
                    onPress={() => void restartFromLatestResult()}>
                    <Text>Ganti dengan hasil terbaru</Text>
                  </Button>
                </>
              ) : null}
              {isCurrentFailedCorrection(snapshot) && !useLastSuccessfulResult ? (
                <Button className="min-h-12" onPress={chooseLastSuccessful}>
                  <Text>Gunakan hasil berhasil terakhir</Text>
                </Button>
              ) : null}
              {snapshot.availability !== 'open_existing' ? (
                <Button variant="outline" className="min-h-12" onPress={load}>
                  <Text>Coba muat lagi</Text>
                </Button>
              ) : null}
            </>
          )}
        </View>
      )}
    </View>
  );
}
