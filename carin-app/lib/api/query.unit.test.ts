import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { scopeKey, type DataScope } from '@/lib/data/scope';
import { invalidateScopedQueries } from './query-cache';

const alice: DataScope = { environment: 'test', userId: 'alice' };
const bob: DataScope = { environment: 'test', userId: 'bob' };

describe('scoped query invalidation', () => {
  it('refreshes history, detail, and dashboard data after a consumption write for that user', async () => {
    const client = new QueryClient();
    const historyKey = scopeKey(alice, 'listConsumptions', { query: { limit: 20 } });
    const detailKey = scopeKey(alice, 'getConsumption', { path: { id: 'consumption-1' } });
    const dashboardKey = scopeKey(alice, 'getDashboard', {});
    const otherUserKey = scopeKey(bob, 'getDashboard', {});
    client.setQueryData(historyKey, { private: 'history' });
    client.setQueryData(detailKey, { private: 'detail' });
    client.setQueryData(dashboardKey, { private: 'dashboard' });
    client.setQueryData(otherUserKey, { private: 'bob-dashboard' });

    await invalidateScopedQueries(client, alice);

    expect(client.getQueryState(historyKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(detailKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(dashboardKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(otherUserKey)?.isInvalidated).toBe(false);
  });
});
