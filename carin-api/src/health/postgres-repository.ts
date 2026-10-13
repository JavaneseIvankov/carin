import type { Pool } from 'pg';
import type { ReadinessRepository } from './readiness.js';

export function postgresReadinessRepository(pool: Pool): ReadinessRepository {
  return {
    async checkDatabase() {
      await pool.query('SELECT 1');
      return true;
    },
  };
}
