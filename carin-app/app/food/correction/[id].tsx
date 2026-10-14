import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { ComponentPortionEditor } from '@/components/food/component-portion-editor';
import { ApiError } from '@/lib/api/repository';
import type { components } from '@/lib/api/generated/app-api';
import { useAppRead, useAppRepository } from '@/lib/api/query';
import { useAppData } from '@/lib/data/provider';
import { createDraftStore, localStorageAdapter } from '@/lib/data/drafts';
import {
  canConfirmLatestScanResult,
  createCorrectionActionState,
  createCorrectionActions,
  createCorrectionDraft,
  getCorrectionErrorMessage,
  isCurrentScanResult,
  type CorrectionDraftComponent,
} from '@/lib/food/correction';
import {
  createCorrectionDraftWriter,
  getCorrectionScreenActions,
} from '@/lib/food/correction-screen';
import { startAnalysisPolling } from '@/lib/food/analysis-polling';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import { ActivityIndicator, AppState, ScrollView, View } from 'react-native';

export default function FoodCorrectionScreen() {
  const { id: routeId, sourceJobId: routeSourceJobId } = useLocalSearchParams<{
    id: string;
    sourceJobId?: string;
  }>();
  const scanId = Array.isArray(routeId) ? routeId[0] : routeId;
  const sourceJobId = Array.isArray(routeSourceJobId) ? routeSourceJobId[0] : routeSourceJobId;
  const router = useRouter();
  const repository = useAppRepository();
  const { scope, connectivity } = useAppData();
  const draftStore = React.useMemo(() => createDraftStore(localStorageAdapter), []);
  const [actionState] = React.useState(() => createCorrectionActionState());
  const actions = React.useMemo(
    () =>
      repository
        ? createCorrectionActions(
            {
              correctScan: (input) => repository.write('correctScan', input),
              retryAnalysisJob: (input) => repository.write('retryAnalysisJob', input),
            },
            actionState
          )
        : null,
    [repository, actionState]
  );
  const [acceptedCorrectionJob, setAcceptedCorrectionJob] = React.useState<{
    job: components['schemas']['AnalysisJob'];
    acceptedAt: number;
  } | null>(null);
  const sourceJobQuery = useAppRead(
    'getAnalysisJob',
    { path: { id: sourceJobId ?? '' } },
    { enabled: !!sourceJobId }
  );
  const scanQuery = useAppRead('getScan', { path: { id: scanId ?? '' } }, { enabled: !!scanId });
  const scan = scanQuery.data?.data;
  const trackedJobId = acceptedCorrectionJob?.job.id ?? scan?.latestJobId ?? '';
  const latestJobQuery = useAppRead(
    'getAnalysisJob',
    { path: { id: trackedJobId } },
    { enabled: !!trackedJobId }
  );
  const sourceJob = sourceJobQuery.data?.data;
  const sourceResult = sourceJob?.result;
  const latestJob =
    acceptedCorrectionJob &&
    (latestJobQuery.data?.updatedAt ?? 0) <= acceptedCorrectionJob.acceptedAt
      ? acceptedCorrectionJob.job
      : (latestJobQuery.data?.data ?? acceptedCorrectionJob?.job);
  const refetchSourceJob = sourceJobQuery.refetch;
  const refetchScan = scanQuery.refetch;
  const refetchLatestJob = latestJobQuery.refetch;
  const draftName = `food-correction:${scanId ?? ''}:${sourceJob?.resultId ?? ''}`;
  const [draft, setDraft] = React.useState<CorrectionDraftComponent[]>([]);
  const draftRef = React.useRef(draft);
  const [draftInitialized, setDraftInitialized] = React.useState(false);
  const [draftSaveError, setDraftSaveError] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [retrying, setRetrying] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [foreground, setForeground] = React.useState(AppState.currentState === 'active');
  const [focused, setFocused] = React.useState(true);
  const initializedDraftName = React.useRef<string | null>(null);
  const navigationDone = React.useRef(false);
  const correctionPollStartedAt = React.useRef(0);
  const draftWriter = React.useMemo(
    () =>
      scope
        ? createCorrectionDraftWriter(
            (value: CorrectionDraftComponent[]) => draftStore.save(scope, draftName, value),
            250,
            () => setDraftSaveError(true),
            () => setDraftSaveError(false)
          )
        : null,
    [draftName, draftStore, scope]
  );

  const persistLatestDraft = React.useCallback(async () => {
    if (!draftWriter) return;
    draftWriter.schedule(draftRef.current);
    try {
      await draftWriter.flush();
      setDraftSaveError(false);
    } catch {
      setDraftSaveError(true);
      throw new Error('Draft koreksi belum berhasil disimpan.');
    }
  }, [draftWriter]);

  useFocusEffect(
    React.useCallback(() => {
      setFocused(true);
      void refetchScan();
      if (sourceJobId) void refetchSourceJob();
      return () => setFocused(false);
    }, [refetchScan, refetchSourceJob, sourceJobId])
  );

  useFocusEffect(
    React.useCallback(
      () => () => {
        void persistLatestDraft().catch(() => {});
      },
      [persistLatestDraft]
    )
  );

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const active = state === 'active';
      setForeground(active);
      if (active) {
        void refetchScan();
        void refetchLatestJob();
      }
    });
    return () => subscription.remove();
  }, [refetchLatestJob, refetchScan]);

  React.useEffect(() => {
    if (
      !scope ||
      !sourceResult ||
      !sourceJob?.resultId ||
      initializedDraftName.current === draftName
    ) {
      return;
    }
    initializedDraftName.current = draftName;
    let current = true;
    void draftStore
      .load<CorrectionDraftComponent[]>(scope, draftName)
      .then((saved) => {
        if (!current) return;
        const loadedDraft = Array.isArray(saved) ? saved : createCorrectionDraft(sourceResult);
        draftRef.current = loadedDraft;
        setDraft(loadedDraft);
        setDraftInitialized(true);
      })
      .catch(() => {
        if (!current) return;
        const initialDraft = createCorrectionDraft(sourceResult);
        draftRef.current = initialDraft;
        setDraft(initialDraft);
        setDraftInitialized(true);
      });
    return () => {
      current = false;
    };
  }, [draftName, draftStore, scope, sourceJob?.resultId, sourceResult]);

  React.useEffect(() => {
    if (!draftInitialized) return;
    draftWriter?.schedule(draft);
  }, [draft, draftInitialized, draftWriter]);

  React.useEffect(
    () => () => {
      void draftWriter?.dispose().catch(() => {});
    },
    [draftWriter]
  );

  const isTrackingCorrection = !!sourceJobId && !!trackedJobId && trackedJobId !== sourceJobId;
  const latestJobStatus = latestJob?.status;
  const latestJobIsCorrection = latestJob?.inputKind === 'correction';
  React.useEffect(() => {
    if (
      !latestJobStatus ||
      !latestJobIsCorrection ||
      !isTrackingCorrection ||
      (latestJobStatus !== 'queued' && latestJobStatus !== 'processing') ||
      !focused ||
      !foreground
    ) {
      return;
    }
    correctionPollStartedAt.current = Date.now();
    return startAnalysisPolling({
      initialStatus: latestJobStatus,
      getElapsedMs: () => Date.now() - correctionPollStartedAt.current,
      shouldPoll: () => focused && foreground && connectivity !== 'offline',
      refetch: async () => {
        const [scanResponse, jobResponse] = await Promise.all([refetchScan(), refetchLatestJob()]);
        if (scanResponse.data?.data.latestJobId !== trackedJobId) return 'processing';
        return jobResponse.data?.data.status ?? null;
      },
    });
  }, [
    connectivity,
    focused,
    foreground,
    isTrackingCorrection,
    latestJobIsCorrection,
    latestJobStatus,
    refetchLatestJob,
    refetchScan,
    trackedJobId,
  ]);

  const correctionPending =
    !!latestJob &&
    latestJob.inputKind === 'correction' &&
    (latestJob.status === 'queued' || latestJob.status === 'processing');
  const sourceIsCurrent =
    !!scan &&
    !!sourceJob &&
    !!sourceResult &&
    isCurrentScanResult(scan, sourceJob) &&
    !!latestJob &&
    !correctionPending &&
    (latestJob.id === sourceJob.id ||
      (latestJob.inputKind === 'correction' &&
        (latestJob.status === 'failed' || latestJob.status === 'cancelled')));
  const failedCorrection =
    !!latestJob && latestJob.inputKind === 'correction' && latestJob.status === 'failed';
  const inactiveCorrection =
    !!latestJob &&
    latestJob.inputKind === 'correction' &&
    (latestJob.status === 'failed' || latestJob.status === 'cancelled');
  const successfulCorrection =
    !!latestJob &&
    !!scan &&
    isTrackingCorrection &&
    latestJob.inputKind === 'correction' &&
    canConfirmLatestScanResult(scan, latestJob);

  React.useEffect(() => {
    if (!successfulCorrection || !latestJob || navigationDone.current) return;
    navigationDone.current = true;
    void (async () => {
      try {
        await persistLatestDraft();
      } catch {
        // A completed correction should still open even if local cleanup cannot be persisted.
      }
      if (scope && draftInitialized) {
        await draftStore.remove(scope, draftName).catch(() => {});
      }
      router.replace({ pathname: '/food/analysis/[id]', params: { id: latestJob.id } });
    })();
  }, [
    draftInitialized,
    draftName,
    draftStore,
    latestJob,
    persistLatestDraft,
    router,
    scope,
    successfulCorrection,
  ]);

  const allComponentsNamed =
    draft.length > 0 && draft.every((component) => component.displayName.trim());
  const canSubmit =
    !!actions &&
    !!scan &&
    !!sourceJob &&
    !!sourceResult &&
    sourceIsCurrent &&
    draftInitialized &&
    allComponentsNamed &&
    !correctionPending &&
    !submitting;
  const screenActions = getCorrectionScreenActions({
    canSubmit,
    correctionPending,
    sourceIsCurrent,
    submitting,
    failedCorrection,
    retrying,
  });

  const submit = async () => {
    if (!canSubmit || !actions || !scan || !sourceJob?.resultId || !sourceResult) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await persistLatestDraft();
      const job = await actions.submit(
        scan.id,
        scan,
        sourceJob.resultId,
        sourceResult.catalogVersion,
        draft
      );
      if (job.scanId !== scan.id || job.targetType !== 'scan') {
        throw new Error('Respons koreksi tidak sesuai dengan scan ini.');
      }
      setAcceptedCorrectionJob({ job, acceptedAt: Date.now() });
      void refetchScan();
    } catch (error) {
      setErrorMessage(
        getCorrectionErrorMessage(error instanceof ApiError ? error.status : undefined)
      );
      if (error instanceof ApiError && error.status === 409) {
        void refetchScan();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const retry = async () => {
    if (!actions || !latestJob || retrying || !failedCorrection) return;
    setRetrying(true);
    setErrorMessage(null);
    try {
      const job = await actions.retry(latestJob.id);
      setAcceptedCorrectionJob({ job, acceptedAt: Date.now() });
      await Promise.all([refetchScan(), refetchLatestJob()]);
    } catch (error) {
      setErrorMessage(
        getCorrectionErrorMessage(error instanceof ApiError ? error.status : undefined)
      );
    } finally {
      setRetrying(false);
    }
  };

  const returnToOldResult = async () => {
    if (!sourceJobId) return;
    try {
      await persistLatestDraft();
    } catch {
      return;
    }
    router.replace({
      pathname: '/food/analysis/[id]',
      params: {
        id: sourceJobId,
        ...(inactiveCorrection ? { returningToOldResult: 'true' } : {}),
      },
    });
  };

  if (!sourceJobId || !scanId) {
    return (
      <View className="flex-1 gap-4 bg-background p-6">
        <Text variant="h2">Koreksi makanan</Text>
        <Text accessibilityRole="alert">Referensi hasil koreksi tidak lengkap.</Text>
        <Button variant="outline" onPress={() => router.back()}>
          <Text>Kembali</Text>
        </Button>
      </View>
    );
  }

  if (sourceJobQuery.isPending || scanQuery.isPending || !draftInitialized) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background p-8">
        <ActivityIndicator accessibilityLabel="Memuat hasil koreksi" />
        <Text variant="muted">Memuat hasil dan porsi…</Text>
      </View>
    );
  }

  if (sourceJobQuery.error || scanQuery.error || !sourceJob || !scan || !sourceResult) {
    return (
      <View className="flex-1 gap-4 bg-background p-6">
        <Text variant="h2">Koreksi makanan</Text>
        <Text accessibilityRole="alert">
          Hasil sumber belum dapat dimuat. Versi katalog dan porsi lama tetap dipertahankan.
        </Text>
        <Button
          variant="outline"
          onPress={() => void Promise.all([refetchSourceJob(), refetchScan()])}>
          <Text>Muat ulang</Text>
        </Button>
        <Button variant="ghost" onPress={returnToOldResult}>
          <Text>Kembali ke hasil sebelumnya</Text>
        </Button>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerClassName="gap-5 px-5 py-8">
        <View className="gap-2">
          <Text variant="h2">Koreksi komponen dan porsi</Text>
          <Text variant="muted">
            Hasil sebelumnya tetap tersimpan sampai koreksi terbaru berhasil.
          </Text>
          <Text variant="muted">
            Katalog terkunci pada versi hasil: {sourceResult.catalogVersion}
          </Text>
        </View>

        {correctionPending ? (
          <View className="gap-2 rounded-xl border border-border p-4">
            <Text variant="large">Koreksi sedang diproses</Text>
            <Text variant="muted">
              Hasil lama masih menampilkan input sebelumnya. Konfirmasi konsumsi tersedia setelah
              hasil koreksi terbaru valid.
            </Text>
            <ActivityIndicator accessibilityLabel="Koreksi sedang diproses" />
            <Button
              variant="outline"
              disabled={scanQuery.isFetching || latestJobQuery.isFetching}
              onPress={() => void Promise.all([refetchScan(), refetchLatestJob()])}>
              <Text>Muat status terbaru</Text>
            </Button>
          </View>
        ) : null}

        {!sourceIsCurrent && !correctionPending ? (
          <Text accessibilityRole="alert">
            Hasil ini bukan revisi terbaru. Muat hasil terbaru sebelum membuat koreksi lain.
          </Text>
        ) : null}

        {screenActions.retryVisible && latestJob ? (
          <View
            className="gap-3 rounded-xl border border-destructive/40 p-4"
            accessibilityRole="alert">
            <Text variant="large">Koreksi gagal; draft tetap tersimpan.</Text>
            <Text>{latestJob.error?.message ?? 'Hasil sebelumnya tetap dapat dibuka.'}</Text>
            <Button onPress={retry} disabled={screenActions.retryDisabled}>
              {retrying ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text>Coba ulang koreksi yang gagal</Text>
              )}
            </Button>
            {screenActions.returnVisible ? (
              <Button variant="outline" onPress={returnToOldResult}>
                <Text>Kembali ke hasil sebelumnya</Text>
              </Button>
            ) : null}
          </View>
        ) : null}

        {errorMessage ? <Text accessibilityRole="alert">{errorMessage}</Text> : null}
        {draftSaveError ? (
          <Text accessibilityRole="alert">
            Draft belum tersimpan di perangkat. Tetap di layar ini sebelum mencoba lagi.
          </Text>
        ) : null}

        <ComponentPortionEditor
          components={draft}
          catalogVersion={sourceResult.catalogVersion}
          disabled={screenActions.editorDisabled}
          onChange={(nextDraft) => {
            draftRef.current = nextDraft;
            setDraft(nextDraft);
            if (draftInitialized) draftWriter?.schedule(nextDraft);
          }}
        />

        <Button onPress={submit} disabled={screenActions.submitDisabled}>
          {submitting ? <ActivityIndicator color="white" /> : <Text>Kirim koreksi</Text>}
        </Button>
        {!failedCorrection && screenActions.returnVisible ? (
          <Button variant="outline" onPress={returnToOldResult}>
            <Text>Kembali ke hasil sebelumnya</Text>
          </Button>
        ) : null}
        <Text variant="muted">
          Komponen yang tidak cocok tetap disimpan sebagai nama bebas. Porsi dapat diisi dalam gram,
          takaran katalog, atau tidak diketahui.
        </Text>
      </ScrollView>
    </View>
  );
}
