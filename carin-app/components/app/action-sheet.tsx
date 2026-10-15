import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Camera, ChevronRight, ClipboardPlus } from 'lucide-react-native';
import { View } from 'react-native';

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
    <Drawer
      isOpen={visible}
      onClose={onClose}
      title="Tambah makanan"
      description="Pilih cara mencatat asupan Anda"
      contentContainerClassName="gap-3.5 pb-8">
      {/* Action 1: Catat Makanan (Primary tactile) */}
      <Button
        variant="tactile"
        className="h-auto min-h-16 w-full justify-start px-4 py-3.5"
        onPress={onManual}
        accessibilityLabel="Catat makanan yang sudah dikonsumsi">
        <View className="h-9 w-9 items-center justify-center rounded-[10px] bg-white/15">
          <Icon as={ClipboardPlus} className="text-primary-foreground" size={20} />
        </View>
        <View className="flex-1 gap-0.5">
          <Text className="text-base font-semibold text-primary-foreground">
            Catat makanan
          </Text>
          <Text variant="caption" className="text-xs text-primary-foreground/80">
            Sudah dikonsumsi · isi manual tanpa foto
          </Text>
        </View>
        <Icon as={ChevronRight} className="text-primary-foreground/80" size={20} />
      </Button>

      {/* Action 2: Analisis Foto (Peach tactile-secondary) */}
      <Button
        variant="tactile-secondary"
        className="h-auto min-h-16 w-full justify-start px-4 py-3.5"
        onPress={onPhoto}
        accessibilityLabel="Analisis foto makanan sebelum makan">
        <View className="h-9 w-9 items-center justify-center rounded-[10px] bg-foreground/10">
          <Icon as={Camera} className="text-secondary-foreground" size={20} />
        </View>
        <View className="flex-1 gap-0.5">
          <Text className="text-base font-semibold text-secondary-foreground">
            Analisis foto
          </Text>
          <Text variant="caption" className="text-xs text-secondary-foreground/80">
            Sebelum makan · foto makanan yang tersedia
          </Text>
        </View>
        <Icon as={ChevronRight} className="text-secondary-foreground/80" size={20} />
      </Button>
    </Drawer>
  );
}
