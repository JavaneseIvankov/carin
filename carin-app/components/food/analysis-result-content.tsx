import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { getAnalysisPresentation } from '@/lib/food/analysis-presentation';
import { ChevronDown, ChevronUp, Edit3, Info } from 'lucide-react-native';
import * as Linking from 'expo-linking';
import * as React from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';

type Presentation = ReturnType<typeof getAnalysisPresentation>;
type Nutrient = Presentation['nutrients'][number];

export function AnalysisDisclosure({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <View className="border-t border-border">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={title}
        onPress={() => setExpanded((value) => !value)}
        className="min-h-12 flex-row items-center justify-between gap-3 rounded-control py-3 active:bg-muted/50">
        <Text className="flex-1 font-semibold">{title}</Text>
        <Icon as={expanded ? ChevronUp : ChevronDown} size={20} className="text-muted-foreground" />
      </Pressable>
      {expanded ? <View className="gap-5 pb-5 pt-1">{children}</View> : null}
    </View>
  );
}

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

const sourceKinds: Readonly<Record<string, string>> = {
  model_estimate: 'Estimasi visual AI',
  nutrition: 'Rujukan gizi',
  portion: 'Rujukan porsi',
  health_rule: 'Rujukan kesehatan',
  synthetic: 'Data demonstrasi',
};

