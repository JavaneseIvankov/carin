import { Hono } from 'hono';
import type { Database } from '../../db/client.js';
import { ContractValidationError, validateRequest, validateResponse } from '../../contracts/validation.js';
import { requireSession, type SessionResolver } from '../../http/access.js';
import { ApiError } from '../../http/errors.js';
import type { AppEnv } from '../../http/types.js';
import {
  getProfile,
  InactiveProfileSessionError,
  ProfileAccountNotFoundError,
  ProfileIdempotencyConflictError,
  ProfileRevisionConflictError,
  replaceProfile,
} from './service.js';
import {
  ProfileValidationError,
  type ProfileCapabilityProvider,
  type ProfileFields,
} from './validation.js';

export type ProfileRouteDependencies = {
  db: Database;
  resolveSession: SessionResolver;
  capabilityProvider?: ProfileCapabilityProvider;
};

function responseValidationError(): ApiError {
  return new ApiError(500, 'INTERNAL_ERROR', 'Profile response is invalid');
}

function mapProfileError(error: unknown): never {
  if (error instanceof ProfileAccountNotFoundError)
    throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Account not found');
  if (error instanceof InactiveProfileSessionError)
    throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication session is no longer active');
  if (error instanceof ProfileRevisionConflictError)
    throw new ApiError(409, 'REVISION_CONFLICT', 'Profile has changed');
  if (error instanceof ProfileIdempotencyConflictError)
    throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was already used for another request');
  if (error instanceof ProfileValidationError)
    throw new ApiError(422, 'INVALID_INPUT', 'Profile fields are invalid');
  throw error;
}

export function registerProfileRoutes(
  app: Hono<AppEnv>,
  dependencies: ProfileRouteDependencies,
): void {
  app.get('/api/v1/profile', requireSession(dependencies.resolveSession), async (c) => {
    try {
      const session = c.get('session');
      const result = await getProfile(dependencies.db, {
        userId: session.userId,
        capabilityProvider: dependencies.capabilityProvider,
      });
      try {
        validateResponse('app.getProfile', 200, result, { contentType: 'application/json' });
      } catch {
        throw responseValidationError();
      }
      return c.json(result);
    } catch (error) {
      mapProfileError(error);
    }
  });

  app.patch('/api/v1/profile', requireSession(dependencies.resolveSession), async (c) => {
    let request: ReturnType<typeof validateRequest>;
    try {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        throw new ContractValidationError('app.updateProfile.body');
      }
      request = validateRequest('app.updateProfile', {
        headers: c.req.header(),
        body,
        contentType: c.req.header('content-type'),
      });
    } catch (error) {
      if (error instanceof ContractValidationError)
        throw new ApiError(422, 'INVALID_REQUEST', 'Request does not match the API contract');
      throw error;
    }

    const session = c.get('session');
    if (!session.sessionId)
      throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication session is unavailable');
    const body = request.body as { expectedVersion: number; fields: ProfileFields };
    try {
      const result = await replaceProfile(dependencies.db, {
        userId: session.userId,
        sessionId: session.sessionId,
        key: request.headers['idempotency-key'] as string,
        expectedVersion: body.expectedVersion,
        fields: body.fields,
      }, dependencies.capabilityProvider);
      try {
        validateResponse('app.updateProfile', 200, result, { contentType: 'application/json' });
      } catch {
        throw responseValidationError();
      }
      return c.json(result);
    } catch (error) {
      mapProfileError(error);
    }
  });
}
