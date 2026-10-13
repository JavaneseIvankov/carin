import { serve } from '@hono/node-server';
import { Pool } from 'pg';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { postgresReadinessRepository } from './health/postgres-repository.js';
import { createReadinessService } from './health/readiness.js';

const config = loadConfig(process.env);
const pool = new Pool({ connectionString: config.databaseUrl, connectionTimeoutMillis: 3000 });
const app = createApp({
  readiness: createReadinessService(postgresReadinessRepository(pool)),
  log: (entry) => { process.stdout.write(`${JSON.stringify(entry)}\n`); },
});

serve({ fetch: app.fetch, port: config.port });
