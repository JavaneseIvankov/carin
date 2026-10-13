import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  calculateCalendarAge,
  isSignupAgeEligible,
} from './age.js';
import {
  aggregateNutrients,
  calculatePortionGrams,
  scaleNutrients,
  type Nutrients,
} from './nutrition.js';
import { getDashboardWindow } from './time-window.js';
import {
  getExaminationDatePrecision,
  getExaminationSeriesKey,
} from './examinations.js';
import { isValidAnalysisJobState } from './job-state.js';

const fixture = <T>(name: string): T =>
  JSON.parse(
    readFileSync(new URL(`../../../specs/fixtures/ai/${name}`, import.meta.url), 'utf8'),
  ) as T;

const complete = fixture<{
  components: { per100g: Nutrients; nutrients: Nutrients; portion: { grams: number } }[];
  totals: Nutrients;
  coverage: Record<string, { knownComponentCount: number; totalComponentCount: number }>;
}>('analysis-complete.json');
const partial = fixture<{
  components: { nutrients: Nutrients }[];
  totals: Nutrients;
  coverage: Record<string, { knownComponentCount: number; totalComponentCount: number }>;
}>('analysis-partial.json');
const unrecognized = fixture<{
  totals: Nutrients;
  coverage: Record<string, { knownComponentCount: number; totalComponentCount: number }>;
}>('analysis-unrecognized.json');
const correction = fixture<{
  components: { per100g: Nutrients; nutrients: Nutrients; portion: { grams: number } }[];
  totals: Nutrients;
}>('correction-complete.json');
const nutrients = (values: Partial<Nutrients>): Nutrients => ({
  energyKcal: null,
  carbohydrateG: null,
  proteinG: null,
  fatG: null,
  fiberG: null,
  sugarsG: null,
  sodiumMg: null,
  ...values,
});

describe('calendar age', () => {
  it('counts the birthday itself and keeps age 50 through the day before the 51st birthday', () => {
    expect(calculateCalendarAge('2008-10-14', '2026-10-13')).toBe(17);
    expect(calculateCalendarAge('2008-10-14', '2026-10-14')).toBe(18);
    expect(calculateCalendarAge('1976-10-15', '2026-10-14')).toBe(49);
    expect(calculateCalendarAge('1976-10-14', '2026-10-14')).toBe(50);
    expect(calculateCalendarAge('1976-10-14', '2027-10-13')).toBe(50);
    expect(calculateCalendarAge('1976-10-14', '2027-10-14')).toBe(51);
  });

  it('does not reach a leap-day birthday until March 1 in a non-leap year', () => {
    expect(calculateCalendarAge('2008-02-29', '2025-02-28')).toBe(16);
    expect(calculateCalendarAge('2008-02-29', '2025-03-01')).toBe(17);
  });

  it('uses Asia/Jakarta signup date and rejects future or out-of-range DOBs', () => {
    expect(isSignupAgeEligible('2008-10-14', new Date('2026-10-13T17:30:00.000Z'))).toBe(true);
    expect(isSignupAgeEligible('2008-10-14', new Date('2026-10-13T16:59:59.000Z'))).toBe(false);
    expect(isSignupAgeEligible('2026-10-15', new Date('2026-10-14T12:00:00.000Z'))).toBe(false);
    expect(isSignupAgeEligible('1975-10-14', new Date('2026-10-14T12:00:00.000Z'))).toBe(false);
  });
});

describe('portion and nutrient math', () => {
  it('scales serving grams and nutrients to the correction fixture', () => {
    const component = correction.components[0]!;
    const grams = calculatePortionGrams({ quantity: 0.5, unit: 'serving', servingGrams: 100 });
    expect(grams).toBe(component.portion.grams);
    expect(scaleNutrients(component.per100g, grams)).toEqual(component.nutrients);
    expect(correction.totals).toEqual(component.nutrients);
  });

  it('keeps unmapped portions unknown and rejects invalid known quantities', () => {
    expect(calculatePortionGrams({ quantity: 2, unit: 'serving', servingGrams: null })).toBeNull();
    expect(calculatePortionGrams({ quantity: null, unit: null, servingGrams: null })).toBeNull();
    expect(() => calculatePortionGrams({ quantity: 0, unit: 'g', servingGrams: null })).toThrow();
  });

  it('rejects portions smaller than the supported six-decimal gram precision', () => {
    expect(() => calculatePortionGrams({ quantity: 1e-7, unit: 'g', servingGrams: null })).toThrow();
    expect(() => calculatePortionGrams({ quantity: 1e-7, unit: 'serving', servingGrams: 1 })).toThrow();
  });

  it('matches complete fixture nutrient values and does not mutate source data', () => {
    const source = structuredClone(complete.components[0]!.per100g);
    const before = structuredClone(source);
    expect(scaleNutrients(source, complete.components[0]!.portion.grams)).toEqual(
      complete.components[0]!.nutrients,
    );
    expect(source).toEqual(before);
  });

  it('keeps explicit zero known while null remains unknown in mixed coverage', () => {
    const zero = nutrients({ energyKcal: 0, carbohydrateG: null });
    const known = nutrients({ energyKcal: 0, carbohydrateG: 30 });
    const result = aggregateNutrients([zero, known]);
    expect(result.totals.energyKcal).toBe(0);
    expect(result.totals.carbohydrateG).toBe(30);
    expect(result.coverage.energyKcal).toEqual({ knownComponentCount: 2, totalComponentCount: 2 });
    expect(result.coverage.carbohydrateG).toEqual({ knownComponentCount: 1, totalComponentCount: 2 });
  });

  it('requires positive finite edible grams while preserving unknown and known-zero nutrients', () => {
    const source = nutrients({ energyKcal: 0, carbohydrateG: null });
    expect(scaleNutrients(source, 10)).toEqual(nutrients({ energyKcal: 0, carbohydrateG: null }));
    for (const grams of [-1, 0, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => scaleNutrients(source, grams)).toThrow();
    }
    expect(scaleNutrients(source, null)).toEqual(nutrients({}));
  });

  it('matches partial and unrecognized fixture totals and coverage', () => {
    expect(aggregateNutrients(partial.components.map(({ nutrients }) => nutrients))).toEqual({
      totals: partial.totals,
      coverage: partial.coverage,
    });
    expect(aggregateNutrients([{
      energyKcal: null,
      carbohydrateG: null,
      proteinG: null,
      fatG: null,
      fiberG: null,
      sugarsG: null,
      sodiumMg: null,
    }])).toEqual({ totals: unrecognized.totals, coverage: unrecognized.coverage });
  });

  it('returns null totals for empty or unknown coverage and retains calculation precision', () => {
    expect(aggregateNutrients([]).totals.energyKcal).toBeNull();
    expect(aggregateNutrients([nutrients({})]).totals.energyKcal).toBeNull();
    expect(scaleNutrients(nutrients({ energyKcal: 1 }), 33.3333333).energyKcal).toBeCloseTo(
      0.333333,
      6,
    );
  });
});

