import { Text } from '@/components/ui/text';
import { getMissingFieldTarget } from '@/lib/profile/profile';
import { Pressable, View } from 'react-native';

export function MissingFieldActions({
  fields,
  onOpen,
}: {
  fields: readonly string[];
  onOpen: (focus: string) => void;
}) {
  if (fields.length === 0) return null;
  return (
    <View className="gap-2 rounded-xl border border-border bg-card p-4">
      <Text className="font-semibold">Informasi yang dibutuhkan untuk personalisasi</Text>
      {fields.map((field) => {
        const target = getMissingFieldTarget(field);
        if (!target) return null;
        return (
          <Pressable
            key={field}
            className="min-h-11 justify-center"
            accessibilityRole="button"
            accessibilityLabel={`Lengkapi ${target.label}`}
            onPress={() => onOpen(target.focus)}>
            <Text className="font-medium text-primary">Lengkapi {target.label} →</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
