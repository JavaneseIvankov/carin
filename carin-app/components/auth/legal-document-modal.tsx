import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { LegalContent } from '@/components/legal/legal-content';
import type { LegalDocument } from '@/lib/auth/legal';
import { Modal, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function LegalDocumentModal({
  document,
  onClose,
}: {
  document: LegalDocument | null;
  onClose: () => void;
}) {
  return (
    <Modal visible={document !== null} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-background" accessibilityViewIsModal>
        <View className="flex-row items-start justify-between gap-4 border-b border-border px-5 py-4">
          <View className="flex-1 gap-1">
            <Text variant="h4">{document?.title ?? 'Dokumen'}</Text>
            {document ? <Text variant="muted">Versi {document.version}</Text> : null}
          </View>
          <Button variant="outline" size="sm" onPress={onClose} accessibilityLabel="Tutup dokumen">
            <Text>Tutup</Text>
          </Button>
        </View>
        {document ? (
          <ScrollView
            accessibilityLabel={`${document.title}, versi ${document.version}`}
            className="flex-1"
            contentContainerClassName="gap-4 px-5 py-5">
            <LegalContent document={document} />
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}
