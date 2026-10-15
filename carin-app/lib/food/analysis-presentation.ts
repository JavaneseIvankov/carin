import type { components } from '@/lib/api/generated/app-api';

type AnalysisJob = components['schemas']['AnalysisJob'];
type AnalysisResult = components['schemas']['ai__AnalysisResult'];

export function getAnalysisFailurePresentation(job: AnalysisJob) {
  if (job.status !== 'failed') return null;
  return {
    message: job.error?.message ?? 'Terjadi kendala saat menyiapkan hasil analisis.',
    retryable: job.error?.retryable ?? false,
  };
}

const nutrientDefinitions = [
  ['energyKcal', 'Energi', 'kkal', 1],
  ['carbohydrateG', 'Karbohidrat', 'g', 2],
  ['proteinG', 'Protein', 'g', 2],
  ['fatG', 'Lemak', 'g', 2],
  ['fiberG', 'Serat', 'g', 2],
  ['sugarsG', 'Gula', 'g', 2],
  ['sodiumMg', 'Natrium', 'mg', 1],
] as const satisfies readonly (readonly [keyof AnalysisResult['totals'], string, string, number])[];

const terminalStatuses = new Set<AnalysisJob['status']>(['completed', 'failed', 'cancelled']);

const criticalNoteLabels: Readonly<Record<string, string>> = {
  ALLERGEN_UNVERIFIED: 'Alergen belum terverifikasi.',
  RULE_ARTIFACT_UNAVAILABLE: 'Pertimbangan kesehatan personal belum tersedia.',
  NUTRITION_ARTIFACT_UNAVAILABLE: 'Nilai gizi belum terverifikasi.',
  VLM_NUTRIENT_ESTIMATE: 'Nilai gizi belum terverifikasi.',
  INCOMPLETE_PORTION: 'Sebagian porsi belum diketahui.',
  VLM_NUTRITION_UNAVAILABLE: 'Sebagian nilai gizi belum tersedia.',
};

export function getAnalysisPollInterval(
  status: AnalysisJob['status'],
  elapsedMs: number,
  isForeground: boolean
): number | false {
  if (!isForeground || terminalStatuses.has(status)) return false;
  return elapsedMs < 30_000 ? 2_000 : 5_000;
}

