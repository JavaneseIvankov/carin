import { ServiceError } from '@/components/app/service-error';
import { LegalContent } from '@/components/legal/legal-content';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAppRead } from '@/lib/api/query';
import { getLegalRegistryState } from '@/lib/profile/profile';
import type { components } from '@/lib/api/generated/app-api';
import type { LegalDocument } from '@/lib/auth/legal';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, View } from 'react-native';

type DocumentKey = 'terms' | 'privacy' | 'ai-processing';

function selectDocument(
  key: string | undefined,
  registry: components['schemas']['LegalRegistry']
): LegalDocument | null {
  if (key === 'terms') return registry.terms;
  if (key === 'privacy') return registry.privacy;
  if (key === 'ai-processing') return registry.aiProcessing;
  return null;
}

export default function LegalDocumentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ document?: string | string[] }>();
  const documentKey = Array.isArray(params.document) ? params.document[0] : params.document;
  const validKey = (['terms', 'privacy', 'ai-processing'] as string[]).includes(documentKey ?? '')
    ? (documentKey as DocumentKey)
    : undefined;
  const legalQuery = useAppRead('getLegalRegistry', {});
  const registry = legalQuery.data?.data;
  const legalRegistryState = getLegalRegistryState({
    hasData: !!registry,
    stale: legalQuery.data?.stale ?? false,
    isPending: legalQuery.isPending,
    isFetching: legalQuery.isFetching,
    hasError: !!legalQuery.error,
  });
  const document = validKey && registry ? selectDocument(validKey, registry) : null;

  if (legalQuery.isPending && !registry) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background">
        <ActivityIndicator accessibilityLabel="Memuat dokumen hukum" />
        <Text variant="muted">Memuat dokumen…</Text>
      </View>
    );
  }

  if (!registry && legalQuery.error) {
    return (
      <View className="flex-1 gap-4 bg-background p-5">
        <Text variant="h2">Dokumen</Text>
        <ServiceError error={legalQuery.error} onRetry={() => void legalQuery.refetch()} />
      </View>
    );
  }

  if (!document) {
    return (
      <View className="flex-1 gap-4 bg-background p-5">
        <Text variant="h2">Dokumen tidak ditemukan</Text>
        <Text variant="muted">Pilih dokumen melalui halaman profil atau pengaturan.</Text>
        <Button variant="outline" onPress={() => router.back()}>
          <Text>Kembali</Text>
        </Button>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <View className="gap-2 border-b border-border px-5 pb-4 pt-7">
        <Text variant="h2">{document.title}</Text>
        {legalRegistryState === 'stale' ? (
          <Text variant="muted">Dokumen tersimpan dari cache dan mungkin bukan versi terbaru.</Text>
        ) : null}
        {legalRegistryState === 'refreshing' ? (
          <Text variant="muted">Memeriksa versi dokumen terbaru…</Text>
        ) : null}
        {legalRegistryState === 'error' ? (
          <Text variant="muted">Versi terbaru belum dapat diverifikasi.</Text>
        ) : null}
        <Text variant="muted">
          Versi {document.version} · berlaku{' '}
          {new Date(document.effectiveAt).toLocaleDateString('id-ID')}
        </Text>
        {legalQuery.error ? (
          <ServiceError error={legalQuery.error} onRetry={() => void legalQuery.refetch()} />
        ) : legalRegistryState === 'stale' ? (
          <Button
            variant="outline"
            size="sm"
            onPress={() => void legalQuery.refetch()}
            disabled={legalQuery.isFetching}>
            <Text>{legalQuery.isFetching ? 'Memuat versi terbaru…' : 'Muat versi terbaru'}</Text>
          </Button>
        ) : null}
        <Button variant="outline" size="sm" onPress={() => router.back()}>
          <Text>Kembali</Text>
        </Button>
      </View>
      <ScrollView
        accessibilityLabel={`${document.title}, versi ${document.version}`}
        contentContainerClassName="gap-4 px-5 pb-10 pt-5">
        <LegalContent document={document} />
      </ScrollView>
    </View>
  );
}
