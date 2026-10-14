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
  disposeCorrectionDraftWriter,
  canRetryFailedCorrection,
  getCorrectionScreenActions,
  loadCorrectionDraft,
  persistCorrectionDraft,
} from '@/lib/food/correction-screen';
import { Icon } from '@/components/ui/icon';
import { AlertCircle, Check, Edit3, RefreshCw } from 'lucide-react-native';
import { startAnalysisPolling } from '@/lib/food/analysis-polling';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import { ActivityIndicator, AppState, ScrollView, View } from 'react-native';

type CorrectionSubmissionSnapshot = {
  jobId: string;
  components: CorrectionDraftComponent[];
};

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
  const submissionSnapshotName = `${draftName}:submission`;
  const [draft, setDraft] = React.useState<CorrectionDraftComponent[]>([]);
  const draftRef = React.useRef(draft);
  const [draftInitialized, setDraftInitialized] = React.useState(false);
  const [draftLoadError, setDraftLoadError] = React.useState(false);
  const [draftLoadVersion, setDraftLoadVersion] = React.useState(0);
  const [submissionSnapshot, setSubmissionSnapshot] =
    React.useState<CorrectionSubmissionSnapshot | null>(null);
  const [invalidPortionComponentIds, setInvalidPortionComponentIds] = React.useState<
    Record<string, true>
  >({});
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
    try {
      const persisted = await persistCorrectionDraft(
        draftWriter,
        draftRef.current,
        draftInitialized && !navigationDone.current
      );
      if (!persisted) return;
      setDraftSaveError(false);
    } catch {
      setDraftSaveError(true);
      throw new Error('Draft koreksi belum berhasil disimpan.');
    }
  }, [draftInitialized, draftWriter]);

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
    void Promise.all([
      loadCorrectionDraft(
        () => draftStore.load<CorrectionDraftComponent[]>(scope, draftName),
        () => createCorrectionDraft(sourceResult)
      ),
      draftStore
        .load<CorrectionSubmissionSnapshot>(scope, submissionSnapshotName)
        .catch(() => null),
    ])
      .then(([savedDraft, savedSubmission]) => {
        if (!current) return;
        const loadedDraft = Array.isArray(savedDraft)
          ? savedDraft
          : createCorrectionDraft(sourceResult);
        draftRef.current = loadedDraft;
        setDraft(loadedDraft);
        setSubmissionSnapshot(
          savedSubmission &&
            typeof savedSubmission.jobId === 'string' &&
            Array.isArray(savedSubmission.components)
            ? savedSubmission
            : null
        );
        setDraftLoadError(false);
        setDraftInitialized(true);
      })
      .catch(() => {
        if (!current) return;
        setDraftLoadError(true);
      });
    return () => {
      current = false;
    };
  }, [
    draftLoadVersion,
    draftName,
    draftStore,
    scope,
    sourceJob?.resultId,
    sourceResult,
    submissionSnapshotName,
  ]);

  React.useEffect(() => {
    if (!draftInitialized || navigationDone.current) return;
    draftWriter?.schedule(draft);
  }, [draft, draftInitialized, draftWriter]);

  React.useEffect(
    () => () => {
      if (draftWriter) {
        void disposeCorrectionDraftWriter(
          draftWriter,
          draftInitialized && !navigationDone.current
        ).catch(() => {});
      }
    },
    [draftInitialized, draftWriter]
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
        if (draftWriter) {
          await persistCorrectionDraft(draftWriter, draftRef.current, true);
        }
      } catch {
        // A completed correction should still open even if local cleanup cannot be persisted.
      }
      if (scope && draftInitialized) {
        await draftStore.remove(scope, draftName).catch(() => {});
        await draftStore.remove(scope, submissionSnapshotName).catch(() => {});
      }
      router.replace({ pathname: '/food/analysis/[id]', params: { id: latestJob.id } });
    })();
  }, [
    draftInitialized,
    draftName,
    draftStore,
    draftWriter,
    latestJob,
    persistLatestDraft,
    router,
    scope,
    submissionSnapshotName,
    successfulCorrection,
  ]);

  const allComponentsNamed =
    draft.length > 0 && draft.every((component) => component.displayName.trim());
  const allPortionsValid = draft.every((component) => !invalidPortionComponentIds[component.id]);
  const onPortionValidityChange = React.useCallback((componentId: string, valid: boolean) => {
    setInvalidPortionComponentIds((current) => {
      if (valid) {
        if (!current[componentId]) return current;
        const next = { ...current };
        delete next[componentId];
        return next;
      }
      return current[componentId] ? current : { ...current, [componentId]: true };
    });
  }, []);
  const canSubmit =
    !!actions &&
    !!scan &&
    !!sourceJob &&
    !!sourceResult &&
    sourceIsCurrent &&
    draftInitialized &&
    allComponentsNamed &&
    allPortionsValid &&
    !correctionPending &&
    !retrying &&
    !submitting;
  const matchesFailedPayload =
    !!latestJob && canRetryFailedCorrection(draft, submissionSnapshot, latestJob.id);
  const hasFailedPayloadSnapshot =
    failedCorrection && !!latestJob && submissionSnapshot?.jobId === latestJob.id;
  const canRetryFailedJob = failedCorrection && matchesFailedPayload && allPortionsValid;
  const draftChangedSinceFailedJob =
    failedCorrection && hasFailedPayloadSnapshot && !matchesFailedPayload;
  const failedPayloadUnavailable = failedCorrection && !hasFailedPayloadSnapshot;
  const screenActions = getCorrectionScreenActions({
    canSubmit,
    correctionPending,
    sourceIsCurrent,
    submitting,
    failedCorrection: canRetryFailedJob,
    retrying,
    portionsValid: allPortionsValid,
  });

  const submit = async () => {
    if (!canSubmit || !actions || !scan || !sourceJob?.resultId || !sourceResult) return;
    const submittedDraft = draft.map((component) => ({
      ...component,
      portion: { ...component.portion },
    }));
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await persistLatestDraft();
      const job = await actions.submit(
        scan.id,
        scan,
        sourceJob.resultId,
        sourceResult.catalogVersion,
        submittedDraft
      );
      if (job.scanId !== scan.id || job.targetType !== 'scan') {
        throw new Error('Respons koreksi tidak sesuai dengan scan ini.');
      }
      setAcceptedCorrectionJob({ job, acceptedAt: Date.now() });
      const submittedSnapshot = { jobId: job.id, components: submittedDraft };
      setSubmissionSnapshot(submittedSnapshot);
      if (scope) {
        try {
          await draftStore.save(scope, submissionSnapshotName, submittedSnapshot);
        } catch {
          setSubmissionSnapshot(null);
        }
      }
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
    if (!actions || !latestJob || retrying || !canRetryFailedJob || !submissionSnapshot) return;
    setRetrying(true);
    setErrorMessage(null);
    try {
      const job = await actions.retry(latestJob.id);
      setAcceptedCorrectionJob({ job, acceptedAt: Date.now() });
      const retriedSnapshot = { ...submissionSnapshot, jobId: job.id };
      setSubmissionSnapshot(retriedSnapshot);
      if (scope) {
        try {
          await draftStore.save(scope, submissionSnapshotName, retriedSnapshot);
        } catch {
          setSubmissionSnapshot(null);
        }
      }
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

  const retryDraftLoad = () => {
    initializedDraftName.current = null;
    setDraftLoadError(false);
    setDraftLoadVersion((version) => version + 1);
  };

  if (!sourceJobId || !scanId) {
    return (
      <View className="flex-1 gap-4 bg-background p-6">
        <Text variant="h2">Koreksi makanan</Text>
        <Text accessibilityRole="alert">Referensi hasil koreksi tidak lengkap.</Text>
        <Button className="min-h-12" variant="outline" onPress={() => router.back()}>
          <Text>Kembali</Text>
        </Button>
      </View>
    );
  }

  if (sourceJobQuery.error || scanQuery.error) {
    return (
      <View className="flex-1 gap-4 bg-background p-6">
        <Text variant="h2">Koreksi makanan</Text>
        <Text accessibilityRole="alert">
          Hasil sumber belum dapat dimuat. Versi katalog dan porsi lama tetap dipertahankan.
        </Text>
        <Button
          className="min-h-12"
          variant="outline"
          onPress={() => void Promise.all([refetchSourceJob(), refetchScan()])}>
          <Text>Muat ulang</Text>
        </Button>
        <Button className="min-h-12" variant="ghost" onPress={returnToOldResult}>
          <Text>Kembali ke hasil sebelumnya</Text>
        </Button>
      </View>
    );
  }

  if (sourceJobQuery.isPending || scanQuery.isPending) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background p-8">
        <View className="h-16 w-16 items-center justify-center rounded-[24px] bg-carin-butter">
          <ActivityIndicator size="large" color="#506B35" accessibilityLabel="Memuat hasil koreksi" />
        </View>
        <Text variant="h2">Memuat Data Koreksi</Text>
        <Text variant="muted" className="text-center">
          Menyiapkan daftar komponen dan takaran porsi…
        </Text>
      </View>
    );
  }

  if (!sourceJob || !scan || !sourceResult) {
    return (
      <View className="flex-1 justify-center gap-4 bg-background p-6">
        <View className="gap-4 rounded-[20px] border border-border bg-card p-6 shadow-sm">
          <View className="flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <Icon as={AlertCircle} size={22} className="text-destructive" />
            </View>
            <Text variant="h2">Koreksi Makanan</Text>
          </View>
          <Text accessibilityRole="alert" className="text-muted-foreground">
            Hasil sumber belum dapat dimuat. Versi katalog dan porsi lama tetap dipertahankan.
          </Text>
          <Button
            variant="tactile"
            onPress={() => void Promise.all([refetchSourceJob(), refetchScan()])}>
            <Icon as={RefreshCw} size={18} className="mr-1.5 text-primary-foreground" />
            <Text>Muat ulang</Text>
          </Button>
          <Button
            variant="outline"
            className="rounded-[20px]"
            onPress={returnToOldResult}>
            <Text>Kembali ke hasil sebelumnya</Text>
          </Button>
        </View>
      </View>
    );
  }

  if (draftLoadError) {
    return (
      <View className="flex-1 justify-center gap-4 bg-background p-6">
        <View className="gap-4 rounded-[20px] border border-border bg-card p-6 shadow-sm">
          <View className="flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <Icon as={AlertCircle} size={22} className="text-destructive" />
            </View>
            <Text variant="h2">Koreksi Makanan</Text>
          </View>
          <Text accessibilityRole="alert" className="text-muted-foreground">
            Draft koreksi belum dapat dibaca. Muat ulang draft sebelum melanjutkan.
          </Text>
          <Button
            variant="tactile"
            onPress={retryDraftLoad}>
            <Icon as={RefreshCw} size={18} className="mr-1.5 text-primary-foreground" />
            <Text>Coba muat draft lagi</Text>
          </Button>
          <Button
            variant="outline"
            className="rounded-[20px]"
            onPress={returnToOldResult}>
            <Text>Kembali ke hasil sebelumnya</Text>
          </Button>
        </View>
      </View>
    );
  }

  if (!draftInitialized) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background p-8">
        <View className="h-16 w-16 items-center justify-center rounded-[24px] bg-carin-butter">
          <ActivityIndicator size="large" color="#506B35" accessibilityLabel="Memuat hasil koreksi" />
        </View>
        <Text variant="h2">Memuat Data Koreksi</Text>
        <Text variant="muted" className="text-center">
          Menyiapkan daftar komponen dan takaran porsi…
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerClassName="gap-5 px-5 py-8">
        <View className="gap-2">
          <View className="flex-row items-center gap-2.5">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-carin-olive-soft">
              <Icon as={Edit3} size={20} className="text-primary" />
            </View>
            <Text variant="h1">Koreksi Komponen & Porsi</Text>
          </View>
          <Text variant="muted">
            Hasil sebelumnya tetap tersimpan sampai koreksi terbaru berhasil. Kamu dapat menyesuaikan komponen atau takaran porsi makanan.
          </Text>
          <View className="self-start rounded-full bg-carin-olive-soft px-3 py-1">
            <Text variant="caption" className="font-semibold text-primary">
              Katalog: {sourceResult.catalogVersion}
            </Text>
          </View>
        </View>

        {correctionPending ? (
          <View className="items-center gap-3.5 rounded-[20px] border border-border bg-card p-6 shadow-sm">
            <ActivityIndicator size="large" color="#506B35" accessibilityLabel="Koreksi sedang diproses" />
            <Text variant="h3" className="text-center">Koreksi Sedang Diproses</Text>
            <Text variant="muted" className="text-center">
              Hasil lama masih menampilkan input sebelumnya. Konfirmasi konsumsi akan tersedia setelah hasil koreksi terbaru selesai.
            </Text>
            <Button
              variant="outline"
              className="rounded-[20px]"
              disabled={scanQuery.isFetching || latestJobQuery.isFetching}
              onPress={() => void Promise.all([refetchScan(), refetchLatestJob()])}>
              <Icon as={RefreshCw} size={16} className="mr-1.5 text-foreground" />
              <Text>Muat status terbaru</Text>
            </Button>
          </View>
        ) : null}

        {!sourceIsCurrent && !correctionPending ? (
          <View className="rounded-[16px] border border-border bg-muted/60 p-3.5">
            <Text accessibilityRole="alert" className="text-sm text-foreground">
              Hasil ini bukan revisi terbaru. Muat hasil terbaru sebelum membuat koreksi lain.
            </Text>
          </View>
        ) : null}

        {failedCorrection && latestJob ? (
          <View
            className="gap-3 rounded-[20px] border border-destructive/40 bg-card p-5 shadow-sm"
            accessibilityRole="alert">
            <View className="flex-row items-center gap-2">
              <Icon as={AlertCircle} size={20} className="text-destructive" />
              <Text variant="large" className="text-destructive">Koreksi belum berhasil</Text>
            </View>
            <Text className="text-muted-foreground">
              {latestJob.error?.message ?? 'Hasil sebelumnya tetap dapat dibuka.'}
            </Text>
            {draftChangedSinceFailedJob ? (
              <Text className="text-sm text-foreground">
                Draft berubah setelah koreksi gagal. Perubahan terbaru akan dikirim sebagai koreksi
                baru; coba ulang hanya tersedia untuk input yang gagal.
              </Text>
            ) : failedPayloadUnavailable ? (
              <Text className="text-sm text-foreground">
                Input koreksi yang gagal tidak dapat dipastikan. Kirim draft ini sebagai koreksi
                baru untuk menjaga perubahan terbaru.
              </Text>
            ) : !allPortionsValid ? (
              <Text className="text-sm text-destructive">
                Perbaiki angka porsi atau pilih Tidak tahu porsi sebelum mencoba ulang.
              </Text>
            ) : null}
            {screenActions.retryVisible ? (
              <Button
                variant="tactile"
                onPress={retry}
                disabled={screenActions.retryDisabled}>
                {retrying ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <Icon as={RefreshCw} size={18} className="mr-1.5 text-primary-foreground" />
                    <Text>Coba ulang koreksi yang gagal</Text>
                  </>
                )}
              </Button>
            ) : null}
            {screenActions.returnVisible ? (
              <Button
                variant="outline"
                className="rounded-[20px]"
                onPress={returnToOldResult}>
                <Text>Kembali ke hasil sebelumnya</Text>
              </Button>
            ) : null}
          </View>
        ) : null}

        {errorMessage ? (
          <View className="rounded-[16px] border border-destructive/30 bg-destructive/10 p-3">
            <Text accessibilityRole="alert" className="text-sm text-destructive">
              {errorMessage}
            </Text>
          </View>
        ) : null}

        {draftSaveError ? (
          <View className="rounded-[16px] border border-destructive/30 bg-destructive/10 p-3">
            <Text accessibilityRole="alert" className="text-sm text-destructive">
              Draft belum tersimpan di perangkat. Tetap di layar ini sebelum mencoba lagi.
            </Text>
          </View>
        ) : null}

        <ComponentPortionEditor
          components={draft}
          catalogVersion={sourceResult.catalogVersion}
          disabled={screenActions.editorDisabled}
          onPortionValidityChange={onPortionValidityChange}
          onChange={(nextDraft) => {
            draftRef.current = nextDraft;
            setDraft(nextDraft);
            if (draftInitialized && !navigationDone.current) draftWriter?.schedule(nextDraft);
          }}
        />

        <Button
          variant="tactile"
          onPress={submit}
          disabled={screenActions.submitDisabled}
          accessibilityLabel={
            draftChangedSinceFailedJob || failedPayloadUnavailable
              ? 'Kirim koreksi baru'
              : 'Kirim koreksi'
          }>
          {submitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Icon as={Check} size={20} className="mr-2 text-primary-foreground" />
              <Text>
                {draftChangedSinceFailedJob || failedPayloadUnavailable
                  ? 'Kirim Koreksi Baru'
                  : 'Kirim Koreksi'}
              </Text>
            </>
          )}
        </Button>

        {!failedCorrection && screenActions.returnVisible ? (
          <Button
            variant="outline"
            className="rounded-[20px]"
            onPress={returnToOldResult}>
            <Text>Kembali ke hasil sebelumnya</Text>
          </Button>
        ) : null}

        <Text variant="muted" className="text-center text-xs">
          Komponen yang tidak cocok tetap disimpan sebagai nama bebas. Porsi dapat diisi dalam gram,
          takaran katalog, atau tidak diketahui.
        </Text>
      </ScrollView>
    </View>
  );
}
