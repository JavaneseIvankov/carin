import { ServiceError } from '@/components/app/service-error';
import { MissingFieldActions } from '@/components/profile/missing-field-actions';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAppRead } from '@/lib/api/query';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, View } from 'react-native';

export default function Home() {
  const router = useRouter();
  const profileQuery = useAppRead('getProfile', {});
  const profile = profileQuery.data?.data;

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-5 px-5 pb-10 pt-7">
      <View className="gap-2">
        <Text variant="h2">Beranda</Text>
        <Text variant="muted">
          Profil kesehatan bersifat opsional. Catatan manual dan pemeriksaan tetap dapat digunakan.
        </Text>
      </View>
      {profileQuery.isPending && !profile ? (
        <View className="flex-row items-center gap-3">
          <ActivityIndicator accessibilityLabel="Memuat kebutuhan profil" />
          <Text variant="muted">Memuat informasi personalisasi…</Text>
        </View>
      ) : null}
      {profileQuery.error ? (
        <ServiceError error={profileQuery.error} onRetry={() => void profileQuery.refetch()} />
      ) : null}
      {profile ? (
        <MissingFieldActions
          fields={profile.personalization.missingFields}
          onOpen={(focus) =>
            router.push({ pathname: '/(onboarding)/health-profile', params: { focus } } as Href)
          }
        />
      ) : null}
      <View className="gap-3 rounded-xl border border-border bg-card p-4">
        <Text variant="h4">Mulai kapan saja</Text>
        <Text variant="muted">
          Isi nanti untuk mulai mencatat makanan atau melihat pemeriksaan. Profil dapat dilengkapi
          dari tab Profil.
        </Text>
        <Button variant="outline" onPress={() => router.push('/consumptions/new' as Href)}>
          <Text>Catat makanan secara manual</Text>
        </Button>
        <Button variant="outline" onPress={() => router.push('/(tabs)/exams' as Href)}>
          <Text>Buka pemeriksaan</Text>
        </Button>
        <Button variant="ghost" onPress={() => router.push('/(onboarding)/health-profile' as Href)}>
          <Text>Lengkapi profil kesehatan</Text>
        </Button>
      </View>
    </ScrollView>
  );
}
