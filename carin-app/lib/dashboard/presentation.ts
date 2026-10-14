import type { components } from '@/lib/api/generated/app-api';
import { formatNutrient } from '@/lib/consumptions/consumption';
import { getMissingFieldTarget } from '@/lib/profile/profile';
import { formatMeasuredAt, formatMeasurement, recordTitle } from '@/lib/exams/model';

export type Dashboard = components['schemas']['Dashboard'];
type NutrientKey = keyof Dashboard['totals'];
type DashboardAction = Dashboard['nextActions'][number];

const nutrientDefinitions = [
  ['energyKcal', 'Energi', 'kkal'],
  ['carbohydrateG', 'Karbohidrat', 'g'],
  ['proteinG', 'Protein', 'g'],
  ['fatG', 'Lemak', 'g'],
  ['fiberG', 'Serat', 'g'],
  ['sugarsG', 'Gula', 'g'],
  ['sodiumMg', 'Natrium', 'mg'],
] as const satisfies readonly (readonly [NutrientKey, string, string])[];

export function getDailyIntakeSummary(dashboard: Dashboard) {
  const kind = dashboard.consumptionCount === 0 ? 'empty' : 'recorded';
  return {
    kind,
    consumptionCount: dashboard.consumptionCount,
    componentCount: dashboard.componentCount,
    nutrients:
      kind === 'empty'
        ? []
        : nutrientDefinitions.map(([key, label, unit]) => {
            const coverage = dashboard.coverage[key];
            return {
              key,
              label,
              unit,
              value: formatNutrient(dashboard.totals[key], unit),
              coverage: `${coverage.knownComponentCount} dari ${coverage.totalComponentCount} komponen`,
            };
          }),
  };
}

export function getRecurringAttentionCards(dashboard: Dashboard) {
  return dashboard.recurringAttentions.map((attention) => ({
    id: `${attention.ruleId}:${attention.conditionId}`,
    count: attention.count,
    links: attention.consumptionIds.map((id, index) => ({
      id,
      label: `Buka catatan ${index + 1}`,
      href: { pathname: '/consumptions/[id]' as const, params: { id } },
    })),
  }));
}

function examinationValue(record: components['schemas']['Examination']['record']) {
  if (record.type === 'pressure') {
    return `${formatMeasurement(record.systolic)} / ${formatMeasurement(record.diastolic)} ${record.unit}`;
  }
  return `${formatMeasurement(record.value)} ${record.unit}`;
}

export function getLatestExaminationCards(dashboard: Dashboard) {
  return dashboard.latestExaminations.map(({ id, record }) => {
    const measured = formatMeasuredAt(record);
    return {
      id,
      title: recordTitle(record),
      value: examinationValue(record),
      measuredAt: record.measuredTime ? measured : `${measured} · waktu tidak dicatat`,
      href: { pathname: '/exams/[id]' as const, params: { id } },
    };
  });
}

export function getNextActionTarget(
  action: DashboardAction,
  missingProfileFields: readonly string[]
):
  | '/consumptions/new'
  | '/exams/new'
  | { pathname: '/(onboarding)/health-profile'; params: { focus: string } }
  | null {
  switch (action.code) {
    case 'record_consumption':
      return '/consumptions/new';
    case 'record_examination':
      return '/exams/new';
    case 'complete_profile': {
      const target = missingProfileFields[0]
        ? getMissingFieldTarget(missingProfileFields[0])
        : null;
      return {
        pathname: '/(onboarding)/health-profile',
        params: { focus: target?.focus ?? 'other' },
      };
    }
    default:
      return null;
  }
}

export function formatDashboardDate(date: string, locale = 'id-ID') {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(value.getTime())) return date;
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(value);
}
