import type { Pool, PoolClient } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { postgresReadinessRepository } from './postgres-repository.js';

describe('PostgreSQL readiness repository', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('bounds a checkout that never resolves', async () => {
    vi.useFakeTimers();
    const connect = vi.fn(() => new Promise<PoolClient>(() => {}));
    const repository = postgresReadinessRepository({
      connect,
    } as unknown as Pool);
    const check = repository.checkDatabase();
    const rejection = expect(check).rejects.toThrow('database probe timed out');

    await vi.advanceTimersByTimeAsync(3000);
    await rejection;
    expect(connect).toHaveBeenCalledOnce();
  });

  it('releases a client checked out after timeout without running the probe', async () => {
    vi.useFakeTimers();
    let resolveCheckout!: (client: PoolClient) => void;
    const connect = vi.fn(
      () =>
        new Promise<PoolClient>((resolve) => {
          resolveCheckout = resolve;
        }),
    );
    const query = vi.fn();
    const release = vi.fn();
    const repository = postgresReadinessRepository({
      connect,
    } as unknown as Pool);
    const check = repository.checkDatabase();
    const rejection = expect(check).rejects.toThrow('database probe timed out');

    await vi.advanceTimersByTimeAsync(3000);
    await rejection;
    resolveCheckout({ query, release } as unknown as PoolClient);
    await Promise.resolve();

    expect(release).toHaveBeenCalledOnce();
    expect(query).not.toHaveBeenCalled();
  });

  it('bounds a stalled query by the overall deadline and discards its client', async () => {
    vi.useFakeTimers();
    const query = vi.fn(() => new Promise(() => {}));
    const release = vi.fn();
    const repository = postgresReadinessRepository({
      connect: vi.fn(
        () =>
          new Promise<PoolClient>((resolve) => {
            setTimeout(
              () => resolve({ query, release } as unknown as PoolClient),
              1000,
            );
          }),
      ),
    } as unknown as Pool);
    const check = repository.checkDatabase();
    let settled = false;
    void check.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    await vi.advanceTimersByTimeAsync(1000);
    expect(query).toHaveBeenCalledWith({ text: 'SELECT 1' });
    await vi.advanceTimersByTimeAsync(1999);
    expect(settled).toBe(false);
    expect(release).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await expect(check).rejects.toThrow('database probe timed out');
    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('PostgreSQL schema readiness probe', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('bounds a stalled schema query and discards its client', async () => {
    vi.useFakeTimers();
    const release = vi.fn();
    const repository = postgresReadinessRepository({
      connect: vi.fn(async () => ({
        query: vi.fn(() => new Promise(() => {})),
        release,
      })),
    } as unknown as Pool);
    const check = repository.checkSchema!();
    const rejection = expect(check).rejects.toThrow('database probe timed out');
    await vi.advanceTimersByTimeAsync(3000);
    await rejection;
    expect(release).toHaveBeenCalledWith(expect.any(Error));
  });
});
