import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAppRead, useAppRepository } from '@/lib/api/query';
import { useAppData } from '@/lib/data/provider';
import {
  getAnalysisFailurePresentation,
  getAnalysisPresentation,
} from '@/lib/food/analysis-presentation';
import { startAnalysisPolling } from '@/lib/food/analysis-polling';
import { createScanActionState, createScanActions } from '@/lib/food/scan-actions';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as React from 'react';
import { ActivityIndicator, AppState, ScrollView, View } from 'react-native';

const statusText = {
  queued: 'Menunggu analisis',
  processing: 'Menganalisis foto',
  completed: 'Analisis selesai',
  failed: 'Analisis gagal',
  cancelled: 'Analisis dibatalkan',
} as const;

const attentionText = {
  considerable: 'Perlu perhatian berdasarkan data tersedia',
  needs_attention: 'Ada hal yang perlu diperhatikan',
  insufficient_information: 'Informasi belum cukup untuk pertimbangan personal',
} as const;

export default function AnalysisResultScreen() {
  const { id: routeId } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(routeId) ? routeId[0] : routeId;
  const router = useRouter();
  const repository = useAppRepository();
  const { connectivity } = useAppData();
  const [actionState] = React.useState(() => createScanActionState());
  const actions = React.useMemo(
    () =>
      repository
        ? createScanActions(
            {
              uploadPhoto: (input) => repository.write('uploadPhoto', input),
              createPhotoAnalysis: (input) => repository.write('createPhotoAnalysis', input),
              retryAnalysisJob: (input) => repository.write('retryAnalysisJob', input),
            },
            undefined,
            actionState
          )
        : null,
    [repository, actionState]
  );
  const jobQuery = useAppRead('getAnalysisJob', { path: { id: id ?? '' } }, { enabled: !!id });
  const conditionsQuery = useAppRead('getConditions', {});
  const [foreground, setForeground] = React.useState(AppState.currentState === 'active');
  const [focused, setFocused] = React.useState(true);
  const [retrying, setRetrying] = React.useState(false);
  const [retryError, setRetryError] = React.useState<string | null>(null);
  const pollStartedAt = React.useRef(0);
  const job = jobQuery.data?.data;
  const jobStatus = job?.status;
  const refetchJob = jobQuery.refetch;

  useFocusEffect(
    React.useCallback(() => {
      setFocused(true);
      pollStartedAt.current = Date.now();
      if (id) void refetchJob();
      return () => setFocused(false);
    }, [id, refetchJob])
  );

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const active = state === 'active';
      setForeground(active);
      if (active) {
        pollStartedAt.current = Date.now();
        if (id) void refetchJob();
      }
    });
    return () => subscription.remove();
  }, [id, refetchJob]);

  React.useEffect(() => {
    if (connectivity === 'online' && focused && foreground && id) void refetchJob();
  }, [connectivity, focused, foreground, id, refetchJob]);

  React.useEffect(() => {
    if (!jobStatus || !focused || !foreground) return;
    return startAnalysisPolling({
      initialStatus: jobStatus,
      getElapsedMs: () => (pollStartedAt.current ? Date.now() - pollStartedAt.current : 0),
      shouldPoll: () => focused && foreground && connectivity !== 'offline',
      refetch: async () => {
        const response = await refetchJob();
        return response.data?.data.status ?? null;
      },
    });
  }, [jobStatus, focused, foreground, connectivity, refetchJob]);

  const retry = async () => {
    if (!job || !actions || retrying) return;
    setRetrying(true);
    setRetryError(null);
    try {
      const retryJob = await actions.retry(job.id);
      router.replace({ pathname: '/food/analysis/[id]', params: { id: retryJob.id } });
    } catch {
      setRetryError(
        'Permintaan coba lagi belum diterima. Coba lagi dengan kunci permintaan yang sama.'
      );
    } finally {
      setRetrying(false);
    }
  };

  if (jobQuery.isPending && !job) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background p-8">
        <ActivityIndicator accessibilityLabel="Memuat status analisis" />
        <Text variant="muted">Memuat analisis…</Text>
      </View>
    );
  }

  if (jobQuery.error && !job) {
    return (
      <View className="flex-1 gap-4 bg-background p-6">
        <Text variant="h2">Hasil analisis</Text>
        <Text accessibilityRole="alert">
          Analisis belum dapat dimuat. Periksa koneksi lalu coba lagi.
        </Text>
        <Button variant="outline" onPress={() => void jobQuery.refetch()}>
          <Text>Coba muat lagi</Text>
        </Button>
        <Button variant="ghost" onPress={() => router.back()}>
          <Text>Kembali</Text>
        </Button>
      </View>
    );
  }

  if (!job) {
    return (
      <View className="flex-1 gap-4 bg-background p-6">
        <Text variant="h2">Hasil analisis</Text>
        <Text>Analisis ini tidak ditemukan atau tidak dapat dibuka.</Text>
        <Button variant="outline" onPress={() => router.back()}>
          <Text>Kembali</Text>
        </Button>
      </View>
    );
  }

  const result = job.result;
  const conditionIndex = new Map(
    (conditionsQuery.data?.data ?? []).map((condition) => [
      condition.id,
      {
        displayName: condition.displayName,
        personalizationSupported: condition.personalizationSupported,
      },
    ])
  );
  const presentation = result ? getAnalysisPresentation(result, conditionIndex) : null;
  const failure = getAnalysisFailurePresentation(job);

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerClassName="gap-5 px-5 py-8">
        <View className="gap-2">
          <Text variant="h2">Hasil analisis makanan</Text>
          <Text variant="muted">{statusText[job.status]}</Text>
          {jobQuery.data?.stale ? (
            <Text variant="muted">
              Status terakhir tersimpan ditampilkan. Muat ulang saat online.
            </Text>
          ) : null}
          {job.status === 'queued' || job.status === 'processing' ? (
            <ActivityIndicator accessibilityLabel={statusText[job.status]} />
          ) : null}
        </View>

        {failure ? (
          <View
            className="gap-3 rounded-xl border border-destructive/40 p-4"
            accessibilityRole="alert">
            <Text variant="large">Analisis belum berhasil</Text>
            <Text>{failure.message}</Text>
            {failure.retryable ? (
              <Button onPress={retry} disabled={retrying}>
                {retrying ? <ActivityIndicator color="white" /> : <Text>Coba lagi</Text>}
              </Button>
            ) : null}
            {retryError ? <Text accessibilityRole="alert">{retryError}</Text> : null}
          </View>
        ) : null}

        {job.status === 'cancelled' ? (
          <Text>Analisis ini dibatalkan dan hasilnya tidak tersedia.</Text>
        ) : null}

        {presentation && result ? (
          <>
            <View className="gap-3 rounded-xl border border-border p-4">
              <Text variant="h3">Makanan dan perkiraan porsi</Text>
              {presentation.components.length ? (
                presentation.components.map((component) => (
                  <View key={component.id} className="gap-1 border-b border-border pb-3">
                    <Text variant="large">{component.name}</Text>
                    <Text variant="muted">{component.portion}</Text>
                    {component.portionBasis ? (
                      <Text variant="muted">Dasar porsi: {component.portionBasis}</Text>
                    ) : null}
                    {component.grams ? <Text variant="muted">{component.grams}</Text> : null}
                    {component.portionSource ? (
                      <Text variant="muted">Sumber porsi: {component.portionSource}</Text>
                    ) : null}
                    {component.matchStatus !== 'matched' ? (
                      <Text variant="muted">Kecocokan makanan belum terverifikasi.</Text>
                    ) : null}
                  </View>
                ))
              ) : (
                <Text variant="muted">Nama makanan belum tersedia.</Text>
              )}
              <Text variant="muted">{presentation.supportLabel}</Text>
              <Text variant="muted">{presentation.dataLabel}</Text>
            </View>

            <View className="gap-3 rounded-xl border border-border p-4">
              <Text variant="h3">Perhatian dan cakupan</Text>
              <Text>{attentionText[presentation.overallAttention]}</Text>
              <Text variant="muted">
                Pertimbangan ini bukan diagnosis atau jaminan keamanan makanan.
              </Text>
              {presentation.attentions.map((attention, index) => (
                <View
                  key={`${attention.conditionId}-${index}`}
                  className="gap-1 border-t border-border pt-3">
                  <Text variant="large">Pertimbangan terkait: {attention.conditionLabel}</Text>
                  {attention.personalizationSupported === false ? (
                    <Text variant="muted">
                      Kondisi ini belum didukung untuk personalisasi. Tidak ada aturan yang
                      ditambahkan untuk kondisi ini.
                    </Text>
                  ) : null}
                  <Text>{attention.reason}</Text>
                  {attention.adjustments.map((adjustment) => (
                    <Text key={adjustment} variant="muted">
                      Penyesuaian: {adjustment}
                    </Text>
                  ))}
                  {attention.limitations.map((limitation) => (
                    <Text key={limitation} variant="muted">
                      {limitation}
                    </Text>
                  ))}
                  {attention.sources.map((source) => (
                    <Text key={source} variant="muted">
                      Sumber: {source}
                    </Text>
                  ))}
                </View>
              ))}
              {result.attentions.length === 0 ? (
                <Text variant="muted">
                  Tidak ada aturan personal yang dapat diterapkan dari data tersedia. Ini bukan
                  konfirmasi bahwa makanan aman.
                </Text>
              ) : null}
            </View>

            <View className="gap-3 rounded-xl border border-border p-4">
              <Text variant="h3">Estimasi gizi</Text>
              {presentation.nutrients.map((nutrient) => (
                <View
                  key={nutrient.key}
                  className="flex-row items-start justify-between gap-3 border-b border-border py-2">
                  <Text className="flex-1">{nutrient.label}</Text>
                  <View className="items-end">
                    <Text>{nutrient.value}</Text>
                    <Text variant="muted">{nutrient.coverage}</Text>
                    {nutrient.sources.length ? (
                      <Text variant="muted">Sumber: {nutrient.sources.join(', ')}</Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>

            <View className="gap-3 rounded-xl border border-border p-4">
              <Text variant="h3">Keterbatasan</Text>
              {presentation.limitations.length ? (
                presentation.limitations.map((limitation, index) => (
                  <Text key={`${index}-${limitation}`}>{limitation}</Text>
                ))
              ) : (
                <Text variant="muted">Tidak ada keterbatasan tambahan yang dilaporkan.</Text>
              )}
            </View>

            <View className="gap-3 rounded-xl border border-border p-4">
              <Text variant="h3">Sumber</Text>
              {presentation.sources.map((source) => (
                <View key={source.id} className="gap-1 border-b border-border pb-3">
                  <Text variant="large">{source.title}</Text>
                  <Text variant="muted">
                    {source.kind} · {source.itemRef}
                  </Text>
                  {source.url ? (
                    <Button variant="link" onPress={() => void Linking.openURL(source.url!)}>
                      <Text>Lihat sumber</Text>
                    </Button>
                  ) : null}
                </View>
              ))}
              {presentation.sources.length === 0 ? (
                <Text variant="muted">Sumber belum tersedia.</Text>
              ) : null}
            </View>
          </>
        ) : null}

        {job.status === 'completed' && !result ? (
          <Text accessibilityRole="alert">
            Hasil analisis belum tersedia. Muat status terbaru untuk mencoba lagi.
          </Text>
        ) : null}

        <Button
          variant="outline"
          onPress={() => void jobQuery.refetch()}
          disabled={jobQuery.isFetching}>
          <Text>{jobQuery.isFetching ? 'Memuat…' : 'Muat status terbaru'}</Text>
        </Button>
        <Text variant="muted">
          Hasil analisis tersimpan terpisah dari catatan konsumsi. Tidak ada makanan yang dicatat
          telah dimakan.
        </Text>
      </ScrollView>
    </View>
  );
}
