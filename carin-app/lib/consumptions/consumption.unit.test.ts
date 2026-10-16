import { describe, expect, it } from 'vitest';
import type { components } from '@/lib/api/generated/app-api';
import {
  buildManualConsumptionInput,
  buildManualConsumptionUpdateInput,
  createManualConsumptionDraftFromRecord,
  createManualFoodComponentDraft,
  formatLocalDateTime,
  formatNutrient,
  localDateTimeToIso,
  mapManualComponent,
  parsePhotoPortionFraction,
  parsePortionQuantity,
  removeManualComponent,
  upsertManualComponent,
  type ManualConsumptionDraft,
  type ManualFoodComponentDraft,
} from './consumption';

function component(fields: Partial<ManualFoodComponentDraft> = {}): ManualFoodComponentDraft {
  return {
    id: 'e15a4bd1-f98a-4abc-9f21-a0c1d3e78510',
    displayName: 'Nasi goreng',
    catalogFoodId: null,
    preparation: null,
    portion: { kind: 'unknown' },
    ...fields,
  };
}

function draft(fields: Partial<ManualConsumptionDraft> = {}): ManualConsumptionDraft {
  return {
    consumedDate: '2026-10-14',
    consumedTime: '12:30',
    catalogVersion: 'catalog-v3',
    components: [component()],
    ...fields,
  };
}

describe('manual consumption form mapping', () => {
  it('parses Indonesian decimal commas and ordinary decimal points', () => {
    expect(parsePortionQuantity('1,5')).toEqual({ value: 1.5 });
    expect(parsePortionQuantity('0.25')).toEqual({ value: 0.25 });
  });

  it.each(['0', '-1', 'satu', '1,2,3'])('rejects invalid portion quantity %s', (raw) => {
    expect(parsePortionQuantity(raw)).toHaveProperty('error');
  });

  it('keeps an unmatched food text-only with an unknown portion', () => {
    expect(mapManualComponent(component({ displayName: '  Makanan rumahan  ' }))).toEqual({
      value: {
        id: 'e15a4bd1-f98a-4abc-9f21-a0c1d3e78510',
        displayName: 'Makanan rumahan',
        catalogFoodId: null,
        preparation: null,
        portion: { kind: 'unknown' },
      },
    });
  });

  it('requires an explicit catalog selection and keeps “Makanan lain” unmatched', () => {
    expect(createManualFoodComponentDraft('  Sambal buatan rumah  ', null, 'component-2')).toEqual({
      id: 'component-2',
      displayName: 'Sambal buatan rumah',
      catalogFoodId: null,
      preparation: null,
      portion: { kind: 'unknown' },
    });
  });

  it('uses the selected catalog identity and preparation instead of a typed lookalike', () => {
    const food = {
      id: 'catalog-food-1',
      catalogVersion: 'catalog-v3',
      displayName: 'Tempe goreng',
      aliases: ['tempe'],
      preparation: 'digoreng',
      per100g: {},
      servings: [],
      sources: [],
      nutrientSourceIds: {},
    } as unknown as components['schemas']['ai__CatalogFood'];
    expect(createManualFoodComponentDraft('Tempe', food, 'component-3')).toEqual({
      id: 'component-3',
      displayName: 'Tempe goreng',
      catalogFoodId: 'catalog-food-1',
      preparation: 'digoreng',
      portion: { kind: 'unknown' },
    });
  });

  it('supports replacing and removing one component without duplicating its identifier', () => {
    const original = component();
    const changed = { ...original, displayName: 'Nasi uduk' };
    expect(upsertManualComponent([original], changed, original.id)).toEqual({
      value: [changed],
    });
    expect(
      removeManualComponent([original, component({ id: 'component-2' })], original.id)
    ).toEqual([component({ id: 'component-2' })]);
  });

  it('maps decimal grams and catalog servings without guessing a portion', () => {
    expect(
      mapManualComponent(
        component({
          catalogFoodId: 'food-rice',
          portion: { kind: 'known', quantity: '125,5', unit: 'g' },
        })
      )
    ).toEqual({
      value: {
        id: 'e15a4bd1-f98a-4abc-9f21-a0c1d3e78510',
        displayName: 'Nasi goreng',
        catalogFoodId: 'food-rice',
        preparation: null,
        portion: { kind: 'known', quantity: 125.5, unit: 'g' },
      },
    });

    expect(
      mapManualComponent(
        component({
          catalogFoodId: 'food-rice',
          portion: {
            kind: 'known',
            quantity: '1,25',
            unit: 'serving',
            servingId: 'serving-small-bowl',
          },
        })
      )
    ).toMatchObject({
      value: {
        portion: {
          kind: 'known',
          quantity: 1.25,
          unit: 'serving',
          servingId: 'serving-small-bowl',
        },
      },
    });
  });

  it('builds a manual request with explicit source, occurrence, account timezone, and no scan refs', () => {
    expect(buildManualConsumptionInput(draft(), 'Asia/Jakarta')).toEqual({
      value: {
        source: 'manual',
        scanId: null,
        sourceAnalysisResultId: null,
        occurrence: 'new_occurrence',
        consumedAt: '2026-10-14T05:30:00.000Z',
        timezone: 'Asia/Jakarta',
        catalogVersion: 'catalog-v3',
        components: [
          {
            id: 'e15a4bd1-f98a-4abc-9f21-a0c1d3e78510',
            displayName: 'Nasi goreng',
            catalogFoodId: null,
            preparation: null,
            portion: { kind: 'unknown' },
          },
        ],
      },
    });
  });

  it('builds an edit request with the current revision and the same frozen catalog version', () => {
    expect(buildManualConsumptionUpdateInput(draft(), 'Asia/Jakarta', 4)).toEqual({
      value: {
        expectedRevision: 4,
        consumedAt: '2026-10-14T05:30:00.000Z',
        timezone: 'Asia/Jakarta',
        catalogVersion: 'catalog-v3',
        components: [
          {
            id: 'e15a4bd1-f98a-4abc-9f21-a0c1d3e78510',
            displayName: 'Nasi goreng',
            catalogFoodId: null,
            preparation: null,
            portion: { kind: 'unknown' },
          },
        ],
      },
    });
  });

  it('reopens a record in its recorded timezone and retains unknown portion state', () => {
    const record = {
      id: 'consumption-1',
      revision: 3,
      source: 'manual',
      scanId: null,
      sourceAnalysisResultId: null,
      photoAvailable: false,
      consumedAt: '2026-10-14T05:30:00.000Z',
      timezone: 'Asia/Jakarta',
      createdAt: '2026-10-14T05:30:00.000Z',
      updatedAt: '2026-10-14T05:30:00.000Z',
      attentionState: 'pending',
      attentionJobId: 'job-1',
      snapshot: {
        catalogVersion: 'catalog-v3',
        components: [
          {
            id: 'e15a4bd1-f98a-4abc-9f21-a0c1d3e78510',
            displayName: 'Makanan rumahan',
            catalogFoodId: null,
            preparation: null,
            matchStatus: 'unmatched',
            portion: {
              quantity: null,
              unit: null,
              servingId: null,
              grams: null,
              origin: 'user_reported',
              basis: null,
              sourceId: null,
            },
            nutrients: {},
            sourceIds: [],
            nutrientSourceIds: {},
            per100g: {},
          },
        ],
      },
    } as unknown as import('./consumption').ManualConsumption;
    expect(createManualConsumptionDraftFromRecord(record)).toEqual({
      consumedDate: '2026-10-14',
      consumedTime: '12:30',
      catalogVersion: 'catalog-v3',
      components: [component({ displayName: 'Makanan rumahan' })],
      activeComponent: null,
      editingComponentId: null,
    });
  });
});

