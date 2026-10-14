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
import * as React from 'react';
import { ActivityIndicator, View } from 'react-native';

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
    <View className="gap-3 rounded-xl border border-border p-4">
      <View className="flex-row items-center justify-between gap-3">
        <Text variant="large">Komponen {index + 1}</Text>
        <Button className="min-h-12" variant="ghost" disabled={disabled} onPress={onRemove}>
          <Text>Hapus</Text>
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
        placeholder="Nama makanan"
      />
      <FormField
        label="Cari makanan atau cara saji"
        value={search}
        onChangeText={setSearch}
        editable={!disabled}
        placeholder="Ketik minimal 2 huruf"
        autoCapitalize="none"
      />
      {foodsQuery.isFetching ? <ActivityIndicator accessibilityLabel="Mencari katalog" /> : null}
      {foodsQuery.error ? (
        <Text accessibilityRole="alert">
          Katalog versi hasil ini belum tersedia. Versi baru tidak akan dipilih otomatis.
        </Text>
      ) : null}
      {foods.map((food) => (
        <Button
          key={food.id}
          variant="outline"
          className="min-h-12"
          disabled={disabled || food.catalogVersion !== catalogVersion}
          onPress={() => chooseFood(food)}>
          <Text>
            {food.displayName}
            {food.preparation ? ` · ${food.preparation}` : ''}
          </Text>
        </Button>
      ))}
      {component.catalogFoodId ? (
        <View className="gap-2">
          <Text variant="muted">
            Cara saji katalog:{' '}
            {selectedFood?.preparation ?? component.preparation ?? 'tidak tersedia'}
          </Text>
          <Text variant="muted">Pilih takaran dari katalog atau isi berat dalam gram.</Text>
          {selectedFood?.servings.map((serving) => (
            <Button
              key={serving.id}
              variant="outline"
              className="min-h-12"
              disabled={disabled}
              onPress={() => chooseServing(serving)}>
              <Text>
                {serving.label} · {serving.grams} g
              </Text>
            </Button>
          ))}
        </View>
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        <Button
          variant={portionMode === 'unknown' ? 'default' : 'outline'}
          className="min-h-12"
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
          variant={portionMode === 'g' ? 'default' : 'outline'}
          className="min-h-12"
          disabled={disabled}
          onPress={selectGramUnit}>
          <Text>Gram</Text>
        </Button>
      </View>
      {portionMode === 'serving' ? (
        <FormField
          label="Jumlah takaran"
          unit="porsi"
          keyboardType="decimal-pad"
          value={quantityText}
          onChangeText={updateQuantity}
          hint="Isi angka lebih dari 0, atau pilih Tidak tahu porsi."
          error={
            quantityText.length > 0 && parseCorrectionQuantity(quantityText) === null
              ? 'Masukkan jumlah lebih dari 0.'
              : undefined
          }
          editable={!disabled}
        />
      ) : portionMode === 'g' ? (
        <FormField
          label="Berat aktual"
          unit="g"
          keyboardType="decimal-pad"
          value={quantityText}
          onChangeText={updateQuantity}
          hint="Isi angka lebih dari 0, atau pilih Tidak tahu porsi."
          error={
            quantityText.length > 0 && parseCorrectionQuantity(quantityText) === null
              ? 'Masukkan jumlah lebih dari 0.'
              : undefined
          }
          editable={!disabled}
        />
      ) : null}
      {!component.displayName.trim() ? (
        <Text variant="muted">Isi nama makanan sebelum mengirim koreksi.</Text>
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
          className="min-h-12"
          variant="outline"
          disabled={disabled}
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
          <Text>Tambah komponen</Text>
        </Button>
      ) : (
        <Text variant="muted">Maksimum 30 komponen per hasil.</Text>
      )}
    </View>
  );
}

function createComponentId() {
  return createIdempotencyKey();
}
