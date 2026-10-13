import type { Pool, PoolClient } from 'pg';
import { expectedMigrations } from '../db/migrations.js';
import type { ReadinessRepository } from './readiness.js';

const DATABASE_PROBE_TIMEOUT_MS = 3000;

export function postgresReadinessRepository(pool: Pool): ReadinessRepository {
  async function probe(text: string) {
    const deadlineAt = Date.now() + DATABASE_PROBE_TIMEOUT_MS;
    const timeoutError = new Error('database probe timed out');
    let timedOut = false;
    let client: PoolClient | undefined;
    let timer!: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => {
          timedOut = true;
          reject(timeoutError);
        },
        Math.max(0, deadlineAt - Date.now()),
      );
    });

    try {
      const checkout = pool.connect().then((checkedOutClient) => {
        if (timedOut || Date.now() >= deadlineAt) {
          timedOut = true;
          checkedOutClient.release(timeoutError);
          return undefined;
        }
        return checkedOutClient;
      });
      client = await Promise.race([checkout, deadline]);
      if (!client) {
        throw timeoutError;
      }
      if (timedOut || Date.now() >= deadlineAt) {
        timedOut = true;
        throw timeoutError;
      }

      return await Promise.race([client.query({ text }), deadline]);
    } finally {
      clearTimeout(timer);
      client?.release(timedOut ? timeoutError : undefined);
    }
  }
  return {
    async checkDatabase() {
      await probe('SELECT 1');
      return true;
    },
    async checkSchema() {
      const { rows } = await probe(
        'SELECT hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY created_at, id',
      );
      return (
        rows.length === expectedMigrations.length &&
        rows.every(
          (row, index) =>
            row.hash === expectedMigrations[index].hash &&
            row.created_at === expectedMigrations[index].created_at,
        )
      );
    },
  };
}
