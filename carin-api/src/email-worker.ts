import { createResendSender } from './modules/email/resend.js';
import { processNextEmailTask } from './modules/email/worker.js';
import { loadConfig } from './config.js';
import { createPostgresPool } from './health/postgres-pool.js';

const config = loadConfig(process.env);
const apiKey = process.env.RESEND_API_KEY?.trim();
const from = process.env.EMAIL_FROM?.trim();
if (!apiKey || !from) throw new Error('RESEND_API_KEY and EMAIL_FROM are required for the email worker');

const pool = createPostgresPool(config.databaseUrl, (entry) => {
  process.stdout.write(`${JSON.stringify({ event: entry.code })}\n`);
});
const sender = createResendSender({ apiKey, from });
let stopping = false;
process.once('SIGINT', () => { stopping = true; });
process.once('SIGTERM', () => { stopping = true; });

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

try {
  while (!stopping) {
    try {
      const result = await processNextEmailTask(pool, sender);
      if (result === 'idle') await delay(1000);
    } catch {
      process.stdout.write(`${JSON.stringify({ event: 'AUTH_EMAIL_WORKER_FAILED' })}\n`);
      await delay(1000);
    }
  }
} finally {
  await pool.end();
}
