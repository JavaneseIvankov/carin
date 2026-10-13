import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPostgresPool } from './health/postgres-pool.js';
import { postgresReadinessRepository } from './health/postgres-repository.js';
import { createReadinessService } from './health/readiness.js';
import { createDatabase } from './db/client.js';
import { createAuthRuntime } from './auth/runtime.js';

const config = loadConfig(process.env);
const authSecret = config.betterAuthSecret;
const authURL = config.betterAuthUrl;
if (!authSecret?.trim()) throw new Error('BETTER_AUTH_SECRET is required');
if (!authURL?.trim()) throw new Error('BETTER_AUTH_URL is required');
const pool = createPostgresPool(config.databaseUrl, (entry) => {
  process.stdout.write(`${JSON.stringify(entry)}\n`);
});
const db = createDatabase(pool);
const authRuntime = createAuthRuntime({
  db,
  baseURL: authURL,
  secret: authSecret,
  trustedOrigins: config.authTrustedOrigins ?? [],
  // C09 supplies the durable Resend/outbox implementation through this seam.
  sendEmail: async () => {
    throw new Error('AUTH_EMAIL_DELIVERY_UNCONFIGURED');
  },
});
const app = createApp({
  readiness: createReadinessService(postgresReadinessRepository(pool)),
  log: (entry) => { process.stdout.write(`${JSON.stringify(entry)}\n`); },
  auth: authRuntime.auth,
  account: { db, resolveSession: authRuntime.resolveSession },
  examinations: { db, resolveSession: authRuntime.resolveSession, cursorSecret: authSecret },
  legalConsent: { db, resolveSession: authRuntime.resolveSession },
});

serve({ fetch: app.fetch, port: config.port });
