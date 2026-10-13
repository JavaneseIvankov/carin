import { ServiceError } from '@/components/app/service-error';
import { MissingFieldActions } from '@/components/profile/missing-field-actions';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth/provider';
import { useAppRead } from '@/lib/api/query';
import { getKnowledgeStateLabel, getProfileConsentSummary } from '@/lib/profile/profile';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import * as React from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';

export default function ProfileScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const profileQuery = useAppRead('getProfile', {});
  const accountQuery = useAppRead('getMe', {});
  const legalQuery = useAppRead('getLegalRegistry', {});
  const [actionError, setActionError] = React.useState<string | null>(null);
  const profile = profileQuery.data?.data;
  const account = accountQuery.data?.data;
  const registry = legalQuery.data?.data;
  const currentRegistryVersion =
    registry && !legalQuery.isFetching && !legalQuery.error ? registry.aiProcessing.version : null;
  const consentSummary = getProfileConsentSummary(
    account?.aiConsent,
    accountQuery.error
      ? 'error'
      : accountQuery.isPending
        ? 'pending'
        : accountQuery.isFetching
          ? 'fetching'
          : 'ready',
    currentRegistryVersion
  );
  const consentMessage =
    consentSummary.kind === 'loading'
      ? 'Memuat status persetujuan akun…'
      : consentSummary.kind === 'error'
        ? 'Status persetujuan akun tidak dapat dimuat.'
        : consentSummary.kind === 'unavailable'
          ? 'Status persetujuan akun belum tersedia.'
          : consentSummary.status === 'active'
            ? 'Aktif untuk versi pemberitahuan saat ini'
            : consentSummary.status === 'stale'
              ? `Perlu diperbarui (persetujuan versi ${account?.aiConsent.version ?? 'lama'})`
              : consentSummary.status === 'version_unavailable'
                ? 'Status belum dapat diverifikasi terhadap versi pemberitahuan saat ini'
                : 'Belum diberikan';

  const openLegal = (document: 'terms' | 'privacy' | 'ai-processing') => {
    router.push({ pathname: '/legal/[document]', params: { document } } as Href);
  };

  const leaveAccount = async () => {
    setActionError(null);
    try {
      await signOut();
    } catch {
      setActionError('Belum berhasil keluar. Periksa koneksi lalu coba lagi.');
    }
  };

  if (profileQuery.isPending && !profileQuery.data) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background">
        <ActivityIndicator accessibilityLabel="Memuat profil" />
        <Text variant="muted">Memuat profil…</Text>
      </View>
    );
  }

  if (!profile && profileQuery.error) {
    return (
      <View className="flex-1 gap-4 bg-background p-5">
        <Text variant="h2">Profil</Text>
        <ServiceError error={profileQuery.error} onRetry={() => void profileQuery.refetch()} />
      </View>
    );
  }

  if (!profile) return null;

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-5 px-5 pb-10 pt-7">
      <View className="gap-1">
        <Text variant="h2">Profil</Text>
        <Text variant="muted">{account?.name ?? 'Akun Carin'}</Text>
        <Text variant="muted">{account?.email ?? ''}</Text>
      </View>

      {accountQuery.error ? (
        <ServiceError error={accountQuery.error} onRetry={() => void accountQuery.refetch()} />
      ) : null}

      <View className="gap-3 rounded-xl border border-border bg-card p-4">
        <View className="gap-1">
          <Text variant="h4">Profil kesehatan</Text>
          <Text variant="muted">
            {profile.version === 0
              ? 'Belum ada informasi kesehatan yang disimpan. Profil ini opsional.'
              : `Terakhir diperbarui ${profile.updatedAt ? new Date(profile.updatedAt).toLocaleString('id-ID') : '—'}.`}
          </Text>
        </View>
        <Text>
          Diagnosis: {getKnowledgeStateLabel('diagnoses', profile.fields.diagnoses.state)}
        </Text>
        <Text>
          Riwayat keluarga:{' '}
          {getKnowledgeStateLabel('familyHistory', profile.fields.familyHistory.state)}
        </Text>
        <Text>
          Alergi/pantangan: {getKnowledgeStateLabel('allergies', profile.fields.allergies.state)}
        </Text>
        {profile.personalization.unsupportedConditions.length > 0 ? (
          <View className="gap-2 rounded-lg border border-border bg-muted/40 p-3">
            <Text className="font-semibold">Belum didukung untuk personalisasi</Text>
            {profile.personalization.unsupportedConditions.map((condition) => (
              <Text key={condition}>• {condition}</Text>
            ))}
            <Text variant="muted">Informasi tetap tersimpan di profil Anda.</Text>
          </View>
        ) : null}
        <MissingFieldActions
          fields={profile.personalization.missingFields}
          onOpen={(focus) =>
            router.push({ pathname: '/(onboarding)/health-profile', params: { focus } } as Href)
          }
        />
        <Button
          variant="outline"
          onPress={() => router.push('/(onboarding)/health-profile' as Href)}>
          <Text>
            {profile.version === 0 ? 'Lengkapi profil kesehatan' : 'Ubah profil kesehatan'}
          </Text>
        </Button>
      </View>

      <View className="gap-3 rounded-xl border border-border bg-card p-4">
        <Text variant="h4">Pengaturan dan persetujuan</Text>
        <Text variant="muted">Zona waktu: {account?.timezone ?? 'Belum tersedia'}</Text>
        <Text variant="muted">Persetujuan pemrosesan AI: {consentMessage}</Text>
        {legalQuery.isPending && !registry ? (
          <View className="flex-row items-center gap-2">
            <ActivityIndicator accessibilityLabel="Memeriksa versi persetujuan AI" />
            <Text variant="muted">Memeriksa versi pemberitahuan…</Text>
          </View>
        ) : null}
        {legalQuery.error ? (
          <ServiceError error={legalQuery.error} onRetry={() => void legalQuery.refetch()} />
        ) : null}
        {registry && legalQuery.isFetching ? (
          <Text variant="muted">Memeriksa versi pemberitahuan terbaru…</Text>
        ) : null}
        <Button variant="outline" onPress={() => router.push('/settings' as Href)}>
          <Text>Buka pengaturan</Text>
        </Button>
      </View>

      <View className="gap-3 rounded-xl border border-border bg-card p-4">
        <Text variant="h4">Dokumen</Text>
        <Button variant="ghost" onPress={() => openLegal('terms')}>
          <Text>Syarat dan Ketentuan</Text>
        </Button>
        <Button variant="ghost" onPress={() => openLegal('privacy')}>
          <Text>Pemberitahuan Privasi</Text>
        </Button>
        <Button variant="ghost" onPress={() => openLegal('ai-processing')}>
          <Text>Pemrosesan AI</Text>
        </Button>
      </View>

      {actionError ? (
        <Text className="text-sm text-destructive" accessibilityRole="alert">
          {actionError}
        </Text>
      ) : null}
      <Button variant="outline" onPress={() => void leaveAccount()}>
        <Text>Keluar dari akun</Text>
      </Button>
    </ScrollView>
  );
}
