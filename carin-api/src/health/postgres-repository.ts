import type { Pool, QueryConfig } from 'pg';
import type { ReadinessRepository } from './readiness.js';

export function postgresReadinessRepository(pool: Pool): ReadinessRepository {
  return {
    async checkDatabase() {
      const probe = { text: 'SELECT 1', query_timeout: 3000 } as QueryConfig & { query_timeout: number };
      await pool.query(probe);
      return true;
    },
  };
}
