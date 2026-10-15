import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Clock, X } from 'lucide-react-native';
import * as React from 'react';
import { Platform, Pressable, View } from 'react-native';

export type TimePickerFieldProps = {
  label: string;
  value: string | null; // Format: HH:mm (24 hour) or null
  onChange: (value: string | null) => void;
  error?: string;
  hint?: string;
  disabled?: boolean;
  allowClear?: boolean;
  className?: string;
};

export function TimePickerField({
  label,
  value,
  onChange,
  error,
  hint,
  disabled = false,
  allowClear = false,
  className,
}: TimePickerFieldProps) {
  const [showPicker, setShowPicker] = React.useState(false);

  const parsedTimeDate = React.useMemo(() => {
    const d = new Date();
    if (value && /^\d{1,2}:\d{2}$/.test(value)) {
      const [h, m] = value.split(':').map(Number);
      d.setHours(h, m, 0, 0);
    }
    return d;
  }, [value]);

  return (
    <View className={cn('gap-1.5', className)}>
      <View className="flex-row items-center justify-between">
        <Text className="font-medium text-foreground">{label}</Text>
        {allowClear && value && !disabled ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Hapus ${label}`}
            onPress={() => onChange(null)}
            className="flex-row items-center gap-1 py-0.5 px-1.5 rounded-full active:bg-muted">
            <Icon as={X} size={13} className="text-muted-foreground" />
            <Text variant="caption" className="text-muted-foreground">
              Hapus
            </Text>
          </Pressable>
        ) : null}
      </View>
      {hint && <Text variant="muted">{hint}</Text>}

      {Platform.OS === 'web' ? (
        <View className="relative justify-center">
          {React.createElement('input', {
            type: 'time',
            value: value || '',
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value || null),
            disabled,
            'aria-label': label,
            className: cn(
              'h-12 w-full rounded-control border border-border bg-card px-3 text-base text-foreground focus:border-primary focus:outline-none',
              error && 'border-destructive',
              disabled && 'opacity-60 cursor-not-allowed'
            ),
            style: {
              height: 48,
              width: '100%',
              borderRadius: '0.75rem',
              borderWidth: 1,
              borderStyle: 'solid',
              borderColor: error ? 'hsl(var(--destructive))' : 'hsl(var(--border))',
              backgroundColor: 'hsl(var(--card))',
              color: 'hsl(var(--foreground))',
              paddingLeft: 12,
              paddingRight: 12,
              fontSize: 16,
              outline: 'none',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
              colorScheme: 'light dark',
            },
          })}
        </View>
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${value ?? 'Belum ditentukan'}`}
            disabled={disabled}
            onPress={() => setShowPicker(true)}
            className={cn(
              'h-12 flex-row items-center justify-between rounded-control border border-border bg-card px-3',
              error && 'border-destructive',
              disabled && 'opacity-60'
            )}>
            <Text className={cn('text-base', value ? 'text-foreground' : 'text-muted-foreground')}>
              {value ?? 'Pilih waktu (HH:mm)'}
            </Text>
            <Icon as={Clock} size={18} className="text-muted-foreground" />
          </Pressable>

          {showPicker && (
            <DateTimePicker
              value={parsedTimeDate}
              mode="time"
              is24Hour={true}
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(event: DateTimePickerEvent, selectedDate?: Date) => {
                setShowPicker(false);
                if (selectedDate && event.type !== 'dismissed') {
                  const h = String(selectedDate.getHours()).padStart(2, '0');
                  const m = String(selectedDate.getMinutes()).padStart(2, '0');
                  onChange(`${h}:${m}`);
                }
              }}
            />
          )}
        </>
      )}

      {error && (
        <Text className="text-sm text-destructive" accessibilityRole="alert">
          {error}
        </Text>
      )}
    </View>
  );
}
