import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import {
  buildExaminationInput,
  type ExaminationFormValues,
  type ExaminationInput,
} from '@/lib/exams/form-model';
import { formatMeasuredAt, formatMeasurement, recordTitle } from '@/lib/exams/model';
import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { DatePickerField } from '@/components/app/date-picker-field';
import { FormField } from '@/components/app/form-field';
import { TimePickerField } from '@/components/app/time-picker-field';
import { cn } from '@/lib/utils';

type GlucoseContext = Extract<ExaminationInput, { type: 'glucose' }>['context'];
type CholesterolSubtype = Extract<ExaminationInput, { type: 'cholesterol' }>['subtype'];

const labels: Record<ExaminationInput['type'], string> = {
  pressure: 'Tekanan darah',
  glucose: 'Gula darah',
  cholesterol: 'Kolesterol',
};
const contextLabels: Record<GlucoseContext, string> = {
  fasting: 'Puasa',
  random: 'Sewaktu',
  post_meal: 'Setelah makan',
  unknown: 'Tidak diketahui',
};
const subtypeLabels: Record<CholesterolSubtype, string> = {
  total: 'Total',
  ldl: 'LDL',
  hdl: 'HDL',
};

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
      <Text className="font-medium text-foreground">{label}</Text>
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
              className={`min-h-11 justify-center rounded-full border px-4 py-2 ${
                selected
                  ? 'border-primary bg-carin-olive-soft'
                  : 'border-border bg-card'
              }`}>
              <Text className={selected ? 'font-semibold text-foreground' : 'text-foreground'}>
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
  submissionDisabled = false,
  submitError,
  submitLabel = 'Lanjut ke konfirmasi',
  onDraftChange,
  onSubmit,
}: {
  initialRecord?: ExaminationInput;
  timezone: string;
  pending?: boolean;
  submissionDisabled?: boolean;
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
        <View className="gap-4 rounded-summary border border-border bg-card p-4">
          <View className="flex-row items-center justify-between">
            <View className="gap-0.5">
              <Text variant="large">Tekanan darah</Text>
              <Text variant="muted">Catat angka sistolik dan diastolik</Text>
            </View>
            <View className="rounded-full bg-carin-olive-soft px-3 py-1">
              <Text variant="caption" className="font-semibold text-foreground">
                mmHg
              </Text>
            </View>
          </View>

          <View className="flex-row items-start gap-3">
            <View className="flex-1">
              <FormField
                label="Sistolik (atas)"
                value={values.systolic}
                onChangeText={(value) => update('systolic', value)}
                keyboardType="number-pad"
                inputMode="numeric"
                error={errors.systolic}
                placeholder="120"
              />
            </View>
            <View className="pt-9 items-center justify-center">
              <Text className="text-2xl font-bold text-muted-foreground">/</Text>
            </View>
            <View className="flex-1">
              <FormField
                label="Diastolik (bawah)"
                value={values.diastolic}
                onChangeText={(value) => update('diastolic', value)}
                keyboardType="number-pad"
                inputMode="numeric"
                error={errors.diastolic}
                placeholder="80"
              />
            </View>
          </View>
        </View>
      ) : (
        <View className="gap-4 rounded-summary border border-border bg-card p-4">
          <View className="gap-1">
            <Text variant="large">{labels[values.type]}</Text>
            <Text variant="muted">Catat angka seperti yang tertulis pada alat.</Text>
          </View>
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
            unitBadge
            value={values.value}
            onChangeText={(value) => update('value', value)}
            keyboardType="decimal-pad"
            inputMode="decimal"
            error={errors.value}
            placeholder="Masukkan angka pada hasil"
          />
        </View>
      )}

      <View className="gap-3 rounded-summary border border-border bg-card p-4">
        <View className="gap-1">
          <Text variant="large">Waktu pengukuran</Text>
          <Text variant="muted">Tanggal wajib. Waktu hanya dicatat jika Anda mengetahuinya.</Text>
        </View>
        <DatePickerField
          label="Tanggal pengukuran"
          hint="Wajib diisi · format tahun, bulan, tanggal"
          value={values.measuredOn}
          onChange={(value) => update('measuredOn', value)}
          error={errors.measuredOn}
        />
        <View className="flex-row items-center gap-2 pt-0.5">
          <Pressable
            onPress={() => {
              const today = new Date().toISOString().slice(0, 10);
              update('measuredOn', today);
            }}
            className={cn(
              'rounded-full border border-border/80 bg-muted/20 px-3 py-1 active:bg-muted/40',
              values.measuredOn === new Date().toISOString().slice(0, 10) &&
                'border-primary/40 bg-carin-olive-soft'
            )}>
            <Text
              variant="caption"
              className={cn(
                'font-medium text-foreground',
                values.measuredOn === new Date().toISOString().slice(0, 10) &&
                  'font-semibold text-primary'
              )}>
              Hari ini
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              const d = new Date();
              d.setDate(d.getDate() - 1);
              update('measuredOn', d.toISOString().slice(0, 10));
            }}
            className="rounded-full border border-border/80 bg-muted/20 px-3 py-1 active:bg-muted/40">
            <Text variant="caption" className="font-medium text-foreground">
              Kemarin
            </Text>
          </Pressable>
        </View>
        {errors.measuredOn && (
          <Text className="text-sm text-destructive" accessibilityRole="alert">
            {errors.measuredOn}
          </Text>
        )}
        {values.measuredTime === null ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              const now = new Date();
              const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
              update('measuredTime', time);
            }}
            className="h-12 justify-center rounded-control border border-dashed border-border bg-card px-3">
            <Text className="font-medium text-primary">+ Tambah waktu pengukuran</Text>
          </Pressable>
        ) : (
          <View className="gap-2">
            <TimePickerField
              label="Waktu pengukuran"
              hint={`Opsional · ${timezone}`}
              value={values.measuredTime}
              onChange={(value) => update('measuredTime', value)}
              error={errors.measuredTime}
              allowClear
              disabled={pending}
            />
            <View className="flex-row flex-wrap items-center gap-2">
              <Pressable
                onPress={() => {
                  const now = new Date();
                  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                  update('measuredTime', time);
                }}
                className="rounded-full border border-border/80 bg-muted/20 px-3 py-1 active:bg-muted/40">
                <Text variant="caption" className="font-medium text-foreground">
                  Sekarang
                </Text>
              </Pressable>
              <Pressable
                onPress={() => update('measuredTime', '08:00')}
                className={cn(
                  'rounded-full border border-border/80 bg-muted/20 px-3 py-1 active:bg-muted/40',
                  values.measuredTime === '08:00' && 'border-primary/40 bg-carin-olive-soft'
                )}>
                <Text
                  variant="caption"
                  className={cn(
                    'font-medium text-foreground',
                    values.measuredTime === '08:00' && 'font-semibold text-primary'
                  )}>
                  Pagi (08:00)
                </Text>
              </Pressable>
              <Pressable
                onPress={() => update('measuredTime', '12:00')}
                className={cn(
                  'rounded-full border border-border/80 bg-muted/20 px-3 py-1 active:bg-muted/40',
                  values.measuredTime === '12:00' && 'border-primary/40 bg-carin-olive-soft'
                )}>
                <Text
                  variant="caption"
                  className={cn(
                    'font-medium text-foreground',
                    values.measuredTime === '12:00' && 'font-semibold text-primary'
                  )}>
                  Siang (12:00)
                </Text>
              </Pressable>
            </View>
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

      {preview ? (
        <View
          className="gap-3 rounded-summary border border-primary/40 bg-card p-5"
          accessibilityRole="summary">
          <Text variant="large">Periksa sebelum menyimpan</Text>
          <Text className="text-base font-semibold text-foreground">{recordTitle(preview)}</Text>
          {preview.type === 'pressure' ? (
            <Text variant="h2" className="text-primary">
              {formatMeasurement(preview.systolic)} / {formatMeasurement(preview.diastolic)} mmHg
            </Text>
          ) : (
            <Text variant="h2" className="text-primary">
              {formatMeasurement(preview.value)} {preview.unit}
            </Text>
          )}
          <Text variant="body" className="text-foreground">
            Diukur {formatMeasuredAt(preview)}
          </Text>
          <Text variant="caption" className="text-muted-foreground">
            Zona waktu: {preview.timezone}
          </Text>
          <View className="rounded-control bg-carin-olive-soft/40 p-3">
            <Text variant="caption" className="text-foreground">
              Angka ditampilkan sebagai catatan pengukuran, tanpa penilaian klinis.
            </Text>
          </View>
          <View className="flex-row flex-wrap gap-2 pt-2">
            <Button variant="outline" disabled={pending} onPress={() => setPreview(null)}>
              <Text>Ubah catatan</Text>
            </Button>
            <Button
              variant="tactile"
              disabled={pending || submissionDisabled || !timezone}
              onPress={() => void onSubmit(preview)}>
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
        <Button
          variant="tactile"
          onPress={showPreview}
          disabled={pending || submissionDisabled || !timezone}>
          <Text>{submitLabel}</Text>
        </Button>
      )}
    </ScrollView>
  );
}
