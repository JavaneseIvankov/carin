import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { getMissingFieldTarget } from '@/lib/profile/profile';
import { ChevronRight, UserRound } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

export function MissingFieldActions({
  fields,
  onOpen,
  tone = 'plain',
  heading = 'Informasi yang dibutuhkan untuk personalisasi',
  description,
}: {
  fields: readonly string[];
  onOpen: (focus: string) => void;
  tone?: 'plain' | 'tonal';
  heading?: string;
  description?: string;
}) {
  if (fields.length === 0) return null;
  return (
    <View
      className={
        tone === 'tonal'
          ? 'gap-2 rounded-compact bg-carin-olive-soft p-3'
          : 'gap-2 rounded-xl border border-border bg-card p-4'
      }>
      {tone === 'tonal' ? (
        <View className="flex-row items-center gap-2">
          <Icon as={UserRound} className="text-primary" size={20} />
          <Text className="flex-1 font-semibold">Profil kesehatan</Text>
          <Text variant="caption" className="rounded-full bg-card px-2 py-1 text-muted-foreground">
            Opsional
          </Text>
        </View>
      ) : (
        <Text className="font-semibold">{heading}</Text>
      )}
      {description ? <Text className="text-muted-foreground">{description}</Text> : null}
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
            <View className="flex-row items-center gap-1">
              <Text className="font-semibold text-primary">Lengkapi {target.label}</Text>
              <Icon as={ChevronRight} className="text-primary" size={18} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
