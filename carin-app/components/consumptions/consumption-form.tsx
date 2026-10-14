import { FormField } from '@/components/app/form-field';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import {
  createManualFoodComponentDraft,
  removeManualComponent,
  upsertManualComponent,
  type CatalogFood,
  type ManualConsumptionDraft,
  type ManualFoodComponentDraft,
} from '@/lib/consumptions/consumption';
import { useFoodCatalogSearch } from '@/lib/consumptions/query';
import { serviceErrorMessage } from '@/components/app/presentation';
import { createIdempotencyKey } from '@/lib/profile/profile';
import * as React from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { FoodEditor } from './food-editor';

type Props = {
  draft: ManualConsumptionDraft;
  timeZone: string;
  title: string;
  description: string;
  submitLabel: string;
  isSubmitting: boolean;
  submitError: string | null;
  revisionConflict?: boolean;
  canRestartAfterConflict?: boolean;
  onChange: (draft: ManualConsumptionDraft) => void;
  onSubmit: (draft: ManualConsumptionDraft) => void;
  onRestartAfterConflict?: () => void;
  onBack: () => void;
};

function emptyComponent(): ManualFoodComponentDraft {
  return {
    id: createIdempotencyKey(),
    displayName: '',
    catalogFoodId: null,
    preparation: null,
    portion: { kind: 'unknown' },
  };
}

function portionLabel(component: ManualFoodComponentDraft) {
  if (component.portion.kind === 'unknown') return 'Porsi tidak diketahui';
  if (!component.portion.quantity.trim()) return 'Jumlah porsi belum diisi';
  return component.portion.unit === 'g'
    ? `${component.portion.quantity} g`
    : `${component.portion.quantity} takaran katalog`;
}

