import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequestId } from './request-id';

afterEach(() => vi.unstubAllGlobals());

describe('request tracing IDs', () => {
  it('uses the platform UUID when available', () => {
    const uuid = '1841b31c-1d75-4658-bcba-7c581b26fcd3';
    expect(createRequestId(() => uuid)).toBe(uuid);
  });

  it('keeps requests possible when UUID generation fails on HTTP web', () => {
    const unavailable = vi.fn(() => {
      throw new TypeError('crypto.randomUUID is not a function');
    });
    const first = createRequestId(unavailable);
    const second = createRequestId(unavailable);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(second).not.toBe(first);
    expect(unavailable).toHaveBeenCalledTimes(2);
  });

  it('can still trace requests when WebCrypto is absent', () => {
    vi.stubGlobal('crypto', undefined);
    expect(createRequestId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });
});
