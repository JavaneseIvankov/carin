import { FormField } from '@/components/app/form-field';
import { ServiceError } from '@/components/app/service-error';
import { LegalCheckbox } from '@/components/auth/legal-checkbox';
import { LegalContent } from '@/components/legal/legal-content';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAppRead, useAppWrite } from '@/lib/api/query';
import { ApiError } from '@/lib/api/repository';
import {
  createStableActionKey,
  getAiConsentValue,
  getAiConsentStatus,
  getLegalRegistryState,
  isAiConsentDraftDirty,
  isCurrentLegalRegistry,
  isSuccessfulQueryRefresh,
  reconcileAiConsentDraft,
  type AiConsentDraft,
} from '@/lib/profile/profile';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { cn } from '@/lib/utils';
import * as React from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

export default function SettingsScreen() {
  const router = useRouter();
  const meQuery = useAppRead('getMe', {});
  const legalQuery = useAppRead('getLegalRegistry', {});
  const updateMe = useAppWrite('updateMe');
  const setAiConsent = useAppWrite('setAiConsent');
  const [timezoneDraft, setTimezoneDraft] = React.useState<string | null>(null);
  const [consentDraft, setConsentDraft] = React.useState<AiConsentDraft | null>(null);
  const [timezoneError, setTimezoneError] = React.useState<string | null>(null);
  const [timezoneConflict, setTimezoneConflict] = React.useState(false);
  const [timezoneMessage, setTimezoneMessage] = React.useState<string | null>(null);
  const [consentMessage, setConsentMessage] = React.useState<string | null>(null);
  const [consentConflict, setConsentConflict] = React.useState(false);
  const [actionKeys] = React.useState(() => createStableActionKey());
  const account = meQuery.data?.data;
  const registry = legalQuery.data?.data;
  const legalRegistryState = getLegalRegistryState({
    hasData: !!registry,
    stale: legalQuery.data?.stale ?? false,
    isPending: legalQuery.isPending,
    isFetching: legalQuery.isFetching,
    hasError: !!legalQuery.error,
  });
  const registryCurrent = isCurrentLegalRegistry(legalRegistryState);
  const timezone = timezoneDraft ?? account?.timezone ?? '';
  const consentStatus = getAiConsentStatus(
    account?.aiConsent ?? { version: null, granted: false },
    registryCurrent ? registry?.aiProcessing.version : null
  );
  const consentActive = consentStatus === 'active';
  const consentVersion = registryCurrent ? registry?.aiProcessing.version : undefined;
  const consentValue = getAiConsentValue(consentDraft, consentVersion, consentActive);

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
    if (isSuccessfulQueryRefresh(result)) {
      setTimezoneConflict(false);
      setTimezoneMessage(
        'Versi terbaru dimuat. Draft zona waktu tetap ada; simpan kembali untuk menerapkannya.'
      );
    } else {
      setTimezoneMessage('Pengaturan terbaru belum dapat dimuat. Draft tetap ada.');
    }
  };

  const saveConsent = async () => {
    if (!account || !registry || !registryCurrent) return;
    setConsentMessage(null);
    const body = { version: registry.aiProcessing.version, granted: consentValue };
    try {
      const updated = await setAiConsent.mutateAsync({
        headers: { 'Idempotency-Key': actionKeys.forPayload(body) },
        body,
      });
      actionKeys.clear();
      setConsentDraft({
        version: updated.aiConsent.version ?? body.version,
        granted: updated.aiConsent.granted,
      });
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
    const previousVersion = registryCurrent ? (registry?.aiProcessing.version ?? null) : null;
    const result = await legalQuery.refetch();
    if (isSuccessfulQueryRefresh(result) && result.data && !result.data.stale) {
      const latestVersion = result.data.data.aiProcessing.version;
      setConsentDraft((draft) => reconcileAiConsentDraft(draft, previousVersion, latestVersion));
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

  const dirtyConsent = isAiConsentDraftDirty(consentDraft, consentVersion, consentActive);
  const consentStatusMessage =
    consentStatus === 'active'
      ? 'Persetujuan aktif untuk versi saat ini'
      : consentStatus === 'stale'
        ? `Persetujuan versi ${account.aiConsent.version ?? 'lama'} sudah tidak berlaku. Setujui versi ${registry?.aiProcessing.version} untuk mengaktifkan pemrosesan AI.`
        : consentStatus === 'version_unavailable'
          ? 'Versi persetujuan belum dapat diverifikasi.'
          : 'Belum memberikan persetujuan';

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-5 px-5 pb-10 pt-7">
      <View className="gap-2">
        <Text variant="h1">Pengaturan</Text>
        <Text variant="muted">Perubahan disimpan ke akun Anda saat server mengonfirmasi.</Text>
      </View>

      <View className="gap-4 rounded-summary border border-border/60 bg-card p-5">
        <Text variant="h3">Zona waktu</Text>
        <Text variant="muted">
          Zona waktu menentukan batas hari pada ringkasan dan catatan asupan Anda.
        </Text>

        {/* Quick regional preset pills */}
        <View className="gap-2">
          <Text className="font-medium text-foreground">Pilih zona wilayah Indonesia</Text>
          <View className="flex-row flex-wrap gap-2.5">
            {[
              { code: 'WIB', tz: 'Asia/Jakarta', region: 'Barat (Jawa, Sumatera)' },
              { code: 'WITA', tz: 'Asia/Makassar', region: 'Tengah (Bali, Sulawesi)' },
              { code: 'WIT', tz: 'Asia/Jayapura', region: 'Timur (Maluku, Papua)' },
            ].map((item) => {
              const isSelected = timezone === item.tz;
              return (
                <Pressable
                  key={item.tz}
                  onPress={() => setTimezoneDraft(item.tz)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.code}: ${item.tz}`}
                  accessibilityState={{ selected: isSelected }}
                  className={cn(
                    'flex-1 min-w-[95px] items-center justify-center rounded-control border p-3 gap-1',
                    isSelected
                      ? 'border-primary bg-carin-olive-soft'
                      : 'border-border bg-card active:bg-muted/30'
                  )}>
                  <Text
                    className={cn(
                      'text-base font-bold',
                      isSelected ? 'text-primary' : 'text-foreground'
                    )}>
                    {item.code}
                  </Text>
                  <Text
                    variant="caption"
                    className={cn(
                      'text-center text-[11px]',
                      isSelected ? 'font-medium text-primary' : 'text-muted-foreground'
                    )}>
                    {item.region}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Device Auto-detect */}
          <Pressable
            onPress={() => {
              try {
                const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
                if (detected) setTimezoneDraft(detected);
              } catch {
                setTimezoneDraft('Asia/Jakarta');
              }
            }}
            accessibilityRole="button"
            accessibilityLabel="Gunakan zona waktu perangkat"
            className="mt-1 self-start rounded-full border border-border/80 bg-muted/20 px-3.5 py-1.5 active:bg-muted/40">
            <Text variant="caption" className="font-medium text-foreground">
              ⚡ Gunakan waktu perangkat
            </Text>
          </Pressable>
        </View>

        <FormField
          label="Zona waktu aktif (IANA)"
          value={timezone}
          onChangeText={(value) => setTimezoneDraft(value)}
          error={timezoneError ?? undefined}
          placeholder="Asia/Jakarta"
          autoCapitalize="none"
          autoCorrect={false}
          hint="Pilih tombol wilayah di atas atau ubah manual jika berada di luar negeri."
        />
        <Button
          variant="tactile"
          className="min-h-12"
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
            className="min-h-12"
            onPress={() => void reloadTimezoneRevision()}
            disabled={meQuery.isFetching}>
            <Text>{meQuery.isFetching ? 'Memuat versi terbaru…' : 'Muat versi terbaru'}</Text>
          </Button>
        ) : null}
      </View>

      <View className="gap-4 rounded-summary border border-border/60 bg-card p-5">
        <View className="gap-2">
          <Text variant="h3">Persetujuan pemrosesan AI</Text>
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
        {registry && legalRegistryState === 'stale' ? (
          <View className="gap-2">
            <Text variant="muted">
              Pemberitahuan tersimpan dari cache dan mungkin bukan versi terbaru. Muat versi terbaru
              sebelum mengubah persetujuan.
            </Text>
            {!legalQuery.error ? (
              <Button
                variant="outline"
                className="min-h-12"
                onPress={() => void legalQuery.refetch()}
                disabled={legalQuery.isFetching}>
                <Text>
                  {legalQuery.isFetching ? 'Memuat versi terbaru…' : 'Muat versi terbaru'}
                </Text>
              </Button>
            ) : null}
          </View>
        ) : null}
        {registry && legalRegistryState === 'refreshing' ? (
          <Text variant="muted">
            Memeriksa versi pemberitahuan terbaru. Perubahan persetujuan sementara dinonaktifkan.
          </Text>
        ) : null}
        {registry && legalRegistryState === 'error' ? (
          <Text variant="muted">
            Versi pemberitahuan belum dapat diverifikasi. Perubahan persetujuan dinonaktifkan.
          </Text>
        ) : null}
        {registry ? (
          <>
            <View className="gap-3 rounded-compact border border-border/60 bg-muted/20 p-4">
              <Text className="font-semibold text-foreground">
                {registryCurrent ? 'Pemberitahuan yang berlaku' : 'Pemberitahuan tersimpan'}
              </Text>
              <LegalContent document={registry.aiProcessing} />
            </View>
            {registryCurrent ? (
              <LegalCheckbox
                label="Persetujuan pemrosesan AI"
                version={registry.aiProcessing.version}
                checked={consentValue}
                onCheckedChange={(granted) =>
                  setConsentDraft({ version: registry.aiProcessing.version, granted })
                }
                onOpenDocument={openConsentDocument}
              />
            ) : null}
          </>
        ) : legalQuery.isPending ? (
          <View className="flex-row items-center gap-2">
            <ActivityIndicator accessibilityLabel="Memuat dokumen persetujuan AI" />
            <Text variant="muted">Memuat versi dokumen…</Text>
          </View>
        ) : null}
        <Text variant="muted">
          Status saat ini: {consentStatusMessage}
          {account.aiConsent.updatedAt
            ? ` · diperbarui ${new Date(account.aiConsent.updatedAt).toLocaleString('id-ID')}`
            : ''}
        </Text>
        <Button
          tactile
          className="min-h-12"
          onPress={() => void saveConsent()}
          disabled={!registryCurrent || !dirtyConsent || consentConflict || setAiConsent.isPending}>
          <Text>
            {setAiConsent.isPending
              ? 'Menyimpan…'
              : !registryCurrent
                ? 'Muat versi terbaru sebelum mengubah'
                : consentValue
                  ? 'Simpan persetujuan'
                  : consentActive
                    ? 'Cabut persetujuan'
                    : consentStatus === 'stale'
                      ? 'Setujui versi terbaru'
                      : 'Belum ada perubahan'}
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
            className="min-h-12"
            onPress={() => void reloadConsentVersion()}
            disabled={legalQuery.isFetching}>
            <Text>{legalQuery.isFetching ? 'Memuat dokumen…' : 'Muat dokumen terbaru'}</Text>
          </Button>
        ) : null}
        <Button variant="outline" className="min-h-12" onPress={openConsentDocument}>
          <Text>Baca pemberitahuan pemrosesan AI</Text>
        </Button>
      </View>

      <Button variant="outline" className="min-h-12" onPress={() => router.back()}>
        <Text>Kembali ke profil</Text>
      </Button>
    </ScrollView>
  );
}
