import { FormField } from '@/components/app/form-field';
import { ServiceError } from '@/components/app/service-error';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { ChoiceField } from '@/components/profile/choice-field';
import type { ChoiceOption } from '@/components/profile/choice-field';
import { useAppRead, useAppWrite } from '@/lib/api/query';
import { ApiError } from '@/lib/api/repository';
import type { components } from '@/lib/api/generated/app-api';
import {
  createIdempotencyKey,
  createOtherDiagnosisEntry,
  createStableActionKey,
  getKnowledgeStateLabel,
  getMissingFieldTarget,
  isSuccessfulQueryRefresh,
  parseOptionalPositiveNumber,
  transitionKnowledgeState,
} from '@/lib/profile/profile';
import type { KnowledgeArea } from '@/lib/profile/profile';
import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  View,
  type LayoutChangeEvent,
} from 'react-native';

const MASCOT = require('../../assets/images/carin-mascot.png');

type ProfileFields = components['schemas']['Profile']['fields'];
type Condition = components['schemas']['ai__Condition'];
type DiagnosisEntry = ProfileFields['diagnoses']['entries'][number];

const DIAGNOSIS_OPTIONS: readonly ChoiceOption[] = [
  { value: 'not_provided', label: 'Belum diisi' },
  { value: 'none_known', label: 'Tidak ada yang diketahui' },
  { value: 'never_examined', label: 'Belum pernah diperiksa' },
  { value: 'reported', label: 'Ada kondisi' },
];
const FAMILY_OPTIONS: readonly ChoiceOption[] = [
  { value: 'not_provided', label: 'Belum diisi' },
  { value: 'unknown', label: 'Belum tahu' },
  { value: 'none_known', label: 'Tidak ada yang diketahui' },
  { value: 'reported', label: 'Ada riwayat' },
];
const ALLERGY_OPTIONS: readonly ChoiceOption[] = [
  { value: 'not_provided', label: 'Belum diisi' },
  { value: 'unknown', label: 'Belum diketahui' },
  { value: 'none_known', label: 'Tidak ada yang diketahui' },
  { value: 'reported', label: 'Ada alergi atau pantangan' },
];
const ACTIVITY_OPTIONS: readonly ChoiceOption[] = [
  { value: '', label: 'Pilih nanti' },
  { value: 'sedentary', label: 'Jarang bergerak' },
  { value: 'light', label: 'Ringan' },
  { value: 'moderate', label: 'Sedang' },
  { value: 'high', label: 'Tinggi' },
];
const SMOKING_OPTIONS: readonly ChoiceOption[] = [
  { value: '', label: 'Pilih nanti' },
  { value: 'never', label: 'Tidak pernah' },
  { value: 'former', label: 'Pernah, sudah berhenti' },
  { value: 'current', label: 'Saat ini' },
];

function friendlyTarget(focus: string | undefined) {
  return focus ? getMissingFieldTarget(focus)?.label : undefined;
}

function supportText(condition: Condition) {
  return condition.personalizationSupported
    ? 'Dapat dipertimbangkan untuk personalisasi'
    : 'Belum didukung untuk personalisasi';
}

function diagnosisSupportLabel(
  entry: DiagnosisEntry,
  unsupportedConditions: readonly string[],
  catalog: readonly Condition[]
) {
  if (!entry.conditionId) return 'Kondisi lain · belum didukung untuk personalisasi';
  if (unsupportedConditions.includes(entry.label)) return 'Belum didukung untuk personalisasi';
  const condition = catalog.find((item) => item.id === entry.conditionId);
  if (condition && !condition.personalizationSupported) return 'Belum didukung untuk personalisasi';
  return null;
}

