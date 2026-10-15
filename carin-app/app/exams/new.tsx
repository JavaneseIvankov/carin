import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import * as React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ServiceError } from '@/components/app/service-error';
import { ExaminationForm } from '@/components/exams/ExaminationForm';
import { BackButton } from '@/components/app/back-button';
import { Text } from '@/components/ui/text';
import { useAppRead, useAppWrite } from '@/lib/api/query';
import { serviceErrorMessage } from '@/components/app/presentation';
import { resolveExaminationTimezoneRead } from '@/lib/exams/timezone-state';

export default function NewExamination() {
  const router = useRouter();
  const me = useAppRead('getMe', {});
  const create = useAppWrite('createExamination');
  const idempotencyKey = React.useRef<string | null>(null);
  const timezoneRead = resolveExaminationTimezoneRead({
    timezone: me.data?.data.timezone,
    isPending: me.isPending,
    error: me.error,
  });
  const timezone = timezoneRead.timezone;

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
  const pageHeader = (
    <View className="gap-1">
      <BackButton href="/(tabs)/exams" />
      <Text variant="h2">Catat pemeriksaan</Text>
      <Text variant="muted">Masukkan nilai persis seperti hasil pengukuran.</Text>
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {timezone ? (
          <ExaminationForm
            header={
              <>
                {pageHeader}
                {timezoneRead.status === 'error' && (
                  <ServiceError error={me.error} onRetry={() => void me.refetch()} />
                )}
              </>
            }
            timezone={timezone}
            pending={create.isPending}
            submissionDisabled={timezoneRead.submissionDisabled}
            submitError={create.error ? serviceErrorMessage(create.error) : undefined}
            onDraftChange={resetDraft}
            onSubmit={save}
          />
        ) : (
          <ScrollView
            className="flex-1 bg-background"
            contentContainerClassName="gap-5 px-5 pb-10 pt-5">
            {pageHeader}
            {me.isPending ? (
              <View className="mt-2">
                <Text variant="muted">Memuat pengaturan akun…</Text>
              </View>
            ) : null}
            {timezoneRead.status === 'error' && (
              <ServiceError error={me.error} onRetry={() => void me.refetch()} />
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
