import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadLegalRegistry } from './legal';

vi.mock('@/lib/config', () => ({ requireApiUrl: () => 'http://localhost:3000' }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('registration legal documents', () => {
  it('loads current documents without a custom header that requires CORS preflight', async () => {
    const registry = { terms: { version: 'v1' }, privacy: { version: 'v1' } };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => registry });
    vi.stubGlobal('fetch', fetchMock);
    await expect(loadLegalRegistry()).resolves.toEqual(registry);
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/api/v1/legal', {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    });
  });

  it('rejects failed responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(loadLegalRegistry()).rejects.toThrow('LEGAL_REGISTRY_UNAVAILABLE');
  });

  it('aborts a stalled request after ten seconds so retry becomes available', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, { signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('aborted')));
          })
      )
    );
    const result = expect(loadLegalRegistry()).rejects.toThrow('aborted');
    await vi.advanceTimersByTimeAsync(10_000);
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });
});
