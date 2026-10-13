import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import {
  buildExaminationInput,
  type ExaminationFormValues,
  type ExaminationInput,
} from '@/lib/exams/form-model';
import { formatMeasuredAt, formatMeasurement, recordTitle } from '@/lib/exams/model';
import * as React from 'react';
import { Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { FormField } from '@/components/app/form-field';

type GlucoseContext = Extract<ExaminationInput, { type: 'glucose' }>['context'];
type CholesterolSubtype = Extract<ExaminationInput, { type: 'cholesterol' }>['subtype'];
type PickerMode = 'date' | 'time';

const labels: Record<ExaminationInput['type'], string> = {
  pressure: 'Tekanan darah',
  glucose: 'Gula darah',
  cholesterol: 'Kolesterol',
};
const contextLabels: Record<GlucoseContext, string> = {
  fasting: 'Puasa',
  random: 'Acak',
  post_meal: 'Setelah makan',
  unknown: 'Tidak diketahui',
};
const subtypeLabels: Record<CholesterolSubtype, string> = {
  total: 'Total',
  ldl: 'LDL',
  hdl: 'HDL',
};

function toLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function formatLocalDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatLocalTime(value: Date) {
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
}

function initialValues(record?: ExaminationInput): ExaminationFormValues {
  const common = {
    measuredOn: record?.measuredOn ?? '',
    measuredTime: record?.measuredTime ?? null,
    note: record?.note ?? '',
    systolic: record?.type === 'pressure' ? String(record.systolic) : '',
    diastolic: record?.type === 'pressure' ? String(record.diastolic) : '',
    value: record && record.type !== 'pressure' ? String(record.value) : '',
    context: (record?.type === 'glucose' ? record.context : 'unknown') as GlucoseContext,
    subtype: (record?.type === 'cholesterol' ? record.subtype : 'total') as CholesterolSubtype,
  };
  return { type: record?.type ?? 'pressure', ...common };
}

function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View className="gap-2">
      <Text className="font-medium">{label}</Text>
      <View
        className="flex-row flex-wrap gap-2"
        accessibilityRole="radiogroup"
        accessibilityLabel={label}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              onPress={() => onChange(option.value)}
              className={`min-h-12 justify-center rounded-full border px-4 ${selected ? 'border-primary bg-accent' : 'border-border bg-background'}`}>
              <Text className={selected ? 'font-semibold text-accent-foreground' : ''}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function ExaminationForm({
  initialRecord,
  timezone,
  pending = false,
  submitError,
  submitLabel = 'Lanjut ke konfirmasi',
  onDraftChange,
  onSubmit,
}: {
  initialRecord?: ExaminationInput;
  timezone: string;
  pending?: boolean;
  submitError?: string;
  submitLabel?: string;
  onDraftChange?: () => void;
  onSubmit: (record: ExaminationInput) => void | Promise<void>;
}) {
  const [values, setValues] = React.useState(() => initialValues(initialRecord));
  const [errors, setErrors] = React.useState<ReturnType<typeof buildExaminationInput>['errors']>(
    {}
  );
  const [preview, setPreview] = React.useState<ExaminationInput | null>(null);
  const [pickerMode, setPickerMode] = React.useState<PickerMode | null>(null);

  const update = <K extends keyof ExaminationFormValues>(
    key: K,
    value: ExaminationFormValues[K]
  ) => {
    setValues((current) => ({ ...current, [key]: value }));
    setPreview(null);
    onDraftChange?.();
  };
  const setType = (type: ExaminationInput['type']) => {
    update('type', type);
  };
  const showPreview = () => {
    const result = buildExaminationInput(values, timezone);
    setErrors(result.errors);
    if (result.record) setPreview(result.record);
  };

  const pickerValue =
    pickerMode === 'date'
      ? values.measuredOn
        ? toLocalDate(values.measuredOn)
        : new Date()
      : values.measuredTime
        ? (() => {
            const [hours, minutes] = values.measuredTime!.split(':').map(Number);
            const date = new Date();
            date.setHours(hours, minutes, 0, 0);
            return date;
          })()
        : new Date();
  const onPickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    const mode = pickerMode;
    setPickerMode(null);
    if (event.type !== 'set' || !selected || !mode) return;
    if (mode === 'date') update('measuredOn', formatLocalDate(selected));
    else update('measuredTime', formatLocalTime(selected));
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 p-5 pb-10"
      keyboardShouldPersistTaps="handled">
      <ChoiceGroup
        label="Jenis pemeriksaan"
        value={values.type}
        onChange={setType}
        options={(['pressure', 'glucose', 'cholesterol'] as const).map((value) => ({
          value,
          label: labels[value],
        }))}
      />

      {values.type === 'pressure' ? (
        <View className="gap-4 rounded-xl border border-border bg-card p-4">
          <Text variant="large">Tekanan darah</Text>
          <Text variant="muted">Catat angka seperti yang tertulis pada alat.</Text>
          <FormField
            label="Sistolik"
            unit="mmHg"
            value={values.systolic}
            onChangeText={(value) => update('systolic', value)}
            keyboardType="decimal-pad"
            inputMode="decimal"
            error={errors.systolic}
            placeholder="Contoh: 120"
          />
          <FormField
            label="Diastolik"
            unit="mmHg"
            value={values.diastolic}
            onChangeText={(value) => update('diastolic', value)}
            keyboardType="decimal-pad"
            inputMode="decimal"
            error={errors.diastolic}
            placeholder="Contoh: 80"
          />
        </View>
      ) : (
        <View className="gap-4 rounded-xl border border-border bg-card p-4">
          <Text variant="large">{labels[values.type]}</Text>
          {values.type === 'glucose' ? (
            <ChoiceGroup
              label="Konteks pengukuran"
              value={values.context}
              onChange={(value) => update('context', value)}
              options={(['fasting', 'random', 'post_meal', 'unknown'] as const).map((value) => ({
                value,
                label: contextLabels[value],
              }))}
            />
          ) : (
            <ChoiceGroup
              label="Jenis kolesterol"
              value={values.subtype}
              onChange={(value) => update('subtype', value)}
              options={(['total', 'ldl', 'hdl'] as const).map((value) => ({
                value,
                label: subtypeLabels[value],
              }))}
            />
          )}
          <FormField
            label={values.type === 'glucose' ? 'Hasil gula darah' : 'Hasil kolesterol'}
            unit="mg/dL"
            value={values.value}
            onChangeText={(value) => update('value', value)}
            keyboardType="decimal-pad"
            inputMode="decimal"
            error={errors.value}
            placeholder="Masukkan angka pada hasil"
          />
        </View>
      )}

      <View className="gap-3 rounded-xl border border-border bg-card p-4">
        <Text variant="large">Waktu pengukuran</Text>
        <Text variant="muted">Tanggal wajib. Waktu hanya dicatat jika Anda mengetahuinya.</Text>
        {Platform.OS === 'web' ? (
          <View className="gap-2">
            <Text className="font-medium">Tanggal pengukuran</Text>
            <TextInput
              accessibilityLabel="Tanggal pengukuran"
              accessibilityHint="Wajib diisi. Format tahun, bulan, tanggal."
              value={values.measuredOn}
              onChangeText={(value) => update('measuredOn', value)}
              placeholder="YYYY-MM-DD"
              className="min-h-12 rounded-lg border border-input bg-background px-3 text-base text-foreground"
              {...({ type: 'date' } as React.ComponentProps<typeof TextInput>)}
            />
          </View>
        ) : (
          <View className="gap-1">
            <Text className="font-medium">Tanggal pengukuran</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                values.measuredOn ? `Tanggal ${values.measuredOn}` : 'Pilih tanggal pengukuran'
              }
              onPress={() => setPickerMode('date')}
              className="min-h-12 justify-center rounded-lg border border-input bg-background px-3">
              <Text>{values.measuredOn || 'Pilih tanggal'}</Text>
            </Pressable>
          </View>
        )}
        {errors.measuredOn && (
          <Text className="text-sm text-destructive" accessibilityRole="alert">
            {errors.measuredOn}
          </Text>
        )}
        {values.measuredTime === null ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              Platform.OS === 'web' ? update('measuredTime', '12:00') : setPickerMode('time')
            }
            className="min-h-12 justify-center rounded-lg border border-dashed border-border px-3">
            <Text className="text-primary">+ Tambah waktu pengukuran</Text>
          </Pressable>
        ) : (
          <View className="flex-row items-center gap-3">
            {Platform.OS === 'web' ? (
              <TextInput
                accessibilityLabel="Waktu pengukuran"
                value={values.measuredTime}
                onChangeText={(value) => update('measuredTime', value)}
                placeholder="HH:mm"
                className="min-h-12 flex-1 rounded-lg border border-input bg-background px-3 text-base text-foreground"
                {...({ type: 'time' } as React.ComponentProps<typeof TextInput>)}
              />
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => setPickerMode('time')}
                className="min-h-12 flex-1 justify-center rounded-lg border border-input px-3">
                <Text>{values.measuredTime}</Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Hapus waktu pengukuran"
              onPress={() => update('measuredTime', null)}
              className="min-h-12 justify-center px-3">
              <Text variant="muted">Hapus</Text>
            </Pressable>
          </View>
        )}
        {errors.measuredTime && (
          <Text className="text-sm text-destructive" accessibilityRole="alert">
            {errors.measuredTime}
          </Text>
        )}
        {!!errors.timezone && (
          <Text className="text-sm text-destructive" accessibilityRole="alert">
            {errors.timezone}
          </Text>
        )}
      </View>

      <FormField
        label="Catatan (opsional)"
        value={values.note}
        onChangeText={(value) => update('note', value)}
        multiline
        numberOfLines={3}
        textAlignVertical="top"
        placeholder="Contoh: hasil dari kunjungan rutin"
        className="min-h-24"
      />

      {pickerMode && Platform.OS !== 'web' && (
        <DateTimePicker value={pickerValue} mode={pickerMode} onChange={onPickerChange} />
      )}

      {preview ? (
        <View
          className="gap-3 rounded-xl border border-primary/40 bg-accent p-4"
          accessibilityRole="summary">
          <Text variant="large">Periksa sebelum menyimpan</Text>
          <Text>{recordTitle(preview)}</Text>
          {preview.type === 'pressure' ? (
            <Text>
              {formatMeasurement(preview.systolic)} / {formatMeasurement(preview.diastolic)} mmHg
            </Text>
          ) : (
            <Text>
              {formatMeasurement(preview.value)} {preview.unit}
            </Text>
          )}
          <Text>{formatMeasuredAt(preview)}</Text>
          <Text variant="muted">
            Angka ditampilkan sebagai catatan pengukuran, tanpa penilaian klinis.
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <Button variant="outline" disabled={pending} onPress={() => setPreview(null)}>
              <Text>Ubah catatan</Text>
            </Button>
            <Button disabled={pending || !timezone} onPress={() => void onSubmit(preview)}>
              <Text>{pending ? 'Menyimpan…' : 'Konfirmasi dan simpan'}</Text>
            </Button>
          </View>
          {!!submitError && (
            <Text className="text-sm text-destructive" accessibilityRole="alert">
              {submitError}
            </Text>
          )}
        </View>
      ) : (
        <Button onPress={showPreview} disabled={pending || !timezone}>
          <Text>{submitLabel}</Text>
        </Button>
      )}
    </ScrollView>
  );
}
