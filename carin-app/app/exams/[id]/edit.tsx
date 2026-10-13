import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import { View } from 'react-native';
import { ServiceError } from '@/components/app/service-error';
import { ExaminationForm } from '@/components/exams/ExaminationForm';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAppRead, useAppWrite } from '@/lib/api/query';
import { serviceErrorMessage } from '@/components/app/presentation';
import { createExaminationEditRouteController } from '@/lib/exams/edit-session';
import { resolveExaminationTimezoneRead } from '@/lib/exams/timezone-state';

export default function EditExamination() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const me = useAppRead('getMe', {});
  const examination = useAppRead('getExamination', { path: { id } });
  const update = useAppWrite('updateExamination');
  const mutateExamination = update.mutateAsync;
  const resetUpdate = update.reset;
  const refetchExamination = examination.refetch;
  const [editSessionController] = React.useState(() => createExaminationEditRouteController());
  const timezoneRead = resolveExaminationTimezoneRead({
    timezone: me.data?.data.timezone,
    isPending: me.isPending,
    error: me.error,
  });
  const timezone = timezoneRead.timezone;
  const item = examination.data?.data;
  const editSession = item
    ? editSessionController.getSession(id, item, {
        createIdempotencyKey: () => Crypto.randomUUID(),
        save: async ({ expectedRevision, record, idempotencyKey }) => {
          await mutateExamination({
            path: { id },
            headers: { 'Idempotency-Key': idempotencyKey },
            body: { expectedRevision, record },
          });
        },
        reload: async () => {
          const result = await refetchExamination();
          if (result.error) throw result.error;
          if (result.data?.stale) {
            throw new Error('Tidak dapat memastikan data terbaru. Periksa koneksi lalu coba lagi.');
          }
          const refreshed = result.data?.data;
          if (!refreshed) throw new Error('Pemeriksaan terbaru tidak tersedia.');
          return refreshed;
        },
      })
    : null;
  const sessionSnapshot = React.useSyncExternalStore(
    React.useCallback((listener) => editSession?.subscribe(listener) ?? (() => {}), [editSession]),
    React.useCallback(() => editSession?.getSnapshot() ?? null, [editSession]),
    React.useCallback(() => editSession?.getSnapshot() ?? null, [editSession])
  );

  const resetDraft = () => {
    editSession?.draftChanged();
    resetUpdate();
  };
  const save = async (record: NonNullable<typeof item>['record']) => {
    if (!editSession) return;
    const outcome = await editSession.save(record);
    if (outcome === 'saved') {
      router.replace({ pathname: '/exams/[id]', params: { id } });
    }
  };

  const reloadCurrent = async () => {
    if (!editSession) return;
    const reloaded = await editSession.reloadCurrent();
    if (reloaded) {
      resetUpdate();
    }
  };

  if (!item && timezoneRead.status === 'error') {
    return (
      <View className="flex-1 gap-4 bg-background p-5">
        <ServiceError error={me.error} onRetry={() => void me.refetch()} />
        <Button variant="outline" onPress={() => router.replace('/(tabs)/exams')}>
          <Text>Kembali ke pemeriksaan</Text>
        </Button>
      </View>
    );
  }
  if (!item && (examination.isPending || me.isPending)) {
    return (
      <View className="flex-1 justify-center bg-background p-5">
        <Text variant="muted">Memuat pemeriksaan…</Text>
      </View>
    );
  }
  if (!item && examination.error) {
    return (
      <View className="flex-1 gap-4 bg-background p-5">
        <ServiceError error={examination.error} onRetry={() => void examination.refetch()} />
        <Button variant="outline" onPress={() => router.replace('/(tabs)/exams')}>
          <Text>Kembali ke pemeriksaan</Text>
        </Button>
      </View>
    );
  }
  if (!item) return null;
  if (timezoneRead.status === 'error' && !timezone) {
    return (
      <View className="flex-1 gap-4 bg-background p-5">
        <ServiceError error={me.error} onRetry={() => void me.refetch()} />
        <Button
          variant="outline"
          onPress={() => router.replace({ pathname: '/exams/[id]', params: { id } })}>
          <Text>Kembali ke detail</Text>
        </Button>
      </View>
    );
  }
  if (!timezone)
    return (
      <View className="flex-1 justify-center bg-background p-5">
        <Text variant="muted">Memuat zona waktu akun…</Text>
      </View>
    );

  if (!editSession || !sessionSnapshot) return null;
  const editFormProps = editSessionController.getFormProps(id, sessionSnapshot, {
    submissionDisabled: timezoneRead.submissionDisabled,
  });

  return (
    <View className="flex-1 bg-background">
      <View className="gap-3 px-5 pt-5">
        <Button
          variant="ghost"
          className="self-start"
          onPress={() => router.replace({ pathname: '/exams/[id]', params: { id } })}>
          <Text>‹ Kembali ke detail</Text>
        </Button>
        <Text variant="h3">Edit pemeriksaan</Text>
      </View>
      <View className="mx-5 mt-4 gap-4">
        {timezoneRead.status === 'error' && (
          <ServiceError error={me.error} onRetry={() => void me.refetch()} />
        )}
        {sessionSnapshot.revisionConflict && (
          <View
            className="gap-3 rounded-xl border border-destructive/40 bg-card p-4"
            accessibilityRole="alert">
            <Text variant="large">Pemeriksaan berubah</Text>
            <Text variant="muted">
              Catatan di server sudah berubah sejak Anda membukanya. Perubahan di formulir tetap
              tersimpan sampai Anda memilih untuk memuat ulang data terbaru.
            </Text>
            {!!sessionSnapshot.reloadError && (
              <Text className="text-sm text-destructive">
                {serviceErrorMessage(sessionSnapshot.reloadError)}
              </Text>
            )}
            <Button
              variant="outline"
              disabled={sessionSnapshot.reloading}
              onPress={() => void reloadCurrent()}>
              <Text>
                {sessionSnapshot.reloading ? 'Memuat data terbaru…' : 'Muat ulang data terbaru'}
              </Text>
            </Button>
          </View>
        )}
      </View>
      <ExaminationForm
        key={editFormProps.key}
        initialRecord={editFormProps.initialRecord}
        timezone={timezone}
        pending={update.isPending || sessionSnapshot.saving}
        submissionDisabled={editFormProps.submissionDisabled}
        submitLabel="Lanjut ke konfirmasi perubahan"
        submitError={
          update.error && !sessionSnapshot.revisionConflict
            ? serviceErrorMessage(update.error)
            : undefined
        }
        onDraftChange={resetDraft}
        onSubmit={save}
      />
    </View>
  );
}
