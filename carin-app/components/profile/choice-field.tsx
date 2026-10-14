import { Text } from '@/components/ui/text';
import { Pressable, View } from 'react-native';

export type ChoiceOption = { value: string; label: string };

export function ChoiceField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: readonly ChoiceOption[];
  onChange: (value: string | null) => void;
}) {
  return (
    <View className="gap-2">
      <Text className="font-medium">{label}</Text>
      <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
        {options.map((option) => {
          const selected = (value ?? '') === option.value;
          return (
            <Pressable
              key={option.value}
              className={`min-h-11 justify-center rounded-full border px-4 py-2 ${
                selected ? 'border-primary bg-primary/10' : 'border-border bg-background'
              }`}
              accessibilityRole="radio"
              accessibilityLabel={`${label}: ${option.label}`}
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(option.value || null)}>
              <Text className={selected ? 'font-semibold text-primary' : 'text-foreground'}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
