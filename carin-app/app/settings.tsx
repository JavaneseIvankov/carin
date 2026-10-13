import { FormField } from '@/components/app/form-field';
import { ServiceError } from '@/components/app/service-error';
import { LegalCheckbox } from '@/components/auth/legal-checkbox';
import { LegalContent } from '@/components/legal/legal-content';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAppRead, useAppWrite } from '@/lib/api/query';
import { ApiError } from '@/lib/api/repository';
import { createStableActionKey } from '@/lib/profile/profile';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import * as React from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';

export default function SettingsScreen() {
  const router = useRouter();
  const meQuery = useAppRead('getMe', {});
  const legalQuery = useAppRead('getLegalRegistry', {});
  const updateMe = useAppWrite('updateMe');
  const setAiConsent = useAppWrite('setAiConsent');
  const [timezoneDraft, setTimezoneDraft] = React.useState<string | null>(null);
  const [consentDraft, setConsentDraft] = React.useState<boolean | null>(null);
  const [timezoneError, setTimezoneError] = React.useState<string | null>(null);
  const [timezoneConflict, setTimezoneConflict] = React.useState(false);
  const [timezoneMessage, setTimezoneMessage] = React.useState<string | null>(null);
  const [consentMessage, setConsentMessage] = React.useState<string | null>(null);
  const [consentConflict, setConsentConflict] = React.useState(false);
  const [actionKeys] = React.useState(() => createStableActionKey());
  const account = meQuery.data?.data;
  const registry = legalQuery.data?.data;
  const timezone = timezoneDraft ?? account?.timezone ?? '';
  const consentValue = consentDraft ?? account?.aiConsent.granted ?? false;

  const openConsentDocument = () => {
    router.push({ pathname: '/legal/[document]', params: { document: 'ai-processing' } } as Href);
  };

  const saveTimezone = async () => {
    if (!account) return;
    const normalizedTimezone = timezone.trim();
    if (!normalizedTimezone) {
      setTimezoneError('Masukkan zona waktu, misalnya Asia/Jakarta.');
      return;
    }
    try {
      new Intl.DateTimeFormat('id-ID', { timeZone: normalizedTimezone }).format(new Date());
    } catch {
      setTimezoneError('Zona waktu tidak dikenali. Gunakan nama seperti Asia/Jakarta.');
      return;
    }
    setTimezoneError(null);
    setTimezoneMessage(null);
    const body = { expectedRevision: account.settingsRevision, timezone: normalizedTimezone };
    try {
      const updated = await updateMe.mutateAsync({
        headers: { 'Idempotency-Key': actionKeys.forPayload(body) },
        body,
      });
      actionKeys.clear();
      setTimezoneDraft(updated.timezone);
      setTimezoneConflict(false);
      setTimezoneMessage('Zona waktu tersimpan.');
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setTimezoneConflict(true);
        setTimezoneMessage('Pengaturan berubah di perangkat lain. Draft Anda tetap ada.');
      } else {
        setTimezoneMessage('Zona waktu belum tersimpan. Periksa koneksi lalu coba lagi.');
      }
    }
  };

  const reloadTimezoneRevision = async () => {
    const result = await meQuery.refetch();
    if (result.data) {
      setTimezoneConflict(false);
      setTimezoneMessage(
        'Versi terbaru dimuat. Draft zona waktu tetap ada; simpan kembali untuk menerapkannya.'
      );
    } else {
      setTimezoneMessage('Pengaturan terbaru belum dapat dimuat. Draft tetap ada.');
    }
  };

  const saveConsent = async () => {
    if (!account || !registry) return;
    setConsentMessage(null);
    const body = { version: registry.aiProcessing.version, granted: consentValue };
    try {
      const updated = await setAiConsent.mutateAsync({
        headers: { 'Idempotency-Key': actionKeys.forPayload(body) },
        body,
      });
      actionKeys.clear();
      setConsentDraft(updated.aiConsent.granted);
      setConsentConflict(false);
      setConsentMessage(
        consentValue ? 'Persetujuan pemrosesan AI aktif.' : 'Persetujuan pemrosesan AI dicabut.'
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setConsentConflict(true);
        setConsentMessage(
          'Versi persetujuan berubah. Baca dokumen terbaru lalu muat ulang sebelum menyimpan.'
        );
      } else {
        setConsentMessage('Perubahan persetujuan belum tersimpan. Periksa koneksi lalu coba lagi.');
      }
    }
  };

  const reloadConsentVersion = async () => {
    const result = await legalQuery.refetch();
    if (result.data) {
      setConsentConflict(false);
      setConsentMessage(
        'Dokumen terbaru dimuat. Baca kembali dokumen sebelum menyimpan persetujuan.'
      );
    } else {
      setConsentMessage('Dokumen terbaru belum dapat dimuat. Pilihan Anda tetap ada.');
    }
  };

  if (meQuery.isPending && !meQuery.data) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background">
        <ActivityIndicator accessibilityLabel="Memuat pengaturan" />
        <Text variant="muted">Memuat pengaturan…</Text>
      </View>
    );
  }

  if (!account && meQuery.error) {
    return (
      <View className="flex-1 gap-4 bg-background p-5">
        <Text variant="h2">Pengaturan</Text>
        <ServiceError error={meQuery.error} onRetry={() => void meQuery.refetch()} />
      </View>
    );
  }
  if (!account) return null;

  const currentConsent = account.aiConsent.granted;
  const dirtyConsent = consentDraft !== null && consentDraft !== currentConsent;

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-5 px-5 pb-10 pt-7">
      <View className="gap-2">
        <Text variant="h2">Pengaturan</Text>
        <Text variant="muted">Perubahan disimpan ke akun Anda saat server mengonfirmasi.</Text>
      </View>

      <View className="gap-4 rounded-xl border border-border bg-card p-4">
        <Text variant="h4">Zona waktu</Text>
        <Text variant="muted">
          Zona waktu menentukan batas hari pada ringkasan dan catatan waktu.
        </Text>
        <FormField
          label="Zona waktu"
          value={timezone}
          onChangeText={(value) => setTimezoneDraft(value)}
          error={timezoneError ?? undefined}
          placeholder="Asia/Jakarta"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Button
          onPress={() => void saveTimezone()}
          disabled={updateMe.isPending || timezone === account.timezone}>
          <Text>{updateMe.isPending ? 'Menyimpan…' : 'Simpan zona waktu'}</Text>
        </Button>
        {timezoneMessage ? (
          <Text variant="muted" accessibilityRole={timezoneConflict ? 'alert' : 'text'}>
            {timezoneMessage}
          </Text>
        ) : null}
        {timezoneConflict ? (
          <Button
            variant="outline"
            onPress={() => void reloadTimezoneRevision()}
            disabled={meQuery.isFetching}>
            <Text>{meQuery.isFetching ? 'Memuat versi terbaru…' : 'Muat versi terbaru'}</Text>
          </Button>
        ) : null}
      </View>

      <View className="gap-4 rounded-xl border border-border bg-card p-4">
        <View className="gap-2">
          <Text variant="h4">Persetujuan pemrosesan AI</Text>
          <Text>
            Persetujuan ini pilihan dan terpisah dari persetujuan saat pendaftaran. Tanpa
            persetujuan aktif, profil, pencatatan makanan manual, dan catatan pemeriksaan tetap
            dapat digunakan. Analisis foto dan evaluasi personal berbantuan AI tidak dimulai.
          </Text>
          <Text variant="muted">
            Anda dapat mencabut persetujuan kapan saja. Catatan yang sudah tersimpan tidak otomatis
            dihapus.
          </Text>
        </View>
        {legalQuery.error ? (
          <ServiceError error={legalQuery.error} onRetry={() => void legalQuery.refetch()} />
        ) : null}
        {registry ? (
          <>
            <View className="gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <Text className="font-semibold">Pemberitahuan yang berlaku</Text>
              <LegalContent document={registry.aiProcessing} />
            </View>
            <LegalCheckbox
              label="Persetujuan pemrosesan AI"
              version={registry.aiProcessing.version}
              checked={consentValue}
              onCheckedChange={setConsentDraft}
              onOpenDocument={openConsentDocument}
            />
          </>
        ) : legalQuery.isPending ? (
          <View className="flex-row items-center gap-2">
            <ActivityIndicator accessibilityLabel="Memuat dokumen persetujuan AI" />
            <Text variant="muted">Memuat versi dokumen…</Text>
          </View>
        ) : null}
        <Text variant="muted">
          Status saat ini: {currentConsent ? 'Persetujuan aktif' : 'Belum memberikan persetujuan'}
          {account.aiConsent.updatedAt
            ? ` · diperbarui ${new Date(account.aiConsent.updatedAt).toLocaleString('id-ID')}`
            : ''}
        </Text>
        <Button
          onPress={() => void saveConsent()}
          disabled={!registry || !dirtyConsent || setAiConsent.isPending}>
          <Text>
            {setAiConsent.isPending
              ? 'Menyimpan…'
              : consentValue
                ? 'Simpan persetujuan'
                : 'Cabut persetujuan'}
          </Text>
        </Button>
        {consentMessage ? (
          <Text variant="muted" accessibilityRole={consentConflict ? 'alert' : 'text'}>
            {consentMessage}
          </Text>
        ) : null}
        {consentConflict ? (
          <Button
            variant="outline"
            onPress={() => void reloadConsentVersion()}
            disabled={legalQuery.isFetching}>
            <Text>{legalQuery.isFetching ? 'Memuat dokumen…' : 'Muat dokumen terbaru'}</Text>
          </Button>
        ) : null}
        <Button variant="outline" onPress={openConsentDocument}>
          <Text>Baca pemberitahuan pemrosesan AI</Text>
        </Button>
      </View>

      <Button variant="outline" onPress={() => router.back()}>
        <Text>Kembali ke profil</Text>
      </Button>
    </ScrollView>
  );
}
