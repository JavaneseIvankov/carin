import { FormField } from '@/components/app/form-field';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import {
  formatNutrient,
  type CatalogFood,
  type ManualFoodComponentDraft,
} from '@/lib/consumptions/consumption';
import { Check } from 'lucide-react-native';
import * as React from 'react';
import { ActivityIndicator, View } from 'react-native';

type Props = {
  component: ManualFoodComponentDraft;
  foods: CatalogFood[];
  isEditing: boolean;
  isLoading: boolean;
  isStale: boolean;
  errorMessage: string | null;
  canUseOther: boolean;
  validationError: string | null;
  disabled: boolean;
  onNameChange: (name: string) => void;
  onChooseFood: (food: CatalogFood) => void;
  onUseOther: () => void;
  onChange: (component: ManualFoodComponentDraft) => void;
  onCommit: () => void;
  onCancel: () => void;
};

export function FoodEditor({
  component,
  foods,
  isEditing,
  isLoading,
  isStale,
  errorMessage,
  canUseOther,
  validationError,
  disabled,
  onNameChange,
  onChooseFood,
  onUseOther,
  onChange,
  onCommit,
  onCancel,
}: Props) {
  const selectedFood = foods.find((food) => food.id === component.catalogFoodId) ?? null;
  const portion = component.portion;

  return (
    <View className="gap-4 rounded-summary border border-border/70 bg-card p-4 sm:p-5">
      <View className="gap-1">
        <Text variant="h3">{isEditing ? 'Ubah komponen' : 'Tambah makanan'}</Text>
        <Text variant="caption" className="text-muted-foreground">
          Pilih hasil katalog yang cocok atau simpan nama sebagai Makanan lain.
        </Text>
      </View>

      <FormField
        label="Nama makanan"
        value={component.displayName}
        onChangeText={onNameChange}
        editable={!disabled}
        placeholder="Contoh: nasi goreng, tempe bacem"
        autoCapitalize="sentences"
        returnKeyType="search"
      />

      {isStale ? (
        <Text variant="caption" className="text-muted-foreground">
          Hasil katalog terakhir tersimpan. Periksa koneksi sebelum menyimpan.
        </Text>
      ) : null}
      {errorMessage ? (
        <Text variant="caption" className="text-destructive" accessibilityRole="alert">
          {errorMessage}
        </Text>
      ) : null}
      {isLoading ? (
        <View className="flex-row items-center gap-2 py-1">
          <ActivityIndicator size="small" />
          <Text variant="caption" className="text-muted-foreground">
            Mencari di katalog makanan…
          </Text>
        </View>
      ) : null}

      {foods.length ? (
        <View className="gap-2" accessibilityLabel="Pilihan katalog makanan">
          <Text variant="label" className="text-muted-foreground">
            Hasil pencarian katalog
          </Text>
          {foods.map((food) => {
            const isSelected = component.catalogFoodId === food.id;
            return (
              <Button
                key={`${food.catalogVersion}:${food.id}`}
                variant={isSelected ? 'secondary' : 'outline'}
                className="min-h-12 justify-start py-2.5"
                accessibilityLabel={`Pilih ${food.displayName}${food.preparation ? `, ${food.preparation}` : ''}`}
                accessibilityState={{ selected: isSelected }}
                disabled={disabled}
                onPress={() => onChooseFood(food)}>
                <View className="w-full flex-row items-center justify-between gap-2">
                  <View className="flex-1 items-start gap-0.5">
                    <Text className="font-semibold text-foreground">{food.displayName}</Text>
                    <Text variant="caption" className="text-muted-foreground">
                      {food.preparation ?? 'Cara saji belum ditentukan'} · {food.servings.length}{' '}
                      takaran katalog
                    </Text>
                  </View>
                  {isSelected ? (
                    <View className="h-6 w-6 items-center justify-center rounded-full bg-primary">
                      <Icon as={Check} size={14} className="text-primary-foreground" />
                    </View>
                  ) : null}
                </View>
              </Button>
            );
          })}
        </View>
      ) : null}

      {component.displayName.trim().length >= 2 ? (
        <Button
          variant="outline"
          className="min-h-12 border-dashed border-border"
          disabled={disabled}
          onPress={onUseOther}
          accessibilityLabel={`Simpan ${component.displayName.trim()} sebagai Makanan lain`}>
          <Text>Gunakan sebagai Makanan lain</Text>
        </Button>
      ) : null}

      {selectedFood ? (
        <View className="gap-1.5 rounded-compact bg-carin-olive-soft p-3.5">
          <View className="flex-row items-center gap-1.5">
            <Icon as={Check} size={16} className="text-primary" />
            <Text variant="emphasis" className="text-primary">
              Cocok dengan katalog
            </Text>
          </View>
          <Text className="font-semibold text-foreground">{selectedFood.displayName}</Text>
          {selectedFood.preparation ? (
            <Text variant="caption" className="text-muted-foreground">
              Cara saji: {selectedFood.preparation}
            </Text>
          ) : null}
          <Text variant="caption" className="text-muted-foreground">
            Estimasi gizi dari pilihan ini akan dihitung dan dibekukan oleh server saat disimpan.
          </Text>
        </View>
      ) : component.catalogFoodId ? (
        <View className="gap-1.5 rounded-compact bg-carin-olive-soft p-3.5">
          <Text variant="emphasis" className="text-primary">
            Pilihan katalog tersimpan
          </Text>
          <Text className="font-semibold text-foreground">{component.displayName}</Text>
          <Text variant="caption" className="text-muted-foreground">
            Gizi akan ditampilkan setelah server menghitung catatan ini.
          </Text>
        </View>
      ) : null}

      <View className="gap-3 pt-1">
        <View className="gap-0.5">
          <Text variant="emphasis">Porsi</Text>
          <Text variant="caption" className="text-muted-foreground">
            Pilih takaran yang sesuai dengan porsi yang Anda makan.
          </Text>
        </View>

        <View className="flex-row gap-2">
          <Button
            variant={portion.kind === 'unknown' ? 'secondary' : 'outline'}
            size="sm"
            className="min-h-11 flex-1"
            accessibilityState={{ selected: portion.kind === 'unknown' }}
            disabled={disabled}
            onPress={() => onChange({ ...component, portion: { kind: 'unknown' } })}>
            <Text>Tidak tahu</Text>
          </Button>

          <Button
            variant={portion.kind === 'known' && portion.unit === 'g' ? 'secondary' : 'outline'}
            size="sm"
            className="min-h-11 flex-1"
            accessibilityState={{ selected: portion.kind === 'known' && portion.unit === 'g' }}
            disabled={disabled}
            onPress={() =>
              onChange({
                ...component,
                portion: {
                  kind: 'known',
                  quantity: portion.kind === 'known' ? portion.quantity : '',
                  unit: 'g',
                },
              })
            }>
            <Text>Gram (g)</Text>
          </Button>

          {selectedFood?.servings.length ? (
            <Button
              variant={
                portion.kind === 'known' && portion.unit === 'serving' ? 'secondary' : 'outline'
              }
              size="sm"
              className="min-h-11 flex-1"
              accessibilityState={{
                selected: portion.kind === 'known' && portion.unit === 'serving',
              }}
              disabled={disabled}
              onPress={() => {
                const servingId =
                  (portion.kind === 'known' &&
                    portion.unit === 'serving' &&
                    portion.servingId) ||
                  selectedFood.servings[0]?.id;
                if (servingId) {
                  onChange({
                    ...component,
                    portion: {
                      kind: 'known',
                      quantity: (portion.kind === 'known' && portion.quantity) || '1',
                      unit: 'serving',
                      servingId,
                    },
                  });
                }
              }}>
              <Text>Takaran</Text>
            </Button>
          ) : null}
        </View>

        {portion.kind === 'known' ? (
          <View className="gap-3 pt-1">
            <FormField
              label={portion.unit === 'g' ? 'Jumlah porsi (g)' : 'Jumlah takaran'}
              unit={portion.unit === 'g' ? 'g' : undefined}
              value={portion.quantity}
              onChangeText={(quantity) =>
                onChange({ ...component, portion: { ...portion, quantity } })
              }
              editable={!disabled}
              placeholder={portion.unit === 'g' ? 'Contoh: 125,5' : 'Contoh: 1'}
              keyboardType="decimal-pad"
            />

            {portion.unit === 'serving' && selectedFood ? (
              <View className="gap-2">
                <Text variant="caption" className="text-muted-foreground">
                  Pilih takaran yang cocok:
                </Text>
                {selectedFood.servings.map((serving) => (
                  <Button
                    key={serving.id}
                    variant={portion.servingId === serving.id ? 'secondary' : 'outline'}
                    className="min-h-12 justify-start py-2.5"
                    accessibilityState={{ selected: portion.servingId === serving.id }}
                    disabled={disabled}
                    onPress={() =>
                      onChange({ ...component, portion: { ...portion, servingId: serving.id } })
                    }>
                    <View className="w-full flex-row items-center justify-between">
                      <Text className="font-medium text-foreground">{serving.label}</Text>
                      <Text variant="caption" className="text-muted-foreground">
                        {formatNutrient(serving.grams, 'g')}
                      </Text>
                    </View>
                  </Button>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {validationError ? (
        <Text className="text-sm font-medium text-destructive" accessibilityRole="alert">
          {validationError}
        </Text>
      ) : null}

      <View className="flex-row gap-3 pt-2">
        <Button
          variant="tactile"
          className="min-h-12 flex-1"
          disabled={disabled}
          onPress={onCommit}>
          <Text>{isEditing ? 'Simpan komponen' : 'Tambah komponen'}</Text>
        </Button>
        <Button variant="outline" className="min-h-12" disabled={disabled} onPress={onCancel}>
          <Text>Batal</Text>
        </Button>
      </View>
    </View>
  );
}