export function getAnalysisPresentation(
  result: AnalysisResult,
  conditionIndex: ReadonlyMap<
    string,
    { displayName: string; personalizationSupported: boolean }
  > = new Map()
) {
  const sourceNames = new Map(result.sources.map((source) => [source.id, source.title]));
  const visualSourceIds = new Set(
    result.sources.filter((source) => source.kind === 'model_estimate').map((source) => source.id)
  );
  const supportLabel =
    result.supportStatus === 'complete'
      ? 'Cocok dengan katalog'
      : result.supportStatus === 'partial'
        ? 'Sebagian cocok dengan katalog'
        : 'Belum cocok dengan katalog';
  const hasVisualEstimates = result.components.some((component) =>
    Object.values(component.nutrientSourceIds).some(
      (sourceId) => sourceId !== null && visualSourceIds.has(sourceId)
    )
  );
  const hasCatalogValues = result.components.some((component) =>
    Object.values(component.nutrientSourceIds).some(
      (sourceId) => sourceId !== null && !visualSourceIds.has(sourceId)
    )
  );

  return {
    hasVisualEstimates,
    supportLabel,
    estimateLabel:
      result.dataMode === 'synthetic'
        ? 'Data sintetis untuk demonstrasi'
        : hasVisualEstimates && hasCatalogValues
          ? 'Katalog & estimasi dari foto'
          : hasVisualEstimates
            ? 'Estimasi dari foto'
            : hasCatalogValues
              ? 'Data katalog gizi'
              : 'Gizi belum tersedia',
    criticalNotes: Array.from(
      new Set(
        result.limitations
          .filter((limitation) => limitation.critical || limitation.code === 'ALLERGEN_UNVERIFIED')
          .map((limitation) =>
            limitation.code === 'UNRECOGNIZED_COMPONENT'
              ? supportLabel
              : Object.hasOwn(criticalNoteLabels, limitation.code)
                ? criticalNoteLabels[limitation.code]
                : limitation.message
          )
      )
    ),
    dataLabel:
      result.dataMode === 'synthetic' ? 'Data sintetis untuk demonstrasi' : 'Estimasi analisis',
    components: result.components.map((component) => {
      const portion = component.portion;
      const quantityLabel =
        portion.quantity === null || portion.unit === null
          ? null
          : `${portion.quantity} ${portion.unit === 'serving' ? 'porsi' : 'g'}`;
      const portionSource = portion.sourceId
        ? (sourceNames.get(portion.sourceId) ?? 'Sumber porsi tidak tersedia')
        : null;
      const knownPortion = quantityLabel ?? (portion.grams === null ? null : `${portion.grams} g`);

      return {
        id: component.id,
        name: component.displayName,
        summaryPortion:
          knownPortion === null
            ? 'Porsi belum tersedia'
            : portion.origin === 'photo_estimate'
              ? `Sekitar ${knownPortion}`
              : knownPortion,
        portionOriginLabel:
          portion.origin === 'photo_estimate' ? 'Perkiraan dari foto' : 'Takaran yang dilaporkan',
        portion:
          quantityLabel ??
          (portion.grams === null ? 'Porsi belum tersedia' : `Perkiraan ${portion.grams} g`),
        portionBasis: portion.basis,
        portionSource,
        grams:
          portion.grams === null
            ? 'Berat dalam gram belum tersedia'
            : quantityLabel
              ? `Perkiraan ${portion.grams} g`
              : null,
        matchStatus: component.matchStatus,
        nutritionLabel: Object.values(component.nutrientSourceIds).some(
          (sourceId) => sourceId !== null && visualSourceIds.has(sourceId)
        )
          ? 'Estimasi visual VLM'
          : component.matchStatus === 'matched'
            ? 'Data katalog gizi'
            : 'Nilai gizi belum tersedia',
      };
    }),
    nutrients: nutrientDefinitions.map(([key, label, unit, digits]) => {
      const amount = result.totals[key];
      const coverage = result.coverage[key];
      const nutrientSources = result.components
        .map((component) => component.nutrientSourceIds[key])
        .filter((sourceId): sourceId is string => sourceId !== null);
      const hasVisualSource = nutrientSources.some((sourceId) => visualSourceIds.has(sourceId));
      const hasCatalogSource = nutrientSources.some((sourceId) => !visualSourceIds.has(sourceId));
      return {
        key,
        label,
        unit,
        value:
          amount === null
            ? 'Belum tersedia'
            : `${amount.toLocaleString('id-ID', { maximumFractionDigits: digits })} ${unit}`,
        coverage: `${coverage.knownComponentCount} dari ${coverage.totalComponentCount} komponen`,
        isPartial: amount !== null && coverage.knownComponentCount < coverage.totalComponentCount,
        sourceLabel:
          hasVisualSource && hasCatalogSource
            ? 'Gabungan katalog dan estimasi visual VLM'
            : hasVisualSource
              ? 'Estimasi visual VLM'
              : hasCatalogSource
                ? 'Data katalog gizi'
                : 'Sumber gizi belum tersedia',
        sources: Array.from(
          new Set(
            nutrientSources.map((sourceId) => sourceNames.get(sourceId) ?? 'Sumber tidak tersedia')
          )
        ),
      };
    }),
    attentions: result.attentions.map((attention) => ({
      conditionId: attention.conditionId,
      conditionLabel: conditionIndex.get(attention.conditionId)?.displayName ?? 'Kondisi terkait',
      personalizationSupported:
        conditionIndex.get(attention.conditionId)?.personalizationSupported ?? null,
      reason: attention.reason,
      adjustments: attention.adjustments,
      limitations: attention.limitations,
      sources: attention.sourceIds.map(
        (sourceId) => sourceNames.get(sourceId) ?? 'Sumber tidak tersedia'
      ),
    })),
    limitations: result.limitations.map((limitation) => limitation.message),
    sources: result.sources.map((source) => ({
      id: source.id,
      title: source.title,
      kind: source.kind,
      itemRef: source.itemRef,
      url: source.url,
    })),
    overallAttention: result.overallAttention,
  };
}
