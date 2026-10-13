import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool, PoolClient } from 'pg';
import * as schema from './schema/index.js';

export function createDatabase(client: Pool | PoolClient) {
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDatabase>;
