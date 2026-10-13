import { describe, expect, it } from 'vitest';
import type { Database } from '../db/client.js';
import { createAuthRuntime } from './runtime.js';

describe('Better Auth runtime', () => {
  it('exposes a handler, verified-session resolver, and injectable mail sender', () => {
    const runtime = createAuthRuntime({
      db: undefined as unknown as Database,
      baseURL: 'http://test.local',
      secret: 'test-secret-that-is-long-enough-for-auth',
      sendEmail: async () => undefined,
    });

    expect(runtime.auth.handler).toBeTypeOf('function');
    expect(runtime.resolveSession).toBeTypeOf('function');
  });
});
