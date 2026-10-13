import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { postgresReadinessRepository } from './postgres-repository.js';

describe('PostgreSQL readiness repository', () => {
  it('sets a finite query deadline on its connectivity probe', async () => {
    const query = vi.fn(async () => ({ rows: [{ '?column?': 1 }] }));
    const repository = postgresReadinessRepository({ query } as unknown as Pool);
    expect(await repository.checkDatabase()).toBe(true);
    expect(query).toHaveBeenCalledWith({ text: 'SELECT 1', query_timeout: 3000 });
  });
});