export function ConsumptionForm({
  draft,
  timeZone,
  title,
  description,
  submitLabel,
  isSubmitting,
  submitError,
  revisionConflict = false,
  canRestartAfterConflict = false,
  onChange,
  onSubmit,
  onRestartAfterConflict,
  onBack,
}: Props) {
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [debouncedSearch, setDebouncedSearch] = React.useState(
    draft.activeComponent?.displayName ?? ''
  );
  const active = draft.activeComponent ?? null;

  React.useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(active?.displayName ?? ''), 250);
    return () => clearTimeout(timeout);
  }, [active?.displayName]);

  const catalogQuery = useFoodCatalogSearch(debouncedSearch, draft.catalogVersion);
  const catalogPage = catalogQuery.data?.data;
  const foods = catalogPage?.items ?? [];

  const updateDraft = (next: ManualConsumptionDraft) => onChange(next);
  const updateActive = (next: ManualFoodComponentDraft) =>
    updateDraft({ ...draft, activeComponent: next });

  const beginAdd = () => {
    setValidationError(null);
    updateDraft({ ...draft, activeComponent: emptyComponent(), editingComponentId: null });
  };

  const beginEdit = (component: ManualFoodComponentDraft) => {
    setValidationError(null);
    updateDraft({ ...draft, activeComponent: component, editingComponentId: component.id });
  };

  const cancelEditor = () => {
    setValidationError(null);
    updateDraft({ ...draft, activeComponent: null, editingComponentId: null });
  };

  const changeName = (name: string) => {
    if (!active) return;
    updateActive({
      ...active,
      displayName: name,
      ...(name === active.displayName
        ? {}
        : { catalogFoodId: null, preparation: null, portion: { kind: 'unknown' as const } }),
    });
  };

  const chooseFood = (food: CatalogFood) => {
    if (!active) return;
    const selected = createManualFoodComponentDraft(food.displayName, food, active.id);
    if (!selected) return;
    updateDraft({
      ...draft,
      catalogVersion: food.catalogVersion,
      activeComponent: selected,
    });
  };

  const useOther = () => {
    if (!active) return;
    const unmatched = createManualFoodComponentDraft(active.displayName, null, active.id);
    if (!unmatched) {
      setValidationError('Masukkan nama makanan untuk menyimpannya sebagai Makanan lain.');
      return;
    }
    updateDraft({
      ...draft,
      catalogVersion: catalogPage?.catalogVersion ?? draft.catalogVersion,
      activeComponent: unmatched,
    });
    setValidationError(null);
  };

  const commitComponent = () => {
    if (!active) return;
    const next = upsertManualComponent(draft.components, active, draft.editingComponentId ?? null);
    if ('error' in next) {
      setValidationError(next.error);
      return;
    }
    setValidationError(null);
    updateDraft({
      ...draft,
      components: next.value,
      activeComponent: null,
      editingComponentId: null,
    });
  };

  const setCatalogFood = (food: CatalogFood) => {
    chooseFood(food);
    setValidationError(null);
  };

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-5 px-5 pb-10 pt-7">
        <View className="gap-2">
          <Button
            variant="ghost"
            className="min-h-12 self-start px-0"
            disabled={isSubmitting}
            onPress={onBack}>
            <Text>Kembali</Text>
          </Button>
          <Text variant="h2">{title}</Text>
          <Text variant="muted">{description}</Text>
          <Text variant="muted">
            Draft disimpan otomatis di perangkat. Pengiriman memerlukan koneksi.
          </Text>
        </View>

        <View className="gap-3 rounded-xl border border-border bg-card p-4">
          <Text variant="h4">Waktu makan</Text>
          <Text variant="muted">Zona waktu akun: {timeZone}</Text>
          <FormField
            label="Tanggal"
            hint="Format YYYY-MM-DD"
            value={draft.consumedDate}
            onChangeText={(consumedDate) => updateDraft({ ...draft, consumedDate })}
            editable={!isSubmitting}
            placeholder="2026-10-14"
            keyboardType="numbers-and-punctuation"
          />
          <FormField
            label="Waktu"
            hint={`Format 24 jam HH:mm (${timeZone})`}
            value={draft.consumedTime}
            onChangeText={(consumedTime) => updateDraft({ ...draft, consumedTime })}
            editable={!isSubmitting}
            placeholder="12:30"
            keyboardType="numbers-and-punctuation"
          />
        </View>

        <View className="gap-3">
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1 gap-1">
              <Text variant="h3">Makanan yang dimakan</Text>
              <Text variant="muted">Tambahkan satu komponen per langkah, hingga 30 komponen.</Text>
            </View>
            {!active ? (
              <Button
                className="min-h-12"
                disabled={isSubmitting}
                onPress={beginAdd}
                accessibilityLabel="Tambah makanan">
                <Text>Tambah</Text>
              </Button>
            ) : null}
          </View>

          {draft.components.map((component) => (
            <View key={component.id} className="gap-2 rounded-xl border border-border p-4">
              <Text variant="large">{component.displayName}</Text>
              <Text variant="muted">
                {component.catalogFoodId
                  ? 'Cocok dengan katalog'
                  : 'Makanan lain · belum cocok dengan katalog'}
              </Text>
              <Text variant="muted">{portionLabel(component)}</Text>
              <View className="flex-row gap-2">
                <Button
                  variant="outline"
                  className="min-h-12 flex-1"
                  disabled={isSubmitting}
                  onPress={() => beginEdit(component)}>
                  <Text>Ubah</Text>
                </Button>
                <Button
                  variant="ghost"
                  className="min-h-12 flex-1"
                  disabled={isSubmitting}
                  accessibilityLabel={`Hapus ${component.displayName}`}
                  onPress={() =>
                    updateDraft({
                      ...draft,
                      components: removeManualComponent(draft.components, component.id),
                    })
                  }>
                  <Text>Hapus</Text>
                </Button>
              </View>
            </View>
          ))}

          {active ? (
            <FoodEditor
              component={active}
              foods={foods}
              isEditing={!!draft.editingComponentId}
              isLoading={catalogQuery.isFetching && debouncedSearch.trim().length >= 2}
              isStale={!!catalogQuery.data?.stale || !!catalogQuery.error}
              errorMessage={
                catalogQuery.error
                  ? serviceErrorMessage(catalogQuery.error)
                  : debouncedSearch.trim().length < 2 && active.displayName.trim()
                    ? 'Ketik minimal dua huruf untuk mencari katalog.'
                    : null
              }
              canUseOther={
                active.displayName.trim().length >= 2 && (!!catalogPage || !!catalogQuery.error)
              }
              validationError={validationError}
              disabled={isSubmitting}
              onNameChange={changeName}
              onChooseFood={setCatalogFood}
              onUseOther={useOther}
              onChange={updateActive}
              onCommit={commitComponent}
              onCancel={cancelEditor}
            />
          ) : null}
        </View>

        {submitError ? (
          <View
            className="gap-2 rounded-xl border border-destructive/40 p-4"
            accessibilityRole="alert">
            <Text className="font-semibold">Catatan belum tersimpan</Text>
            <Text>{submitError}</Text>
            <Text variant="muted">
              Draft tetap tersedia. Periksa koneksi lalu ulangi pengiriman.
            </Text>
          </View>
        ) : null}

        {revisionConflict && onRestartAfterConflict ? (
          <View className="gap-2 rounded-xl border border-border p-4">
            <Text variant="muted">
              Draft tetap tersimpan. Tindakan berikut akan membuang draft ini dan membuka revisi
              terbaru dari server.
            </Text>
            <Button
              variant="outline"
              className="min-h-12"
              disabled={isSubmitting || !canRestartAfterConflict}
              onPress={onRestartAfterConflict}>
              <Text>Buang draft dan muat revisi terbaru</Text>
            </Button>
            {!canRestartAfterConflict ? (
              <Text variant="muted">Hubungkan ke internet untuk memuat revisi terbaru.</Text>
            ) : null}
          </View>
        ) : null}

        {draft.activeComponent ? (
          <Text variant="muted">Simpan komponen yang sedang dibuka sebelum mengirim catatan.</Text>
        ) : null}

        <Button
          className="min-h-12"
          disabled={isSubmitting || !draft.components.length || !!draft.activeComponent}
          onPress={() => onSubmit(draft)}>
          {isSubmitting ? <ActivityIndicator color="white" /> : <Text>{submitLabel}</Text>}
        </Button>
      </ScrollView>
    </View>
  );
}
