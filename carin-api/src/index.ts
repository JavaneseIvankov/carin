import { serve } from '@hono/node-server';
import { createVerifiedApp } from './app.js';
import { loadConfig } from './config.js';
import { createPostgresPool } from './health/postgres-pool.js';
import { postgresReadinessRepository } from './health/postgres-repository.js';
import { createReadinessService } from './health/readiness.js';
import { createDatabase } from './db/client.js';
import { createAuthRuntime } from './auth/runtime.js';
import { enqueueAuthMail } from './modules/email/outbox.js';
import { createMediaRuntimeOptions } from './modules/media/runtime.js';

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
  appEnv: config.appEnv,
  sendEmail: async (mail) => {
    const result = await enqueueAuthMail(db, authSecret, mail);
    if (result === 'expired') process.stdout.write(`${JSON.stringify({ event: 'AUTH_EMAIL_TOKEN_EXPIRED' })}\n`);
  },
  onEmailQueueFailure: () => process.stdout.write(`${JSON.stringify({ event: 'AUTH_EMAIL_QUEUE_FAILED' })}\n`),
});
const mediaOptions = createMediaRuntimeOptions(db, config);
const app = createVerifiedApp({
  readiness: createReadinessService(postgresReadinessRepository(pool)),
  log: (entry) => { process.stdout.write(`${JSON.stringify(entry)}\n`); },
  auth: authRuntime.auth,
  db,
  resolveSession: authRuntime.resolveSession,
  accountDeletion: { verifyPassword: authRuntime.verifyPassword, deletionSecret: authSecret },
  appLinkScheme: config.appLinkScheme,
  media: { ...mediaOptions, resolveSession: authRuntime.resolveSession },
  examinations: { db, resolveSession: authRuntime.resolveSession, cursorSecret: authSecret },
  corsOrigins: config.authTrustedOrigins,
  appEnv: config.appEnv,
});

serve({ fetch: app.fetch, port: config.port });
