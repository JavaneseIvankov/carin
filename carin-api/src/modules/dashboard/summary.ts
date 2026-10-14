import { aggregateNutrients, type Nutrients } from '../../domain/nutrition.js';

export type DashboardSummaryItem = {
  id: string;
  evaluationState: 'completed' | 'pending' | 'failed' | 'not_requested';
  components: Array<{ id: string; nutrients: Nutrients }>;
  attentions: Array<{ ruleId: string; conditionId: string }>;
};

export function buildDashboardSummary(
  daily: readonly DashboardSummaryItem[],
  attentionWindow: readonly DashboardSummaryItem[],
) {
  const components = daily.flatMap(({ components: rows }) => rows);
  const nutrition = aggregateNutrients(components.map(({ nutrients }) => nutrients));
  const groups = new Map<string, { ruleId: string; conditionId: string; consumptionIds: Set<string> }>();

  for (const item of attentionWindow) {
    if (item.evaluationState !== 'completed') continue;
    const seen = new Set<string>();
    for (const attention of item.attentions) {
      const key = JSON.stringify([attention.ruleId, attention.conditionId]);
      if (seen.has(key)) continue;
      seen.add(key);
      const group = groups.get(key) ?? {
        ruleId: attention.ruleId,
        conditionId: attention.conditionId,
        consumptionIds: new Set<string>(),
      };
      group.consumptionIds.add(item.id);
      groups.set(key, group);
    }
  }

  const recurringAttentions = [...groups.values()]
    .filter(({ consumptionIds }) => consumptionIds.size >= 2)
    .map(({ ruleId, conditionId, consumptionIds }) => ({
      ruleId,
      conditionId,
      count: consumptionIds.size,
      consumptionIds: [...consumptionIds].sort(),
    }))
    .sort((left, right) => left.ruleId.localeCompare(right.ruleId) || left.conditionId.localeCompare(right.conditionId));

  return {
    consumptionCount: daily.length,
    componentCount: components.length,
    totals: nutrition.totals,
    coverage: nutrition.coverage,
    recurringAttentions,
  };
}
