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
    contractVersion: '1.0.0',
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
    expect(view.supportLabel).toBe('Makanan belum dapat dikenali');
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
    expect(view.supportLabel).toBe('Hasil sebagian');
    expect(view.nutrients[0]).toMatchObject({ value: '210.0 kkal', coverage: '1 dari 2 komponen' });
    expect(view.nutrients[0].sources).toEqual(['Data sintetis untuk demonstrasi']);
    expect(view.attentions[0]).toMatchObject({
      conditionLabel: 'Kondisi contoh',
      personalizationSupported: false,
      reason: 'Periksa kandungan natrium.',
      sources: ['Data sintetis untuk demonstrasi'],
    });
    expect(view.limitations).toEqual(['Nilai gizi belum tersedia untuk makanan ini.']);
  });
});
