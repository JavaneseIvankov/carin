import { describe, expect, it } from 'vitest';
import { buildDashboardSummary } from './summary.js';

const nutrients = (energyKcal: number | null, proteinG: number | null) => ({
  energyKcal,
  carbohydrateG: null,
  proteinG,
  fatG: null,
  fiberG: null,
  sugarsG: null,
  sodiumMg: null,
});

function item(
  id: string,
  nutrition: ReturnType<typeof nutrients>,
  state: 'completed' | 'pending' | 'failed' | 'not_requested',
  attention: { ruleId: string; conditionId: string }[] = [],
) {
  return {
    id,
    evaluationState: state,
    components: [{ id: `${id}-component`, nutrients: nutrition }],
    attentions: attention,
  };
}

describe('dashboard snapshot aggregation', () => {
  it('keeps unknown nutrients null and counts records separately from components', () => {
    const result = buildDashboardSummary([
      item('one', nutrients(20, 1), 'completed'),
      { ...item('two', nutrients(null, null), 'pending'), components: [
        { id: 'two-a', nutrients: nutrients(null, null) },
        { id: 'two-b', nutrients: nutrients(null, null) },
      ] },
    ], []);

    expect(result.consumptionCount).toBe(2);
    expect(result.componentCount).toBe(3);
    expect(result.totals.energyKcal).toBe(20);
    expect(result.totals.proteinG).toBe(1);
    expect(result.totals.sodiumMg).toBeNull();
    expect(result.coverage.energyKcal).toEqual({ knownComponentCount: 1, totalComponentCount: 3 });
  });

  it('counts each completed rule once per consumption and omits groups below two', () => {
    const result = buildDashboardSummary([], [
      item('one', nutrients(1, 1), 'completed', [
        { ruleId: 'rule-a', conditionId: 'condition-a' },
        { ruleId: 'rule-a', conditionId: 'condition-a' },
        { ruleId: 'rule-single', conditionId: 'condition-a' },
      ]),
      item('two', nutrients(1, 1), 'pending', [
        { ruleId: 'rule-a', conditionId: 'condition-a' },
      ]),
      item('three', nutrients(1, 1), 'completed', [
        { ruleId: 'rule-a', conditionId: 'condition-a' },
      ]),
    ]);

    expect(result.recurringAttentions).toEqual([{
      ruleId: 'rule-a',
      conditionId: 'condition-a',
      count: 2,
      consumptionIds: ['one', 'three'],
    }]);
  });
});
