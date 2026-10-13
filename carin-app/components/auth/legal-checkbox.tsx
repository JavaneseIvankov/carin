import { Text } from '@/components/ui/text';
import { Pressable, View } from 'react-native';

export function LegalCheckbox({
  label,
  version,
  checked,
  error,
  onCheckedChange,
  onOpenDocument,
}: {
  label: string;
  version: string;
  checked: boolean;
  error?: string;
  onCheckedChange: (checked: boolean) => void;
  onOpenDocument: () => void;
}) {
  return (
    <View className="gap-2">
      <View className="flex-row items-start gap-3">
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={`Saya menyetujui ${label}`}
          accessibilityState={{ checked }}
          accessibilityHint="Pilih untuk menyetujui dokumen ini. Buka nama dokumen untuk membacanya."
          className="min-h-11 min-w-11 items-center justify-center"
          onPress={() => onCheckedChange(!checked)}>
          <View
            className={`h-6 w-6 items-center justify-center rounded border ${
              checked ? 'border-primary bg-primary' : 'border-input bg-background'
            }`}>
            {checked ? <Text className="font-bold text-primary-foreground">✓</Text> : null}
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Baca ${label}, versi ${version}`}
          className="flex-1 gap-1 py-2"
          onPress={onOpenDocument}>
          <Text className="font-medium leading-5">{label}</Text>
          <Text variant="muted">Versi {version} · Ketuk untuk membaca</Text>
        </Pressable>
      </View>
      {error ? (
        <Text className="ml-14 text-sm text-destructive" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
