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
  const supportLabel =
    result.supportStatus === 'complete'
      ? 'Hasil lengkap'
      : result.supportStatus === 'partial'
        ? 'Hasil sebagian'
        : 'Makanan belum dapat dikenali';

  return {
    supportLabel,
    dataLabel:
      result.dataMode === 'synthetic' ? 'Data sintetis untuk demonstrasi' : 'Estimasi analisis',
    components: result.components.map((component) => ({
      id: component.id,
      name: component.displayName,
      portion:
        component.portion.grams === null
          ? 'Porsi belum tersedia'
          : `Perkiraan ${component.portion.grams} g`,
      matchStatus: component.matchStatus,
    })),
    nutrients: nutrientDefinitions.map(([key, label, unit, digits]) => {
      const amount = result.totals[key];
      const coverage = result.coverage[key];
      return {
        key,
        label,
        unit,
        value: amount === null ? 'Belum tersedia' : `${amount.toFixed(digits)} ${unit}`,
        coverage: `${coverage.knownComponentCount} dari ${coverage.totalComponentCount} komponen`,
        sources: Array.from(
          new Set(
            result.components
              .map((component) => component.nutrientSourceIds[key])
              .filter((sourceId): sourceId is string => sourceId !== null)
              .map((sourceId) => sourceNames.get(sourceId) ?? 'Sumber tidak tersedia')
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
