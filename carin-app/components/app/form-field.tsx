import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { Eye, EyeOff } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';
import { fieldAccessibilityHint, fieldLabel } from './presentation';

export function FormField({
  label,
  hint,
  error,
  unit,
  unitBadge = false,
  className,
  ...props
}: TextInputProps & {
  label: string;
  hint?: string;
  error?: string;
  unit?: string;
  unitBadge?: boolean;
}) {
  const [isFocused, setIsFocused] = React.useState(false);
  const isPasswordField = Boolean(props.secureTextEntry);
  const [showPassword, setShowPassword] = React.useState(false);

  return (
    <View className="gap-1.5">
      <View className="flex-row items-center justify-between">
        <Text className="font-medium text-foreground">
          {unitBadge ? label : fieldLabel(label, unit)}
        </Text>
        {unitBadge && unit ? (
          <View className="rounded-full bg-carin-olive-soft px-2.5 py-0.5">
            <Text variant="caption" className="font-semibold text-foreground">
              {unit}
            </Text>
          </View>
        ) : null}
      </View>
      {hint && <Text variant="muted">{hint}</Text>}
      <View className="relative justify-center">
        <TextInput
          {...props}
          secureTextEntry={isPasswordField ? !showPassword : props.secureTextEntry}
          onFocus={(e) => {
            setIsFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            props.onBlur?.(e);
          }}
          accessibilityLabel={fieldLabel(label, unit)}
          accessibilityHint={fieldAccessibilityHint(hint, error)}
          placeholderTextColor="#8a8d80"
          className={cn(
            'h-12 rounded-control border border-border bg-card px-3 text-base text-foreground',
            isPasswordField && 'pr-11',
            isFocused && 'border-primary',
            props.multiline && 'h-auto min-h-12 py-3',
            error && 'border-destructive',
            className
          )}
        />
        {isPasswordField && (
          <Pressable
            onPress={() => setShowPassword((prev) => !prev)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
            className="absolute right-3 top-0 bottom-0 justify-center p-1"
          >
            <Icon
              as={showPassword ? EyeOff : Eye}
              size={20}
              className="text-muted-foreground"
            />
          </Pressable>
        )}
      </View>
      {error && (
        <Text className="text-sm text-destructive" accessibilityRole="alert">
          {error}
        </Text>
      )}
    </View>
  );
}

