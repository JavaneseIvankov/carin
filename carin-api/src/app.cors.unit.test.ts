import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

const origin = 'http://localhost:8081';

function app() {
  return createApp({
    readiness: async () => true,
    trustedWebOrigins: [origin],
    auth: { handler: async () => Response.json(null) },
    registerRoutes: (app) => {
      app.get('/api/v1/test', (c) => c.json({ ok: true }));
    },
  });
}

describe('web API CORS', () => {
  it.each(['/api/auth/get-session', '/api/v1/test'])(
    'allows credentialed requests from a configured web origin to %s', async (path) => {
      const response = await app().request(path, { headers: { Origin: origin } });
      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
      expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
      expect(response.headers.get('Vary')).toContain('Origin');
    }
  );

  it('handles write preflights with the content type and idempotency header', async () => {
    const response = await app().request('/api/v1/test', {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,idempotency-key',
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(response.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toContain('idempotency-key');
  });

  it('does not allow unconfigured origins', async () => {
    const response = await app().request('/api/auth/get-session', {
      headers: { Origin: 'http://untrusted.example' },
    });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('defaults to no allowed web origins', async () => {
    const response = await createApp({ readiness: async () => true }).request('/api/v1/missing', {
      headers: { Origin: origin },
    });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
