import { describe, expect, it } from 'vitest';
import type { components } from '@/lib/api/generated/app-api';
import type { ManualConsumptionDraft } from './consumption';
import {
  buildPhotoConsumptionInput,
  createPhotoConfirmationDraft,
  getPhotoConfirmationAvailability,
  type PhotoConfirmationOccurrence,
} from './photo-confirmation';

type AnalysisResult = components['schemas']['ai__AnalysisResult'];
type AnalysisComponent = components['schemas']['ai__ComponentResult'];
type Scan = components['schemas']['Scan'];
type AnalysisJob = components['schemas']['AnalysisJob'];

const resultComponent = (id: string, fields: Partial<AnalysisComponent> = {}): AnalysisComponent =>
  ({
    id,
    displayName: 'Nasi goreng',
    catalogFoodId: 'food-rice',
    preparation: 'digoreng',
    matchStatus: 'matched',
    portion: {
      basis: 'piring sedang',
      grams: 150,
      origin: 'photo_estimate',
      quantity: 150,
      servingId: null,
      sourceId: 'portion-source',
      unit: 'g',
    },
    nutrients: {},
    nutrientSourceIds: {},
    per100g: {},
    sourceIds: [],
    ...fields,
  }) as AnalysisComponent;

const result = (fields: Partial<AnalysisResult> = {}): AnalysisResult =>
  ({
    attentions: [],
    catalogVersion: 'catalog-photo-v8',
    components: [],
    computedAt: '2026-10-14T04:00:00.000Z',
    contractVersion: '2.0.0',
    coverage: {},
    dataMode: 'synthetic',
    inputKind: 'photo',
    limitations: [],
    nutritionDatasetVersion: 'nutrition-v1',
    // This is the job/correlation ID, not the result row ID.
    operationId: 'job-operation-4',
    overallAttention: 'insufficient_information',
    profileVersion: 1,
    ruleSetVersion: 'rules-v1',
    sources: [],
    supportStatus: 'partial',
    totals: {},
    ...fields,
  }) as AnalysisResult;

const scan = (fields: Partial<Scan> = {}): Scan =>
  ({
    createdAt: '2026-10-14T04:00:00.000Z',
    defaultConsumptionId: null,
    id: 'scan-1',
    latestJobId: 'job-1',
    latestResultId: 'result-1',
    photoId: 'photo-1',
    revision: 2,
    ...fields,
  }) as Scan;

const job = (fields: Partial<AnalysisJob> = {}): AnalysisJob =>
  ({
    attempts: 1,
    createdAt: '2026-10-14T04:00:00.000Z',
    error: null,
    finishedAt: '2026-10-14T04:01:00.000Z',
    id: 'job-1',
    inputKind: 'photo',
    result: null,
    resultId: 'result-1',
    scanId: 'scan-1',
    startedAt: '2026-10-14T04:00:10.000Z',
    status: 'completed',
    targetId: 'scan-1',
    targetRevision: 2,
    targetType: 'scan',
    ...fields,
  }) as AnalysisJob;

function availability(
  fields: Partial<Parameters<typeof getPhotoConfirmationAvailability>[0]> = {}
) {
  return getPhotoConfirmationAvailability({
    scan: scan(),
    latestJob: job(),
    resultId: 'result-1',
    result: result(),
    explicitlyUseLastSuccessfulResult: false,
    ...fields,
  });
}

function draft(fields: Partial<ManualConsumptionDraft> = {}): ManualConsumptionDraft {
  return {
    consumedDate: '2026-10-14',
    consumedTime: '12:30',
    catalogVersion: 'catalog-photo-v8',
    components: [
      {
        id: 'component-1',
        displayName: 'Nasi goreng',
        catalogFoodId: 'food-rice',
        preparation: 'digoreng',
        portion: { kind: 'known', quantity: '150', unit: 'g' },
      },
    ],
    ...fields,
  };
}

