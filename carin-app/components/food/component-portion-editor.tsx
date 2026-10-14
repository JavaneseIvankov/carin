import { Button } from '@/components/ui/button';
import { FormField } from '@/components/app/form-field';
import { Text } from '@/components/ui/text';
import { useAppRead } from '@/lib/api/query';
import type { components } from '@/lib/api/generated/app-api';
import { createIdempotencyKey } from '@/lib/profile/profile';
import { replaceCorrectionFood, type CorrectionDraftComponent } from '@/lib/food/correction';
import {
  parseCorrectionQuantity,
  updateCorrectionDraftQuantity,
} from '@/lib/food/correction-screen';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { Check, Plus, Sparkles, Trash2 } from 'lucide-react-native';
import * as React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

type Food = components['schemas']['ai__CatalogFood'];
const EMPTY_FOODS: Food[] = [];

type Props = {
  component: CorrectionDraftComponent;
  index: number;
  catalogVersion: string;
  disabled?: boolean;
  onChange: (next: CorrectionDraftComponent) => void;
  onPortionValidityChange: (componentId: string, valid: boolean) => void;
  onRemove: () => void;
};

function FoodRow({
  component,
  index,
  catalogVersion,
  disabled,
  onChange,
  onPortionValidityChange,
  onRemove,
}: Props) {
  const [search, setSearch] = React.useState(component.catalogFoodId ? component.displayName : '');
  const [selectedFoodOverride, setSelectedFoodOverride] = React.useState<Food | null>(null);
  const [quantityText, setQuantityText] = React.useState(
    component.portion.kind === 'known' ? String(component.portion.quantity) : ''
  );
  const [portionMode, setPortionMode] = React.useState<'unknown' | 'g' | 'serving'>(
    component.portion.kind === 'known' ? component.portion.unit : 'unknown'
  );
  const [selectedServingId, setSelectedServingId] = React.useState(
    component.portion.kind === 'known' && component.portion.unit === 'serving'
      ? component.portion.servingId
      : null
  );
  const foodsQuery = useAppRead(
    'searchFoods',
    { query: { q: search.trim(), limit: 8, version: catalogVersion } },
    { enabled: search.trim().length >= 2 }
  );
  const foods = foodsQuery.data?.data.items ?? EMPTY_FOODS;
  const selectedFood =
    selectedFoodOverride?.id === component.catalogFoodId
      ? selectedFoodOverride
      : (foods.find((food) => food.id === component.catalogFoodId) ?? null);

  const updateQuantity = (raw: string) => {
    setQuantityText(raw);
    const updated = updateCorrectionDraftQuantity(component, raw, portionMode, selectedServingId);
    onPortionValidityChange(component.id, !!updated);
    if (updated) onChange(updated);
  };

  const chooseFood = (food: Food) => {
    if (food.catalogVersion !== catalogVersion) return;
    setSelectedFoodOverride(food);
    setSearch('');
    setQuantityText('');
    setPortionMode('unknown');
    setSelectedServingId(null);
    onPortionValidityChange(component.id, true);
    onChange(replaceCorrectionFood(component, food));
  };

  const chooseServing = (serving: Food['servings'][number]) => {
    setPortionMode('serving');
    setSelectedServingId(serving.id);
    setQuantityText('1');
    onPortionValidityChange(component.id, true);
    onChange({
      ...component,
      portion: { kind: 'known', quantity: 1, servingId: serving.id, unit: 'serving' },
    });
  };

  const selectGramUnit = () => {
    setPortionMode('g');
    setSelectedServingId(null);
    setQuantityText('');
    onPortionValidityChange(component.id, false);
  };

  return (
    <View className="gap-4 rounded-summary border border-border bg-card p-5 shadow-sm">
      <View className="flex-row items-center justify-between gap-3 border-b border-border/50 pb-3">
        <View className="flex-row items-center gap-2">
          <View className="h-7 w-7 items-center justify-center rounded-full bg-carin-olive-soft">
            <Text variant="caption" className="font-bold text-primary">
              {index + 1}
            </Text>
          </View>
          <Text variant="large" className="font-bold">
            Komponen {index + 1}
          </Text>
        </View>
        <Button
          className="h-10 min-h-10 rounded-full px-3"
          variant="ghost"
          disabled={disabled}
          accessibilityLabel={`Hapus komponen ${index + 1}`}
          onPress={onRemove}>
          <Icon as={Trash2} size={16} className="mr-1 text-destructive" />
          <Text className="text-sm font-semibold text-destructive">Hapus</Text>
        </Button>
      </View>

      <FormField
        label="Nama makanan"
        value={component.displayName}
        onChangeText={(displayName) => {
          if (displayName === component.displayName) return;
          setSelectedFoodOverride(null);
          setPortionMode('unknown');
          setSelectedServingId(null);
          setQuantityText('');
          onPortionValidityChange(component.id, true);
          onChange({
            ...component,
            catalogFoodId: null,
            displayName,
            preparation: null,
            portion: { kind: 'unknown' },
          });
        }}
        editable={!disabled}
        placeholder="Contoh: Nasi Putih, Tempe Goreng"
      />

      <FormField
        label="Cari di katalog makanan"
        hint="Cari untuk menyambungkan ke takaran standar dan data gizi resmi"
        value={search}
        onChangeText={setSearch}
        editable={!disabled}
        placeholder="Ketik minimal 2 huruf untuk mencari…"
        autoCapitalize="none"
      />

      {foodsQuery.isFetching ? (
        <ActivityIndicator accessibilityLabel="Mencari katalog" />
      ) : null}

      {foodsQuery.error ? (
        <Text accessibilityRole="alert" className="text-xs text-destructive">
          Katalog versi hasil ini belum tersedia. Versi baru tidak akan dipilih otomatis.
        </Text>
      ) : null}

      {foods.length > 0 ? (
        <View className="gap-2">
          <Text variant="caption" className="font-semibold text-muted-foreground">
            Pilih dari Katalog:
          </Text>
          <View className="gap-1.5">
            {foods.map((food) => (
              <Button
                key={food.id}
                variant="outline"
                className="min-h-12 items-center justify-start rounded-[14px] px-3.5 py-2.5"
                disabled={disabled || food.catalogVersion !== catalogVersion}
                onPress={() => chooseFood(food)}>
                <Icon as={Sparkles} size={16} className="mr-2 text-primary" />
                <View className="flex-1 items-start">
                  <Text className="text-left font-semibold text-foreground">
                    {food.displayName}
                  </Text>
                  {food.preparation ? (
                    <Text variant="caption" className="text-left text-muted-foreground">
                      Cara saji: {food.preparation}
                    </Text>
                  ) : null}
                </View>
              </Button>
            ))}
          </View>
        </View>
      ) : null}

      {component.catalogFoodId ? (
        <View className="gap-2.5 rounded-[16px] border border-carin-olive-soft bg-carin-olive-soft/30 p-3.5">
          <View className="flex-row items-center gap-1.5">
            <Icon as={Check} size={16} className="text-primary" />
            <Text className="text-xs font-semibold text-primary">Terhubung ke katalog</Text>
          </View>
          <Text variant="caption" className="text-muted-foreground">
            Cara saji katalog:{' '}
            {selectedFood?.preparation ?? component.preparation ?? 'tidak tersedia'}
          </Text>
          <Text variant="caption" className="font-medium text-foreground">
            Pilihan takaran porsi katalog:
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {selectedFood?.servings.map((serving) => {
              const isSelected = portionMode === 'serving' && selectedServingId === serving.id;
              return (
                <Button
                  key={serving.id}
                  variant={isSelected ? 'tactile' : 'outline'}
                  className={isSelected ? 'h-11 px-3.5' : 'h-11 rounded-[14px] px-3.5'}
                  disabled={disabled}
                  onPress={() => chooseServing(serving)}>
                  <Text>
                    {serving.label} ({serving.grams} g)
                  </Text>
                </Button>
              );
            })}
          </View>
        </View>
      ) : null}

      <View className="gap-2">
        <Text variant="caption" className="font-semibold text-muted-foreground">
          Pilihan Takaran Porsi:
        </Text>
        <View className="flex-row flex-wrap gap-2">
          <Button
            variant={portionMode === 'unknown' ? 'tactile' : 'outline'}
            className={portionMode === 'unknown' ? 'h-11 px-4' : 'h-11 rounded-[14px] px-4'}
            disabled={disabled}
            onPress={() => {
              setQuantityText('');
              setPortionMode('unknown');
              setSelectedServingId(null);
              onPortionValidityChange(component.id, true);
              onChange({ ...component, portion: { kind: 'unknown' } });
            }}>
            <Text>Tidak tahu porsi</Text>
          </Button>
          <Button
            variant={portionMode === 'g' ? 'tactile' : 'outline'}
            className={portionMode === 'g' ? 'h-11 px-4' : 'h-11 rounded-[14px] px-4'}
            disabled={disabled}
            onPress={selectGramUnit}>
            <Text>Isi Berat (Gram)</Text>
          </Button>
        </View>
      </View>

      {portionMode === 'serving' ? (
        <View className="gap-2">
          <View className="flex-row items-end gap-3">
            <View className="flex-1">
              <FormField
                label="Jumlah takaran porsi"
                unit="porsi"
                unitBadge
                keyboardType="decimal-pad"
                value={quantityText}
                onChangeText={updateQuantity}
                hint="Isi angka jumlah porsi (misal 1 atau 1.5), atau pilih tombol cepat di bawah."
                error={
                  quantityText.length > 0 && parseCorrectionQuantity(quantityText) === null
                    ? 'Masukkan jumlah lebih dari 0.'
                    : undefined
                }
                editable={!disabled}
              />
            </View>
            {/* Tactile steppers [-] and [+] */}
            <View className="flex-row items-center gap-1.5 pb-0.5">
              <Button
                variant="outline"
                size="sm"
                disabled={disabled || (parseCorrectionQuantity(quantityText) ?? 0) <= 0.25}
                onPress={() => {
                  const curr = parseCorrectionQuantity(quantityText) ?? 1;
                  const next = Math.max(0.25, Math.round((curr - 0.25) * 100) / 100);
                  updateQuantity(String(next));
                }}
                accessibilityLabel="Kurangi porsi 0.25"
                className="h-12 w-12 rounded-control p-0 items-center justify-center">
                <Text className="text-xl font-bold text-foreground">−</Text>
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={disabled}
                onPress={() => {
                  const curr = parseCorrectionQuantity(quantityText) ?? 0;
                  const next = Math.round((curr + 0.25) * 100) / 100;
                  updateQuantity(String(next));
                }}
                accessibilityLabel="Tambah porsi 0.25"
                className="h-12 w-12 rounded-control p-0 items-center justify-center">
                <Text className="text-xl font-bold text-foreground">+</Text>
              </Button>
            </View>
          </View>

          {/* Quick serving chips */}
          <View className="flex-row flex-wrap items-center gap-2">
            {['0.5', '1', '1.5', '2'].map((val) => {
              const isSelected = quantityText === val;
              return (
                <Pressable
                  key={val}
                  onPress={() => updateQuantity(val)}
                  accessibilityRole="button"
                  accessibilityLabel={`Pilih ${val} porsi`}
                  className={cn(
                    'rounded-full border px-3 py-1.5',
                    isSelected
                      ? 'border-primary bg-carin-olive-soft'
                      : 'border-border/80 bg-muted/20 active:bg-muted/40'
                  )}>
                  <Text
                    variant="caption"
                    className={cn(
                      'font-medium text-foreground',
                      isSelected && 'font-semibold text-primary'
                    )}>
                    {val}x porsi
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : portionMode === 'g' ? (
        <View className="gap-2">
          <View className="flex-row items-end gap-3">
            <View className="flex-1">
              <FormField
                label="Berat aktual makanan"
                unit="g"
                unitBadge
                keyboardType="decimal-pad"
                value={quantityText}
                onChangeText={updateQuantity}
                hint="Isi estimasi berat dalam gram, atau gunakan tombol di samping."
                error={
                  quantityText.length > 0 && parseCorrectionQuantity(quantityText) === null
                    ? 'Masukkan jumlah lebih dari 0.'
                    : undefined
                }
                editable={!disabled}
              />
            </View>
            {/* Tactile steppers [-25g] and [+25g] */}
            <View className="flex-row items-center gap-1.5 pb-0.5">
              <Button
                variant="outline"
                size="sm"
                disabled={disabled || (parseCorrectionQuantity(quantityText) ?? 0) <= 25}
                onPress={() => {
                  const curr = parseCorrectionQuantity(quantityText) ?? 100;
                  const next = Math.max(25, Math.round(curr - 25));
                  updateQuantity(String(next));
                }}
                accessibilityLabel="Kurangi 25 gram"
                className="h-12 px-3 rounded-control items-center justify-center">
                <Text className="text-sm font-bold text-foreground">−25g</Text>
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={disabled}
                onPress={() => {
                  const curr = parseCorrectionQuantity(quantityText) ?? 0;
                  const next = Math.round(curr + 25);
                  updateQuantity(String(next));
                }}
                accessibilityLabel="Tambah 25 gram"
                className="h-12 px-3 rounded-control items-center justify-center">
                <Text className="text-sm font-bold text-foreground">+25g</Text>
              </Button>
            </View>
          </View>

          {/* Quick gram chips */}
          <View className="flex-row flex-wrap items-center gap-2">
            {['50', '100', '150', '200', '250'].map((val) => {
              const isSelected = quantityText === val;
              return (
                <Pressable
                  key={val}
                  onPress={() => updateQuantity(val)}
                  accessibilityRole="button"
                  accessibilityLabel={`Pilih ${val} gram`}
                  className={cn(
                    'rounded-full border px-3 py-1.5',
                    isSelected
                      ? 'border-primary bg-carin-olive-soft'
                      : 'border-border/80 bg-muted/20 active:bg-muted/40'
                  )}>
                  <Text
                    variant="caption"
                    className={cn(
                      'font-medium text-foreground',
                      isSelected && 'font-semibold text-primary'
                    )}>
                    {val} g
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {!component.displayName.trim() ? (
        <Text variant="caption" className="text-muted-foreground">
          Isi nama makanan sebelum mengirim koreksi.
        </Text>
      ) : null}
    </View>
  );
}

export function ComponentPortionEditor({
  components,
  catalogVersion,
  disabled = false,
  onChange,
  onPortionValidityChange,
}: {
  components: CorrectionDraftComponent[];
  catalogVersion: string;
  disabled?: boolean;
  onChange: (next: CorrectionDraftComponent[]) => void;
  onPortionValidityChange: (componentId: string, valid: boolean) => void;
}) {
  return (
    <View className="gap-4">
      {components.map((component, index) => (
        <FoodRow
          key={component.id}
          component={component}
          index={index}
          catalogVersion={catalogVersion}
          disabled={disabled}
          onPortionValidityChange={onPortionValidityChange}
          onChange={(next) =>
            onChange(components.map((item) => (item.id === next.id ? next : item)))
          }
          onRemove={() => onChange(components.filter((item) => item.id !== component.id))}
        />
      ))}
      {components.length < 30 ? (
        <Button
          variant="tactile-secondary"
          disabled={disabled}
          accessibilityLabel="Tambah komponen makanan baru"
          onPress={() =>
            onChange([
              ...components,
              {
                id: createComponentId(),
                catalogFoodId: null,
                displayName: '',
                preparation: null,
                portion: { kind: 'unknown' },
              },
            ])
          }>
          <Icon as={Plus} size={18} className="mr-1.5 text-secondary-foreground" />
          <Text>Tambah Komponen Makanan</Text>
        </Button>
      ) : (
        <Text variant="muted" className="text-center text-xs">
          Maksimum 30 komponen per hasil.
        </Text>
      )}
    </View>
  );
}

function createComponentId() {
  return createIdempotencyKey();
}
