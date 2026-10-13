import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPostgresPool } from './health/postgres-pool.js';
import { postgresReadinessRepository } from './health/postgres-repository.js';
import { createReadinessService } from './health/readiness.js';

const config = loadConfig(process.env);
const pool = createPostgresPool(config.databaseUrl, (entry) => {
  process.stdout.write(`${JSON.stringify(entry)}\n`);
});
const app = createApp({
  readiness: createReadinessService(postgresReadinessRepository(pool)),
  log: (entry) => { process.stdout.write(`${JSON.stringify(entry)}\n`); },
});

serve({ fetch: app.fetch, port: config.port });
