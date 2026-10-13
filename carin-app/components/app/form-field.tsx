import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import * as React from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { fieldAccessibilityHint, fieldLabel } from './presentation';

export function FormField({
  label,
  hint,
  error,
  unit,
  className,
  ...props
}: TextInputProps & {
  label: string;
  hint?: string;
  error?: string;
  unit?: string;
}) {
  return (
    <View className="gap-1.5">
      <Text className="font-medium">{fieldLabel(label, unit)}</Text>
      {hint && <Text variant="muted">{hint}</Text>}
      <TextInput
        {...props}
        accessibilityLabel={fieldLabel(label, unit)}
        accessibilityHint={fieldAccessibilityHint(hint, error)}
        className={cn(
          'min-h-12 rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground',
          error && 'border-destructive',
          className
        )}
      />
      {error && (
        <Text className="text-sm text-destructive" accessibilityRole="alert">
          {error}
        </Text>
      )}
    </View>
  );
}
