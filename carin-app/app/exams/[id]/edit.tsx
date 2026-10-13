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

export default function EditExamination() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const me = useAppRead('getMe', {});
  const examination = useAppRead('getExamination', { path: { id } });
  const update = useAppWrite('updateExamination');
  const idempotencyKey = React.useRef<string | null>(null);
  const timezone = me.data?.data.timezone;
  const item = examination.data?.data;

  const resetDraft = () => {
    idempotencyKey.current = null;
    update.reset();
  };
  const save = async (record: NonNullable<typeof item>['record']) => {
    if (!item) return;
    idempotencyKey.current ??= Crypto.randomUUID();
    try {
      await update.mutateAsync({
        path: { id },
        headers: { 'Idempotency-Key': idempotencyKey.current },
        body: { expectedRevision: item.revision, record },
      });
      idempotencyKey.current = null;
      router.replace({ pathname: '/exams/[id]', params: { id } });
    } catch {
      // Keep the same key so retrying the exact action is idempotent.
    }
  };

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
  if (me.error && !timezone) {
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
      <ExaminationForm
        key={`${id}:${item.revision}`}
        initialRecord={item.record}
        timezone={timezone}
        pending={update.isPending}
        submitLabel="Lanjut ke konfirmasi perubahan"
        submitError={update.error ? serviceErrorMessage(update.error) : undefined}
        onDraftChange={resetDraft}
        onSubmit={save}
      />
    </View>
  );
}
