import { FormField } from '@/components/app/form-field';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import {
  formatNutrient,
  type CatalogFood,
  type ManualFoodComponentDraft,
} from '@/lib/consumptions/consumption';
import { View } from 'react-native';

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
    <View className="gap-4 rounded-xl border border-border bg-card p-4">
      <View className="gap-1">
        <Text variant="h4">{isEditing ? 'Ubah komponen' : 'Tambah makanan'}</Text>
        <Text variant="muted">
          Pilih hasil katalog yang cocok atau simpan nama sebagai Makanan lain.
        </Text>
      </View>

      <FormField
        label="Nama makanan"
        value={component.displayName}
        onChangeText={onNameChange}
        editable={!disabled}
        placeholder="Contoh: nasi goreng"
        autoCapitalize="sentences"
        returnKeyType="search"
      />

      {isStale ? (
        <Text variant="muted">
          Hasil katalog terakhir tersimpan. Periksa koneksi sebelum menyimpan.
        </Text>
      ) : null}
      {errorMessage ? <Text accessibilityRole="alert">{errorMessage}</Text> : null}
      {isLoading ? <Text variant="muted">Mencari katalog…</Text> : null}

      {foods.length ? (
        <View className="gap-2" accessibilityLabel="Pilihan katalog makanan">
          {foods.map((food) => (
            <Button
              key={`${food.catalogVersion}:${food.id}`}
              variant={component.catalogFoodId === food.id ? 'secondary' : 'outline'}
              className="min-h-12 justify-start"
              accessibilityLabel={`Pilih ${food.displayName}${food.preparation ? `, ${food.preparation}` : ''}`}
              accessibilityState={{ selected: component.catalogFoodId === food.id }}
              disabled={disabled}
              onPress={() => onChooseFood(food)}>
              <View className="flex-1 items-start gap-1">
                <Text className="font-semibold">{food.displayName}</Text>
                <Text variant="muted">
                  {food.preparation ?? 'Cara saji belum ditentukan'} · {food.servings.length}{' '}
                  takaran katalog
                </Text>
              </View>
            </Button>
          ))}
        </View>
      ) : null}

      {component.displayName.trim() ? (
        <Button
          variant="outline"
          className="min-h-12"
          disabled={disabled || !canUseOther}
          onPress={onUseOther}
          accessibilityLabel={`Simpan ${component.displayName.trim()} sebagai Makanan lain`}>
          <Text>Gunakan sebagai Makanan lain</Text>
        </Button>
      ) : null}
      {component.displayName.trim() && !canUseOther ? (
        <Text variant="muted">Tunggu pencarian katalog selesai sebelum memilih Makanan lain.</Text>
      ) : null}

      {selectedFood ? (
        <View className="gap-1 rounded-lg bg-muted/40 p-3">
          <Text variant="large">Cocok dengan katalog</Text>
          <Text variant="muted">{selectedFood.displayName}</Text>
          {selectedFood.preparation ? (
            <Text variant="muted">Cara saji: {selectedFood.preparation}</Text>
          ) : null}
          <Text variant="muted">
            Estimasi gizi dari pilihan ini akan dihitung dan dibekukan oleh server saat disimpan.
          </Text>
        </View>
      ) : component.catalogFoodId ? (
        <View className="gap-1 rounded-lg bg-muted/40 p-3">
          <Text variant="large">Pilihan katalog tersimpan</Text>
          <Text variant="muted">{component.displayName}</Text>
          <Text variant="muted">Gizi akan ditampilkan setelah server menghitung catatan ini.</Text>
        </View>
      ) : null}

      <View className="gap-2">
        <Text variant="large">Porsi</Text>
        <Button
          variant={portion.kind === 'unknown' ? 'secondary' : 'outline'}
          className="min-h-12"
          accessibilityState={{ selected: portion.kind === 'unknown' }}
          disabled={disabled}
          onPress={() => onChange({ ...component, portion: { kind: 'unknown' } })}>
          <Text>Tidak tahu porsi</Text>
        </Button>

        {portion.kind === 'known' ? (
          <View className="gap-3">
            <View className="flex-row gap-2">
              <Button
                variant={portion.unit === 'g' ? 'secondary' : 'outline'}
                className="min-h-12 flex-1"
                accessibilityState={{ selected: portion.unit === 'g' }}
                disabled={disabled}
                onPress={() =>
                  onChange({
                    ...component,
                    portion: { kind: 'known', quantity: portion.quantity, unit: 'g' },
                  })
                }>
                <Text>Gram</Text>
              </Button>
              {selectedFood?.servings.length ? (
                <Button
                  variant={portion.unit === 'serving' ? 'secondary' : 'outline'}
                  className="min-h-12 flex-1"
                  accessibilityState={{ selected: portion.unit === 'serving' }}
                  disabled={disabled}
                  onPress={() => {
                    const servingId = selectedFood.servings[0]?.id;
                    if (servingId) {
                      onChange({
                        ...component,
                        portion: {
                          kind: 'known',
                          quantity: portion.quantity || '1',
                          unit: 'serving',
                          servingId,
                        },
                      });
                    }
                  }}>
                  <Text>Takaran katalog</Text>
                </Button>
              ) : null}
            </View>

            <FormField
              label={portion.unit === 'g' ? 'Jumlah porsi' : 'Jumlah takaran'}
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
                <Text variant="muted">Pilih takaran yang cocok:</Text>
                {selectedFood.servings.map((serving) => (
                  <Button
                    key={serving.id}
                    variant={portion.servingId === serving.id ? 'secondary' : 'outline'}
                    className="min-h-12 justify-start"
                    accessibilityState={{ selected: portion.servingId === serving.id }}
                    disabled={disabled}
                    onPress={() =>
                      onChange({ ...component, portion: { ...portion, servingId: serving.id } })
                    }>
                    <Text>
                      {serving.label} · {formatNutrient(serving.grams, 'g')}
                    </Text>
                  </Button>
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <View className="flex-row gap-2">
            <Button
              variant="outline"
              className="min-h-12 flex-1"
              disabled={disabled}
              onPress={() =>
                onChange({ ...component, portion: { kind: 'known', quantity: '', unit: 'g' } })
              }>
              <Text>Masukkan gram</Text>
            </Button>
            {selectedFood?.servings.length ? (
              <Button
                variant="outline"
                className="min-h-12 flex-1"
                disabled={disabled}
                onPress={() => {
                  const servingId = selectedFood.servings[0]?.id;
                  if (servingId) {
                    onChange({
                      ...component,
                      portion: { kind: 'known', quantity: '1', unit: 'serving', servingId },
                    });
                  }
                }}>
                <Text>Pilih takaran</Text>
              </Button>
            ) : null}
          </View>
        )}
      </View>

      {validationError ? <Text accessibilityRole="alert">{validationError}</Text> : null}

      <View className="flex-row gap-2">
        <Button className="min-h-12 flex-1" disabled={disabled} onPress={onCommit}>
          <Text>{isEditing ? 'Simpan komponen' : 'Tambah komponen'}</Text>
        </Button>
        <Button variant="ghost" className="min-h-12" disabled={disabled} onPress={onCancel}>
          <Text>Batal</Text>
        </Button>
      </View>
    </View>
  );
}
