import { Pool } from 'pg';

export type DatabaseLog = (entry: { code: 'DATABASE_IDLE_CLIENT_ERROR' }) => void;

export function createPostgresPool(connectionString: string, log: DatabaseLog): Pool {
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 3000 });
  pool.on('error', () => log({ code: 'DATABASE_IDLE_CLIENT_ERROR' }));
  return pool;
}
