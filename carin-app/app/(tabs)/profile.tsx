import { ServiceError } from '@/components/app/service-error';
import { MissingFieldActions } from '@/components/profile/missing-field-actions';
import { ProfileHeaderPattern } from '@/components/profile/profile-header-pattern';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth/provider';
import { useAppRead } from '@/lib/api/query';
import {
  getKnowledgeStateLabel,
  getLegalRegistryState,
  getProfileConsentSummary,
  isCurrentLegalRegistry,
} from '@/lib/profile/profile';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import * as React from 'react';
import { Icon } from '@/components/ui/icon';
import { ChevronRight } from 'lucide-react-native';
import { ActivityIndicator, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ProfileScreen() {
  const router = useRouter();
  const { width, fontScale } = useWindowDimensions();
  const pageGutter = width < 360 ? 16 : 20;
  const stackIdentity = width < 360 || fontScale > 1.2;
  const { signOut } = useAuth();
  const profileQuery = useAppRead('getProfile', {});
  const accountQuery = useAppRead('getMe', {});
  const legalQuery = useAppRead('getLegalRegistry', {});
  const [actionError, setActionError] = React.useState<string | null>(null);
  const profile = profileQuery.data?.data;
  const account = accountQuery.data?.data;
  const registry = legalQuery.data?.data;
  const legalRegistryState = getLegalRegistryState({
    hasData: !!registry,
    stale: legalQuery.data?.stale ?? false,
    isPending: legalQuery.isPending,
    isFetching: legalQuery.isFetching,
    hasError: !!legalQuery.error,
  });
  const currentRegistryVersion =
    registry && isCurrentLegalRegistry(legalRegistryState) ? registry.aiProcessing.version : null;
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
      <SafeAreaView
        edges={['top', 'left', 'right']}
        className="flex-1 items-center justify-center gap-3 bg-background">
        <ActivityIndicator accessibilityLabel="Memuat profil" />
        <Text variant="muted">Memuat profil…</Text>
      </SafeAreaView>
    );
  }

  if (!profile && profileQuery.error) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 gap-4 bg-background p-5">
        <Text variant="h2">Profil</Text>
        <ServiceError error={profileQuery.error} onRetry={() => void profileQuery.refetch()} />
      </SafeAreaView>
    );
  }

  if (!profile) return null;

  return (
    <SafeAreaView className="flex-1 bg-carin-olive-soft" edges={['top', 'left', 'right']}>
      <ScrollView
        className="flex-1 bg-background"
        contentInsetAdjustmentBehavior="never"
        contentContainerClassName="gap-5 pb-10"
        contentContainerStyle={{ paddingHorizontal: pageGutter }}
        showsVerticalScrollIndicator={false}>
        <View
          className="relative gap-5 overflow-hidden rounded-b-[28px] bg-carin-olive-soft pb-8 pt-4"
          style={{ marginHorizontal: -pageGutter, paddingHorizontal: pageGutter }}>
          <ProfileHeaderPattern />
          <Text variant="label" className="text-primary">
            Profil
          </Text>
          <View className={stackIdentity ? 'items-start gap-4' : 'flex-row items-center gap-4'}>
            <View
              className="h-16 w-16 shrink-0 items-center justify-center border-2 border-card bg-carin-butter"
              style={{
                borderTopLeftRadius: 28,
                borderTopRightRadius: 36,
                borderBottomRightRadius: 26,
                borderBottomLeftRadius: 32,
              }}>
              <Text className="text-2xl font-bold text-foreground">
                {(account?.name?.trim()?.[0] || 'C').toUpperCase()}
              </Text>
            </View>
            <View className={stackIdentity ? 'w-full gap-1.5' : 'min-w-0 flex-1 gap-1.5'}>
              <Text variant="h1">{account?.name || 'Akun Carin'}</Text>
              {account?.email ? (
                <Text variant="muted" className="shrink">
                  {account.email}
                </Text>
              ) : null}
              <View className="mt-0.5 self-start rounded-full bg-card px-2.5 py-1">
                <Text className="text-xs font-semibold text-foreground">Pengguna Carin</Text>
              </View>
            </View>
          </View>
        </View>

        {accountQuery.error ? (
          <ServiceError error={accountQuery.error} onRetry={() => void accountQuery.refetch()} />
        ) : null}

        <View className="gap-3.5 rounded-summary border border-border/60 bg-card p-4">
          <View className="gap-1">
            <View className="flex-row items-center justify-between">
              <Text variant="h3">Profil kesehatan</Text>
              <View className="rounded-full bg-muted/80 px-2.5 py-0.5">
                <Text className="text-xs font-medium text-muted-foreground">Opsional</Text>
              </View>
            </View>
            <Text variant="caption" className="text-muted-foreground">
              {profile.version === 0
                ? 'Belum ada informasi kesehatan yang disimpan. Profil ini opsional.'
                : `Terakhir diperbarui ${profile.updatedAt ? new Date(profile.updatedAt).toLocaleString('id-ID') : '—'}.`}
            </Text>
          </View>
          <View className="gap-2.5 rounded-compact bg-muted/20 p-3.5">
            <View className="gap-0.5 border-b border-border/40 pb-2.5">
              <Text variant="caption" className="text-xs text-muted-foreground">
                Diagnosis
              </Text>
              <Text className="text-sm font-semibold text-foreground">
                {getKnowledgeStateLabel('diagnoses', profile.fields.diagnoses.state)}
              </Text>
              {profile.fields.diagnoses.entries?.length > 0 ? (
                <Text variant="caption" className="mt-0.5 text-muted-foreground">
                  {profile.fields.diagnoses.entries.map((e) => e.label).join(', ')}
                </Text>
              ) : null}
            </View>
            <View className="gap-0.5 border-b border-border/40 pb-2.5">
              <Text variant="caption" className="text-xs text-muted-foreground">
                Riwayat keluarga
              </Text>
              <Text className="text-sm font-semibold text-foreground">
                {getKnowledgeStateLabel('familyHistory', profile.fields.familyHistory.state)}
              </Text>
              {profile.fields.familyHistory.entries?.length > 0 ? (
                <Text variant="caption" className="mt-0.5 text-muted-foreground">
                  {profile.fields.familyHistory.entries.map((e) => e.label).join(', ')}
                </Text>
              ) : null}
            </View>
            <View className="gap-0.5 pt-0.5">
              <Text variant="caption" className="text-xs text-muted-foreground">
                Alergi dan pantangan
              </Text>
              <Text className="text-sm font-semibold text-foreground">
                {getKnowledgeStateLabel('allergies', profile.fields.allergies.state)}
              </Text>
              {profile.fields.allergies.entries?.length > 0 ? (
                <Text variant="caption" className="mt-0.5 text-muted-foreground">
                  {profile.fields.allergies.entries.join(', ')}
                </Text>
              ) : null}
            </View>
          </View>
          {profile.personalization.unsupportedConditions.length > 0 ? (
            <View className="gap-2 rounded-compact border border-border/60 bg-carin-butter/30 p-3.5">
              <Text className="font-semibold text-foreground">
                Belum didukung untuk personalisasi
              </Text>
              {profile.personalization.unsupportedConditions.map((condition) => (
                <Text key={condition} className="text-sm text-foreground">
                  • {condition}
                </Text>
              ))}
              <Text variant="caption" className="text-muted-foreground">
                Informasi tetap tersimpan di profil Anda.
              </Text>
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
            className="min-h-12"
            onPress={() => router.push('/(onboarding)/health-profile' as Href)}>
            <Text>
              {profile.version === 0 ? 'Lengkapi profil kesehatan' : 'Ubah profil kesehatan'}
            </Text>
          </Button>
        </View>

        <View className="gap-3.5 rounded-summary border border-border/60 bg-card p-4">
          <Text variant="h3">Pengaturan dan persetujuan</Text>
          <View className="gap-2 rounded-compact bg-muted/20 p-3">
            <View className="flex-row items-center justify-between border-b border-border/40 py-1">
              <Text variant="caption" className="text-muted-foreground">
                Zona waktu
              </Text>
              <Text className="text-sm font-semibold text-foreground">
                {account?.timezone ?? 'Belum tersedia'}
              </Text>
            </View>
            <View className="gap-1 py-1">
              <Text variant="caption" className="text-muted-foreground">
                Persetujuan pemrosesan AI
              </Text>
              <Text className="text-sm font-medium text-foreground">{consentMessage}</Text>
            </View>
          </View>
          {legalRegistryState === 'loading' ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator accessibilityLabel="Memeriksa versi persetujuan AI" />
              <Text variant="muted">Memeriksa versi pemberitahuan…</Text>
            </View>
          ) : null}
          {legalQuery.error ? (
            <ServiceError error={legalQuery.error} onRetry={() => void legalQuery.refetch()} />
          ) : null}
          {legalRegistryState === 'stale' ? (
            <View className="gap-2">
              <Text variant="muted">
                Versi pemberitahuan tersimpan mungkin belum terbaru. Status persetujuan belum dapat
                diverifikasi.
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
          {legalRegistryState === 'refreshing' ? (
            <Text variant="muted">Memeriksa versi pemberitahuan terbaru…</Text>
          ) : null}
          <Button
            variant="outline"
            className="min-h-12"
            onPress={() => router.push('/settings' as Href)}>
            <Text>Buka pengaturan</Text>
          </Button>
        </View>

        <View className="gap-2 rounded-summary border border-border/60 bg-card p-4">
          <Text variant="h3">Dokumen dan kebijakan</Text>
          <Pressable
            className="min-h-12 flex-row items-center justify-between border-b border-border/40 py-2"
            accessibilityRole="link"
            accessibilityLabel="Syarat dan Ketentuan"
            onPress={() => openLegal('terms')}>
            <Text className="text-sm font-medium text-foreground">Syarat dan Ketentuan</Text>
            <Icon as={ChevronRight} size={18} className="text-muted-foreground" />
          </Pressable>
          <Pressable
            className="min-h-12 flex-row items-center justify-between border-b border-border/40 py-2"
            accessibilityRole="link"
            accessibilityLabel="Pemberitahuan Privasi"
            onPress={() => openLegal('privacy')}>
            <Text className="text-sm font-medium text-foreground">Pemberitahuan Privasi</Text>
            <Icon as={ChevronRight} size={18} className="text-muted-foreground" />
          </Pressable>
          <Pressable
            className="min-h-12 flex-row items-center justify-between py-2"
            accessibilityRole="link"
            accessibilityLabel="Pemrosesan AI"
            onPress={() => openLegal('ai-processing')}>
            <Text className="text-sm font-medium text-foreground">Pemrosesan AI</Text>
            <Icon as={ChevronRight} size={18} className="text-muted-foreground" />
          </Pressable>
        </View>

        {actionError ? (
          <Text className="text-sm text-destructive" accessibilityRole="alert">
            {actionError}
          </Text>
        ) : null}
        <Button variant="outline" className="min-h-12" onPress={() => void leaveAccount()}>
          <Text>Keluar dari akun</Text>
        </Button>
        <View className="gap-3 rounded-summary border border-destructive/30 bg-destructive/5 p-4">
          <Text variant="h4" className="font-bold text-destructive">
            Penghapusan data
          </Text>
          <Text variant="muted">
            Hapus akun dan data, atau hapus satu hasil analisis beserta foto sumbernya.
          </Text>
          <Button
            variant="destructive"
            className="min-h-12"
            onPress={() => router.push('/account/delete' as Href)}>
            <Text>Hapus akun dan data</Text>
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
