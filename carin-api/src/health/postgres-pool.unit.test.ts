import { describe, expect, it, vi } from 'vitest';
import { createPostgresPool } from './postgres-pool.js';

describe('PostgreSQL pool', () => {
  it('handles an idle-client error without logging its sensitive message', async () => {
    const log = vi.fn();
    const pool = createPostgresPool('postgresql://user:secret@localhost:5432/carin', log);
    try {
      expect(() => pool.emit('error', new Error('password=secret'))).not.toThrow();
      expect(log).toHaveBeenCalledOnce();
      expect(log).toHaveBeenCalledWith({ code: 'DATABASE_IDLE_CLIENT_ERROR' });
      expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
    } finally {
      await pool.end();
    }
  });
});
