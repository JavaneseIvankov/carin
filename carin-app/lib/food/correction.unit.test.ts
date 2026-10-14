import { describe, expect, it } from 'vitest';
import type { components } from '@/lib/api/generated/app-api';
import { ApiError } from '@/lib/api/repository';
import {
  buildCorrectionInput,
  canConfirmSelectedScanResult,
  canConfirmLatestScanResult,
  createCorrectionActionState,
  createCorrectionActions,
  createCorrectionDraft,
  getCorrectionErrorMessage,
  replaceCorrectionFood,
} from './correction';

type Result = components['schemas']['ai__AnalysisResult'];
type Scan = components['schemas']['Scan'];
type Job = components['schemas']['AnalysisJob'];

const result: Result = {
  attentions: [],
  catalogVersion: 'catalog-v7',
  components: [
    {
      catalogFoodId: 'food-rice',
      displayName: 'Nasi putih',
      id: '10000000-0000-4000-8000-000000000001',
      matchStatus: 'matched',
      nutrients: {
        energyKcal: 130,
        carbohydrateG: 28,
        proteinG: 2,
        fatG: 0.3,
        fiberG: 0.4,
        sugarsG: 0.1,
        sodiumMg: 1,
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
        energyKcal: 130,
        carbohydrateG: 28,
        proteinG: 2,
        fatG: 0.3,
        fiberG: 0.4,
        sugarsG: 0.1,
        sodiumMg: 1,
      },
      portion: {
        basis: '1 mangkuk',
        grams: 150,
        origin: 'photo_estimate',
        quantity: 1,
        servingId: 'serving-bowl',
        sourceId: 'portion-source',
        unit: 'serving',
      },
      preparation: 'matang',
      sourceIds: [],
    },
  ],
  computedAt: '2026-10-14T00:00:00.000Z',
  contractVersion: '1.0.0',
  coverage: {
    energyKcal: { knownComponentCount: 1, totalComponentCount: 1 },
    carbohydrateG: { knownComponentCount: 1, totalComponentCount: 1 },
    proteinG: { knownComponentCount: 1, totalComponentCount: 1 },
    fatG: { knownComponentCount: 1, totalComponentCount: 1 },
    fiberG: { knownComponentCount: 1, totalComponentCount: 1 },
    sugarsG: { knownComponentCount: 1, totalComponentCount: 1 },
    sodiumMg: { knownComponentCount: 1, totalComponentCount: 1 },
  },
  dataMode: 'synthetic',
  inputKind: 'photo',
  limitations: [],
  nutritionDatasetVersion: 'dataset-v7',
  operationId: '20000000-0000-4000-8000-000000000001',
  overallAttention: 'insufficient_information',
  profileVersion: 1,
  ruleSetVersion: 'rules-v7',
  sources: [],
  supportStatus: 'complete',
  totals: {
    energyKcal: 130,
    carbohydrateG: 28,
    proteinG: 2,
    fatG: 0.3,
    fiberG: 0.4,
    sugarsG: 0.1,
    sodiumMg: 1,
  },
};

const scan: Scan = {
  createdAt: '2026-10-14T00:00:00.000Z',
  defaultConsumptionId: null,
  id: '30000000-0000-4000-8000-000000000001',
  latestJobId: '40000000-0000-4000-8000-000000000001',
  latestResultId: '20000000-0000-4000-8000-000000000001',
  photoId: '50000000-0000-4000-8000-000000000001',
  revision: 3,
};

function completedJob(overrides: Partial<Job> = {}): Job {
  return {
    attempts: 1,
    createdAt: '2026-10-14T00:00:00.000Z',
    error: null,
    finishedAt: '2026-10-14T00:00:01.000Z',
    id: scan.latestJobId,
    inputKind: 'correction',
    result,
    resultId: scan.latestResultId,
    scanId: scan.id,
    startedAt: '2026-10-14T00:00:00.500Z',
    status: 'completed',
    targetId: scan.id,
    targetRevision: scan.revision,
    targetType: 'scan',
    ...overrides,
  };
}

