import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import {
  formatLocalDateTime,
  formatNutrient,
  type ManualConsumption,
} from '@/lib/consumptions/consumption';
import { getConsumptionDetailPresentation } from '@/lib/consumptions/attention-presentation';
import { ActivityIndicator, ScrollView, View } from 'react-native';

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
  const presentation = getConsumptionDetailPresentation(consumption);
  const localTime = formatLocalDateTime(new Date(consumption.consumedAt), consumption.timezone);

  return (
    <ScrollView contentContainerClassName="gap-5 px-5 pb-10 pt-7">
      <View className="gap-2">
        <Button variant="ghost" className="min-h-12 self-start px-0" onPress={onBack}>
          <Text>Kembali</Text>
        </Button>
        <Text variant="h2">Detail konsumsi</Text>
        <Text variant="muted">
          {presentation.source.label} · Revisi {consumption.revision}
        </Text>
        {presentation.source.photoDeleted ? (
          <Text variant="muted">Foto sumber telah dihapus.</Text>
        ) : null}
        {isStale ? (
          <Text variant="muted">Data terakhir tersimpan ditampilkan. Muat ulang saat online.</Text>
        ) : null}
      </View>

      <View className="gap-2 rounded-xl border border-border bg-card p-4">
        <Text variant="h4">Waktu makan</Text>
        <Text>
          {localTime.date} pukul {localTime.time}
        </Text>
        <Text variant="muted">Zona waktu: {consumption.timezone}</Text>
      </View>

      <View className="gap-3 rounded-xl border border-border bg-card p-4">
        <Text variant="h4">Makanan dan porsi aktual</Text>
        {presentation.components.length ? (
          presentation.components.map((component) => (
            <View key={component.id} className="gap-1 border-t border-border pt-3">
              <Text variant="large">{component.name}</Text>
              <Text>{component.portion}</Text>
              {component.portionBasis ? (
                <Text variant="muted">Dasar porsi: {component.portionBasis}</Text>
              ) : null}
              {component.grams !== null ? (
                <Text variant="muted">{formatNutrient(component.grams, 'g')}</Text>
              ) : null}
              {component.matchStatus !== 'matched' ? (
                <Text variant="muted">Makanan ini belum cocok dengan data katalog.</Text>
              ) : null}
            </View>
          ))
        ) : (
          <Text variant="muted">Komponen makanan belum tersedia.</Text>
        )}
      </View>

      <View className="gap-3 rounded-xl border border-border bg-card p-4">
        <Text variant="h4">Estimasi gizi tersimpan</Text>
        <Text variant="muted">
          {consumption.snapshot.dataMode === 'synthetic'
            ? 'Data sintetis untuk demonstrasi'
            : consumption.snapshot.dataMode === 'unavailable'
              ? 'Gizi belum tersedia dari katalog'
              : 'Snapshot gizi dari katalog'}
        </Text>
        {presentation.nutrients.map((nutrient) => (
          <View
            key={nutrient.key}
            className="flex-row justify-between gap-3 border-t border-border pt-2">
            <View className="flex-1 gap-1">
              <Text>{nutrient.label}</Text>
              <Text variant="muted">Cakupan: {nutrient.coverage}</Text>
            </View>
            <Text className="font-semibold">{nutrient.value}</Text>
          </View>
        ))}
      </View>

      <View className="gap-2 rounded-xl border border-border bg-card p-4">
        <Text variant="h4">Perhatian personal</Text>
        <Text variant="large">{presentation.attention.title}</Text>
        {consumption.attentionState === 'pending' ? (
          <ActivityIndicator accessibilityLabel="Memproses perhatian personal" />
        ) : null}
        <Text variant="muted">{presentation.attention.message}</Text>
        {presentation.attention.available ? (
          <View className="gap-2">
            {presentation.attentions.map((attention) => (
              <View key={attention.id} className="gap-1 border-t border-border pt-3">
                <Text>{attention.reason}</Text>
                {attention.adjustments.map((adjustment, index) => (
                  <Text key={`${index}:${adjustment}`} variant="muted">
                    {adjustment}
                  </Text>
                ))}
                {attention.limitations.map((limitation, index) => (
                  <Text key={`${index}:${limitation}`} variant="muted">
                    {limitation}
                  </Text>
                ))}
              </View>
            ))}
            <Text variant="muted">
              Pertimbangan ini bukan diagnosis atau jaminan keamanan makanan.
            </Text>
          </View>
        ) : null}
      </View>

      {presentation.limitations.length ? (
        <View className="gap-2 rounded-xl border border-border p-4">
          <Text variant="large">Keterbatasan data</Text>
          {presentation.limitations.map((limitation, index) => (
            <Text key={`${index}:${limitation}`} variant="muted">
              {limitation}
            </Text>
          ))}
        </View>
      ) : null}

      {presentation.sources.length ? (
        <View className="gap-2 rounded-xl border border-border p-4">
          <Text variant="large">Sumber data</Text>
          {presentation.sources.map((source) => (
            <Text key={source.id} variant="muted">
              {source.title}
            </Text>
          ))}
        </View>
      ) : null}

      <Button
        variant="outline"
        className="min-h-12"
        onPress={onRefresh}
        accessibilityLabel="Muat ulang catatan konsumsi">
        <Text>Muat ulang</Text>
      </Button>

      {consumption.source === 'manual' ? (
        <Button variant="outline" className="min-h-12" onPress={onEdit}>
          <Text>Ubah catatan</Text>
        </Button>
      ) : null}

      {!deleteConfirmation ? (
        <Button
          variant="destructive"
          className="min-h-12"
          onPress={onRequestDelete}
          accessibilityLabel="Hapus catatan konsumsi">
          <Text>Hapus catatan</Text>
        </Button>
      ) : (
        <View className="gap-3 rounded-xl border border-destructive/40 p-4">
          <Text variant="large">Hapus catatan ini?</Text>
          <Text variant="muted">Catatan ini akan dikeluarkan dari ringkasan konsumsi.</Text>
          {deleteError ? <Text accessibilityRole="alert">{deleteError}</Text> : null}
          <Button
            variant="destructive"
            className="min-h-12"
            disabled={isDeleting}
            onPress={onConfirmDelete}>
            {isDeleting ? <ActivityIndicator color="white" /> : <Text>Ya, hapus catatan</Text>}
          </Button>
          <Button
            variant="ghost"
            className="min-h-12"
            disabled={isDeleting}
            onPress={onCancelDelete}>
            <Text>Batal</Text>
          </Button>
        </View>
      )}
    </ScrollView>
  );
}
