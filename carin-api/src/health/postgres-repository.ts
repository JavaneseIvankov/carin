import type { Pool, PoolClient, QueryConfig } from 'pg';
import type { ReadinessRepository } from './readiness.js';

const DATABASE_PROBE_TIMEOUT_MS = 3000;

export function postgresReadinessRepository(pool: Pool): ReadinessRepository {
  return {
    async checkDatabase() {
      const deadlineAt = Date.now() + DATABASE_PROBE_TIMEOUT_MS;
      const timeoutError = new Error('database probe timed out');
      let timedOut = false;
      let client: PoolClient | undefined;
      let timer!: ReturnType<typeof setTimeout>;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(timeoutError);
        }, Math.max(0, deadlineAt - Date.now()));
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

        const queryTimeout = deadlineAt - Date.now();
        const probe = {
          text: 'SELECT 1',
          query_timeout: queryTimeout,
        } as QueryConfig & { query_timeout: number };
        await Promise.race([client.query(probe), deadline]);
        return true;
      } finally {
        clearTimeout(timer);
        client?.release(timedOut ? timeoutError : undefined);
      }
    },
  };
}
