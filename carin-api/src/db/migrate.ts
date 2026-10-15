import { Pool } from 'pg';
import { applyMigrations } from './migrations.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString)
  throw new Error('DATABASE_URL is required for migrations');
const pool = new Pool({ connectionString, connectionTimeoutMillis: 3000 });
try {
  await applyMigrations(pool);
  process.stdout.write('Database migrations applied.\n');
} finally {
  await pool.end();
}
