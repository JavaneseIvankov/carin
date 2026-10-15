import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { Eye, EyeOff } from 'lucide-react-native';
import * as React from 'react';
import {
  Animated,
  Platform,
  Pressable,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { fieldAccessibilityHint, fieldLabel } from './presentation';

export type FormFieldProps = TextInputProps & {
  label: string;
  hint?: string;
  error?: string;
  unit?: string;
  unitBadge?: boolean;
};

export const FormField = React.forwardRef<TextInput, FormFieldProps>(function FormField(
  {
    label,
    hint,
    error,
    unit,
    unitBadge = false,
    className,
    ...props
  },
  ref
) {
  const [isFocused, setIsFocused] = React.useState(false);
  const isPasswordField = Boolean(props.secureTextEntry);
  const [showPassword, setShowPassword] = React.useState(false);
  const [internalValue, setInternalValue] = React.useState(props.defaultValue ?? '');

  const placeholderColor = props.placeholderTextColor ?? '#8a8d80';

  const isControlled = props.value !== undefined;
  const currentValue = isControlled ? props.value : internalValue;
  const hasValue = Boolean(
    currentValue !== undefined &&
      currentValue !== null &&
      String(currentValue).length > 0
  );

  const isFloating = isFocused || hasValue || Boolean(props.multiline);

  const animatedProgress = React.useRef(
    new Animated.Value(isFloating ? 1 : 0)
  ).current;

  React.useEffect(() => {
    const animation = Animated.timing(animatedProgress, {
      toValue: isFloating ? 1 : 0,
      duration: 150,
      useNativeDriver: false,
    });
    animation.start();
    return () => {
      animation.stop();
    };
  }, [isFloating, animatedProgress]);

  const labelTop = props.multiline
    ? 6
    : animatedProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [17, 6],
      });

  const labelClasses = cn(
    Platform.select({ web: 'transition-all duration-150' }),
    isFloating
      ? cn('text-[11px] font-semibold text-primary', error && 'text-destructive')
      : cn('text-base font-normal text-muted-foreground', error && 'text-destructive')
  );

  const containerBorderClass = error
    ? 'border-destructive'
    : isFocused
      ? 'border-primary'
      : 'border-border';

  const containerHeightClass = props.multiline
    ? 'min-h-[56px] py-2.5'
    : 'h-14 min-h-[56px]';

  const handleChangeText = (text: string) => {
    if (!isControlled) {
      setInternalValue(text);
    }
    props.onChangeText?.(text);
  };

  const hasRightAccessory = Boolean(unit || isPasswordField);

  return (
    <View className={cn('gap-1.5', className)}>
      <View
        className={cn(
          'relative flex-row items-center rounded-control border bg-card px-3.5',
          containerHeightClass,
          containerBorderClass,
          props.editable === false && 'opacity-80'
        )}
      >
        <View className={cn('relative flex-1 justify-center', !props.multiline && 'h-full')}>
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: labelTop,
              zIndex: 1,
            }}
          >
            <Text numberOfLines={1} className={labelClasses}>
              {label}
            </Text>
          </Animated.View>

          <TextInput
            {...props}
            ref={ref}
            value={props.value}
            defaultValue={props.defaultValue}
            onChangeText={handleChangeText}
            secureTextEntry={isPasswordField ? !showPassword : props.secureTextEntry}
            onFocus={(e) => {
              setIsFocused(true);
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              props.onBlur?.(e);
            }}
            placeholder={isFloating ? props.placeholder : undefined}
            placeholderTextColor={placeholderColor}
            accessibilityLabel={
              props.accessibilityLabel ?? fieldLabel(label, unit)
            }
            accessibilityHint={
              props.accessibilityHint ?? fieldAccessibilityHint(hint, error)
            }
            className={cn(
              'w-full text-base text-foreground bg-transparent p-0',
              Platform.select({ web: 'focus:outline-none outline-none' }),
              props.multiline
                ? 'min-h-[52px] pt-[18px]'
                : 'h-full pt-[18px] pb-1 justify-center'
            )}
            style={[
              props.multiline ? { textAlignVertical: 'top' } : undefined,
              props.style,
            ]}
          />
        </View>

        {hasRightAccessory && (
          <View className="flex-row items-center gap-2 pl-2">
            {unit ? (
              unitBadge ? (
                <View className="rounded-full bg-carin-olive-soft px-2.5 py-0.5">
                  <Text
                    variant="caption"
                    className="font-semibold text-foreground"
                  >
                    {unit}
                  </Text>
                </View>
              ) : (
                <Text className="text-sm font-medium text-muted-foreground">
                  {unit}
                </Text>
              )
            ) : null}
            {isPasswordField && (
              <Pressable
                onPress={() => setShowPassword((prev) => !prev)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={
                  showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'
                }
                className="justify-center p-1"
              >
                <Icon
                  as={showPassword ? EyeOff : Eye}
                  size={20}
                  className="text-muted-foreground"
                />
              </Pressable>
            )}
          </View>
        )}
      </View>

      {hint && <Text variant="muted">{hint}</Text>}
      {error && (
        <Text className="text-sm text-destructive" accessibilityRole="alert">
          {error}
        </Text>
      )}
    </View>
  );
});
