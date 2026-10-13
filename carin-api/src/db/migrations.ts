import { fileURLToPath } from 'node:url';
import { createDatabase } from './client.js';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import type { Pool } from 'pg';

export const migrationsFolder = fileURLToPath(
  new URL('../../drizzle', import.meta.url),
);
export const expectedMigrations = readMigrationFiles({ migrationsFolder }).map(
  ({ hash, folderMillis }) => ({ hash, created_at: String(folderMillis) }),
);

export async function applyMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    // Serialize deployment runners; Drizzle applies pending SQL in a transaction.
    await client.query('SELECT pg_advisory_lock(77183, 3)');
    try {
      await migrate(createDatabase(client), { migrationsFolder });
    } finally {
      await client.query('SELECT pg_advisory_unlock(77183, 3)');
    }
  } finally {
    client.release();
  }
}
