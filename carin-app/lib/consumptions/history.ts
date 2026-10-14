import type { ManualConsumption } from './consumption';
import type { AppRequestInput } from '@/lib/api/contracts';

export const CONSUMPTION_HISTORY_PAGE_LIMIT = 20;

export type ConsumptionHistoryFilter = 'all' | '7d' | '30d';

export function getHistoryDateRange(filter: ConsumptionHistoryFilter, now: Date) {
  if (filter === 'all') return null;
  const days = filter === '7d' ? 7 : 30;
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1);
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

export type ConsumptionHistoryPage = {
  items: ManualConsumption[];
  nextCursor: string | null;
};

type ConsumptionHistoryReadPage = { data: ConsumptionHistoryPage };

export function getNextConsumptionCursor(page: Pick<ConsumptionHistoryPage, 'nextCursor'>) {
  return page.nextCursor ?? undefined;
}

export function createConsumptionHistoryPageInput(
  cursor: string | undefined,
  filter: ConsumptionHistoryFilter = 'all',
  now: Date = new Date()
): AppRequestInput<'listConsumptions'> {
  return {
    query: {
      limit: CONSUMPTION_HISTORY_PAGE_LIMIT,
      ...(cursor ? { cursor } : {}),
      ...getHistoryDateRange(filter, now),
    },
  };
}

export function getConsumptionHistoryItems(
  pages: readonly ConsumptionHistoryReadPage[] | undefined
): ManualConsumption[] {
  return pages?.flatMap((page) => page.data.items) ?? [];
}
