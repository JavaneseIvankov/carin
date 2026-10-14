import { describe, expect, it } from 'vitest';
import type { ManualConsumption } from './consumption';
import { getConsumptionDetailPresentation } from './attention-presentation';

function record(
  attentionState: ManualConsumption['attentionState'],
  overrides: Partial<Pick<ManualConsumption, 'source' | 'photoAvailable'>> = {}
): ManualConsumption {
  return {
    id: 'consumption-1',
    revision: 1,
    source: overrides.source ?? 'manual',
    scanId: null,
    sourceAnalysisResultId: null,
    photoAvailable: overrides.photoAvailable ?? false,
    consumedAt: '2026-10-14T05:30:00.000Z',
    timezone: 'Asia/Jakarta',
    createdAt: '2026-10-14T05:30:00.000Z',
    updatedAt: '2026-10-14T05:30:00.000Z',
    attentionState,
    attentionJobId: attentionState === 'pending' ? 'job-1' : null,
    snapshot: {
      attentions: [],
      catalogVersion: 'catalog-v3',
      components: [],
      computedAt: '2026-10-14T05:30:00.000Z',
      contractVersion: '1.0.0',
      coverage: {
        energyKcal: { knownComponentCount: 1, totalComponentCount: 2 },
        carbohydrateG: { knownComponentCount: 1, totalComponentCount: 2 },
        proteinG: { knownComponentCount: 1, totalComponentCount: 2 },
        fatG: { knownComponentCount: 1, totalComponentCount: 2 },
        fiberG: { knownComponentCount: 1, totalComponentCount: 2 },
        sugarsG: { knownComponentCount: 1, totalComponentCount: 2 },
        sodiumMg: { knownComponentCount: 1, totalComponentCount: 2 },
      },
      dataMode: 'synthetic',
      inputKind: 'manual',
      limitations: [],
      nutritionDatasetVersion: 'dataset-v1',
      operationId: 'op-1',
      overallAttention: 'needs_attention',
      profileVersion: 0,
      ruleSetVersion: 'rules-v1',
      sources: [],
      supportStatus: 'partial',
      totals: {
        energyKcal: 123,
        carbohydrateG: null,
        proteinG: 8.5,
        fatG: null,
        fiberG: 2,
        sugarsG: null,
        sodiumMg: 300,
      },
    },
  };
}

describe('consumption detail presentation', () => {
  it.each([
    ['not_requested', 'Pertimbangan personal belum diminta'],
    ['pending', 'Pertimbangan personal sedang diproses'],
    ['failed', 'Pertimbangan personal belum tersedia'],
  ] as const)('keeps frozen nutrition visible while attention is %s', (state, label) => {
    const presentation = getConsumptionDetailPresentation(record(state));
    expect(presentation.attention.title).toBe(label);
    expect(presentation.nutrients.find((item) => item.key === 'energyKcal')).toMatchObject({
      value: '123 kkal',
      coverage: '1 dari 2 komponen',
    });
    expect(presentation.nutrients.find((item) => item.key === 'carbohydrateG')?.value).toBe(
      'Belum tersedia'
    );
  });

  it('shows the stored attention result only when evaluation is available', () => {
    expect(getConsumptionDetailPresentation(record('available')).attention).toEqual({
      title: 'Ada hal yang perlu diperhatikan',
      message: 'Pertimbangan ini memakai snapshot catatan saat disimpan.',
      available: true,
    });
  });

  it('labels a photo-backed consumption whose source photo has been removed', () => {
    expect(
      getConsumptionDetailPresentation(
        record('not_requested', {
          source: 'photo_confirmation',
          photoAvailable: false,
        })
      ).source
    ).toEqual({ label: 'Konfirmasi dari foto', photoDeleted: true });
  });
});
