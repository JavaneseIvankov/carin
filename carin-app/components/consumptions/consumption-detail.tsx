import { BackButton } from '@/components/app/back-button';
import { AnalysisDisclosure } from '@/components/food/analysis-result-content';
import { PhotoThumbnail } from '@/components/food/photo-thumbnail';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useAppRead } from '@/lib/api/query';
import { getConsumptionDetailPresentation } from '@/lib/consumptions/attention-presentation';
import {
  formatLocalDateTime,
  formatNutrient,
  type ManualConsumption,
} from '@/lib/consumptions/consumption';
import {
  Camera,
  ClipboardPlus,
  Info,
  Pencil,
  RefreshCw,
  Trash2,
  Utensils,
} from 'lucide-react-native';
import { ActivityIndicator, ScrollView, View, useWindowDimensions } from 'react-native';

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

type Nutrient = ReturnType<typeof getConsumptionDetailPresentation>['nutrients'][number];

function NutrientValue({
  nutrient,
  prominent = false,
}: {
  nutrient: Nutrient;
  prominent?: boolean;
}) {
  return (
    <View className="min-w-0 shrink gap-1">
      <Text variant={prominent ? 'metric' : 'emphasis'}>{nutrient.value}</Text>
      {nutrient.isPartial ? (
        <Text variant="caption" className="text-muted-foreground">
          Mencakup {nutrient.coverage}
        </Text>
      ) : null}
    </View>
  );
}

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
  const { width, fontScale } = useWindowDimensions();
  const stackRows = width < 360 || fontScale > 1.2;
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
      : presentation.components.length > 1
        ? presentation.components.length + ' makanan'
        : 'Catatan makan';
  const energy = presentation.nutrients.find((nutrient) => nutrient.key === 'energyKcal');
  const macros = presentation.nutrients.filter((nutrient) =>
    ['carbohydrateG', 'proteinG', 'fatG'].includes(nutrient.key)
  );
  const hasMissingNutrition = presentation.nutrients.some(
    (nutrient) => nutrient.isPartial || consumption.snapshot.totals[nutrient.key] === null
  );
  const personalNote =
    consumption.attentionState === 'pending'
      ? 'Pertimbangan kesehatan sedang diproses.'
      : presentation.attention.available &&
          consumption.snapshot.overallAttention !== 'insufficient_information'
        ? consumption.snapshot.overallAttention === 'needs_attention'
          ? 'Ada hal yang perlu diperhatikan.'
          : 'Pertimbangan ini berdasarkan data yang tersedia.'
        : 'Pertimbangan kesehatan personal belum tersedia.';

  return (
    <ScrollView
      contentContainerClassName="gap-5 px-5 pb-12 pt-3"
      showsVerticalScrollIndicator={false}>
      <View className="gap-5">
        <View className="flex-row items-center justify-between">
          <BackButton onPress={onBack} />
          <Button
            variant="ghost"
            size="icon"
            onPress={onRefresh}
            disabled={isDeleting}
            accessibilityLabel="Muat ulang catatan konsumsi">
            <Icon as={RefreshCw} size={20} className="text-muted-foreground" />
          </Button>
        </View>
        <Text variant="h1">Detail konsumsi</Text>
      </View>

      {isStale ? (
        <View className="gap-1 rounded-control bg-carin-butter/60 p-3">
          <Text>Menampilkan catatan terakhir tersimpan.</Text>
          <Text variant="muted">Muat ulang saat terhubung ke internet.</Text>
        </View>
      ) : null}

      <View className="flex-row items-start gap-4">
        {consumption.source === 'photo_confirmation' ? (
          <PhotoThumbnail
            photoId={sourceScanQuery.data?.data.photoId ?? null}
            className="h-20 w-20"
            accessibilityLabel="Foto makanan yang dicatat"
            fallbackLabel={
              presentation.source.photoDeleted
                ? 'Foto dihapus'
                : sourceScanQuery.isPending
                  ? 'Memuat foto'
                  : 'Foto tidak tersedia'
            }
          />
        ) : (
          <View className="h-20 w-20 items-center justify-center rounded-compact bg-carin-butter/60">
            <Icon as={Utensils} size={24} className="text-primary" />
          </View>
        )}
        <View className="min-w-0 flex-1 gap-2">
          <Text variant="h2">{foodTitle}</Text>
          <View className="flex-row items-center gap-1.5 self-start rounded-control bg-carin-olive-soft px-2.5 py-1">
            <Icon
              as={consumption.source === 'photo_confirmation' ? Camera : ClipboardPlus}
              size={14}
              className="text-primary"
            />
            <Text variant="label" className="text-primary">
              {consumption.source === 'photo_confirmation' ? 'Dari foto' : 'Dicatat manual'}
            </Text>
          </View>
          <Text variant="caption" className="text-muted-foreground">
            Dimakan {localTime.date} · {localTime.time}
          </Text>
        </View>
      </View>

      <View className="gap-2">
        <Text variant="h2">Makanan &amp; porsi</Text>
        {presentation.components.map((component) => (
          <View
            key={component.id}
            className={
              stackRows
                ? 'gap-1 border-b border-border/60 py-3'
                : 'flex-row items-baseline justify-between gap-4 border-b border-border/60 py-3'
            }>
            <Text className={stackRows ? 'font-semibold' : 'min-w-0 flex-1 font-semibold'}>
              {component.name}
            </Text>
            <View className={stackRows ? 'gap-0.5' : 'max-w-[45%] items-end gap-0.5'}>
              <Text className="text-muted-foreground">{component.portion}</Text>
              {consumption.snapshot.components.find((item) => item.id === component.id)?.portion
                .unit === 'serving' && component.grams !== null ? (
                <Text variant="caption" className="text-muted-foreground">
                  {formatNutrient(component.grams, 'g')}
                </Text>
              ) : null}
            </View>
          </View>
        ))}
        {presentation.components.length === 0 ? (
          <Text variant="muted">Makanan dan porsi belum tersedia.</Text>
        ) : null}
        {consumption.source === 'manual' ? (
          <Button
            variant="ghost"
            className="mt-1 self-start px-0"
            disabled={isDeleting}
            onPress={onEdit}>
            <Icon as={Pencil} size={16} className="text-primary" />
            <Text className="text-primary">Ubah catatan</Text>
          </Button>
        ) : null}
      </View>

      <View className="gap-5 rounded-summary bg-card p-5">
        <View className="gap-3">
          <Text variant="h2">
            {presentation.hasVisualEstimates ? 'Estimasi gizi' : 'Gizi tercatat'}
          </Text>
          {energy ? (
            <View className="gap-1">
              <Text variant="caption" className="text-muted-foreground">
                Energi
              </Text>
              <NutrientValue nutrient={energy} prominent />
            </View>
          ) : null}
        </View>
        <View
          className={
            stackRows
              ? 'gap-3 border-t border-border pt-4'
              : 'flex-row gap-4 border-t border-border pt-4'
          }>
          {macros.map((nutrient) => (
            <View
              key={nutrient.key}
              className={
                stackRows ? 'flex-row items-start justify-between gap-4' : 'min-w-0 flex-1 gap-1.5'
              }>
              <Text variant="caption" className="text-muted-foreground">
                {nutrient.label}
              </Text>
              <NutrientValue nutrient={nutrient} />
            </View>
          ))}
        </View>
        <Text variant="caption" className="text-muted-foreground">
          {presentation.dataLabel}. Sesuai porsi yang kamu catat.
        </Text>
        <AnalysisDisclosure title="Lihat rincian gizi">
          {presentation.nutrients.map((nutrient) => (
            <View key={nutrient.key} className="gap-1 border-b border-border/60 pb-3">
              <View className="flex-row flex-wrap justify-between gap-2">
                <Text className="font-semibold">{nutrient.label}</Text>
                <Text>{nutrient.value}</Text>
              </View>
              <Text variant="caption" className="text-muted-foreground">
                Mencakup {nutrient.coverage}
              </Text>
              <Text variant="caption" className="text-muted-foreground">
                {nutrient.sourceLabel}
              </Text>
              {nutrient.sources.length ? (
                <Text variant="caption" className="text-muted-foreground">
                  {nutrient.sources.join(', ')}
                </Text>
              ) : null}
            </View>
          ))}
        </AnalysisDisclosure>
      </View>

      <View className="gap-2 rounded-compact bg-carin-olive-soft/50 p-4">
        <View className="flex-row items-center gap-2">
          <Icon as={Info} size={18} className="text-foreground" />
          <Text variant="h2" className="flex-1 text-base">
            Yang perlu diketahui
          </Text>
        </View>
        {consumption.snapshot.dataMode === 'synthetic' ? (
          <Text>Angka gizi memakai data demonstrasi.</Text>
        ) : presentation.hasVisualEstimates ? (
          <Text>Gizi dari foto adalah perkiraan, bukan hasil pengukuran.</Text>
        ) : null}
        {hasMissingNutrition ? (
          <Text>Beberapa nilai gizi belum tersedia secara lengkap.</Text>
        ) : null}
        <View className="flex-row items-start gap-2">
          {consumption.attentionState === 'pending' ? (
            <ActivityIndicator size="small" accessibilityLabel="Memproses pertimbangan kesehatan" />
          ) : null}
          <Text className="flex-1">{personalNote}</Text>
        </View>
        {presentation.attention.available
          ? presentation.attentions.map((attention) => (
              <View key={attention.id} className="gap-1 border-t border-border pt-3">
                <Text className="font-semibold">{attention.reason}</Text>
                {attention.adjustments.map((adjustment, index) => (
                  <Text key={index + ':' + adjustment}>{adjustment}</Text>
                ))}
              </View>
            ))
          : null}
      </View>

      <AnalysisDisclosure title="Tentang catatan ini">
        <View className="gap-1">
          <Text variant="h2">Waktu makan</Text>
          <Text>
            {localTime.date} · {localTime.time} ({consumption.timezone})
          </Text>
          <Text variant="muted">Nilai gizi mengikuti makanan dan porsi saat catatan disimpan.</Text>
          {presentation.source.photoDeleted ? (
            <Text variant="muted">Foto sumber telah dihapus. Catatan makan tetap tersimpan.</Text>
          ) : null}
        </View>
        <View className="gap-3">
          <Text variant="h2">Tentang porsi</Text>
          {presentation.components.map((component) => (
            <View key={component.id} className="gap-1 border-b border-border/60 pb-3">
              <Text className="font-semibold">{component.name}</Text>
              <Text>{component.portion}</Text>
              {component.photoPortionFactor !== null ? (
                <Text variant="muted">
                  {new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(
                    component.photoPortionFactor
                  )}{' '}
                  porsi dari foto
                  {component.photoSourceGrams !== null
                    ? ' dengan porsi awal ' + formatNutrient(component.photoSourceGrams, 'g')
                    : ''}
                </Text>
              ) : null}
              {component.portionBasis ? (
                <Text variant="muted">{component.portionBasis}</Text>
              ) : null}
              <Text variant="caption" className="text-muted-foreground">
                {component.nutritionLabel}
              </Text>
            </View>
          ))}
        </View>
        {presentation.limitations.length ? (
          <View className="gap-2">
            <Text variant="h2">Batas informasi</Text>
            {presentation.limitations.map((limitation, index) => (
              <Text key={index + ':' + limitation} variant="muted">
                {limitation}
              </Text>
            ))}
          </View>
        ) : null}
        {presentation.attention.available
          ? presentation.attentions.map((attention) =>
              attention.limitations.length ? (
                <View key={attention.id} className="gap-2">
                  <Text className="font-semibold">{attention.reason}</Text>
                  {attention.limitations.map((limitation, index) => (
                    <Text key={index + ':' + limitation} variant="muted">
                      {limitation}
                    </Text>
                  ))}
                </View>
              ) : null
            )
          : null}
        <View className="gap-2">
          <Text variant="h2">Sumber gizi</Text>
          {presentation.sources.length ? (
            presentation.sources.map((source) => (
              <Text key={source.id} variant="muted">
                {source.title}
              </Text>
            ))
          ) : (
            <Text variant="muted">Sumber gizi belum tersedia.</Text>
          )}
        </View>
        <Text variant="muted">
          Informasi ini bukan diagnosis medis atau jaminan keamanan makanan.
        </Text>
      </AnalysisDisclosure>

      {!deleteConfirmation ? (
        <Button
          variant="ghost"
          className="self-start px-0"
          onPress={onRequestDelete}
          disabled={isDeleting}
          accessibilityLabel="Hapus catatan konsumsi">
          <Icon as={Trash2} size={16} className="text-destructive" />
          <Text className="text-destructive">Hapus catatan</Text>
        </Button>
      ) : (
        <View className="gap-3 rounded-summary border border-destructive/40 bg-destructive/10 p-4">
          <Text variant="h2" className="text-destructive">
            Hapus catatan ini?
          </Text>
          <Text variant="muted">Catatan ini akan dikeluarkan dari ringkasan konsumsi.</Text>
          {deleteError ? (
            <Text className="text-destructive" accessibilityRole="alert">
              {deleteError}
            </Text>
          ) : null}
          <View className="flex-row flex-wrap gap-3">
            <Button
              variant="outline"
              className="flex-1"
              disabled={isDeleting}
              onPress={onCancelDelete}>
              <Text>Batal</Text>
            </Button>
            <Button
              variant="destructive"
              tactile
              className="flex-1"
              disabled={isDeleting}
              onPress={onConfirmDelete}>
              {isDeleting ? <ActivityIndicator accessibilityLabel="Menghapus catatan" /> : null}
              <Text>{isDeleting ? 'Menghapus…' : 'Ya, hapus'}</Text>
            </Button>
          </View>
        </View>
      )}
    </ScrollView>
  );
}
