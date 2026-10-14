import { Hono } from 'hono';
import { ContractValidationError, validateRequest, validateResponse } from '../../contracts/validation.js';
import type { Database } from '../../db/client.js';
import { requireSession, type SessionResolver } from '../../http/access.js';
import { ApiError } from '../../http/errors.js';
import type { AppEnv } from '../../http/types.js';
import { DashboardDateError, DashboardSessionError, getDashboard } from './repository.js';

export type DashboardRouteDependencies = { db: Database; resolveSession: SessionResolver };

export function registerDashboardRoutes(app: Hono<AppEnv>, dependencies: DashboardRouteDependencies): void {
  app.get('/api/v1/dashboard', requireSession(dependencies.resolveSession), async (c) => {
    let request: ReturnType<typeof validateRequest>;
    try {
      request = validateRequest('app.getDashboard', {
        query: new URL(c.req.url).searchParams,
        headers: c.req.header(),
      });
    } catch (error) {
      if (error instanceof ContractValidationError)
        throw new ApiError(422, 'INVALID_INPUT', 'Dashboard date is invalid');
      throw error;
    }

    const session = c.get('session');
    if (!session.sessionId) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication session is unavailable');
    try {
      const body = await getDashboard(dependencies.db, {
        userId: session.userId,
        sessionId: session.sessionId,
        date: request.query.date as string | undefined,
      });
      try {
        validateResponse('app.getDashboard', 200, body, { contentType: 'application/json' });
      } catch {
        throw new ApiError(500, 'INTERNAL_ERROR', 'Dashboard response failed contract validation');
      }
      return c.json(body);
    } catch (error) {
      if (error instanceof DashboardSessionError)
        throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication session is no longer active');
      if (error instanceof DashboardDateError || error instanceof RangeError)
        throw new ApiError(422, 'INVALID_INPUT', 'Dashboard date or account timezone is invalid');
      throw error;
    }
  });
}
