import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { components } from '@/lib/api/generated/app-api';
import { createAppRepository } from '@/lib/api/repository';
import { invalidateScopedQueries } from '@/lib/api/query-cache';
import { createManualConsumptionActions } from '@/lib/consumptions/manual-actions';
import type { DataScope, StorageAdapter } from '@/lib/data/scope';
import { scopeKey } from '@/lib/data/scope';
import {
  formatDashboardDate,
  getDailyIntakeSummary,
  getLatestExaminationCards,
} from './presentation';

type Dashboard = components['schemas']['Dashboard'];
type ComponentInput = components['schemas']['ai__ComponentInput'];
type ConsumptionCreate = components['schemas']['ConsumptionCreate'];
type ManualRecord = { id: string; body: ConsumptionCreate };
const owner: DataScope = { environment: 'test', userId: 'dashboard-owner' };

class MemoryStorage implements StorageAdapter {
  private readonly entries = new Map<string, string>();

  async getItem(key: string) {
    return this.entries.get(key) ?? null;
  }

  async setItem(key: string, value: string) {
    this.entries.set(key, value);
  }

  async getAllKeys() {
    return [...this.entries.keys()];
  }

  async removeItem(key: string) {
    this.entries.delete(key);
  }
}

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

function makeComponent(id: string, displayName: string): ComponentInput {
  return {
    id,
    displayName,
    catalogFoodId: null,
    preparation: null,
    portion: { kind: 'unknown' },
  };
}

function aggregateRecords(records: ManualRecord[]): Dashboard {
  const componentCount = records.reduce((sum, record) => sum + record.body.components.length, 0);
  const coverage = {
    energyKcal: { knownComponentCount: 0, totalComponentCount: componentCount },
    carbohydrateG: { knownComponentCount: 0, totalComponentCount: componentCount },
    proteinG: { knownComponentCount: 0, totalComponentCount: componentCount },
    fatG: { knownComponentCount: 0, totalComponentCount: componentCount },
    fiberG: { knownComponentCount: 0, totalComponentCount: componentCount },
    sugarsG: { knownComponentCount: 0, totalComponentCount: componentCount },
    sodiumMg: { knownComponentCount: 0, totalComponentCount: componentCount },
  };
  return dashboard({ consumptionCount: records.length, componentCount, coverage });
}

function createRepository(storage: StorageAdapter, fetcher: typeof fetch) {
  return createAppRepository({
    scope: owner,
    storage,
    connectivity: () => 'online',
    onUnauthorized: async () => {},
    fetcher,
    baseUrl: 'https://api.test',
  });
}

function createDashboardObserver(
  client: QueryClient,
  repository: ReturnType<typeof createRepository>
) {
  return new QueryObserver(client, {
    queryKey: scopeKey(owner, 'getDashboard', {}),
    queryFn: () => repository.read('getDashboard', {}),
    staleTime: Infinity,
    networkMode: 'always',
  });
}

