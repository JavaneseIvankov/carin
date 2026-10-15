import { describe, expect, it } from 'vitest';
import type { components } from '@/lib/api/generated/app-api';
import {
  getAnalysisFailurePresentation,
  getAnalysisPollInterval,
  getAnalysisPresentation,
} from './analysis-presentation';

type Result = components['schemas']['ai__AnalysisResult'];

function result(overrides: Partial<Result> = {}): Result {
  return {
    attentions: [
      {
        adjustments: [],
        componentIds: ['component-1'],
        conditionId: 'condition-1',
        limitations: ['Profil belum lengkap.'],
        reason: 'Periksa kandungan natrium.',
        ruleId: 'rule-1',
        sourceIds: ['source-1'],
      },
    ],
    catalogVersion: 'catalog-synthetic-v1',
    components: [
      {
        catalogFoodId: null,
        displayName: 'Nasi goreng',
        id: 'component-1',
        matchStatus: 'unmatched',
        nutrients: {
          energyKcal: null,
          carbohydrateG: null,
          proteinG: null,
          fatG: null,
          fiberG: null,
          sugarsG: null,
          sodiumMg: null,
        },
        nutrientSourceIds: {
          energyKcal: null,
          carbohydrateG: null,
          proteinG: null,
          fatG: null,
          fiberG: null,
          sugarsG: null,
          sodiumMg: null,
        },
        per100g: {
          energyKcal: null,
          carbohydrateG: null,
          proteinG: null,
          fatG: null,
          fiberG: null,
          sugarsG: null,
          sodiumMg: null,
        },
        portion: {
          basis: null,
          grams: null,
          origin: 'photo_estimate',
          quantity: null,
          servingId: null,
          sourceId: null,
          unit: null,
        },
        preparation: null,
        sourceIds: [],
      },
    ],
    computedAt: '2026-10-14T00:00:00.000Z',
    contractVersion: '2.0.0',
    coverage: {
      energyKcal: { knownComponentCount: 0, totalComponentCount: 1 },
      carbohydrateG: { knownComponentCount: 0, totalComponentCount: 1 },
      proteinG: { knownComponentCount: 0, totalComponentCount: 1 },
      fatG: { knownComponentCount: 0, totalComponentCount: 1 },
      fiberG: { knownComponentCount: 0, totalComponentCount: 1 },
      sugarsG: { knownComponentCount: 0, totalComponentCount: 1 },
      sodiumMg: { knownComponentCount: 0, totalComponentCount: 1 },
    },
    dataMode: 'synthetic',
    inputKind: 'photo',
    limitations: [
      {
        code: 'food_unmatched',
        componentIds: ['component-1'],
        critical: false,
        message: 'Nilai gizi belum tersedia untuk makanan ini.',
      },
    ],
    nutritionDatasetVersion: 'synthetic-v1',
    operationId: '00000000-0000-0000-0000-000000000001',
    overallAttention: 'insufficient_information',
    profileVersion: 0,
    ruleSetVersion: 'synthetic-v1',
    sources: [
      {
        datasetVersion: 'synthetic-v1',
        id: 'source-1',
        itemRef: 'synthetic-item-1',
        kind: 'synthetic',
        title: 'Data sintetis untuk demonstrasi',
        url: null,
      },
    ],
    supportStatus: 'unrecognized',
    totals: {
      energyKcal: null,
      carbohydrateG: null,
      proteinG: null,
      fatG: null,
      fiberG: null,
      sugarsG: null,
      sodiumMg: null,
    },
    ...overrides,
  };
}

