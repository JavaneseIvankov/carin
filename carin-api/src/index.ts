import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPostgresPool } from './health/postgres-pool.js';
import { postgresReadinessRepository } from './health/postgres-repository.js';
import { createReadinessService } from './health/readiness.js';
import { createDatabase } from './db/client.js';
import { createAuthRuntime } from './auth/runtime.js';
import { enqueueAuthMail } from './modules/email/outbox.js';

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
  sendEmail: async (mail) => {
    const result = await enqueueAuthMail(db, authSecret, mail);
    if (result === 'expired') process.stdout.write(`${JSON.stringify({ event: 'AUTH_EMAIL_TOKEN_EXPIRED' })}\n`);
  },
  onEmailQueueFailure: () => process.stdout.write(`${JSON.stringify({ event: 'AUTH_EMAIL_QUEUE_FAILED' })}\n`),
});
const app = createApp({
  readiness: createReadinessService(postgresReadinessRepository(pool)),
  log: (entry) => { process.stdout.write(`${JSON.stringify(entry)}\n`); },
  auth: authRuntime.auth,
  account: { db, resolveSession: authRuntime.resolveSession },
  legalConsent: { db, resolveSession: authRuntime.resolveSession },
  appLinkScheme: config.appLinkScheme,
});

serve({ fetch: app.fetch, port: config.port });
