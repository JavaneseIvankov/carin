import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { registerHealthRoutes } from './health/handler.js';
import { ApiError, errorResponse } from './http/errors.js';
import type { AppEnv } from './http/types.js';

export type RequestLog = {
  requestId: string;
  method: string;
  status: number;
  durationMs: number;
};

export type AppDependencies = {
  readiness: () => Promise<boolean>;
  log?: (entry: RequestLog) => void;
  registerRoutes?: (app: Hono<AppEnv>) => void;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createApp({ readiness, log, registerRoutes }: AppDependencies): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    const supplied = c.req.header('x-request-id');
    const requestId = supplied && uuid.test(supplied) ? supplied : randomUUID();
    c.set('requestId', requestId);
    c.header('x-request-id', requestId);
    const started = performance.now();
    await next();
    log?.({ requestId, method: c.req.method, status: c.res.status, durationMs: Math.round(performance.now() - started) });
  });

  registerHealthRoutes(app, readiness);

  registerRoutes?.(app);

  app.notFound((c) => errorResponse(c, new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource not found')));
  app.onError((error, c) => errorResponse(c, error instanceof ApiError
    ? error : new ApiError(500, 'INTERNAL_ERROR', 'Internal server error')));
  return app;
}
