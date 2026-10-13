import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Modal, Pressable, View } from 'react-native';

export function ActionSheet({
  visible,
  onClose,
  onPhoto,
  onManual,
}: {
  visible: boolean;
  onClose: () => void;
  onPhoto: () => void;
  onManual: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Tutup menu" />
        <View className="gap-3 rounded-t-3xl bg-background px-5 pb-8 pt-5">
          <View className="flex-row items-center justify-between">
            <Text variant="h4">Tambah makanan</Text>
            <Button variant="ghost" onPress={onClose} accessibilityLabel="Tutup">
              <Text>Tutup</Text>
            </Button>
          </View>
          <Button
            variant="outline"
            className="h-auto min-h-16 flex-col items-start py-3"
            onPress={onPhoto}
            accessibilityLabel="Analisis sebelum makan">
            <Text className="font-semibold">Analisis sebelum makan</Text>
            <Text variant="muted">Foto makanan yang masih tersedia.</Text>
          </Button>
          <Button
            variant="outline"
            className="h-auto min-h-16 flex-col items-start py-3"
            onPress={onManual}
            accessibilityLabel="Catat yang sudah dimakan">
            <Text className="font-semibold">Catat yang sudah dimakan</Text>
            <Text variant="muted">Isi catatan manual tanpa foto.</Text>
          </Button>
        </View>
      </View>
    </Modal>
  );
}
