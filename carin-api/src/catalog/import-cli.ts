import { createDatabase } from '../db/client.js';
import { AiAdapterError, createAiClient } from '../integrations/ai/index.js';
import { loadConfig } from '../config.js';
import { createPostgresPool } from '../health/postgres-pool.js';
import { CatalogImportError, importCatalog } from './importer.js';

const config = loadConfig(process.env);
const pool = createPostgresPool(config.databaseUrl, () => undefined);

try {
  const result = await importCatalog(createDatabase(pool), createAiClient(config));
  process.stdout.write(`${JSON.stringify({ event: 'catalog_imported', ...result })}\n`);
} catch (error) {
  const code = error instanceof CatalogImportError || error instanceof AiAdapterError
    ? error.code
    : 'CATALOG_IMPORT_FAILED';
  process.stderr.write(`${JSON.stringify({ event: 'catalog_import_failed', code })}\n`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