describe('photo confirmation draft mapping', () => {
  it('maps recognized components and supported estimates into the editable C22 draft', () => {
    const analysis = result({
      components: [
        resultComponent('component-rice', {
          displayName: 'Nasi goreng spesial',
          portion: {
            basis: 'gram',
            grams: 125.5,
            origin: 'photo_estimate',
            quantity: 125.5,
            servingId: null,
            sourceId: null,
            unit: 'g',
          },
        }),
        resultComponent('component-soup', {
          displayName: 'Soto ayam',
          catalogFoodId: 'food-soup',
          preparation: 'berkuah',
          portion: {
            basis: 'mangkuk',
            grams: 300,
            origin: 'photo_estimate',
            quantity: 1,
            servingId: 'serving-bowl',
            sourceId: null,
            unit: 'serving',
          },
        }),
        resultComponent('component-unknown', {
          displayName: 'Sambal rumahan',
          catalogFoodId: null,
          matchStatus: 'unmatched',
          preparation: null,
          portion: {
            basis: null,
            grams: null,
            origin: 'photo_estimate',
            quantity: null,
            servingId: null,
            sourceId: null,
            unit: null,
          },
        }),
        resultComponent('component-serving-without-id', {
          portion: {
            basis: 'porsi',
            grams: 100,
            origin: 'photo_estimate',
            quantity: 1,
            servingId: null,
            sourceId: null,
            unit: 'serving',
          },
        }),
        resultComponent('component-unsupported', {
          portion: {
            basis: null,
            grams: 50,
            origin: 'photo_estimate',
            quantity: 50,
            servingId: null,
            sourceId: null,
            unit: 'oz',
          } as unknown as AnalysisComponent['portion'],
        }),
      ],
    });

    expect(
      createPhotoConfirmationDraft(analysis, new Date('2026-10-14T05:30:00.000Z'), 'Asia/Jakarta')
    ).toEqual({
      consumedDate: '2026-10-14',
      consumedTime: '12:30',
      catalogVersion: 'catalog-photo-v8',
      components: [
        {
          id: 'component-rice',
          displayName: 'Nasi goreng spesial',
          catalogFoodId: 'food-rice',
          preparation: 'digoreng',
          portion: { kind: 'known', quantity: '125.5', unit: 'g' },
        },
        {
          id: 'component-soup',
          displayName: 'Soto ayam',
          catalogFoodId: 'food-soup',
          preparation: 'berkuah',
          portion: {
            kind: 'known',
            quantity: '1',
            unit: 'serving',
            servingId: 'serving-bowl',
          },
        },
        {
          id: 'component-unknown',
          displayName: 'Sambal rumahan',
          catalogFoodId: null,
          preparation: null,
          portion: { kind: 'unknown' },
        },
        {
          id: 'component-serving-without-id',
          displayName: 'Nasi goreng',
          catalogFoodId: 'food-rice',
          preparation: 'digoreng',
          portion: { kind: 'unknown' },
        },
        {
          id: 'component-unsupported',
          displayName: 'Nasi goreng',
          catalogFoodId: 'food-rice',
          preparation: 'digoreng',
          portion: { kind: 'unknown' },
        },
      ],
      activeComponent: null,
      editingComponentId: null,
    });
  });

  it('keeps a zero estimate known so payload validation can reject it', () => {
    const mapped = createPhotoConfirmationDraft(
      result({
        components: [
          resultComponent('component-zero', {
            portion: {
              basis: null,
              grams: 0,
              origin: 'photo_estimate',
              quantity: 0,
              servingId: null,
              sourceId: null,
              unit: 'g',
            },
          }),
        ],
      }),
      new Date('2026-10-14T05:30:00.000Z'),
      'Asia/Jakarta'
    );

    expect(mapped.components[0]?.portion).toEqual({ kind: 'known', quantity: '0', unit: 'g' });
    expect(
      buildPhotoConsumptionInput(mapped, {
        scanId: 'scan-1',
        resultId: 'result-1',
        occurrence: 'default_confirmation',
        timeZone: 'Asia/Jakarta',
      })
    ).toHaveProperty('error');
  });

  it.each(['unmatched', 'unrecognized'] as const)(
    'does not carry a server catalog match into a %s draft component',
    (matchStatus) => {
      const mapped = createPhotoConfirmationDraft(
        result({
          components: [
            resultComponent('component-unmatched', {
              matchStatus,
              catalogFoodId: 'server-food-id',
            }),
          ],
        }),
        new Date('2026-10-14T05:30:00.000Z'),
        'Asia/Jakarta'
      );

      expect(mapped.components[0]).toMatchObject({
        id: 'component-unmatched',
        catalogFoodId: null,
      });
    }
  );
});

