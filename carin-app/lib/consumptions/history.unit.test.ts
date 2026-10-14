import { describe, expect, it } from 'vitest';
import type { ManualConsumption } from './consumption';
import {
  createConsumptionHistoryPageInput,
  getConsumptionHistoryItems,
  getNextConsumptionCursor,
} from './history';

describe('consumption history pagination', () => {
  it('returns the next cursor so the history view can request older records', () => {
    expect(getNextConsumptionCursor({ nextCursor: 'opaque-cursor' })).toBe('opaque-cursor');
    expect(getNextConsumptionCursor({ nextCursor: null })).toBeUndefined();
    expect(createConsumptionHistoryPageInput('opaque-cursor')).toEqual({
      query: { limit: 20, cursor: 'opaque-cursor' },
    });
    expect(createConsumptionHistoryPageInput(undefined)).toEqual({ query: { limit: 20 } });
  });

  it('keeps the visible records from every loaded page in order', () => {
    const first = { id: 'newer' } as unknown as ManualConsumption;
    const second = { id: 'older' } as unknown as ManualConsumption;
    const pages = [
      { data: { items: [first], nextCursor: 'cursor-2' } },
      { data: { items: [second], nextCursor: null } },
    ];

    expect(getConsumptionHistoryItems(pages).map((item) => item.id)).toEqual(['newer', 'older']);
    expect(getConsumptionHistoryItems(undefined)).toEqual([]);
  });
});

describe('consumption history filters', () => {
  it('uses the local calendar window with an inclusive start and exclusive next-day end', () => {
    const now = new Date(2026, 9, 14, 15, 30);
    const input = createConsumptionHistoryPageInput('next', '7d', now);
    expect(input.query).toEqual({
      limit: 20,
      cursor: 'next',
      from: new Date(2026, 9, 8).toISOString(),
      to: new Date(2026, 9, 15).toISOString(),
    });
    expect(createConsumptionHistoryPageInput(undefined, '30d', now).query?.from).toBe(
      new Date(2026, 8, 15).toISOString()
    );
    expect(createConsumptionHistoryPageInput(undefined, 'all', now)).toEqual({
      query: { limit: 20 },
    });
  });
});
