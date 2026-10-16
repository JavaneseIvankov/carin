import { BackButton } from '@/components/app/back-button';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { PhotoThumbnail } from '@/components/food/photo-thumbnail';
import { useAppRead } from '@/lib/api/query';
import { getConsumptionDetailPresentation } from '@/lib/consumptions/attention-presentation';
import {
  formatLocalDateTime,
  formatNutrient,
  type ManualConsumption,
} from '@/lib/consumptions/consumption';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  ClipboardPlus,
  Pencil,
  RefreshCw,
  Sparkles,
  Trash2,
  Utensils,
} from 'lucide-react-native';
import * as React from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

type Props = {
  consumption: ManualConsumption;
  isStale: boolean;
  isDeleting: boolean;
  deleteConfirmation: boolean;
  deleteError: string | null;
  onBack: () => void;
  onEdit: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onRefresh: () => void;
};

export function ConsumptionDetail({
  consumption,
  isStale,
  isDeleting,
  deleteConfirmation,
  deleteError,
  onBack,
  onEdit,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
  onRefresh,
}: Props) {
  const [otherNutrientsExpanded, setOtherNutrientsExpanded] = React.useState(false);
  const presentation = getConsumptionDetailPresentation(consumption);
  const localTime = formatLocalDateTime(new Date(consumption.consumedAt), consumption.timezone);
  const sourceScanQuery = useAppRead(
    'getScan',
    { path: { id: consumption.scanId ?? '' } },
    {
      enabled:
        consumption.source === 'photo_confirmation' &&
        consumption.photoAvailable &&
        !!consumption.scanId,
    }
  );
  const foodTitle =
    presentation.components.length === 1
      ? presentation.components[0]!.name
      : `${presentation.components.length} makanan dicatat`;

  const energy = presentation.nutrients.find((n) => n.key === 'energyKcal');
  const macroKeys = ['carbohydrateG', 'proteinG', 'fatG'];
  const macroNutrients = presentation.nutrients.filter((n) => macroKeys.includes(n.key));
  const otherNutrients = presentation.nutrients.filter(
    (n) => !['energyKcal', ...macroKeys].includes(n.key)
  );

  return (
    <ScrollView
      contentContainerClassName="gap-5 px-5 pb-12 pt-6"
      showsVerticalScrollIndicator={false}>
      {/* Header follows the analysis detail identity and provenance hierarchy. */}
      <View className="gap-3">
        <BackButton onPress={onBack} />

        <View className="flex-row items-start gap-4">
          {consumption.source === 'photo_confirmation' ? (
            <PhotoThumbnail
              photoId={sourceScanQuery.data?.data.photoId ?? null}
              className="h-20 w-20"
              accessibilityLabel="Foto sumber catatan makan"
              fallbackLabel={presentation.source.photoDeleted ? 'Foto dihapus' : 'Memuat foto'}
            />
          ) : (
            <View className="h-20 w-20 items-center justify-center rounded-[16px] border border-border/70 bg-carin-butter/60">
              <Icon as={Utensils} size={22} className="text-primary" />
            </View>
          )}
          <View className="min-w-0 flex-1 gap-1.5">
            <View className="flex-row flex-wrap items-center gap-2">
              <View className="flex-row items-center gap-1.5 rounded-full bg-carin-olive-soft px-3 py-1">
                <Icon
                  as={consumption.source === 'photo_confirmation' ? Camera : ClipboardPlus}
                  size={14}
                  className="text-primary"
                />
                <Text variant="caption" className="font-semibold text-primary">
                  {presentation.source.label}
                </Text>
              </View>
              <View className="rounded-full bg-muted px-2.5 py-1">
                <Text variant="caption" className="text-muted-foreground">
                  Revisi {consumption.revision}
                </Text>
              </View>
            </View>
            <Text variant="h2">{foodTitle || 'Catatan makan'}</Text>
            <Text variant="caption" className="text-muted-foreground">
              Dimakan {localTime.date} · {localTime.time} ({consumption.timezone})
            </Text>
            {presentation.source.photoDeleted ? (
              <Text variant="caption" className="text-muted-foreground">
                Foto sumber telah dihapus.
              </Text>
            ) : null}
          </View>
        </View>

        {isStale ? (
          <View className="mt-1 rounded-control bg-carin-butter/60 px-3 py-2">
            <Text variant="caption" className="text-foreground">
              Data terakhir tersimpan ditampilkan. Muat ulang saat online.
            </Text>
          </View>
        ) : null}
      </View>

      {/* Hero Summary Card: Energy & Macros */}
      <View className="gap-4 rounded-summary border border-border/70 bg-card p-4 sm:p-5">
        <View className="gap-0.5">
          <Text variant="h3">Gizi untuk porsi ini</Text>
          <Text variant="caption" className="text-muted-foreground">
            {presentation.dataLabel}
          </Text>
        </View>

        {energy ? (
          <View className="gap-1 pb-1">
            <Text variant="label" className="text-muted-foreground">
              Energi tercatat
            </Text>
            <View className="flex-row items-baseline gap-1.5">
              {energy.value === 'Belum tersedia' ? (
                <Text className="text-2xl font-bold tracking-tight text-foreground">
                  Belum tersedia
                </Text>
              ) : (
                <>
                  <Text className="text-[44px] font-bold leading-none tracking-tight text-foreground">
                    {energy.value.replace(/ kkal$/, '')}
                  </Text>
                  <Text className="text-base font-semibold text-muted-foreground">kkal</Text>
                </>
              )}
            </View>
            <Text variant="caption" className="text-muted-foreground">
              Cakupan {energy.coverage}
            </Text>
            {energy.sourceLabel === 'Estimasi visual VLM' ||
            energy.sourceLabel === 'Gabungan katalog dan estimasi visual VLM' ? (
              <Text variant="caption" className="text-muted-foreground">
                {energy.sourceLabel}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* 3-column macro cards */}
        <View className="flex-row gap-2">
          {macroNutrients.map((macro) => (
            <View key={macro.key} className="flex-1 gap-1 rounded-[14px] bg-carin-olive-soft p-2.5">
              <Text className="text-[11px] font-medium leading-tight text-muted-foreground">
                {macro.label}
              </Text>
              <Text className="text-[18px] font-bold leading-tight text-foreground">
                {macro.value}
              </Text>
              <Text className="text-[11px] leading-tight text-muted-foreground">
                {macro.coverage}
              </Text>
              {macro.sourceLabel.includes('visual VLM') ? (
                <Text className="text-[10px] leading-tight text-muted-foreground">
                  {macro.sourceLabel}
                </Text>
              ) : null}
            </View>
          ))}
        </View>

        {/* Collapsible micro nutrients */}
        {otherNutrients.length > 0 ? (
          <View className="gap-2 border-t border-border/70 pt-2">
            <Pressable
              className="min-h-11 flex-row items-center justify-between py-1"
              accessibilityRole="button"
              accessibilityLabel="Zat gizi lainnya: serat, gula, dan natrium"
              accessibilityState={{ expanded: otherNutrientsExpanded }}
              onPress={() => setOtherNutrientsExpanded((prev) => !prev)}>
              <Text className="text-sm font-medium text-foreground">Serat, gula, dan natrium</Text>
              <Icon
                as={otherNutrientsExpanded ? ChevronUp : ChevronDown}
                size={18}
                className="text-muted-foreground"
              />
            </Pressable>

            {otherNutrientsExpanded ? (
              <View className="gap-1 pb-1">
                {otherNutrients.map((item) => (
                  <View
                    key={item.key}
                    className="min-h-11 flex-row items-center justify-between gap-3 border-t border-border/50 py-2">
                    <View className="flex-1 gap-0.5">
                      <Text variant="label">{item.label}</Text>
                      <Text variant="caption" className="text-muted-foreground">
                        Cakupan {item.coverage}
                      </Text>
                      {item.sourceLabel.includes('visual VLM') ? (
                        <Text variant="caption" className="text-muted-foreground">
                          {item.sourceLabel}
                        </Text>
                      ) : null}
                    </View>
                    <Text className="font-semibold text-foreground">{item.value}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Component Breakdown List */}
      <View className="gap-3 rounded-summary border border-border/70 bg-card p-4 sm:p-5">
        <View className="flex-row items-center justify-between">
          <Text variant="h3">Yang dicatat dimakan</Text>
          <View className="rounded-full bg-carin-olive-soft px-2.5 py-0.5">
            <Text variant="caption" className="font-medium text-primary">
              {presentation.components.length} komponen
            </Text>
          </View>
        </View>

        {presentation.components.length ? (
          <View className="gap-2.5 pt-1">
            {presentation.components.map((component) => (
              <View key={component.id} className="gap-1.5 rounded-compact bg-muted/40 p-3.5">
                <View className="flex-row items-start justify-between gap-2">
                  <Text variant="emphasis" className="flex-1 text-foreground">
                    {component.name}
                  </Text>
                  <View className="rounded-full border border-border/60 bg-card px-2.5 py-0.5">
                    <Text variant="caption" className="font-semibold text-foreground">
                      {component.portion}
                    </Text>
                  </View>
                </View>

                {component.grams !== null ? (
                  <Text variant="caption" className="text-muted-foreground">
                    Bobot terhitung: {formatNutrient(component.grams, 'g')}
                  </Text>
                ) : null}

                {component.photoPortionFactor !== null ? (
                  <Text variant="caption" className="text-muted-foreground">
                    Porsi estimasi foto ×{' '}
                    {new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(
                      component.photoPortionFactor
                    )}
                    {component.photoSourceGrams !== null
                      ? ` · sumber ${formatNutrient(component.photoSourceGrams, 'g')}`
                      : ''}
                  </Text>
                ) : null}

                {component.portionBasis ? (
                  <Text variant="caption" className="text-muted-foreground">
                    Dasar porsi: {component.portionBasis}
                  </Text>
                ) : null}

                {component.matchStatus !== 'matched' ? (
                  <View className="mt-0.5 self-start rounded-md bg-carin-butter/60 px-2 py-0.5">
                    <Text variant="caption" className="text-foreground">
                      Makanan lain · belum cocok dengan katalog
                    </Text>
                  </View>
                ) : null}
                {component.nutritionLabel === 'Estimasi visual VLM' ? (
                  <Text variant="caption" className="text-muted-foreground">
                    {component.nutritionLabel}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <Text variant="muted">Komponen makanan belum tersedia.</Text>
        )}
      </View>

      {/* Attention Card */}
      <View className="gap-3 rounded-summary border border-border/70 bg-card p-4 sm:p-5">
        <View className="flex-row items-center gap-2">
          <View className="h-7 w-7 items-center justify-center rounded-full bg-carin-butter">
            <Icon as={Sparkles} size={15} className="text-primary" />
          </View>
          <Text variant="h3">Perhatian personal</Text>
        </View>

        <Text variant="large" className="font-semibold text-foreground">
          {presentation.attention.title}
        </Text>

        {consumption.attentionState === 'pending' ? (
          <View className="flex-row items-center gap-2 py-1">
            <ActivityIndicator size="small" accessibilityLabel="Memproses perhatian personal" />
            <Text variant="caption" className="text-muted-foreground">
              Memproses perhatian personal…
            </Text>
          </View>
        ) : null}

        <Text className="text-muted-foreground">{presentation.attention.message}</Text>

        {presentation.attention.available ? (
          <View className="gap-3 pt-1">
            {presentation.attentions.map((attention) => (
              <View
                key={attention.id}
                className="gap-2 rounded-compact border border-border/50 bg-carin-olive-soft/40 p-3.5">
                <Text className="font-semibold text-foreground">{attention.reason}</Text>
                {attention.adjustments.length > 0 ? (
                  <View className="gap-1">
                    <Text variant="label" className="text-muted-foreground">
                      Saran penyesuaian:
                    </Text>
                    {attention.adjustments.map((adjustment, index) => (
                      <Text
                        key={`${index}:${adjustment}`}
                        variant="caption"
                        className="text-foreground">
                        • {adjustment}
                      </Text>
                    ))}
                  </View>
                ) : null}
                {attention.limitations.length > 0 ? (
                  <View className="gap-1">
                    <Text variant="label" className="text-muted-foreground">
                      Catatan pertimbangan:
                    </Text>
                    {attention.limitations.map((limitation, index) => (
                      <Text
                        key={`${index}:${limitation}`}
                        variant="caption"
                        className="text-muted-foreground">
                        • {limitation}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
            <View className="rounded-control bg-muted/50 p-2.5">
              <Text variant="caption" className="text-muted-foreground">
                Pertimbangan ini bukan diagnosis atau jaminan keamanan makanan.
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* Limitations Card */}
      {presentation.limitations.length ? (
        <View className="gap-2 rounded-summary border border-border/70 bg-card p-4 sm:p-5">
          <Text variant="emphasis">Keterbatasan data</Text>
          <View className="gap-1">
            {presentation.limitations.map((limitation, index) => (
              <Text
                key={`${index}:${limitation}`}
                variant="caption"
                className="text-muted-foreground">
                • {limitation}
              </Text>
            ))}
          </View>
        </View>
      ) : null}

      {/* Sources Card */}
      {presentation.sources.length ? (
        <View className="gap-2 rounded-summary border border-border/70 bg-card p-4 sm:p-5">
          <Text variant="emphasis">Sumber data</Text>
          <View className="gap-1">
            {presentation.sources.map((source) => (
              <Text key={source.id} variant="caption" className="text-muted-foreground">
                • {source.title}
              </Text>
            ))}
          </View>
        </View>
      ) : null}

      {/* Actions */}
      <View className="gap-3 pt-1">
        {consumption.source === 'manual' ? (
          <Button
            variant="tactile"
            className="min-h-12 w-full flex-row items-center justify-center gap-2"
            onPress={onEdit}>
            <Icon as={Pencil} size={16} className="text-primary-foreground" />
            <Text>Ubah catatan</Text>
          </Button>
        ) : null}

        <Button
          variant="outline"
          className="min-h-12 w-full flex-row items-center justify-center gap-2"
          onPress={onRefresh}
          accessibilityLabel="Muat ulang catatan konsumsi">
          <Icon as={RefreshCw} size={16} className="text-foreground" />
          <Text>Muat ulang</Text>
        </Button>

        {!deleteConfirmation ? (
          <Button
            variant="ghost"
            className="min-h-12 w-full flex-row items-center justify-center gap-2 text-destructive"
            onPress={onRequestDelete}
            accessibilityLabel="Hapus catatan konsumsi">
            <Icon as={Trash2} size={16} className="text-destructive" />
            <Text className="text-destructive">Hapus catatan</Text>
          </Button>
        ) : (
          <View className="gap-3 rounded-summary border border-destructive/40 bg-destructive/10 p-4 sm:p-5">
            <View className="gap-1">
              <Text variant="h3" className="text-destructive">
                Hapus catatan ini?
              </Text>
              <Text variant="caption" className="text-muted-foreground">
                Catatan ini akan dikeluarkan dari ringkasan konsumsi.
              </Text>
            </View>
            {deleteError ? (
              <Text className="text-sm font-medium text-destructive" accessibilityRole="alert">
                {deleteError}
              </Text>
            ) : null}
            <View className="flex-row gap-3 pt-1">
              <Button
                variant="destructive"
                tactile
                className="min-h-12 flex-1"
                disabled={isDeleting}
                onPress={onConfirmDelete}>
                {isDeleting ? <ActivityIndicator color="white" /> : <Text>Ya, hapus</Text>}
              </Button>
              <Button
                variant="outline"
                className="min-h-12"
                disabled={isDeleting}
                onPress={onCancelDelete}>
                <Text>Batal</Text>
              </Button>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