describe('photo consumption input', () => {
  it.each<PhotoConfirmationOccurrence>(['default_confirmation', 'new_occurrence'])(
    'builds a photo payload with %s occurrence and source result identity',
    (occurrence) => {
      expect(
        buildPhotoConsumptionInput(draft(), {
          scanId: 'scan-7',
          resultId: 'result-row-9',
          occurrence,
          timeZone: 'Asia/Jakarta',
        })
      ).toEqual({
        value: {
          source: 'photo_confirmation',
          scanId: 'scan-7',
          sourceAnalysisResultId: 'result-row-9',
          occurrence,
          consumedAt: '2026-10-14T05:30:00.000Z',
          timezone: 'Asia/Jakarta',
          catalogVersion: 'catalog-photo-v8',
          components: [
            {
              id: 'component-1',
              displayName: 'Nasi goreng',
              catalogFoodId: 'food-rice',
              preparation: 'digoreng',
              portion: { kind: 'known', quantity: 150, unit: 'g' },
            },
          ],
        },
      });
    }
  );

  it.each([
    ['impossible calendar date', { consumedDate: '2026-02-30', consumedTime: '12:00' }],
    ['invalid clock time', { consumedDate: '2026-10-14', consumedTime: '24:00' }],
  ])('returns an error for an %s', (_label, fields) => {
    expect(
      buildPhotoConsumptionInput(draft(fields), {
        scanId: 'scan-1',
        resultId: 'result-1',
        occurrence: 'default_confirmation',
        timeZone: 'Asia/Jakarta',
      })
    ).toHaveProperty('error');
  });

  it.each(['0', 'not-a-number'])(
    'rejects invalid known quantity %s instead of treating it as unknown',
    (quantity) => {
      const outcome = buildPhotoConsumptionInput(
        draft({
          components: [
            {
              id: 'component-invalid',
              displayName: 'Nasi goreng',
              catalogFoodId: 'food-rice',
              preparation: 'digoreng',
              portion: { kind: 'known', quantity, unit: 'g' },
            },
          ],
        }),
        {
          scanId: 'scan-1',
          resultId: 'result-1',
          occurrence: 'default_confirmation',
          timeZone: 'Asia/Jakarta',
        }
      );

      expect(outcome).toHaveProperty('error');
    }
  );

  it('requires between one and thirty components', () => {
    const fields = {
      scanId: 'scan-1',
      resultId: 'result-1',
      occurrence: 'default_confirmation' as const,
      timeZone: 'Asia/Jakarta',
    };
    expect(buildPhotoConsumptionInput(draft({ components: [] }), fields)).toHaveProperty('error');
    expect(
      buildPhotoConsumptionInput(
        draft({
          components: Array.from({ length: 31 }, (_, index) => ({
            id: `component-${index}`,
            displayName: `Makanan ${index}`,
            catalogFoodId: null,
            preparation: null,
            portion: { kind: 'unknown' as const },
          })),
        }),
        fields
      )
    ).toHaveProperty('error');
  });
});

