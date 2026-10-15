import { Hono } from 'hono';
import { createHmac } from 'node:crypto';
import type { Database } from '../../db/client.js';
import { ContractValidationError, validateRequest, validateResponse } from '../../contracts/validation.js';
import { requireSession, type SessionResolver } from '../../http/access.js';
import { ApiError } from '../../http/errors.js';
import type { AppEnv } from '../../http/types.js';
import {
  AccountDeletionSessionError,
  acceptAccountDeletion,
} from './deletion-service.js';
import {
  AccountIdempotencyConflict,
  AccountNotFoundError,
  AccountRevisionConflict,
  getMe,
  InactiveAccountSessionError,
  InvalidTimezoneError,
  updateMe,
} from './service.js';

export type AccountRouteDependencies = {
  db: Database;
  resolveSession: SessionResolver;
  verifyPassword?: (request: Request, password: string) => Promise<boolean>;
  deletionSecret?: string;
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

  app.patch('/api/v1/me', requireSession(dependencies.resolveSession), async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new ApiError(422, 'INVALID_REQUEST', 'Request does not match the API contract');
    }
    let request: ReturnType<typeof validateRequest>;
    try {
      request = validateRequest('app.updateMe', {
        headers: c.req.header(),
        body,
        contentType: c.req.header('content-type'),
      });
    } catch (error) {
      if (error instanceof ContractValidationError)
        throw new ApiError(422, 'INVALID_REQUEST', 'Request does not match the API contract');
      throw error;
    }

    const currentSession = c.get('session');
    if (!currentSession.sessionId)
      throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication session is unavailable');
    const update = request.body as { expectedRevision: number; timezone: string };
    try {
      const result = await updateMe(dependencies.db, {
        userId: currentSession.userId,
        sessionId: currentSession.sessionId,
        key: request.headers['idempotency-key'] as string,
        expectedRevision: update.expectedRevision,
        timezone: update.timezone,
      });
      try {
        validateResponse('app.updateMe', 200, result, { contentType: 'application/json' });
      } catch {
        throw new ApiError(500, 'INTERNAL_ERROR', 'Account response is invalid');
      }
      return c.json(result);
    } catch (error) {
      if (error instanceof AccountNotFoundError)
        throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Account not found');
      if (error instanceof InactiveAccountSessionError)
        throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication session is no longer active');
      if (error instanceof InvalidTimezoneError)
        throw new ApiError(422, 'INVALID_INPUT', 'Timezone must be a valid IANA time zone');
      if (error instanceof AccountRevisionConflict)
        throw new ApiError(409, 'REVISION_CONFLICT', 'Account settings have changed');
      if (error instanceof AccountIdempotencyConflict)
        throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was already used for another request');
      throw error;
    }
  });

  const verifyPassword = dependencies.verifyPassword;
  const deletionSecret = dependencies.deletionSecret;
  if (verifyPassword && deletionSecret) {
    app.post('/api/v1/account-deletion', requireSession(dependencies.resolveSession), async (c) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        throw new ApiError(422, 'INVALID_REQUEST', 'Request does not match the API contract');
      }
      let request: ReturnType<typeof validateRequest>;
      try {
        request = validateRequest('app.deleteAccount', {
          headers: c.req.header(),
          body,
          contentType: c.req.header('content-type'),
        });
      } catch (error) {
        if (error instanceof ContractValidationError)
          throw new ApiError(422, 'INVALID_REQUEST', 'Request does not match the API contract');
        throw error;
      }
      const currentSession = c.get('session');
      if (!currentSession.sessionId)
        throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication session is unavailable');
      const input = request.body as { password: string; confirmation: 'DELETE_MY_ACCOUNT' };
      if (!await verifyPassword(c.req.raw, input.password))
        throw new ApiError(403, 'REAUTHENTICATION_REQUIRED', 'Current password is incorrect');
      const requestHash = createHmac('sha256', deletionSecret)
        .update(JSON.stringify({ confirmation: input.confirmation, password: input.password }), 'utf8')
        .digest('hex');
      try {
        const result = await acceptAccountDeletion(dependencies.db, {
          userId: currentSession.userId,
          sessionId: currentSession.sessionId,
          idempotencyKey: request.headers['idempotency-key'] as string,
          requestHash,
        });
        try {
          validateResponse('app.deleteAccount', 202, result, { contentType: 'application/json' });
        } catch {
          throw new ApiError(500, 'INTERNAL_ERROR', 'Account deletion response is invalid');
        }
        return c.json(result, 202);
      } catch (error) {
        if (error instanceof AccountDeletionSessionError)
          throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication session is no longer active');
        throw error;
      }
    });
  }
}
