import { FormField } from '@/components/app/form-field';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import {
  formatNutrient,
  parsePortionQuantity,
  type CatalogFood,
  type ManualFoodComponentDraft,
} from '@/lib/consumptions/consumption';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react-native';
import * as React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

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
  showCardWrapper?: boolean;
  showFooterButtons?: boolean;
  onNameChange: (name: string) => void;
  onChooseFood: (food: CatalogFood) => void;
  onUseOther: () => void;
  onChange: (component: ManualFoodComponentDraft) => void;
  onCommit?: () => void;
  onCancel?: () => void;
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
  showCardWrapper = false,
  showFooterButtons = false,
  onNameChange,
  onChooseFood,
  onUseOther,
  onChange,
  onCommit,
  onCancel,
}: Props) {
  const selectedFood = foods.find((food) => food.id === component.catalogFoodId) ?? null;
  const portion = component.portion;

  const content = (
    <>
      {showCardWrapper ? (
        <View className="gap-1">
          <Text variant="h3">{isEditing ? 'Ubah komponen' : 'Tambah makanan'}</Text>
          <Text variant="caption" className="text-muted-foreground">
            Pilih hasil katalog yang cocok atau simpan nama sebagai Makanan lain.
          </Text>
        </View>
      ) : null}

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
                  quantity:
                    portion.kind === 'known' && portion.unit === 'g' && portion.quantity
                      ? portion.quantity
                      : '100',
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
                  (portion.kind === 'known' && portion.unit === 'serving' && portion.servingId) ||
                  selectedFood.servings[0]?.id;
                if (servingId) {
                  onChange({
                    ...component,
                    portion: {
                      kind: 'known',
                      quantity:
                        portion.kind === 'known' && portion.unit === 'serving' && portion.quantity
                          ? portion.quantity
                          : '1',
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

        {component.photoEstimated &&
        component.catalogFoodId === null &&
        (component.photoSourceGrams === null ||
          component.photoSourceGrams === undefined ||
          portion.kind === 'unknown' ||
          portion.unit !== 'g') ? (
          <View className="gap-2 rounded-compact bg-carin-olive-soft/50 p-3.5">
            <FormField
              label="Porsi dibanding foto"
              hint="1 = porsi di foto · 0,5 = setengah · 2 = dua kali"
              unit="×"
              unitBadge
              keyboardType="decimal-pad"
              value={component.photoPortionFraction ?? '1'}
              onChangeText={(photoPortionFraction) =>
                onChange({ ...component, photoPortionFraction })
              }
              editable={!disabled}
              placeholder="Contoh: 1"
            />
            <Text variant="caption" className="text-muted-foreground">
              Nilai gizi visual akan diskalakan dari porsi foto yang dipilih.
            </Text>
          </View>
        ) : component.photoEstimated &&
          component.photoSourceGrams !== null &&
          component.photoSourceGrams !== undefined ? (
          <Text variant="caption" className="text-muted-foreground">
            Estimasi visual diskalakan dari {component.photoSourceGrams} g sesuai gram yang dicatat.
          </Text>
        ) : null}

        {portion.kind === 'known' && portion.unit === 'serving' ? (
          <View className="gap-3 pt-1">
            <View className="flex-row items-end gap-3">
              <View className="flex-1">
                <FormField
                  label="Jumlah takaran porsi"
                  unit="porsi"
                  unitBadge
                  keyboardType="decimal-pad"
                  value={portion.quantity}
                  onChangeText={(quantity) =>
                    onChange({ ...component, portion: { ...portion, quantity } })
                  }
                  editable={!disabled}
                  placeholder="Contoh: 1"
                />
              </View>
              {/* Steppers [-] and [+] */}
              <View className="flex-row items-center gap-1.5 pb-0.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    disabled ||
                    (() => {
                      const p = parsePortionQuantity(portion.quantity);
                      return 'value' in p && p.value <= 0.25;
                    })()
                  }
                  onPress={() => {
                    const parsed = parsePortionQuantity(portion.quantity);
                    const curr = 'value' in parsed ? parsed.value : 1;
                    const next = Math.max(0.25, Math.round((curr - 0.25) * 100) / 100);
                    onChange({ ...component, portion: { ...portion, quantity: String(next) } });
                  }}
                  accessibilityLabel="Kurangi porsi 0.25"
                  className="h-12 w-12 items-center justify-center rounded-control p-0">
                  <Text className="text-xl font-bold text-foreground">−</Text>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onPress={() => {
                    const parsed = parsePortionQuantity(portion.quantity);
                    const curr = 'value' in parsed ? parsed.value : 0;
                    const next = Math.round((curr + 0.25) * 100) / 100;
                    onChange({ ...component, portion: { ...portion, quantity: String(next) } });
                  }}
                  accessibilityLabel="Tambah porsi 0.25"
                  className="h-12 w-12 items-center justify-center rounded-control p-0">
                  <Text className="text-xl font-bold text-foreground">+</Text>
                </Button>
              </View>
            </View>

            {/* Quick multiplier chips */}
            <View className="flex-row flex-wrap items-center gap-2">
              {['0.5', '1', '1.5', '2'].map((val) => {
                const isSelected = portion.quantity === val;
                return (
                  <Pressable
                    key={val}
                    onPress={() =>
                      onChange({ ...component, portion: { ...portion, quantity: val } })
                    }
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

            {selectedFood?.servings.length ? (
              <View className="gap-2 pt-1">
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
        ) : portion.kind === 'known' && portion.unit === 'g' ? (
          <View className="gap-3 pt-1">
            <View className="flex-row items-end gap-3">
              <View className="flex-1">
                <FormField
                  label="Jumlah porsi (g)"
                  unit="g"
                  unitBadge
                  keyboardType="decimal-pad"
                  value={portion.quantity}
                  onChangeText={(quantity) =>
                    onChange({ ...component, portion: { ...portion, quantity } })
                  }
                  editable={!disabled}
                  placeholder="Contoh: 100"
                />
              </View>
              {/* Steppers [-25g] and [+25g] */}
              <View className="flex-row items-center gap-1.5 pb-0.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    disabled ||
                    (() => {
                      const p = parsePortionQuantity(portion.quantity);
                      return 'value' in p && p.value <= 25;
                    })()
                  }
                  onPress={() => {
                    const parsed = parsePortionQuantity(portion.quantity);
                    const curr = 'value' in parsed ? parsed.value : 100;
                    const next = Math.max(25, Math.round(curr - 25));
                    onChange({ ...component, portion: { ...portion, quantity: String(next) } });
                  }}
                  accessibilityLabel="Kurangi 25 gram"
                  className="h-12 items-center justify-center rounded-control px-3">
                  <Text className="text-sm font-bold text-foreground">−25g</Text>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onPress={() => {
                    const parsed = parsePortionQuantity(portion.quantity);
                    const curr = 'value' in parsed ? parsed.value : 0;
                    const next = Math.round(curr + 25);
                    onChange({ ...component, portion: { ...portion, quantity: String(next) } });
                  }}
                  accessibilityLabel="Tambah 25 gram"
                  className="h-12 items-center justify-center rounded-control px-3">
                  <Text className="text-sm font-bold text-foreground">+25g</Text>
                </Button>
              </View>
            </View>

            {/* Quick gram chips */}
            <View className="flex-row flex-wrap items-center gap-2">
              {['50', '100', '150', '200', '250'].map((val) => {
                const isSelected = portion.quantity === val;
                return (
                  <Pressable
                    key={val}
                    onPress={() =>
                      onChange({ ...component, portion: { ...portion, quantity: val } })
                    }
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
      </View>

      {validationError ? (
        <Text className="text-sm font-medium text-destructive" accessibilityRole="alert">
          {validationError}
        </Text>
      ) : null}

      {showFooterButtons && onCommit && onCancel ? (
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
      ) : null}
    </>
  );

  if (showCardWrapper) {
    return (
      <View className="gap-4 rounded-summary border border-border/70 bg-card p-4 sm:p-5">
        {content}
      </View>
    );
  }

  return <View className="gap-4">{content}</View>;
}