describe('timezone dashboard window', () => {
  it('returns today plus six preceding local dates and half-open UTC boundaries', () => {
    expect(getDashboardWindow(new Date('2026-10-14T00:30:00.000Z'), 'Asia/Jakarta')).toEqual({
      timezone: 'Asia/Jakarta',
      startDate: '2026-10-08',
      endDate: '2026-10-14',
      startInclusiveUtc: '2026-10-07T17:00:00.000Z',
      endExclusiveUtc: '2026-10-14T17:00:00.000Z',
      dates: [
        '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11',
        '2026-10-12', '2026-10-13', '2026-10-14',
      ],
    });
  });

  it('uses local midnights across DST changes', () => {
    const window = getDashboardWindow(new Date('2026-03-09T12:00:00.000Z'), 'America/New_York');
    expect(window.startDate).toBe('2026-03-03');
    expect(window.endDate).toBe('2026-03-09');
    expect(window.startInclusiveUtc).toBe('2026-03-03T05:00:00.000Z');
    expect(window.endExclusiveUtc).toBe('2026-03-10T04:00:00.000Z');
  });

  it('uses the first valid instant after a midnight DST gap', () => {
    const window = getDashboardWindow(new Date('2026-09-05T12:00:00.000Z'), 'America/Santiago');
    expect(window.endDate).toBe('2026-09-05');
    expect(window.endExclusiveUtc).toBe('2026-09-06T04:00:00.000Z');
  });

  it('uses the next valid local date boundary when an entire date is skipped', () => {
    const window = getDashboardWindow(new Date('2011-12-29T12:00:00.000Z'), 'Pacific/Apia');
    expect(window.endDate).toBe('2011-12-29');
    expect(window.endExclusiveUtc).toBe('2011-12-30T10:00:00.000Z');
  });

  it('rejects invalid instants and timezones', () => {
    expect(() => getDashboardWindow(new Date(Number.NaN), 'Asia/Jakarta')).toThrow();
    expect(() => getDashboardWindow(new Date(), 'Mars/Olympus')).toThrow();
  });
});

describe('examination series and precision', () => {
  it('groups pressure values while keeping glucose contexts and cholesterol subtypes separate', () => {
    expect(getExaminationSeriesKey({ type: 'pressure', unit: 'mmHg', context: 'systolic' })).toBe(
      getExaminationSeriesKey({ type: 'pressure', unit: 'mmHg', context: 'diastolic' }),
    );
    expect(getExaminationSeriesKey({ type: 'glucose', unit: 'mg/dL', context: 'fasting' })).not.toBe(
      getExaminationSeriesKey({ type: 'glucose', unit: 'mg/dL', context: 'random' }),
    );
    expect(getExaminationSeriesKey({ type: 'cholesterol', unit: 'mg/dL', context: 'ldl' })).not.toBe(
      getExaminationSeriesKey({ type: 'cholesterol', unit: 'mg/dL', context: 'hdl' }),
    );
  });

  it('preserves date-only measurements without inventing a time', () => {
    expect(getExaminationDatePrecision(null)).toBe('date_only');
    expect(getExaminationDatePrecision('09:05')).toBe('date_time');
    expect(() => getExaminationDatePrecision('24:00')).toThrow();
  });
});

describe('analysis job status invariants', () => {
  it('accepts the failed job fixture and rejects inconsistent terminal payloads', () => {
    const failed = fixture<Record<string, unknown>>('job-failed.json');
    expect(isValidAnalysisJobState(failed)).toBe(true);
    expect(isValidAnalysisJobState({ ...failed, status: 'completed' })).toBe(false);
    expect(isValidAnalysisJobState({ ...failed, resultId: 'result-id' })).toBe(false);
    expect(isValidAnalysisJobState({
      ...failed,
      status: 'processing',
      finishedAt: null,
      error: null,
    })).toBe(true);
    expect(isValidAnalysisJobState({
      ...failed,
      status: 'completed',
      resultId: 'result-id',
      result: {},
      error: null,
    })).toBe(true);
    expect(isValidAnalysisJobState({
      ...failed,
      status: 'queued',
      startedAt: null,
      finishedAt: null,
      error: null,
    })).toBe(true);
    expect(isValidAnalysisJobState({ ...failed, status: 'processing', finishedAt: 'bad' })).toBe(false);
  });
});
