import { createDatabase } from './db/client.js';
import { loadConfig } from './config.js';
import { createPostgresPool } from './health/postgres-pool.js';
import { createAiClient } from './integrations/ai/index.js';
import { runAnalysisWorker } from './jobs/worker.js';
import { createMediaService } from './modules/media/service.js';
import { createMediaRuntimeOptions } from './modules/media/runtime.js';
import { runPhotoCleanupWorker } from './modules/media/cleanup.js';
import { errorLogDetails, logEvent } from './logging.js';

const config = loadConfig(process.env);
const pool = createPostgresPool(config.databaseUrl, (entry) => {
  logEvent('error', 'database.pool.error', { errorCode: entry.code });
});
const concurrencyValue = process.env.WORKER_CONCURRENCY ?? '2';
const concurrency = Number(concurrencyValue);
if (!/^\d+$/.test(concurrencyValue) || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) {
  throw new Error('WORKER_CONCURRENCY must be an integer from 1 to 32');
}

const shutdown = new AbortController();
process.once('SIGINT', () => shutdown.abort());
process.once('SIGTERM', () => shutdown.abort());

try {
  const db = createDatabase(pool);
  const mediaOptions = createMediaRuntimeOptions(db, config);
  const media = createMediaService(mediaOptions);
  await Promise.all([
    runAnalysisWorker(db, createAiClient(config), {
      concurrency,
      signal: shutdown.signal,
      photoUrlForJob: media.createAiPhotoUrl,
      onError: (error) => logEvent('error', 'worker.analysis.loop_failed', errorLogDetails(error)),
    }),
    runPhotoCleanupWorker(db, mediaOptions.store, {
      signal: shutdown.signal,
      onError: (error) => logEvent('error', 'worker.photo_cleanup.loop_failed', errorLogDetails(error)),
    }),
  ]);
} finally {
  await pool.end();
}