export default function HealthProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ focus?: string | string[] }>();
  const rawFocus = Array.isArray(params.focus) ? params.focus[0] : params.focus;
  const targetFocus = rawFocus ? getMissingFieldTarget(rawFocus)?.focus : undefined;
  const profileQuery = useAppRead('getProfile', {});
  const accountQuery = useAppRead('getMe', {});
  const updateProfile = useAppWrite('updateProfile');
  const [conditionInput, setConditionInput] = React.useState('');
  const [debouncedConditionInput, setDebouncedConditionInput] = React.useState('');
  const conditionsQuery = useAppRead(
    'getConditions',
    { query: { q: debouncedConditionInput.trim() || undefined } },
    { enabled: debouncedConditionInput.trim().length >= 2 }
  );
  const profile = profileQuery.data?.data;
  const account = accountQuery.data?.data;
  const [draft, setDraft] = React.useState<ProfileFields | null>(null);
  const fields = draft ?? profile?.fields ?? null;

  const [heightInput, setHeightInput] = React.useState<string | null>(null);
  const [weightInput, setWeightInput] = React.useState<string | null>(null);
  const heightText = heightInput ?? (fields?.heightCm == null ? '' : String(fields.heightCm));
  const weightText = weightInput ?? (fields?.weightKg == null ? '' : String(fields.weightKg));
  const [otherCondition, setOtherCondition] = React.useState('');
  const [familyCondition, setFamilyCondition] = React.useState('');
  const [familyRelation, setFamilyRelation] = React.useState('');
  const [allergyText, setAllergyText] = React.useState('');
  const [conflict, setConflict] = React.useState(false);
  const [conflictMessage, setConflictMessage] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [keyFactory] = React.useState(() => createStableActionKey());
  const scrollRef = React.useRef<ScrollView>(null);
  const [offsets, setOffsets] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedConditionInput(conditionInput.trim()), 250);
    return () => clearTimeout(timer);
  }, [conditionInput]);

  React.useEffect(() => {
    if (!targetFocus) return;
    const scrollTarget = ['heightCm', 'weightKg', 'sexForReference'].includes(targetFocus)
      ? 'basics'
      : ['clinicianNotes', 'activity', 'smoking'].includes(targetFocus)
        ? 'other'
        : targetFocus;
    const timer = setTimeout(() => {
      const y = offsets[scrollTarget];
      if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(y - 12, 0), animated: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [offsets, targetFocus]);

  const registerOffset = React.useCallback(
    (key: string) => (event: LayoutChangeEvent) => {
      const y = event.nativeEvent.layout.y;
      setOffsets((current) => (current[key] === y ? current : { ...current, [key]: y }));
    },
    []
  );

  const skip = () => router.replace('/(tabs)' as Href);
  const conditionResults = conditionsQuery.data?.data ?? [];
  const unsupportedConditions = profile?.personalization.unsupportedConditions ?? [];

  const patchFields = (patch: Partial<ProfileFields>) => {
    setDraft((current) => {
      const base = current ?? profile?.fields;
      return base ? { ...base, ...patch } : null;
    });
  };

  const applyKnowledgeState = (area: KnowledgeArea, state: string, confirmed = false) => {
    const base = draft ?? profile?.fields;
    if (!base) return;
    const current = base[area] as { state: string; entries: unknown[] };
    const transition = transitionKnowledgeState(current, state, confirmed);
    if (transition.kind === 'unchanged') return;
    if (transition.kind === 'confirmation-required') {
      const heading =
        area === 'diagnoses'
          ? 'Ubah status diagnosis?'
          : area === 'familyHistory'
            ? 'Ubah status riwayat keluarga?'
            : 'Ubah status alergi dan pantangan?';
      if (Platform.OS === 'web') {
        const ok = window.confirm(
          `${heading}\n\nDaftar yang sudah dicatat akan dihapus. Perubahan baru berlaku setelah Anda menyimpan profil.`
        );
        if (ok) applyKnowledgeState(area, state, true);
        return;
      }
      Alert.alert(
        heading,
        'Daftar yang sudah dicatat akan dihapus. Perubahan baru berlaku setelah Anda menyimpan profil.',
        [
          { text: 'Batal', style: 'cancel' },
          {
            text: 'Hapus daftar',
            style: 'destructive',
            onPress: () => applyKnowledgeState(area, state, true),
          },
        ]
      );
      return;
    }
    setDraft((currentFields) => {
      const b = currentFields ?? profile?.fields;
      return b ? ({ ...b, [area]: transition.value } as ProfileFields) : null;
    });
  };

  const addCondition = (condition: Condition) => {
    const base = draft ?? profile?.fields;
    if (!base) return;
    if (base.diagnoses.entries.some((entry) => entry.conditionId === condition.id)) return;
    const entry: DiagnosisEntry = {
      id: createIdempotencyKey(),
      conditionId: condition.id,
      label: condition.displayName,
    };
    setDraft({
      ...base,
      diagnoses: { state: 'reported', entries: [...base.diagnoses.entries, entry] },
    });
    setConditionInput('');
  };

  const addOtherCondition = () => {
    const base = draft ?? profile?.fields;
    if (!base) return;
    const entry = createOtherDiagnosisEntry(otherCondition);
    if (!entry) {
      setFieldErrors((current) => ({ ...current, otherCondition: 'Masukkan nama kondisi lain.' }));
      return;
    }
    setFieldErrors((current) => ({ ...current, otherCondition: '' }));
    setDraft({
      ...base,
      diagnoses: { state: 'reported', entries: [...base.diagnoses.entries, entry] },
    });
    setOtherCondition('');
  };

  const removeDiagnosis = (entryId: string) => {
    const base = draft ?? profile?.fields;
    if (!base) return;
    setDraft({
      ...base,
      diagnoses: {
        ...base.diagnoses,
        entries: base.diagnoses.entries.filter((entry) => entry.id !== entryId),
      },
    });
  };

  const addFamilyHistory = () => {
    const base = draft ?? profile?.fields;
    if (!base || !familyCondition.trim()) return;
    setDraft({
      ...base,
      familyHistory: {
        state: 'reported',
        entries: [
          ...base.familyHistory.entries,
          {
            conditionId: null,
            label: familyCondition.trim(),
            relation: familyRelation.trim() || null,
          },
        ],
      },
    });
    setFamilyCondition('');
    setFamilyRelation('');
  };

  const addAllergy = () => {
    const base = draft ?? profile?.fields;
    if (!base || !allergyText.trim()) return;
    setDraft({
      ...base,
      allergies: { state: 'reported', entries: [...base.allergies.entries, allergyText.trim()] },
    });
    setAllergyText('');
  };

  const save = async () => {
    if (!fields || !profile) return;
    setSaveError(null);
    setConflictMessage(null);
    const nextErrors: Record<string, string> = {};
    const height = parseOptionalPositiveNumber(heightText);
    const weight = parseOptionalPositiveNumber(weightText);
    if ('error' in height) nextErrors.heightCm = height.error;
    if ('error' in weight) nextErrors.weightKg = weight.error;
    if (fields.diagnoses.state === 'reported' && fields.diagnoses.entries.length === 0)
      nextErrors.diagnoses = 'Tambahkan kondisi atau ubah status diagnosis.';
    if (fields.familyHistory.state === 'reported' && fields.familyHistory.entries.length === 0)
      nextErrors.familyHistory = 'Tambahkan satu riwayat atau ubah statusnya.';
    if (fields.allergies.state === 'reported' && fields.allergies.entries.length === 0)
      nextErrors.allergies = 'Tambahkan alergi/pantangan atau ubah statusnya.';
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const nextFields = {
      ...fields,
      heightCm: 'value' in height ? height.value : null,
      weightKg: 'value' in weight ? weight.value : null,
    };
    const payload = { expectedVersion: profile.version, fields: nextFields };
    try {
      const result = await updateProfile.mutateAsync({
        headers: { 'Idempotency-Key': keyFactory.forPayload(payload) },
        body: payload,
      });
      keyFactory.clear();
      setDraft(result.fields);
      setHeightInput(result.fields.heightCm === null ? '' : String(result.fields.heightCm));
      setWeightInput(result.fields.weightKg === null ? '' : String(result.fields.weightKg));
      setConflict(false);
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)' as Href);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setConflict(true);
        setConflictMessage(
          'Profil berubah di perangkat lain. Draft Anda tetap ada; muat versi terbaru lalu tinjau sebelum menyimpan lagi.'
        );
        return;
      }
      setSaveError('Profil belum tersimpan. Periksa koneksi lalu coba lagi.');
    }
  };

  const reloadConflict = async () => {
    const result = await profileQuery.refetch();
    if (isSuccessfulQueryRefresh(result) && result.data && !result.data.stale) {
      setConflict(false);
      setConflictMessage(
        'Versi terbaru sudah dimuat. Draft tetap ada; tinjau lalu simpan kembali.'
      );
    } else {
      setConflictMessage(
        'Versi terbaru belum dapat dimuat. Draft tetap ada; coba muat ulang lagi.'
      );
    }
  };

  if (profileQuery.isPending && !profileQuery.data) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background p-6">
        <ActivityIndicator accessibilityLabel="Memuat profil kesehatan" />
        <Text variant="muted">Memuat profil kesehatan…</Text>
        <Button variant="outline" onPress={skip}>
          <Text>Isi nanti</Text>
        </Button>
      </View>
    );
  }

  if (!profileQuery.data && profileQuery.error) {
    return (
      <View className="flex-1 bg-background p-5">
        <Text variant="h3">Profil kesehatan</Text>
        <ServiceError error={profileQuery.error} onRetry={() => void profileQuery.refetch()} />
        <Button variant="outline" onPress={skip}>
          <Text>Isi nanti</Text>
        </Button>
      </View>
    );
  }

  if (!fields || !profile) return null;
  const focusLabel = friendlyTarget(rawFocus);
  const sexOptions: readonly ChoiceOption[] = [
    { value: '', label: 'Pilih nanti' },
    { value: 'female', label: 'Perempuan' },
    { value: 'male', label: 'Laki-laki' },
  ];

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-5 px-5 pb-10 pt-4">
        {/* Top bar with instant skip (explicitly optional invariant) */}
        <View className="flex-row items-center justify-between pt-1">
          <View className="flex-row items-center gap-1.5">
            <View className="h-2 w-2 rounded-full bg-carin-olive" />
            <Text variant="caption" className="font-medium text-muted-foreground">
              Langkah opsional
            </Text>
          </View>
          <Button
            variant="ghost"
            size="sm"
            onPress={skip}
            accessibilityRole="button"
            accessibilityLabel="Lewati pengisian profil kesehatan"
            className="h-8 rounded-full px-3">
            <Text className="text-xs font-semibold text-primary">Nanti saja →</Text>
          </Button>
        </View>

        {/* Welcoming mascot hero card */}
        <View className="overflow-hidden rounded-summary border border-border bg-card p-5">
          <View className="flex-row items-center gap-4">
            <View
              className="items-center justify-center bg-carin-butter"
              style={{
                borderRadius: 24,
                width: 72,
                height: 72,
              }}>
              <Image
                source={MASCOT}
                resizeMode="contain"
                accessibilityLabel="Maskot Carin"
                style={{
                  width: 80,
                  height: 84,
                  transform: [{ rotate: '-4deg' }],
                }}
              />
            </View>
            <View className="flex-1 gap-1.5">
              <Text variant="h2">Profil kesehatan</Text>
              <View className="self-start rounded-full bg-carin-olive-soft px-3 py-1">
                <Text variant="caption" className="font-semibold text-foreground">
                  Profil bersifat opsional
                </Text>
              </View>
            </View>
          </View>
          <View className="mt-4 gap-1.5 border-t border-border pt-3">
            <Text variant="body" className="text-foreground">
              Isi yang Anda ketahui. Profil ini opsional dan bisa dilengkapi kapan saja tanpa tekanan.
            </Text>
            <Text variant="caption" className="text-muted-foreground">
              Data yang belum diketahui tidak dianggap normal atau nol. Informasi ini membantu personalisasi jika sesuai kebutuhan Anda.
            </Text>
          </View>
          {focusLabel ? (
            <View className="mt-3 rounded-control border border-primary/40 bg-carin-olive-soft/30 p-3">
              <Text className="font-semibold text-foreground">Lengkapi: {focusLabel}</Text>
              <Text variant="caption" className="text-muted-foreground">Bagian tersebut sudah dituju dari tindakan sebelumnya.</Text>
            </View>
          ) : null}
        </View>

        <View
          className="gap-4 rounded-summary border border-border bg-card p-5"
          onLayout={registerOffset('basics')}>
          <Text variant="h4">Informasi dasar</Text>
          <FormField
            label="Tanggal lahir"
            value={account?.birthDate ?? 'Belum tersedia'}
            editable={false}
          />
          <FormField
            label="Tinggi badan"
            unit="cm"
            unitBadge
            value={heightText}
            onChangeText={setHeightInput}
            error={fieldErrors.heightCm}
            keyboardType="decimal-pad"
            placeholder="Opsional"
          />
          <FormField
            label="Berat badan"
            unit="kg"
            unitBadge
            value={weightText}
            onChangeText={setWeightInput}
            error={fieldErrors.weightKg}
            keyboardType="decimal-pad"
            placeholder="Opsional"
          />
          <ChoiceField
            label="Informasi seks untuk acuan (opsional)"
            value={fields.sexForReference}
            options={sexOptions}
            onChange={(value) =>
              patchFields({ sexForReference: value as ProfileFields['sexForReference'] })
            }
          />
        </View>

        <View
          className="gap-4 rounded-summary border border-border bg-card p-5"
          onLayout={registerOffset('diagnoses')}>
          <View className="gap-1">
            <Text variant="h4">Diagnosis</Text>
            <Text variant="muted">
              Pilih keadaan yang paling sesuai. “Belum pernah diperiksa” bukan berarti sehat.
            </Text>
          </View>
          <ChoiceField
            label="Pengetahuan diagnosis"
            value={fields.diagnoses.state}
            options={DIAGNOSIS_OPTIONS}
            onChange={(value) => value && applyKnowledgeState('diagnoses', value)}
          />
          <Text variant="muted">
            Saat ini: {getKnowledgeStateLabel('diagnoses', fields.diagnoses.state)}
          </Text>
          {fields.diagnoses.state === 'reported' ? (
            <>
              <FormField
                label="Cari kondisi"
                value={conditionInput}
                onChangeText={setConditionInput}
                placeholder="Ketik minimal 2 huruf"
                autoCapitalize="none"
              />
              {conditionsQuery.isFetching ? (
                <ActivityIndicator accessibilityLabel="Mencari kondisi" />
              ) : null}
              {conditionsQuery.error ? (
                <ServiceError
                  error={conditionsQuery.error}
                  onRetry={() => void conditionsQuery.refetch()}
                />
              ) : null}
              {conditionResults.map((condition) => {
                const selected = fields.diagnoses.entries.some(
                  (entry) => entry.conditionId === condition.id
                );
                return (
                  <Pressable
                    key={condition.id}
                    className="min-h-12 gap-1 rounded-control border border-border bg-background p-3"
                    accessibilityRole="button"
                    accessibilityLabel={`${condition.displayName}. ${supportText(condition)}`}
                    accessibilityState={{ disabled: selected }}
                    disabled={selected}
                    onPress={() => addCondition(condition)}>
                    <Text className="font-medium text-foreground">{condition.displayName}</Text>
                    <Text variant="muted">
                      {selected ? 'Sudah ditambahkan' : supportText(condition)}
                    </Text>
                  </Pressable>
                );
              })}
              {debouncedConditionInput.trim().length >= 2 &&
              !conditionsQuery.isFetching &&
              conditionResults.length === 0 ? (
                <Text variant="muted">
                  Kondisi tidak ditemukan. Anda dapat menambahkannya sebagai kondisi lain.
                </Text>
              ) : null}
              <View className="gap-2 rounded-control border border-dashed border-border p-3">
                <Text className="font-medium text-foreground">Kondisi lain</Text>
                <Text variant="muted">
                  Teks ini disimpan sebagai keterangan Anda dan tidak dicocokkan otomatis ke
                  katalog.
                </Text>
                <FormField
                  label="Nama kondisi lain"
                  value={otherCondition}
                  onChangeText={setOtherCondition}
                  error={fieldErrors.otherCondition}
                  placeholder="Tulis sesuai informasi yang Anda miliki"
                />
                <Button variant="outline" onPress={addOtherCondition}>
                  <Text>Tambah kondisi lain</Text>
                </Button>
              </View>
              {fields.diagnoses.entries.map((entry) => {
                const unsupported = diagnosisSupportLabel(
                  entry,
                  unsupportedConditions,
                  conditionResults
                );
                return (
                  <View
                    key={entry.id}
                    className="flex-row items-center justify-between gap-3 rounded-control bg-muted/50 p-3">
                    <View className="flex-1 gap-1">
                      <Text className="font-medium text-foreground">{entry.label}</Text>
                      {unsupported ? <Text variant="muted">{unsupported}</Text> : null}
                    </View>
                    <Pressable
                      className="min-h-11 min-w-11 items-center justify-center"
                      accessibilityRole="button"
                      accessibilityLabel={`Hapus ${entry.label}`}
                      onPress={() => removeDiagnosis(entry.id)}>
                      <Text className="text-destructive">Hapus</Text>
                    </Pressable>
                  </View>
                );
              })}
              {fieldErrors.diagnoses ? (
                <Text className="text-sm text-destructive">{fieldErrors.diagnoses}</Text>
              ) : null}
            </>
          ) : null}
        </View>

        <View
          className="gap-4 rounded-summary border border-border bg-card p-5"
          onLayout={registerOffset('familyHistory')}>
          <View className="gap-1">
            <Text variant="h4">Riwayat keluarga</Text>
            <Text variant="muted">
              Isi bila Anda mengetahuinya. “Belum tahu” berbeda dari “tidak ada yang diketahui”.
            </Text>
          </View>
          <ChoiceField
            label="Pengetahuan riwayat keluarga"
            value={fields.familyHistory.state}
            options={FAMILY_OPTIONS}
            onChange={(value) => value && applyKnowledgeState('familyHistory', value)}
          />
          <Text variant="muted">
            Saat ini: {getKnowledgeStateLabel('familyHistory', fields.familyHistory.state)}
          </Text>
          {fields.familyHistory.state === 'reported' ? (
            <>
              <FormField
                label="Kondisi yang diketahui"
                value={familyCondition}
                onChangeText={setFamilyCondition}
                placeholder="Contoh: diabetes"
              />
              <FormField
                label="Hubungan keluarga (opsional)"
                value={familyRelation}
                onChangeText={setFamilyRelation}
                placeholder="Contoh: orang tua"
              />
              <Button variant="outline" onPress={addFamilyHistory}>
                <Text>Tambah riwayat keluarga</Text>
              </Button>
              {fields.familyHistory.entries.map((entry, index) => (
                <View
                  key={`${entry.label}-${index}`}
                  className="flex-row items-center justify-between rounded-control bg-muted/50 p-3">
                  <Text className="flex-1 text-foreground">
                    {entry.label}
                    {entry.relation ? ` · ${entry.relation}` : ''}
                  </Text>
                  <Pressable
                    className="min-h-11 justify-center px-2"
                    accessibilityRole="button"
                    accessibilityLabel={`Hapus riwayat ${entry.label}`}
                    onPress={() =>
                      patchFields({
                        familyHistory: {
                          ...fields.familyHistory,
                          entries: fields.familyHistory.entries.filter(
                            (_, entryIndex) => entryIndex !== index
                          ),
                        },
                      })
                    }>
                    <Text className="text-destructive">Hapus</Text>
                  </Pressable>
                </View>
              ))}
              {fieldErrors.familyHistory ? (
                <Text className="text-sm text-destructive">{fieldErrors.familyHistory}</Text>
              ) : null}
            </>
          ) : null}
        </View>

        <View
          className="gap-4 rounded-summary border border-border bg-card p-5"
          onLayout={registerOffset('allergies')}>
          <View className="gap-1">
            <Text variant="h4">Alergi dan pantangan</Text>
            <Text variant="muted">Informasi ini tidak menjamin makanan bebas alergen.</Text>
          </View>
          <ChoiceField
            label="Pengetahuan alergi dan pantangan"
            value={fields.allergies.state}
            options={ALLERGY_OPTIONS}
            onChange={(value) => value && applyKnowledgeState('allergies', value)}
          />
          <Text variant="muted">
            Saat ini: {getKnowledgeStateLabel('allergies', fields.allergies.state)}
          </Text>
          {fields.allergies.state === 'reported' ? (
            <>
              <FormField
                label="Alergi atau pantangan"
                value={allergyText}
                onChangeText={setAllergyText}
                placeholder="Contoh: kacang"
              />
              <Button variant="outline" onPress={addAllergy}>
                <Text>Tambah alergi atau pantangan</Text>
              </Button>
              {fields.allergies.entries.map((entry, index) => (
                <View
                  key={`${entry}-${index}`}
                  className="flex-row items-center justify-between rounded-control bg-muted/50 p-3">
                  <Text className="flex-1 text-foreground">{entry}</Text>
                  <Pressable
                    className="min-h-11 justify-center px-2"
                    accessibilityRole="button"
                    accessibilityLabel={`Hapus ${entry}`}
                    onPress={() =>
                      patchFields({
                        allergies: {
                          ...fields.allergies,
                          entries: fields.allergies.entries.filter(
                            (_, entryIndex) => entryIndex !== index
                          ),
                        },
                      })
                    }>
                    <Text className="text-destructive">Hapus</Text>
                  </Pressable>
                </View>
              ))}
              {fieldErrors.allergies ? (
                <Text className="text-sm text-destructive">{fieldErrors.allergies}</Text>
              ) : null}
            </>
          ) : null}
        </View>

        <View
          className="gap-4 rounded-summary border border-border bg-card p-5"
          onLayout={registerOffset('other')}>
          <Text variant="h4">Informasi tambahan (opsional)</Text>
          <FormField
            label="Arahan tenaga kesehatan"
            value={fields.clinicianNotes ?? ''}
            onChangeText={(value) => patchFields({ clinicianNotes: value || null })}
            placeholder="Catatan yang ingin Anda simpan"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          <ChoiceField
            label="Aktivitas"
            value={fields.activity}
            options={ACTIVITY_OPTIONS}
            onChange={(value) => patchFields({ activity: value as ProfileFields['activity'] })}
          />
          <ChoiceField
            label="Kebiasaan merokok"
            value={fields.smoking}
            options={SMOKING_OPTIONS}
            onChange={(value) => patchFields({ smoking: value as ProfileFields['smoking'] })}
          />
        </View>

        {conflictMessage ? (
          <View className="gap-3 rounded-summary border border-destructive/40 bg-card p-4">
            <Text accessibilityRole="alert">{conflictMessage}</Text>
            {conflict ? (
              <Button
                variant="outline"
                onPress={() => void reloadConflict()}
                disabled={profileQuery.isFetching}>
                <Text>
                  {profileQuery.isFetching ? 'Memuat versi terbaru…' : 'Muat versi terbaru'}
                </Text>
              </Button>
            ) : null}
          </View>
        ) : null}
        {saveError ? <ServiceError error={saveError} /> : null}
        <Button variant="tactile" onPress={() => void save()} disabled={updateProfile.isPending}>
          <Text>{updateProfile.isPending ? 'Menyimpan profil…' : 'Simpan profil'}</Text>
        </Button>
        <Button variant="outline" onPress={skip}>
          <Text>Isi nanti</Text>
        </Button>
        <Text variant="muted">
          Status diagnosis: {getKnowledgeStateLabel('diagnoses', fields.diagnoses.state)}
        </Text>
      </ScrollView>
    </View>
  );
}