describe('dashboard consumer API refresh', () => {
  it('refreshes summary through repository CRUD and keeps a scan-only write out of intake', async () => {
    const storage = new MemoryStorage();
    const records: ManualRecord[] = [];
    let scans = 0;
    let nextId = 0;
    let nextRequestKey = 0;
    const makeRequestKey = () =>
      `00000000-0000-4000-8000-${String(++nextRequestKey).padStart(12, '0')}`;
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';
      if (method === 'GET' && url.pathname === '/api/v1/dashboard') {
        return Response.json(aggregateRecords(records));
      }
      if (method === 'POST' && url.pathname === '/api/v1/analysis-jobs') {
        scans += 1;
        return Response.json({ id: 'analysis-job-1' }, { status: 201 });
      }
      if (method === 'POST' && url.pathname === '/api/v1/consumptions') {
        const body = JSON.parse(String(init?.body)) as ConsumptionCreate;
        const record = { id: `consumption-${++nextId}`, body };
        records.push(record);
        return Response.json({ id: record.id }, { status: 201 });
      }
      const recordId = url.pathname.match(/^\/api\/v1\/consumptions\/([^/]+)$/)?.[1];
      if (method === 'PATCH' && recordId) {
        const record = records.find(({ id }) => id === recordId);
        if (!record) return Response.json({ error: 'missing' }, { status: 404 });
        const body = JSON.parse(String(init?.body)) as components['schemas']['ConsumptionUpdate'];
        record.body = { ...record.body, ...body };
        return Response.json({ id: record.id, revision: body.expectedRevision + 1 });
      }
      if (method === 'DELETE' && recordId) {
        const index = records.findIndex(({ id }) => id === recordId);
        if (index >= 0) records.splice(index, 1);
        return new Response(null, { status: 204 });
      }
      return Response.json({ error: 'unexpected request' }, { status: 404 });
    }) as typeof fetch;
    const repository = createRepository(storage, fetcher);
    const client = new QueryClient();
    const observer = createDashboardObserver(client, repository);
    const unsubscribe = observer.subscribe(() => {});
    const actions = createManualConsumptionActions({
      scope: owner,
      storage,
      api: {
        create: (input) => repository.write('createConsumption', input),
        update: (input) => repository.write('updateConsumption', input),
        delete: (input) => repository.write('deleteConsumption', input),
      },
      makeKey: makeRequestKey,
    });

    try {
      await observer.refetch();
      expect(getDailyIntakeSummary(observer.getCurrentResult().data!.data).kind).toBe('empty');

      await repository.write('createPhotoAnalysis', {
        headers: { 'Idempotency-Key': makeRequestKey() },
        body: { photoId: '00000000-0000-4000-8000-000000000001' },
      });
      await invalidateScopedQueries(client, owner);
      expect(scans).toBe(1);
      expect(getDailyIntakeSummary(observer.getCurrentResult().data!.data)).toMatchObject({
        kind: 'empty',
        consumptionCount: 0,
      });

      const request: ConsumptionCreate = {
        source: 'manual',
        scanId: null,
        sourceAnalysisResultId: null,
        occurrence: 'new_occurrence',
        consumedAt: '2026-03-08T05:30:00.000Z',
        timezone: 'Asia/Jakarta',
        catalogVersion: 'unavailable',
        components: [makeComponent('00000000-0000-4000-8000-000000000011', 'Makanan')],
      };
      const created = await actions.create('draft-1', request);
      await invalidateScopedQueries(client, owner);
      expect(getDailyIntakeSummary(observer.getCurrentResult().data!.data)).toMatchObject({
        kind: 'recorded',
        consumptionCount: 1,
        componentCount: 1,
      });

      await actions.update('consumption-1', 'edit-1', {
        expectedRevision: 1,
        consumedAt: request.consumedAt,
        timezone: request.timezone,
        catalogVersion: request.catalogVersion,
        components: [
          ...request.components,
          makeComponent('00000000-0000-4000-8000-000000000012', 'Lauk'),
        ],
      });
      await invalidateScopedQueries(client, owner);
      expect(getDailyIntakeSummary(observer.getCurrentResult().data!.data)).toMatchObject({
        kind: 'recorded',
        consumptionCount: 1,
        componentCount: 2,
      });

      await actions.delete('consumption-1');
      await invalidateScopedQueries(client, owner);
      expect(getDailyIntakeSummary(observer.getCurrentResult().data!.data)).toMatchObject({
        kind: 'empty',
        consumptionCount: 0,
        componentCount: 0,
      });
      expect(created).toMatchObject({ id: 'consumption-1' });
    } finally {
      unsubscribe();
      client.clear();
    }
  });

  it('uses the server-selected account day after a timezone update and preserves exam dates', async () => {
    const storage = new MemoryStorage();
    let server = dashboard();
    const fetcher = (async () => Response.json(server)) as typeof fetch;
    const repository = createRepository(storage, fetcher);
    const client = new QueryClient();
    const observer = createDashboardObserver(client, repository);
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