describe('photo confirmation availability', () => {
  it('enables the current result even when its operation ID differs from the result row ID', () => {
    expect(availability()).toBe('confirm');
  });

  it.each(['queued', 'processing'] as const)(
    'blocks while the latest scan analysis job is %s',
    (status) => {
      expect(
        availability({ latestJob: job({ status, inputKind: 'correction', targetRevision: 3 }) })
      ).toBe('correction_pending');
    }
  );

  it('requires an explicit choice to use the retained result after a failed correction', () => {
    const latestJob = job({
      status: 'failed',
      inputKind: 'correction',
      resultId: null,
      targetRevision: 3,
    });
    expect(availability({ latestJob })).toBe('unavailable');
    expect(availability({ latestJob, explicitlyUseLastSuccessfulResult: true })).toBe('confirm');
  });

  it('blocks when the scan has no latest result', () => {
    expect(availability({ scan: scan({ latestResultId: null }) })).toBe('unavailable');
  });

  it('blocks a fetched result that is no longer the scan latest result', () => {
    expect(availability({ resultId: 'older-result-row' })).toBe('unavailable');
  });

  it('marks a latest job for another scan as stale', () => {
    expect(availability({ latestJob: job({ scanId: 'scan-2' }) })).toBe('unavailable');
  });

  it('marks a latest job for another scan revision as stale', () => {
    expect(availability({ latestJob: job({ targetRevision: 1 }) })).toBe('unavailable');
  });

  it.each([
    ['queued', 2],
    ['queued', 4],
    ['processing', 4],
    ['failed', 2],
    ['failed', 4],
  ] as const)('rejects a %s correction targeting stale revision %s', (status, targetRevision) => {
    expect(
      availability({
        latestJob: job({
          status,
          inputKind: 'correction',
          targetRevision,
          resultId: status === 'failed' ? null : 'result-1',
        }),
        explicitlyUseLastSuccessfulResult: true,
      })
    ).toBe('unavailable');
  });

  it.each(['queued', 'failed'] as const)(
    'does not treat a %s non-correction job as the current scan correction',
    (status) => {
      expect(
        availability({
          latestJob: job({
            status,
            inputKind: 'photo',
            targetRevision: 3,
            resultId: status === 'failed' ? null : 'result-1',
          }),
          explicitlyUseLastSuccessfulResult: true,
        })
      ).toBe('unavailable');
    }
  );

  it('requires a completed job to target the current scan revision', () => {
    expect(availability({ latestJob: job({ targetRevision: 3 }) })).toBe('unavailable');
  });

  it('marks a latest job with a mismatched target type or target ID as stale', () => {
    expect(availability({ latestJob: job({ targetType: 'consumption' }) })).toBe('unavailable');
    expect(availability({ latestJob: job({ targetId: 'scan-2' }) })).toBe('unavailable');
  });

  it('marks a different known latest job or result ID as stale', () => {
    expect(availability({ latestJob: job({ id: 'job-2' }) })).toBe('unavailable');
    expect(availability({ latestJob: job({ resultId: 'result-2' }) })).toBe('unavailable');
  });

  it('offers the existing default record while allowing an explicit new occurrence payload', () => {
    expect(availability({ scan: scan({ defaultConsumptionId: 'consumption-1' }) })).toBe(
      'open_existing'
    );
    expect(
      availability({
        scan: scan({ defaultConsumptionId: 'consumption-1' }),
        occurrence: 'new_occurrence',
      })
    ).toBe('confirm');
    expect(
      buildPhotoConsumptionInput(draft(), {
        scanId: 'scan-1',
        resultId: 'result-1',
        occurrence: 'new_occurrence',
        timeZone: 'Asia/Jakarta',
      })
    ).toHaveProperty('value');
  });

  it('opens the saved default during correction while gating a new occurrence', () => {
    const input = {
      scan: scan({ defaultConsumptionId: 'consumption-1' }),
      latestJob: job({ status: 'processing', inputKind: 'correction', targetRevision: 3 }),
    };

    expect(availability(input)).toBe('open_existing');
    expect(availability({ ...input, occurrence: 'new_occurrence' })).toBe('correction_pending');
  });

  it('opens the saved default after a failed correction while gating a new occurrence', () => {
    const input = {
      scan: scan({ defaultConsumptionId: 'consumption-1' }),
      latestJob: job({
        status: 'failed',
        inputKind: 'correction',
        resultId: null,
        targetRevision: 3,
      }),
      resultId: undefined,
      result: undefined,
    };

    expect(availability(input)).toBe('open_existing');
    expect(availability({ ...input, occurrence: 'new_occurrence' })).toBe('unavailable');
  });

  it('opens the saved default with no latest result while keeping a new occurrence unavailable', () => {
    const input = {
      scan: scan({ defaultConsumptionId: 'consumption-1', latestResultId: null }),
      latestJob: undefined,
      resultId: undefined,
      result: undefined,
    };

    expect(availability(input)).toBe('open_existing');
    expect(availability({ ...input, occurrence: 'new_occurrence' })).toBe('unavailable');
  });
});
