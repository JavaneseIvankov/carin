import type { Hono } from 'hono';
import { ApiError } from '../http/errors.js';
import type { AppEnv } from '../http/types.js';

export function registerHealthRoutes(app: Hono<AppEnv>, readiness: () => Promise<boolean>): void {
  app.get('/health/live', (c) => c.json({ status: 'ok', requestId: c.get('requestId') }));
  app.get('/health/ready', async (c) => {
    let ready = false;
    try {
      ready = await readiness();
    } catch {
      // Readiness probes must not disclose connection or migration errors.
    }
    if (!ready) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Service is not ready', true);
    return c.json({ status: 'ok', requestId: c.get('requestId') });
  });
}
