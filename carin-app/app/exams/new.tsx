import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import * as React from 'react';
import { View } from 'react-native';
import { ServiceError } from '@/components/app/service-error';
import { ExaminationForm } from '@/components/exams/ExaminationForm';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAppRead, useAppWrite } from '@/lib/api/query';
import { serviceErrorMessage } from '@/components/app/presentation';

export default function NewExamination() {
  const router = useRouter();
  const me = useAppRead('getMe', {});
  const create = useAppWrite('createExamination');
  const idempotencyKey = React.useRef<string | null>(null);
  const timezone = me.data?.data.timezone;

  const resetDraft = () => {
    idempotencyKey.current = null;
    create.reset();
  };
  const save = async (record: Parameters<typeof create.mutateAsync>[0]['body']) => {
    idempotencyKey.current ??= Crypto.randomUUID();
    try {
      await create.mutateAsync({
        headers: { 'Idempotency-Key': idempotencyKey.current },
        body: record,
      });
      idempotencyKey.current = null;
      router.replace('/(tabs)/exams');
    } catch {
      // Keep the same key so retrying the exact action is idempotent.
    }
  };

  return (
    <View className="flex-1 gap-4 bg-background p-5">
      <Button
        variant="ghost"
        className="self-start"
        onPress={() => router.replace('/(tabs)/exams')}>
        <Text>‹ Kembali ke pemeriksaan</Text>
      </Button>
      <View className="gap-1">
        <Text variant="h3">Catat pemeriksaan</Text>
        <Text variant="muted">Masukkan nilai persis seperti hasil pengukuran.</Text>
      </View>
      {me.isPending ? (
        <Text variant="muted">Memuat pengaturan akun…</Text>
      ) : me.error && !timezone ? (
        <ServiceError error={me.error} onRetry={() => void me.refetch()} />
      ) : timezone ? (
        <ExaminationForm
          timezone={timezone}
          pending={create.isPending}
          submitError={create.error ? serviceErrorMessage(create.error) : undefined}
          onDraftChange={resetDraft}
          onSubmit={save}
        />
      ) : null}
    </View>
  );
}
