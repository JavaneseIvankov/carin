import { describe, expect, it } from 'vitest';
import type { components } from '@/lib/api/generated/app-api';
import {
  getDailyIntakeSummary,
  getLatestExaminationCards,
  getNextActionTarget,
  getRecurringAttentionCards,
  getRecurringAttentionReason,
} from './presentation';

type Dashboard = components['schemas']['Dashboard'];

function dashboard(overrides: Partial<Dashboard> = {}): Dashboard {
  const coverage = {
    energyKcal: { knownComponentCount: 0, totalComponentCount: 0 },
    carbohydrateG: { knownComponentCount: 0, totalComponentCount: 0 },
    proteinG: { knownComponentCount: 0, totalComponentCount: 0 },
    fatG: { knownComponentCount: 0, totalComponentCount: 0 },
    fiberG: { knownComponentCount: 0, totalComponentCount: 0 },
    sugarsG: { knownComponentCount: 0, totalComponentCount: 0 },
    sodiumMg: { knownComponentCount: 0, totalComponentCount: 0 },
  };
  return {
    attentionWindow: { startDate: '2026-10-08', endDate: '2026-10-14' },
    componentCount: 0,
    computedAt: '2026-10-14T05:30:00.000Z',
    consumptionCount: 0,
    consumptionWindow: {
      startAt: '2026-10-13T17:00:00.000Z',
      endAt: '2026-10-14T17:00:00.000Z',
    },
    coverage,
    date: '2026-10-14',
    latestExaminations: [],
    nextActions: [],
    profileMissingFields: [],
    recurringAttentions: [],
    timezone: 'Asia/Jakarta',
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

describe('dashboard mobile presentation', () => {
  it('shows an empty state without presenting missing nutrients as zero intake', () => {
    const summary = getDailyIntakeSummary(dashboard());

    expect(summary).toMatchObject({ kind: 'empty', consumptionCount: 0, componentCount: 0 });
    expect(summary.nutrients).toEqual([]);
  });

  it('separates meal and component counts and preserves partial coverage after edits', () => {
    const recorded = dashboard({
      consumptionCount: 1,
      componentCount: 2,
      coverage: {
        energyKcal: { knownComponentCount: 1, totalComponentCount: 2 },
        carbohydrateG: { knownComponentCount: 1, totalComponentCount: 2 },
        proteinG: { knownComponentCount: 0, totalComponentCount: 2 },
        fatG: { knownComponentCount: 1, totalComponentCount: 2 },
        fiberG: { knownComponentCount: 0, totalComponentCount: 2 },
        sugarsG: { knownComponentCount: 1, totalComponentCount: 2 },
        sodiumMg: { knownComponentCount: 1, totalComponentCount: 2 },
      },
      totals: {
        energyKcal: 0,
        carbohydrateG: 10,
        proteinG: null,
        fatG: 2,
        fiberG: null,
        sugarsG: 3,
        sodiumMg: 20,
      },
    });
    const summary = getDailyIntakeSummary(recorded);
    const energy = summary.nutrients.find(({ key }) => key === 'energyKcal');
    const protein = summary.nutrients.find(({ key }) => key === 'proteinG');

    expect(summary).toMatchObject({ kind: 'recorded', consumptionCount: 1, componentCount: 2 });
    expect(energy).toMatchObject({ value: '0 kkal', coverage: '1 dari 2 komponen' });
    expect(protein).toMatchObject({ value: 'Belum tersedia', coverage: '0 dari 2 komponen' });

    const edited = getDailyIntakeSummary(
      dashboard({ ...recorded, totals: { ...recorded.totals, energyKcal: 250 } })
    );
    expect(edited.nutrients.find(({ key }) => key === 'energyKcal')?.value).toBe('250 kkal');
    expect(getDailyIntakeSummary(dashboard()).kind).toBe('empty');
  });

  it('links every recurring-attention occurrence to its consumption detail', () => {
    const attentions = getRecurringAttentionCards(
      dashboard({
        recurringAttentions: [
          {
            ruleId: 'rule-sodium',
            conditionId: 'condition-hypertension',
            count: 2,
            consumptionIds: ['consumption-a', 'consumption-b'],
          },
          {
            ruleId: 'rule-sugar',
            conditionId: 'condition-diabetes',
            count: 1,
            consumptionIds: ['consumption-c'],
          },
        ],
      })
    );
    const [attention] = attentions;

    expect(attention?.label).toBe('Kelompok perhatian 1');
    expect(attentions.map(({ label }) => label)).toEqual([
      'Kelompok perhatian 1',
      'Kelompok perhatian 2',
    ]);
    expect(attention?.count).toBe(2);
    expect(attention?.links).toEqual([
      {
        id: 'consumption-a',
        label: 'Buka catatan 1',
        href: { pathname: '/consumptions/[id]', params: { id: 'consumption-a' } },
      },
      {
        id: 'consumption-b',
        label: 'Buka catatan 2',
        href: { pathname: '/consumptions/[id]', params: { id: 'consumption-b' } },
      },
    ]);
  });

  it('shows the human-readable reason belonging to the exact recurring rule and condition', () => {
    const [attention] = getRecurringAttentionCards(
      dashboard({
        recurringAttentions: [
          {
            ruleId: 'rule-sodium',
            conditionId: 'condition-hypertension',
            count: 1,
            consumptionIds: ['consumption-a'],
          },
        ],
      })
    );

    expect(
      getRecurringAttentionReason(attention!, {
        snapshot: {
          attentions: [
            {
              ruleId: 'rule-sodium',
              conditionId: 'condition-other',
              reason: 'Do not show a reason from another condition.',
            },
            {
              ruleId: 'rule-sodium',
              conditionId: 'condition-hypertension',
              reason: 'Periksa kandungan natrium pada makanan ini.',
            },
          ],
        },
      })
    ).toBe('Periksa kandungan natrium pada makanan ini.');
  });

  it('keeps recurring groups distinct when rule and condition IDs contain delimiters', () => {
    const attentions = getRecurringAttentionCards(
      dashboard({
        recurringAttentions: [
          {
            ruleId: 'rule:alert',
            conditionId: 'high',
            count: 2,
            consumptionIds: ['consumption-a', 'consumption-b'],
          },
          {
            ruleId: 'rule',
            conditionId: 'alert:high',
            count: 2,
            consumptionIds: ['consumption-c', 'consumption-d'],
          },
        ],
      })
    );
    const consumption = {
      snapshot: {
        attentions: [
          { ruleId: 'rule:alert', conditionId: 'high', reason: 'First group reason.' },
          { ruleId: 'rule', conditionId: 'alert:high', reason: 'Second group reason.' },
        ],
      },
    };

    expect(attentions[0]?.id).not.toBe(attentions[1]?.id);
    expect(
      attentions.map((attention) => getRecurringAttentionReason(attention, consumption))
    ).toEqual(['First group reason.', 'Second group reason.']);
  });

  it('uses the recorded measurement date for each latest examination card', () => {
    const [card] = getLatestExaminationCards(
      dashboard({
        latestExaminations: [
          {
            id: 'exam-historical',
            revision: 1,
            createdAt: '2026-10-14T05:30:00.000Z',
            updatedAt: '2026-10-14T05:30:00.000Z',
            record: {
              type: 'glucose',
              value: 105,
              unit: 'mg/dL',
              context: 'fasting',
              measuredOn: '2024-01-01',
              measuredTime: null,
              timezone: 'Pacific/Kiritimati',
              note: null,
            },
          },
        ],
      })
    );

    expect(card).toMatchObject({
      id: 'exam-historical',
      title: 'Gula darah · Puasa',
      value: '105 mg/dL',
      measuredAt: '1 Jan 2024 · waktu tidak dicatat',
      href: { pathname: '/exams/[id]', params: { id: 'exam-historical' } },
    });
  });

  it('routes next actions to the relevant entry and profile field', () => {
    expect(
      getNextActionTarget(
        { code: 'record_consumption', label: 'Catat konsumsi', target: 'ignored' },
        []
      )
    ).toEqual('/consumptions/new');
    expect(
      getNextActionTarget({ code: 'record_examination', label: 'Tambahkan', target: 'ignored' }, [])
    ).toEqual('/exams/new');
    expect(
      getNextActionTarget({ code: 'complete_profile', label: 'Lengkapi', target: 'ignored' }, [
        'allergies.entries',
      ])
    ).toEqual({
      pathname: '/(onboarding)/health-profile',
      params: { focus: 'allergies' },
    });
    expect(
      getNextActionTarget({ code: 'unknown', label: 'Other', target: '/unsafe' }, [])
    ).toBeNull();
  });
});
