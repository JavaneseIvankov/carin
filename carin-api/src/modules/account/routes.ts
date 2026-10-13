import { Hono } from 'hono';
import type { Database } from '../../db/client.js';
import { validateResponse } from '../../contracts/validation.js';
import { requireSession, type SessionResolver } from '../../http/access.js';
import { ApiError } from '../../http/errors.js';
import type { AppEnv } from '../../http/types.js';
import { AccountNotFoundError, getMe } from './service.js';

export type AccountRouteDependencies = {
  db: Database;
  resolveSession: SessionResolver;
};

export function registerAccountRoutes(
  app: Hono<AppEnv>,
  dependencies: AccountRouteDependencies,
) {
  app.get('/api/v1/me', requireSession(dependencies.resolveSession), async (c) => {
    const session = c.get('session');
    try {
      const result = await getMe(dependencies.db, session.userId);
      try {
        validateResponse('app.getMe', 200, result, {
          contentType: 'application/json',
        });
      } catch {
        throw new ApiError(500, 'INTERNAL_ERROR', 'Account response is invalid');
      }
      return c.json(result);
    } catch (error) {
      if (error instanceof AccountNotFoundError) {
        throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Account not found');
      }
      throw error;
    }
  });
}
