import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { readValidatedJson } from '../../src/http/json.js';
import { requireOwnership, requireSession } from '../../src/http/access.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('HTTP foundation', () => {
  it('keeps liveness available when readiness is unavailable', async () => {
    const app = createApp({ readiness: async () => false });
    const live = await app.request('/health/live');
    expect(live.status).toBe(200);
    const liveBody = await live.json();
    expect(liveBody).toEqual({ status: 'ok', requestId: expect.stringMatching(uuid) });
    expect(live.headers.get('x-request-id')).toBe(liveBody.requestId);

    const ready = await app.request('/health/ready');
    expect(ready.status).toBe(503);
    expect(await ready.json()).toEqual({ error: {
      code: 'SERVICE_UNAVAILABLE', message: 'Service is not ready', retryable: true,
      requestId: ready.headers.get('x-request-id'), details: {},
    } });
  });

  it('reports readiness only when its injected DB and schema check succeeds', async () => {
    const app = createApp({ readiness: async () => true });
    const response = await app.request('/health/ready');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', requestId: response.headers.get('x-request-id') });
  });

  it('does not allow an AI failure to change core readiness', async () => {
    const app = createApp({
      readiness: async () => true,
      registerRoutes: (router) => router.get('/fixture/ai', () => { throw new Error('AI unavailable'); }),
    });
    expect((await app.request('/fixture/ai')).status).toBe(500);
    const response = await app.request('/health/ready');
    expect(response.status).toBe(200);
  });

  it('converts a failing readiness probe to a temporary service error', async () => {
    const app = createApp({ readiness: async () => { throw new Error('database password'); } });
    const response = await app.request('/health/ready');
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain('database password');
  });

  it('sanitizes incoming request IDs and matches the response header and body', async () => {
    const app = createApp({ readiness: async () => true });
    const unsafe = await app.request('/health/live', { headers: { 'x-request-id': 'token=secret' } });
    const unsafeBody = await unsafe.json();
    expect(unsafeBody.requestId).toMatch(uuid);
    expect(unsafeBody.requestId).not.toBe('token=secret');
    expect(unsafe.headers.get('x-request-id')).toBe(unsafeBody.requestId);

    const supplied = '72f917c5-5fbc-4a14-9829-5b64ec687403';
    const accepted = await app.request('/health/live', { headers: { 'x-request-id': supplied } });
    expect((await accepted.json()).requestId).toBe(supplied);
    expect(accepted.headers.get('x-request-id')).toBe(supplied);
  });

  it('uses the contract envelope for unknown routes and malformed JSON', async () => {
    const app = createApp({
      readiness: async () => true,
      registerRoutes: (router) => router.post('/fixture', async (c) => {
        const data = await readValidatedJson(c, (value): value is { name: string } =>
          typeof value === 'object' && value !== null && 'name' in value && typeof value.name === 'string');
        return c.json(data);
      }),
    });
    const missing = await app.request('/private?token=private');
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: {
      code: 'RESOURCE_NOT_FOUND', message: 'Resource not found', retryable: false,
      requestId: missing.headers.get('x-request-id'), details: {},
    } });
    const malformed = await app.request('/fixture', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{password:secret' });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: {
      code: 'INVALID_INPUT', message: 'Malformed JSON', retryable: false,
      requestId: malformed.headers.get('x-request-id'), details: {},
    } });
    const invalid = await app.request('/fixture', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(invalid.status).toBe(422);
    expect((await invalid.json()).error.code).toBe('INVALID_INPUT');
  });

  it('redacts unexpected errors and request secrets from responses and logs', async () => {
    const log = vi.fn();
    const app = createApp({
      readiness: async () => true, log,
      registerRoutes: (router) => router.post('/fixture', () => { throw new Error('password=private-token'); }),
    });
    const response = await app.request('/fixture?access_token=private-token', {
      method: 'POST', headers: { authorization: 'Bearer private-token', cookie: 'session=private-token' }, body: 'private-token',
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: {
      code: 'INTERNAL_ERROR', message: 'Internal server error', retryable: false,
      requestId: response.headers.get('x-request-id'), details: {},
    } });
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain('private-token');
    expect(logged).not.toContain('access_token');
    expect(logged).toContain(response.headers.get('x-request-id'));
    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      requestId: response.headers.get('x-request-id'), method: 'POST', status: 500,
    }));
  });

  it('keeps session and ownership hooks closed without trusted server evidence', async () => {
    const app = createApp({
      readiness: async () => true,
      registerRoutes: (router) => {
        router.get('/absent', requireSession(async () => null), (c) => c.text('unexpected'));
        router.get('/unverified', requireSession(async () => ({ userId: 'user-1', emailVerified: false })), (c) => c.text('unexpected'));
        router.get('/owned/:id', requireSession(async () => ({ userId: 'user-1', emailVerified: true })), requireOwnership(async () => 'user-2'), (c) => c.text('unexpected'));
      },
    });
    for (const [path, status, code] of [
      ['/absent', 401, 'UNAUTHENTICATED'], ['/unverified', 403, 'EMAIL_NOT_VERIFIED'], ['/owned/resource-1', 404, 'RESOURCE_NOT_FOUND'],
    ] as const) {
      const response = await app.request(path);
      expect(response.status).toBe(status);
      expect((await response.json()).error.code).toBe(code);
    }
  });

  it('allows a verified session to access an owned resource with a named route parameter', async () => {
    const ownerLookup = vi.fn(async () => 'user-1');
    const app = createApp({
      readiness: async () => true,
      registerRoutes: (router) => router.get('/fixture/photos/:photoId',
        requireSession(async () => ({ userId: 'user-1', emailVerified: true })),
        requireOwnership(ownerLookup, 'photoId'),
        (c) => c.text('owned')),
    });
    const response = await app.request('/fixture/photos/photo-1');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('owned');
    expect(ownerLookup).toHaveBeenCalledWith('photo-1', { userId: 'user-1', emailVerified: true });
  });
});