describe('account-local consumption time', () => {
  it('formats the current time in the account timezone and converts it to a UTC instant', () => {
    const local = formatLocalDateTime(new Date('2026-10-14T05:30:00.000Z'), 'Asia/Jakarta');
    expect(local).toEqual({ date: '2026-10-14', time: '12:30' });
    expect(localDateTimeToIso(local.date, local.time, 'Asia/Jakarta')).toEqual({
      value: '2026-10-14T05:30:00.000Z',
    });
  });

  it('rejects impossible dates, clock values, and daylight-saving gaps', () => {
    expect(localDateTimeToIso('2026-02-30', '12:00', 'Asia/Jakarta')).toHaveProperty('error');
    expect(localDateTimeToIso('2026-10-14', '25:00', 'Asia/Jakarta')).toHaveProperty('error');
    expect(localDateTimeToIso('2026-03-08', '02:30', 'America/New_York')).toHaveProperty('error');
  });
});

describe('nutrient presentation', () => {
  it('keeps a missing nutrient visibly unavailable instead of converting it to zero', () => {
    expect(formatNutrient(null, 'g')).toBe('Belum tersedia');
    expect(formatNutrient(0, 'g')).toBe('0 g');
    expect(formatNutrient(12.5, 'g')).toBe('12,5 g');
  });
});

describe('photo portion fraction', () => {
  it('accepts positive fractions through 100 and rejects invalid or excessive values', () => {
    expect(parsePhotoPortionFraction('0,5')).toEqual({ value: 0.5 });
    expect(parsePhotoPortionFraction('100')).toEqual({ value: 100 });
    expect(parsePhotoPortionFraction('0')).toHaveProperty('error');
    expect(parsePhotoPortionFraction('100,1')).toHaveProperty('error');
    expect(parsePhotoPortionFraction('abc')).toHaveProperty('error');
  });
});
