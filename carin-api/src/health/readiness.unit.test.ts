import { describe, expect, it, vi } from 'vitest';
import { createReadinessService } from './readiness.js';

describe('readiness service', () => {
  it('requires database connectivity and the expected schema', async () => {
    const schema = vi.fn(async () => true);
    expect(await createReadinessService({ checkDatabase: async () => true, checkSchema: schema })()).toBe(true);
    expect(schema).toHaveBeenCalledOnce();
  });

  it('fails closed before a schema probe is wired', async () => {
    expect(await createReadinessService({ checkDatabase: async () => true })()).toBe(false);
  });

  it('does not claim ready or inspect schema if the database is unavailable', async () => {
    const schema = vi.fn(async () => true);
    expect(await createReadinessService({ checkDatabase: async () => false, checkSchema: schema })()).toBe(false);
    expect(schema).not.toHaveBeenCalled();
  });

  it('treats probe exceptions as unavailable', async () => {
    expect(await createReadinessService({ checkDatabase: async () => { throw new Error('secret'); } })()).toBe(false);
    expect(await createReadinessService({ checkDatabase: async () => true, checkSchema: async () => { throw new Error('secret'); } })()).toBe(false);
  });
});
