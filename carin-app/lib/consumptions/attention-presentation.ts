import type { ManualConsumption } from './consumption';
import { formatNutrient } from './consumption';

const nutrientDefinitions = [
  ['energyKcal', 'Energi', 'kkal'],
  ['carbohydrateG', 'Karbohidrat', 'g'],
  ['proteinG', 'Protein', 'g'],
  ['fatG', 'Lemak', 'g'],
  ['fiberG', 'Serat', 'g'],
  ['sugarsG', 'Gula', 'g'],
  ['sodiumMg', 'Natrium', 'mg'],
] as const satisfies readonly (readonly [
  keyof ManualConsumption['snapshot']['totals'],
  string,
  string,
])[];

function attentionPresentation(consumption: ManualConsumption) {
  if (consumption.attentionState === 'not_requested') {
    return {
      title: 'Pertimbangan personal belum diminta',
      message:
        'Catatan tetap tersimpan. Snapshot gizi dapat dilihat tanpa menunggu perhatian personal.',
      available: false,
    };
  }
  if (consumption.attentionState === 'pending') {
    return {
      title: 'Pertimbangan personal sedang diproses',
      message: 'Snapshot gizi dari catatan ini sudah tersimpan dan tetap dapat dilihat.',
      available: false,
    };
  }
  if (consumption.attentionState === 'failed') {
    return {
      title: 'Pertimbangan personal belum tersedia',
      message: 'Perhatian personal belum berhasil. Snapshot gizi tetap tersimpan.',
      available: false,
    };
  }

  const title = {
    considerable: 'Perlu perhatian berdasarkan data tersedia',
    needs_attention: 'Ada hal yang perlu diperhatikan',
    insufficient_information: 'Informasi belum cukup untuk pertimbangan personal',
  }[consumption.snapshot.overallAttention];
  return {
    title,
    message: 'Pertimbangan ini memakai snapshot catatan saat disimpan.',
    available: true,
  };
}

export function getConsumptionDetailPresentation(consumption: ManualConsumption) {
  const visualSourceIds = new Set(
    consumption.snapshot.sources
      .filter((source) => source.kind === 'model_estimate')
      .map((source) => source.id)
  );
  const sourceNames = new Map(
    consumption.snapshot.sources.map((source) => [source.id, source.title])
  );
  const hasVisualEstimates = consumption.snapshot.components.some((component) =>
    Object.values(component.nutrientSourceIds).some(
      (sourceId) => sourceId !== null && visualSourceIds.has(sourceId)
    )
  );
  return {
    hasVisualEstimates,
    dataLabel:
      consumption.snapshot.dataMode === 'synthetic'
        ? 'Data demonstrasi'
        : hasVisualEstimates
          ? 'Estimasi dari foto'
          : consumption.snapshot.dataMode === 'unavailable'
            ? 'Gizi belum tersedia'
            : 'Data katalog gizi',
    source: {
      label: consumption.source === 'manual' ? 'Catatan manual' : 'Konfirmasi dari foto',
      photoDeleted: consumption.source === 'photo_confirmation' && !consumption.photoAvailable,
    },
    attention: attentionPresentation(consumption),
    nutrients: nutrientDefinitions.map(([key, label, unit]) => {
      const coverage = consumption.snapshot.coverage[key];
      const nutrientSourceIds = consumption.snapshot.components
        .map((component) => component.nutrientSourceIds[key])
        .filter((sourceId): sourceId is string => sourceId !== null);
      const hasVisualSource = nutrientSourceIds.some((sourceId) => visualSourceIds.has(sourceId));
      const hasCatalogSource = nutrientSourceIds.some((sourceId) => !visualSourceIds.has(sourceId));
      return {
        key,
        label,
        value: formatNutrient(consumption.snapshot.totals[key], unit),
        isPartial:
          consumption.snapshot.totals[key] !== null &&
          coverage.knownComponentCount < coverage.totalComponentCount,
        coverage: `${coverage.knownComponentCount} dari ${coverage.totalComponentCount} makanan`,
        sourceLabel:
          hasVisualSource && hasCatalogSource
            ? 'Gabungan katalog dan estimasi foto'
            : hasVisualSource
              ? 'Estimasi dari foto'
              : hasCatalogSource
                ? 'Data katalog gizi'
                : 'Sumber gizi belum tersedia',
        sources: Array.from(
          new Set(
            nutrientSourceIds.map(
              (sourceId) => sourceNames.get(sourceId) ?? 'Sumber tidak tersedia'
            )
          )
        ),
      };
    }),
    components: consumption.snapshot.components.map((component) => {
      const portion = component.portion;
      const photoScale = consumption.snapshot.photoPortionScales?.find(
        (scale) => scale.componentId === component.id
      );
      const portionLabel =
        portion.quantity !== null && portion.unit !== null
          ? formatNutrient(portion.quantity, portion.unit === 'serving' ? 'takaran' : 'g')
          : photoScale
            ? `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(photoScale.factor)} porsi foto`
            : 'Porsi belum diketahui';
      return {
        id: component.id,
        name: component.displayName,
        portion: portionLabel,
        portionBasis: portion.basis,
        grams: portion.grams,
        photoPortionFactor: photoScale?.factor ?? null,
        photoSourceGrams: photoScale?.sourceGrams ?? null,
        matchStatus: component.matchStatus,
        nutritionLabel: Object.values(component.nutrientSourceIds).some(
          (sourceId) => sourceId !== null && visualSourceIds.has(sourceId)
        )
          ? 'Estimasi dari foto'
          : component.matchStatus === 'matched'
            ? 'Data katalog gizi'
            : 'Nilai gizi belum tersedia',
      };
    }),
    attentions: consumption.snapshot.attentions.map((attention) => ({
      id: attention.ruleId,
      reason: attention.reason,
      adjustments: attention.adjustments,
      limitations: attention.limitations,
    })),
    limitations: consumption.snapshot.limitations.map((limitation) => limitation.message),
    sources: consumption.snapshot.sources.map((source) => ({ id: source.id, title: source.title })),
  };
}
