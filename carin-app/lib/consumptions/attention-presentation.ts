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
  return {
    source: {
      label: consumption.source === 'manual' ? 'Catatan manual' : 'Konfirmasi dari foto',
      photoDeleted: consumption.source === 'photo_confirmation' && !consumption.photoAvailable,
    },
    attention: attentionPresentation(consumption),
    nutrients: nutrientDefinitions.map(([key, label, unit]) => {
      const coverage = consumption.snapshot.coverage[key];
      return {
        key,
        label,
        value: formatNutrient(consumption.snapshot.totals[key], unit),
        coverage: `${coverage.knownComponentCount} dari ${coverage.totalComponentCount} komponen`,
      };
    }),
    components: consumption.snapshot.components.map((component) => {
      const portion = component.portion;
      const portionLabel =
        portion.quantity !== null && portion.unit !== null
          ? `${portion.quantity} ${portion.unit === 'serving' ? 'takaran' : 'g'}`
          : 'Porsi tidak diketahui';
      return {
        id: component.id,
        name: component.displayName,
        portion: portionLabel,
        portionBasis: portion.basis,
        grams: portion.grams,
        matchStatus: component.matchStatus,
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