export function AnalysisResultContent({
  presentation,
  photo,
  timestamp,
  onCorrect,
  correctionDisabled,
  correctionIsActive,
  photoDeleted,
}: {
  presentation: Presentation;
  photo: React.ReactNode;
  timestamp: string | null;
  onCorrect?: () => void;
  correctionDisabled: boolean;
  correctionIsActive: boolean;
  photoDeleted: boolean;
}) {
  const { width, fontScale } = useWindowDimensions();
  const stackMacros = width < 360 || fontScale > 1.2;
  const energy = presentation.nutrients.find((item) => item.key === 'energyKcal');
  const macros = presentation.nutrients.filter((item) =>
    ['carbohydrateG', 'proteinG', 'fatG'].includes(item.key)
  );
  // The catalog note remains visible in the identity block; do not repeat it.
  const notes = presentation.criticalNotes.filter((note) => note !== presentation.supportLabel);
  const personalNote = 'Pertimbangan kesehatan personal belum tersedia.';
  const needsPersonalNote =
    presentation.overallAttention === 'insufficient_information' && !notes.includes(personalNote);

  return (
    <View className="gap-6">
      <View className="flex-row items-start gap-4">
        {photo}
        <View className="min-w-0 flex-1 gap-2">
          <Text variant="h2">
            {presentation.components.length === 1
              ? presentation.components[0].name
              : `${presentation.components.length} makanan dalam foto`}
          </Text>
          <View className="self-start rounded-control bg-carin-butter/60 px-2.5 py-1">
            <Text variant="label">{presentation.estimateLabel}</Text>
          </View>
          <Text variant="caption" className="text-muted-foreground">
            {presentation.supportLabel}
          </Text>
          {photoDeleted ? (
            <Text variant="caption" className="text-muted-foreground">
              Foto sumber telah dihapus
            </Text>
          ) : null}
        </View>
      </View>

      <View className="gap-2">
        <Text variant="h2">Makanan & porsi</Text>
        {presentation.components.map((component) => (
          <View
            key={component.id}
            className={
              stackMacros
                ? 'gap-1 border-b border-border/60 py-3'
                : 'flex-row flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border/60 py-3'
            }>
            <Text className={stackMacros ? 'font-semibold' : 'min-w-0 flex-1 font-semibold'}>
              {component.name}
            </Text>
            <Text className="text-muted-foreground">{component.summaryPortion}</Text>
          </View>
        ))}
        {presentation.components.length === 0 ? (
          <Text variant="muted">Nama makanan dan porsi belum tersedia.</Text>
        ) : null}
        {onCorrect ? (
          <Button
            variant="ghost"
            className="mt-1 self-start px-0"
            disabled={correctionDisabled}
            onPress={onCorrect}
            accessibilityLabel="Koreksi komponen atau porsi">
            <Icon as={Edit3} size={16} className="text-primary" />
            <Text className="text-primary">
              {correctionIsActive ? 'Koreksi sedang berjalan' : 'Ubah makanan atau porsi'}
            </Text>
          </Button>
        ) : null}
      </View>

      <View className="gap-2 rounded-compact bg-carin-olive-soft/50 p-4">
        <View className="flex-row items-center gap-2">
          <Icon as={Info} size={18} className="text-foreground" />
          <Text variant="h2" className="flex-1 text-base">
            Yang perlu diketahui
          </Text>
        </View>
        {presentation.overallAttention === 'needs_attention' ? (
          <Text className="font-semibold">Ada hal yang perlu diperhatikan.</Text>
        ) : presentation.overallAttention === 'considerable' ? (
          <Text>Pertimbangan ini berdasarkan data tersedia, bukan jaminan keamanan makanan.</Text>
        ) : needsPersonalNote ? (
          <Text>{personalNote}</Text>
        ) : null}
        {notes.map((note) => (
          <Text key={note} className="text-sm">
            {note}
          </Text>
        ))}
        {presentation.attentions.map((attention, index) => (
          <View
            key={`${attention.conditionId}-${index}`}
            className="gap-1 border-t border-border pt-3">
            <Text className="font-semibold">{attention.conditionLabel}</Text>
            {attention.personalizationSupported === false ? (
              <Text>Kondisi ini belum didukung untuk personalisasi.</Text>
            ) : null}
            <Text>{attention.reason}</Text>
            {attention.adjustments.map((adjustment) => (
              <Text key={adjustment}>{adjustment}</Text>
            ))}
          </View>
        ))}
      </View>

      <View className="gap-5 rounded-summary bg-card p-5">
        <View className="gap-3">
          <Text variant="h2">Estimasi gizi</Text>
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
            stackMacros
              ? 'gap-3 border-t border-border pt-4'
              : 'flex-row gap-4 border-t border-border pt-4'
          }>
          {macros.map((nutrient) => (
            <View
              key={nutrient.key}
              className={
                stackMacros
                  ? 'flex-row items-start justify-between gap-4'
                  : 'min-w-0 flex-1 gap-1.5'
              }>
              <Text variant="caption" className="text-muted-foreground">
                {nutrient.label}
              </Text>
              <NutrientValue nutrient={nutrient} />
            </View>
          ))}
        </View>
        <Text variant="caption" className="text-muted-foreground">
          {presentation.estimateLabel}. Nilai mengikuti porsi yang ditampilkan.
        </Text>
        <AnalysisDisclosure title="Lihat rincian gizi">
          {presentation.nutrients.map((nutrient) => (
            <View key={nutrient.key} className="gap-1 border-b border-border/60 pb-3">
              <View className="flex-row flex-wrap justify-between gap-2">
                <Text className="font-semibold">{nutrient.label}</Text>
                <Text>{nutrient.value}</Text>
              </View>
              <Text variant="caption" className="text-muted-foreground">
                Cakupan: {nutrient.coverage}
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

      <AnalysisDisclosure title="Tentang hasil ini">
        {timestamp ? <Text variant="muted">Dianalisis pada {timestamp}</Text> : null}
        <Text variant="muted">
          Hasil ini bersifat informatif, bukan diagnosis medis atau jaminan keamanan makanan.
        </Text>
        <View className="gap-3">
          <Text variant="h2">Dasar porsi</Text>
          {presentation.components.map((component) => (
            <View key={component.id} className="gap-1 border-b border-border/60 pb-3">
              <Text className="font-semibold">{component.name}</Text>
              <Text>
                {component.summaryPortion} · {component.portionOriginLabel}
              </Text>
              {component.portionBasis ? (
                <Text variant="muted">{component.portionBasis}</Text>
              ) : null}
              {component.grams ? <Text variant="muted">{component.grams}</Text> : null}
              {component.portionSource ? (
                <Text variant="caption" className="text-muted-foreground">
                  Sumber: {component.portionSource}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
        {presentation.attentions.map((attention, index) => (
          <View key={`${attention.conditionId}-${index}`} className="gap-2">
            <Text variant="h2">Dasar pertimbangan: {attention.conditionLabel}</Text>
            <Text>{attention.reason}</Text>
            {attention.limitations.map((message) => (
              <Text key={message} variant="muted">
                {message}
              </Text>
            ))}
            {attention.sources.map((source) => (
              <Text key={source} variant="caption" className="text-muted-foreground">
                Sumber: {source}
              </Text>
            ))}
          </View>
        ))}
        {presentation.limitations.length ? (
          <View className="gap-2">
            <Text variant="h2">Batas dan keterbatasan</Text>
            {presentation.limitations.map((message, index) => (
              <Text key={`${index}-${message}`} variant="muted">
                {message}
              </Text>
            ))}
          </View>
        ) : null}
        <View className="gap-3">
          <Text variant="h2">Sumber rujukan</Text>
          {presentation.sources.map((source) => (
            <View key={source.id} className="gap-1 border-b border-border/60 pb-3">
              <Text className="font-semibold">{source.title}</Text>
              <Text variant="caption" className="text-muted-foreground">
                {sourceKinds[source.kind] ?? source.kind}
              </Text>
              <Text variant="caption" className="text-muted-foreground">
                Referensi: {source.itemRef}
              </Text>
              {source.url ? (
                <Button
                  variant="link"
                  className="self-start px-0"
                  onPress={() => void Linking.openURL(source.url!)}>
                  <Text>Lihat sumber</Text>
                </Button>
              ) : null}
            </View>
          ))}
          {presentation.sources.length === 0 ? (
            <Text variant="muted">Sumber belum tersedia.</Text>
          ) : null}
        </View>
      </AnalysisDisclosure>
    </View>
  );
}
