import { DatePickerField } from '@/components/app/date-picker-field';
import { serviceErrorMessage } from '@/components/app/presentation';
import { TimePickerField } from '@/components/app/time-picker-field';
import { BackButton } from '@/components/app/back-button';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { Icon } from '@/components/ui/icon';
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
import { createIdempotencyKey } from '@/lib/profile/profile';
import { cn } from '@/lib/utils';
import { Pencil, Plus, Trash2 } from 'lucide-react-native';
import * as React from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
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
  isDrawer?: boolean;
  inlineFoodEditor?: boolean;
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
  isDrawer = false,
  inlineFoodEditor = false,
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

  const formBody = (
    <View className={cn(isDrawer ? 'gap-6 pb-6' : 'gap-6')}>
      {!isDrawer ? (
        <View className="gap-2">
          <BackButton disabled={isSubmitting} onPress={onBack} />
          <Text variant="h1">{title}</Text>
          <Text className="text-muted-foreground">{description}</Text>
          <View className="mt-1 rounded-control bg-carin-olive-soft/50 px-3 py-2">
            <Text variant="caption" className="text-muted-foreground">
              Draft tersimpan otomatis di perangkat. Pengiriman memerlukan koneksi internet.
            </Text>
          </View>
        </View>
      ) : null}

      <View
        className={cn(
          'gap-3 rounded-summary border border-border/70 p-4 sm:p-5',
          isDrawer ? 'bg-transparent' : 'bg-card'
        )}>
        <View className="flex-row items-center justify-between">
          <Text variant="h3">Waktu makan</Text>
          <View className="rounded-full bg-carin-olive-soft px-2.5 py-0.5">
            <Text variant="caption" className="font-medium text-primary">
              {timeZone}
            </Text>
          </View>
        </View>

        {/* Date input with quick preset chips */}
        <View className="gap-1.5">
          <DatePickerField
            label="Tanggal"
            hint="Format tahun, bulan, tanggal"
            value={draft.consumedDate}
            onChange={(consumedDate) => updateDraft({ ...draft, consumedDate })}
            disabled={isSubmitting}
          />
          <View className="flex-row items-center gap-2 pt-0.5">
            <Pressable
              onPress={() => {
                const today = new Date().toISOString().slice(0, 10);
                updateDraft({ ...draft, consumedDate: today });
              }}
              className={cn(
                'rounded-full border border-border/80 bg-muted/20 px-3 py-1 active:bg-muted/40',
                draft.consumedDate === new Date().toISOString().slice(0, 10) &&
                  'border-primary/40 bg-carin-olive-soft'
              )}>
              <Text
                variant="caption"
                className={cn(
                  'font-medium text-foreground',
                  draft.consumedDate === new Date().toISOString().slice(0, 10) &&
                    'font-semibold text-primary'
                )}>
                Hari ini
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                const d = new Date();
                d.setDate(d.getDate() - 1);
                updateDraft({ ...draft, consumedDate: d.toISOString().slice(0, 10) });
              }}
              className="rounded-full border border-border/80 bg-muted/20 px-3 py-1 active:bg-muted/40">
              <Text variant="caption" className="font-medium text-foreground">
                Kemarin
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Time input with quick preset chips */}
        <View className="gap-1.5">
          <TimePickerField
            label="Waktu"
            hint={`Format 24 jam HH:mm (${timeZone})`}
            value={draft.consumedTime}
            onChange={(consumedTime) =>
              updateDraft({ ...draft, consumedTime: consumedTime ?? '12:00' })
            }
            disabled={isSubmitting}
          />
          <View className="flex-row flex-wrap items-center gap-2 pt-0.5">
            <Pressable
              onPress={() => {
                const now = new Date();
                const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                updateDraft({ ...draft, consumedTime: time });
              }}
              className="rounded-full border border-border/80 bg-muted/20 px-3 py-1 active:bg-muted/40">
              <Text variant="caption" className="font-medium text-foreground">
                Baru saja
              </Text>
            </Pressable>
            <Pressable
              onPress={() => updateDraft({ ...draft, consumedTime: '08:00' })}
              className={cn(
                'rounded-full border border-border/80 bg-muted/20 px-3 py-1 active:bg-muted/40',
                draft.consumedTime === '08:00' && 'border-primary/40 bg-carin-olive-soft'
              )}>
              <Text
                variant="caption"
                className={cn(
                  'font-medium text-foreground',
                  draft.consumedTime === '08:00' && 'font-semibold text-primary'
                )}>
                Pagi (08:00)
              </Text>
            </Pressable>
            <Pressable
              onPress={() => updateDraft({ ...draft, consumedTime: '12:30' })}
              className={cn(
                'rounded-full border border-border/80 bg-muted/20 px-3 py-1 active:bg-muted/40',
                draft.consumedTime === '12:30' && 'border-primary/40 bg-carin-olive-soft'
              )}>
              <Text
                variant="caption"
                className={cn(
                  'font-medium text-foreground',
                  draft.consumedTime === '12:30' && 'font-semibold text-primary'
                )}>
                Siang (12:30)
              </Text>
            </Pressable>
            <Pressable
              onPress={() => updateDraft({ ...draft, consumedTime: '19:00' })}
              className={cn(
                'rounded-full border border-border/80 bg-muted/20 px-3 py-1 active:bg-muted/40',
                draft.consumedTime === '19:00' && 'border-primary/40 bg-carin-olive-soft'
              )}>
              <Text
                variant="caption"
                className={cn(
                  'font-medium text-foreground',
                  draft.consumedTime === '19:00' && 'font-semibold text-primary'
                )}>
                Malam (19:00)
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View className="gap-3">
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1 gap-0.5">
            <Text variant="h3">Makanan yang dimakan</Text>
            <Text variant="caption" className="text-muted-foreground">
              Tambahkan komponen makanan yang dikonsumsi (hingga 30 komponen).
            </Text>
          </View>
          {!active || !inlineFoodEditor ? (
            <Button
              variant="secondary"
              tactile
              size="sm"
              className="h-11"
              disabled={isSubmitting}
              onPress={beginAdd}
              accessibilityLabel="Tambah makanan">
              <Icon as={Plus} size={16} className="text-secondary-foreground" />
              <Text>Tambah</Text>
            </Button>
          ) : null}
        </View>

        {draft.components.length === 0 && (!active || !inlineFoodEditor) ? (
          <Pressable
            role="button"
            accessibilityRole="button"
            accessibilityLabel="Tambah makanan pertama"
            onPress={beginAdd}
            disabled={isSubmitting}
            className={cn(
              'items-center justify-center gap-2 rounded-summary border border-dashed border-border p-6 active:bg-carin-olive-soft/40',
              isDrawer ? 'bg-transparent' : 'bg-card/60'
            )}>
            <View className="h-10 w-10 items-center justify-center rounded-full bg-carin-olive-soft">
              <Icon as={Plus} size={20} className="text-primary" />
            </View>
            <Text className="font-semibold text-foreground">Belum ada makanan</Text>
            <Text variant="caption" className="text-center text-muted-foreground">
              Ketuk di sini untuk menambahkan makanan yang sudah Anda konsumsi.
            </Text>
          </Pressable>
        ) : null}

        {draft.components.map((component) => (
          <View
            key={component.id}
            className={cn(
              'gap-3 rounded-summary border border-border/70 p-4 sm:p-5',
              isDrawer ? 'bg-transparent' : 'bg-card'
            )}>
            <View className="flex-row items-start justify-between gap-2">
              <View className="flex-1 gap-1">
                <Text variant="emphasis">{component.displayName}</Text>
                <View className="flex-row flex-wrap items-center gap-1.5">
                  <View
                    className={cn(
                      'self-start rounded-full px-2.5 py-0.5',
                      component.catalogFoodId ? 'bg-carin-olive-soft' : 'bg-muted'
                    )}>
                    <Text
                      variant="caption"
                      className={
                        component.catalogFoodId
                          ? 'font-medium text-primary'
                          : 'text-muted-foreground'
                      }>
                      {component.catalogFoodId ? 'Cocok katalog' : 'Makanan lain'}
                    </Text>
                  </View>
                  <Text variant="caption" className="text-muted-foreground">
                    ·
                  </Text>
                  <Text variant="caption" className="font-medium text-foreground">
                    {portionLabel(component)}
                  </Text>
                </View>
              </View>
            </View>

            <View className="flex-row gap-2 border-t border-border/50 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="min-h-11 flex-1"
                disabled={isSubmitting}
                onPress={() => beginEdit(component)}>
                <Icon as={Pencil} size={14} className="text-foreground" />
                <Text>Ubah</Text>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="min-h-11 flex-1"
                disabled={isSubmitting}
                accessibilityLabel={`Hapus ${component.displayName}`}
                onPress={() =>
                  updateDraft({
                    ...draft,
                    components: removeManualComponent(draft.components, component.id),
                  })
                }>
                <Icon as={Trash2} size={14} className="text-destructive" />
                <Text className="text-destructive">Hapus</Text>
              </Button>
            </View>
          </View>
        ))}

        {inlineFoodEditor && active ? (
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
            canUseOther={active.displayName.trim().length >= 2}
            validationError={validationError}
            disabled={isSubmitting}
            showCardWrapper={true}
            showFooterButtons={true}
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
          className="gap-1.5 rounded-summary border border-destructive/30 bg-destructive/10 p-4"
          accessibilityRole="alert">
          <Text className="font-semibold text-destructive">Catatan belum tersimpan</Text>
          <Text className="text-sm text-foreground">{submitError}</Text>
          <Text variant="caption" className="text-muted-foreground">
            Draft tetap tersedia di perangkat. Periksa koneksi internet lalu coba simpan kembali.
          </Text>
        </View>
      ) : null}

      {revisionConflict && onRestartAfterConflict ? (
        <View className="gap-2.5 rounded-summary border border-border/70 bg-card p-4">
          <Text variant="emphasis">Ada pembaruan data di server</Text>
          <Text variant="caption" className="text-muted-foreground">
            Draft tetap tersimpan di perangkat. Tindakan berikut akan membuang draft ini dan memuat
            revisi terbaru dari server.
          </Text>
          <Button
            variant="outline"
            className="min-h-12"
            disabled={isSubmitting || !canRestartAfterConflict}
            onPress={onRestartAfterConflict}>
            <Text>Buang draft dan muat revisi terbaru</Text>
          </Button>
          {!canRestartAfterConflict ? (
            <Text variant="caption" className="text-muted-foreground">
              Hubungkan ke internet untuk memuat revisi terbaru.
            </Text>
          ) : null}
        </View>
      ) : null}

      {inlineFoodEditor && draft.activeComponent ? (
        <Text variant="caption" className="text-center text-muted-foreground">
          Simpan komponen yang sedang dibuka sebelum mengirim catatan.
        </Text>
      ) : null}

      <Button
        variant="tactile"
        className="min-h-12 w-full"
        disabled={
          isSubmitting ||
          !draft.components.length ||
          (Boolean(inlineFoodEditor) && Boolean(draft.activeComponent))
        }
        onPress={() => onSubmit(draft)}>
        {isSubmitting ? <ActivityIndicator color="white" /> : <Text>{submitLabel}</Text>}
      </Button>
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      {isDrawer ? (
        formBody
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="px-5 py-6 gap-6 pb-16"
          showsVerticalScrollIndicator={false}>
          {formBody}
        </ScrollView>
      )}

      {/* Food Editor Drawer */}
      {!inlineFoodEditor ? (
        <Drawer
          isOpen={Boolean(active)}
          onClose={cancelEditor}
          title={draft.editingComponentId ? 'Ubah komponen makanan' : 'Tambah komponen makanan'}
          description="Pilih hasil katalog yang cocok atau simpan nama sebagai Makanan lain."
          footer={
            <View className="gap-2">
              <Button
                variant="tactile"
                className="min-h-12 w-full"
                disabled={isSubmitting}
                onPress={commitComponent}>
                <Text>Simpan Komponen</Text>
              </Button>
              <Button
                variant="ghost"
                className="min-h-11 w-full"
                disabled={isSubmitting}
                onPress={cancelEditor}>
                <Text>Batal</Text>
              </Button>
            </View>
          }>
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
              canUseOther={active.displayName.trim().length >= 2}
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
        </Drawer>
      ) : null}
    </View>
  );
}