describe('analysis presentation', () => {
  it('labels visual VLM nutrients separately from catalog values', () => {
    const visual = result({ dataMode: 'real' });
    const component = visual.components[0]!;
    component.nutrients.energyKcal = 320;
    component.nutrientSourceIds.energyKcal = 'vlm-source';
    component.sourceIds = ['vlm-source'];
    visual.sources = [
      {
        id: 'vlm-source',
        kind: 'model_estimate',
        title: 'Estimasi visual VLM untuk porsi pada foto',
        datasetVersion: 'vlm-estimate-v1',
        itemRef: `${visual.operationId}/${component.id}`,
        url: null,
      },
    ];
    visual.totals.energyKcal = 320;
    visual.coverage.energyKcal.knownComponentCount = 1;

    const presentation = getAnalysisPresentation(visual);

    expect(presentation.hasVisualEstimates).toBe(true);
    expect(presentation.components[0]?.nutritionLabel).toBe('Estimasi visual VLM');
    expect(presentation.nutrients[0]).toMatchObject({
      value: '320 kkal',
      sourceLabel: 'Estimasi visual VLM',
      sources: ['Estimasi visual VLM untuk porsi pada foto'],
    });
  });

  it('stops polling when backgrounded or after a terminal status', () => {
    expect(getAnalysisPollInterval('queued', 0, false)).toBe(false);
    expect(getAnalysisPollInterval('completed', 0, true)).toBe(false);
    expect(getAnalysisPollInterval('failed', 0, true)).toBe(false);
  });

  it('polls every two seconds for 30 seconds, then every five seconds', () => {
    expect(getAnalysisPollInterval('processing', 29_999, true)).toBe(2_000);
    expect(getAnalysisPollInterval('queued', 30_000, true)).toBe(5_000);
  });

  it('shows provider failure text and only offers retry when the server marks it retryable', () => {
    const failedJob = {
      attempts: 1,
      createdAt: '2026-10-14T00:00:00.000Z',
      error: { code: 'PROVIDER_TIMEOUT', message: 'Provider timeout', retryable: true },
      finishedAt: '2026-10-14T00:01:00.000Z',
      id: 'job-1',
      inputKind: 'photo',
      result: null,
      resultId: null,
      scanId: 'scan-1',
      startedAt: '2026-10-14T00:00:01.000Z',
      status: 'failed',
      targetId: 'scan-1',
      targetRevision: 1,
      targetType: 'scan',
    } as const;
    expect(getAnalysisFailurePresentation(failedJob)).toEqual({
      message: 'Provider timeout',
      retryable: true,
    });
  });

  it('keeps null totals unavailable and labels unrecognized synthetic results', () => {
    const view = getAnalysisPresentation(result());
    expect(view.supportLabel).toBe('Belum cocok dengan katalog');
    expect(view.dataLabel).toBe('Data sintetis untuk demonstrasi');
    expect(view.nutrients[0]).toMatchObject({
      value: 'Belum tersedia',
      coverage: '0 dari 1 komponen',
    });
  });

  it('preserves partial nutrient coverage, attention provenance, and limitations', () => {
    const partial = result({
      components: [
        {
          ...result().components[0],
          nutrientSourceIds: {
            energyKcal: 'source-1',
            carbohydrateG: null,
            proteinG: null,
            fatG: null,
            fiberG: null,
            sugarsG: null,
            sodiumMg: null,
          },
        },
        { ...result().components[0], id: 'component-2', displayName: 'Telur' },
      ],
      supportStatus: 'partial',
      totals: {
        energyKcal: 210,
        carbohydrateG: null,
        proteinG: null,
        fatG: null,
        fiberG: null,
        sugarsG: null,
        sodiumMg: null,
      },
      coverage: {
        energyKcal: { knownComponentCount: 1, totalComponentCount: 2 },
        carbohydrateG: { knownComponentCount: 0, totalComponentCount: 2 },
        proteinG: { knownComponentCount: 0, totalComponentCount: 2 },
        fatG: { knownComponentCount: 0, totalComponentCount: 2 },
        fiberG: { knownComponentCount: 0, totalComponentCount: 2 },
        sugarsG: { knownComponentCount: 0, totalComponentCount: 2 },
        sodiumMg: { knownComponentCount: 0, totalComponentCount: 2 },
      },
    });
    const view = getAnalysisPresentation(
      partial,
      new Map([['condition-1', { displayName: 'Kondisi contoh', personalizationSupported: false }]])
    );
    expect(view.supportLabel).toBe('Sebagian cocok dengan katalog');
    expect(view.nutrients[0]).toMatchObject({
      value: '210 kkal',
      coverage: '1 dari 2 komponen',
      isPartial: true,
    });
    expect(view.nutrients[0].sources).toEqual(['Data sintetis untuk demonstrasi']);
    expect(view.attentions[0]).toMatchObject({
      conditionLabel: 'Kondisi contoh',
      personalizationSupported: false,
      reason: 'Periksa kandungan natrium.',
      sources: ['Data sintetis untuk demonstrasi'],
    });
    expect(view.limitations).toEqual(['Nilai gizi belum tersedia untuk makanan ini.']);
  });

  it('preserves a known serving and its provenance when grams are unavailable', () => {
    const serving = result({
      components: [
        {
          ...result().components[0],
          portion: {
            basis: '1 porsi sedang',
            grams: null,
            origin: 'user_reported',
            quantity: 1,
            servingId: 'serving-1',
            sourceId: 'source-1',
            unit: 'serving',
          },
        },
      ],
    });

    expect(getAnalysisPresentation(serving).components[0]).toMatchObject({
      portion: '1 porsi',
      portionBasis: '1 porsi sedang',
      portionSource: 'Data sintetis untuk demonstrasi',
      grams: 'Berat dalam gram belum tersedia',
    });
  });

  it('keeps attention adjustments with the reason, limitations, and sources', () => {
    const adjusted = result({
      attentions: [
        {
          ...result().attentions[0],
          adjustments: ['Nilai dikurangi sesuai profil.'],
        },
      ],
    });

    expect(getAnalysisPresentation(adjusted).attentions[0].adjustments).toEqual([
      'Nilai dikurangi sesuai profil.',
    ]);
  });

  it('keeps critical and allergen information visible without exposing every detail by default', () => {
    const original = result({
      limitations: [
        {
          code: 'ALLERGEN_UNVERIFIED',
          message: 'Original allergen detail.',
          critical: true,
          componentIds: [],
        },
        {
          code: 'RULE_ARTIFACT_UNAVAILABLE',
          message: 'Internal rule artifact detail.',
          critical: true,
          componentIds: [],
        },
        {
          code: 'FUTURE_CRITICAL_CODE',
          message: 'A new critical warning must remain visible.',
          critical: true,
          componentIds: [],
        },
        {
          code: 'OPTIONAL_DETAIL',
          message: 'Supporting method detail.',
          critical: false,
          componentIds: [],
        },
      ],
    });
    const view = getAnalysisPresentation(original);
    expect(view.criticalNotes).toEqual([
      'Alergen belum terverifikasi.',
      'Pertimbangan kesehatan personal belum tersedia.',
      'A new critical warning must remain visible.',
    ]);
    expect(view.limitations).toEqual(original.limitations.map((item) => item.message));
  });

  it('does not hide repeated critical warnings with different meanings', () => {
    const view = getAnalysisPresentation(
      result({
        limitations: [
          {
            code: 'FUTURE_CODE',
            message: 'First important warning.',
            critical: true,
            componentIds: [],
          },
          {
            code: 'FUTURE_CODE',
            message: 'Another important warning.',
            critical: true,
            componentIds: [],
          },
        ],
      })
    );
    expect(view.criticalNotes).toEqual(['First important warning.', 'Another important warning.']);
  });

  it('keeps an unverified-allergen warning visible even when it is not marked critical', () => {
    const view = getAnalysisPresentation(
      result({
        limitations: [
          {
            code: 'ALLERGEN_UNVERIFIED',
            message: 'Allergen detail.',
            critical: false,
            componentIds: [],
          },
        ],
      })
    );
    expect(view.criticalNotes).toEqual(['Alergen belum terverifikasi.']);
  });

  it('preserves unknown critical codes that coincide with object property names', () => {
    const view = getAnalysisPresentation(
      result({
        limitations: [
          {
            code: 'toString',
            message: 'Important provider warning.',
            critical: true,
            componentIds: [],
          },
        ],
      })
    );
    expect(view.criticalNotes).toEqual(['Important provider warning.']);
  });

  it('shows a single estimated portion without repeating the same gram amount', () => {
    const original = result();
    original.components[0].portion = {
      ...original.components[0].portion,
      quantity: 150,
      unit: 'g',
      grams: 150,
      basis: 'Provider portion methodology.',
    };
    expect(getAnalysisPresentation(original).components[0]).toMatchObject({
      summaryPortion: 'Sekitar 150 g',
      portionBasis: 'Provider portion methodology.',
      portionOriginLabel: 'Perkiraan dari foto',
    });
  });

  it('keeps unknown portions and user-provided servings explicit', () => {
    const original = result();
    expect(getAnalysisPresentation(original).components[0].summaryPortion).toBe(
      'Porsi belum tersedia'
    );
    original.components[0].portion = {
      ...original.components[0].portion,
      quantity: 1,
      unit: 'serving',
      origin: 'user_reported',
    };
    expect(getAnalysisPresentation(original).components[0].summaryPortion).toBe('1 porsi');
  });

  it('keeps demonstration data labeled even when it includes model estimates', () => {
    const original = result();
    original.components[0].nutrientSourceIds.energyKcal = 'visual';
    original.sources = [{ ...original.sources[0], id: 'visual', kind: 'model_estimate' }];
    expect(getAnalysisPresentation(original).estimateLabel).toBe('Data sintetis untuk demonstrasi');
    original.dataMode = 'real';
    expect(getAnalysisPresentation(original).estimateLabel).toBe('Estimasi dari foto');
  });
});
