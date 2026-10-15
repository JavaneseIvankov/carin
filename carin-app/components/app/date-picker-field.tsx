import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Calendar } from 'lucide-react-native';
import * as React from 'react';
import { Platform, Pressable, View } from 'react-native';

export type DatePickerFieldProps = {
  label: string;
  value: string; // Format: YYYY-MM-DD
  onChange: (value: string) => void;
  minDate?: string;
  maxDate?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  className?: string;
};

function formatDisplayDate(isoDate: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return 'Pilih tanggal';
  const [year, month, day] = isoDate.split('-').map(Number);
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  return `${day} ${months[month - 1] ?? ''} ${year}`;
}

export function DatePickerField({
  label,
  value,
  onChange,
  minDate,
  maxDate,
  error,
  hint,
  disabled = false,
  className,
}: DatePickerFieldProps) {
  const [showPicker, setShowPicker] = React.useState(false);

  const parsedDate = React.useMemo(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-').map(Number);
      return new Date(year, month - 1, day, 12, 0, 0);
    }
    return new Date();
  }, [value]);

  const minDateObj = React.useMemo(() => {
    if (minDate && /^\d{4}-\d{2}-\d{2}$/.test(minDate)) {
      const [year, month, day] = minDate.split('-').map(Number);
      return new Date(year, month - 1, day, 0, 0, 0);
    }
    return undefined;
  }, [minDate]);

  const maxDateObj = React.useMemo(() => {
    if (maxDate && /^\d{4}-\d{2}-\d{2}$/.test(maxDate)) {
      const [year, month, day] = maxDate.split('-').map(Number);
      return new Date(year, month - 1, day, 23, 59, 59);
    }
    return undefined;
  }, [maxDate]);

  return (
    <View className={cn('gap-1.5', className)}>
      <View className="flex-row items-center justify-between">
        <Text className="font-medium text-foreground">{label}</Text>
      </View>
      {hint && <Text variant="muted">{hint}</Text>}

      {Platform.OS === 'web' ? (
        <View className="relative justify-center">
          {React.createElement('input', {
            type: 'date',
            value: value || '',
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
            min: minDate,
            max: maxDate,
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
            },
          })}
        </View>
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${formatDisplayDate(value)}`}
            disabled={disabled}
            onPress={() => setShowPicker(true)}
            className={cn(
              'h-12 flex-row items-center justify-between rounded-control border border-border bg-card px-3',
              error && 'border-destructive',
              disabled && 'opacity-60'
            )}>
            <Text className={cn('text-base', value ? 'text-foreground' : 'text-muted-foreground')}>
              {formatDisplayDate(value)}
            </Text>
            <Icon as={Calendar} size={18} className="text-muted-foreground" />
          </Pressable>

          {showPicker && (
            <DateTimePicker
              value={parsedDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              minimumDate={minDateObj}
              maximumDate={maxDateObj}
              onChange={(event: DateTimePickerEvent, selectedDate?: Date) => {
                setShowPicker(false);
                if (selectedDate && event.type !== 'dismissed') {
                  const y = selectedDate.getFullYear();
                  const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
                  const d = String(selectedDate.getDate()).padStart(2, '0');
                  onChange(`${y}-${m}-${d}`);
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