describe('food correction', () => {
  it('keeps a half-serving as serving quantity in the correction request', () => {
    const draft = createCorrectionDraft(result);
    draft[0]!.portion = {
      kind: 'known',
      quantity: 0.5,
      servingId: 'serving-bowl',
      unit: 'serving',
    };

    const input = buildCorrectionInput(scan, scan.latestResultId!, result.catalogVersion, draft);

    expect(input).toMatchObject({
      expectedRevision: 3,
      basedOnResultId: scan.latestResultId,
      catalogVersion: 'catalog-v7',
      components: [
        { portion: { kind: 'known', quantity: 0.5, servingId: 'serving-bowl', unit: 'serving' } },
      ],
    });
  });

  it('clears the prior portion when a replacement catalog food is selected', () => {
    const current = createCorrectionDraft(result)[0]!;
    const replacement = replaceCorrectionFood(current, {
      id: 'food-oat',
      displayName: 'Oatmeal',
      preparation: 'direbus',
    });

    expect(replacement).toMatchObject({
      catalogFoodId: 'food-oat',
      displayName: 'Oatmeal',
      preparation: 'direbus',
      portion: { kind: 'unknown' },
    });
  });

  it('keeps unknown portions explicit instead of using estimated grams', () => {
    const draft = createCorrectionDraft(result);
    draft[0]!.portion = { kind: 'unknown' };

    expect(
      buildCorrectionInput(scan, scan.latestResultId!, result.catalogVersion, draft).components[0]
        ?.portion
    ).toEqual({
      kind: 'unknown',
    });
  });

  it('does not submit against a result that is no longer current', () => {
    expect(() =>
      buildCorrectionInput(
        scan,
        '60000000-0000-4000-8000-000000000001',
        result.catalogVersion,
        createCorrectionDraft(result)
      )
    ).toThrow(/hasil terbaru/i);
  });

  it('shows a conflict message for a 409 and preserves the same request key for an unchanged retry', async () => {
    const requests: { headers: { 'Idempotency-Key': string }; body: unknown }[] = [];
    let keyNumber = 0;
    const actions = createCorrectionActions(
      {
        correctScan: async (input) => {
          requests.push(input);
          throw new ApiError(409, 'Conflict');
        },
        retryAnalysisJob: async () => {
          throw new Error('not used');
        },
      },
      createCorrectionActionState(() => `key-${++keyNumber}`)
    );
    const draft = createCorrectionDraft(result);

    await expect(
      actions.submit(scan.id, scan, scan.latestResultId!, result.catalogVersion, draft)
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      actions.submit(scan.id, scan, scan.latestResultId!, result.catalogVersion, draft)
    ).rejects.toMatchObject({ status: 409 });
    const replacementDraft = [
      {
        ...draft[0]!,
        catalogFoodId: null,
        displayName: 'Beras merah',
        preparation: null,
        portion: { kind: 'unknown' as const },
      },
    ];
    await expect(
      actions.submit(scan.id, scan, scan.latestResultId!, result.catalogVersion, replacementDraft)
    ).rejects.toMatchObject({ status: 409 });

    expect(getCorrectionErrorMessage(409)).toMatch(/hasil berubah|sedang berjalan/i);
    expect(requests[0]?.headers['Idempotency-Key']).toBe(requests[1]?.headers['Idempotency-Key']);
    expect(requests[0]?.body).toEqual(requests[1]?.body);
    expect(requests[2]?.headers['Idempotency-Key']).not.toBe(
      requests[0]?.headers['Idempotency-Key']
    );
    expect(requests[2]?.body).toMatchObject({
      components: [
        { displayName: 'Beras merah', catalogFoodId: null, portion: { kind: 'unknown' } },
      ],
    });
  });

  it('allows confirmation only when the latest scan job completed the current result revision', () => {
    expect(canConfirmLatestScanResult(scan, completedJob())).toBe(true);
    expect(
      canConfirmLatestScanResult(
        scan,
        completedJob({ status: 'processing', result: null, resultId: null })
      )
    ).toBe(false);
    expect(canConfirmLatestScanResult(scan, completedJob({ targetRevision: 2 }))).toBe(false);
  });

  it('allows the prior still-current result only after an explicit return from a failed correction', () => {
    const failedCorrection = completedJob({
      id: '70000000-0000-4000-8000-000000000001',
      inputKind: 'correction',
      result: null,
      resultId: null,
      status: 'failed',
      targetRevision: scan.revision + 1,
    });

    const failedScan = { ...scan, latestJobId: failedCorrection.id };
    expect(canConfirmSelectedScanResult(failedScan, completedJob(), failedCorrection, false)).toBe(
      false
    );
    expect(canConfirmSelectedScanResult(failedScan, completedJob(), failedCorrection, true)).toBe(
      true
    );
    expect(
      canConfirmSelectedScanResult(
        failedScan,
        completedJob(),
        { ...failedCorrection, status: 'processing' },
        true
      )
    ).toBe(false);
  });

  it('never confirms the previously displayed result after a newer correction succeeds', () => {
    const correctedScan = {
      ...scan,
      latestJobId: '80000000-0000-4000-8000-000000000001',
      latestResultId: '90000000-0000-4000-8000-000000000001',
      revision: scan.revision + 1,
    };
    const correctedJob = completedJob({
      id: correctedScan.latestJobId,
      resultId: correctedScan.latestResultId,
      targetRevision: correctedScan.revision,
    });

    expect(canConfirmSelectedScanResult(correctedScan, completedJob(), correctedJob, true)).toBe(
      false
    );
  });
});
