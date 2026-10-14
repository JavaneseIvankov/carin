import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { components } from '@/lib/api/generated/app-api';
import { invalidateScopedQueries } from '@/lib/api/query-cache';
import { scopeKey, type DataScope } from '@/lib/data/scope';
import {
  formatDashboardDate,
  getDailyIntakeSummary,
  getLatestExaminationCards,
} from './presentation';

type Dashboard = components['schemas']['Dashboard'];
const owner: DataScope = { environment: 'test', userId: 'dashboard-owner' };

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
    attentionWindow: { startDate: '2026-03-02', endDate: '2026-03-08' },
    componentCount: 0,
    computedAt: '2026-03-08T08:00:00.000Z',
    consumptionCount: 0,
    consumptionWindow: {
      startAt: '2026-03-08T00:00:00.000Z',
      endAt: '2026-03-09T00:00:00.000Z',
    },
    coverage,
    date: '2026-03-08',
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

function createDashboardObserver(client: QueryClient, read: () => Dashboard) {
  return new QueryObserver(client, {
    queryKey: scopeKey(owner, 'getDashboard', {}),
    queryFn: async () => ({ data: read(), updatedAt: Date.now(), stale: false }),
    staleTime: Infinity,
    networkMode: 'always',
  });
}

describe('dashboard query refresh', () => {
  it('refreshes intake after create, edit, and delete while a scan alone leaves it unchanged', async () => {
    const client = new QueryClient();
    let server = dashboard();
    const observer = createDashboardObserver(client, () => server);
    const unsubscribe = observer.subscribe(() => {});

    await observer.refetch();
    expect(getDailyIntakeSummary(observer.getCurrentResult().data!.data).kind).toBe('empty');

    // Scan writes invalidate the same scoped query, but the API summary contains consumptions only.
    await invalidateScopedQueries(client, owner);
    expect(getDailyIntakeSummary(observer.getCurrentResult().data!.data).kind).toBe('empty');

    server = dashboard({
      consumptionCount: 1,
      componentCount: 2,
      coverage: {
        energyKcal: { knownComponentCount: 1, totalComponentCount: 2 },
        carbohydrateG: { knownComponentCount: 1, totalComponentCount: 2 },
        proteinG: { knownComponentCount: 1, totalComponentCount: 2 },
        fatG: { knownComponentCount: 1, totalComponentCount: 2 },
        fiberG: { knownComponentCount: 1, totalComponentCount: 2 },
        sugarsG: { knownComponentCount: 1, totalComponentCount: 2 },
        sodiumMg: { knownComponentCount: 1, totalComponentCount: 2 },
      },
      totals: {
        energyKcal: 180,
        carbohydrateG: 24,
        proteinG: 8,
        fatG: 6,
        fiberG: 3,
        sugarsG: 4,
        sodiumMg: 30,
      },
    });
    await invalidateScopedQueries(client, owner);
    expect(getDailyIntakeSummary(observer.getCurrentResult().data!.data)).toMatchObject({
      kind: 'recorded',
      consumptionCount: 1,
      componentCount: 2,
    });

    server = dashboard({ ...server, totals: { ...server.totals, energyKcal: 220 } });
    await invalidateScopedQueries(client, owner);
    expect(
      getDailyIntakeSummary(observer.getCurrentResult().data!.data).nutrients.find(
        ({ key }) => key === 'energyKcal'
      )?.value
    ).toBe('220 kkal');

    server = dashboard();
    await invalidateScopedQueries(client, owner);
    expect(getDailyIntakeSummary(observer.getCurrentResult().data!.data).kind).toBe('empty');
    unsubscribe();
    client.clear();
  });

  it('uses the server-selected account day after a timezone update and preserves exam dates', async () => {
    const client = new QueryClient();
    let server = dashboard();
    const observer = createDashboardObserver(client, () => server);
    const unsubscribe = observer.subscribe(() => {});
    await observer.refetch();

    server = dashboard({
      date: '2026-03-07',
      timezone: 'America/New_York',
      latestExaminations: [
        {
          id: 'historical-exam',
          revision: 2,
          createdAt: '2026-03-08T07:30:00.000Z',
          updatedAt: '2026-03-08T07:30:00.000Z',
          record: {
            type: 'pressure',
            systolic: 118,
            diastolic: 76,
            unit: 'mmHg',
            measuredOn: '2024-12-31',
            measuredTime: null,
            timezone: 'Asia/Jakarta',
            note: null,
          },
        },
      ],
    });
    await invalidateScopedQueries(client, owner);

    const refreshed = observer.getCurrentResult().data!.data;
    expect([refreshed.date, refreshed.timezone, formatDashboardDate(refreshed.date)]).toEqual([
      '2026-03-07',
      'America/New_York',
      '7 Maret 2026',
    ]);
    expect(getLatestExaminationCards(refreshed)[0]?.measuredAt).toBe(
      '31 Des 2024 · waktu tidak dicatat'
    );
    unsubscribe();
    client.clear();
  });
});
