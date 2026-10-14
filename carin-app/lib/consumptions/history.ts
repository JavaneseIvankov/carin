import type { ManualConsumption } from './consumption';
import type { AppRequestInput } from '@/lib/api/contracts';

export const CONSUMPTION_HISTORY_PAGE_LIMIT = 20;

export type ConsumptionHistoryPage = {
  items: ManualConsumption[];
  nextCursor: string | null;
};

type ConsumptionHistoryReadPage = { data: ConsumptionHistoryPage };

export function getNextConsumptionCursor(page: Pick<ConsumptionHistoryPage, 'nextCursor'>) {
  return page.nextCursor ?? undefined;
}

export function createConsumptionHistoryPageInput(
  cursor: string | undefined
): AppRequestInput<'listConsumptions'> {
  return {
    query: {
      limit: CONSUMPTION_HISTORY_PAGE_LIMIT,
      ...(cursor ? { cursor } : {}),
    },
  };
}

export function getConsumptionHistoryItems(
  pages: readonly ConsumptionHistoryReadPage[] | undefined
): ManualConsumption[] {
  return pages?.flatMap((page) => page.data.items) ?? [];
}
