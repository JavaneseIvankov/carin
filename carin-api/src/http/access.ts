import { createMiddleware } from 'hono/factory';
import { ApiError } from './errors.js';
import type { AppEnv, Session } from './types.js';

export type SessionResolver = (request: Request) => Promise<Session | null>;

export function requireSession(resolve: SessionResolver) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const session = await resolve(c.req.raw);
    if (!session) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required');
    if (!session.emailVerified) throw new ApiError(403, 'EMAIL_NOT_VERIFIED', 'Email verification required');
    c.set('session', session);
    await next();
  });
}

export type OwnerLookup = (resourceId: string, session: Session) => Promise<string | null>;

export function requireOwnership(ownerForResource: OwnerLookup, resourceIdParam = 'id') {
  return createMiddleware<AppEnv>(async (c, next) => {
    const session = c.get('session');
    if (!session) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required');
    const resourceId = c.req.param(resourceIdParam);
    if (!resourceId || await ownerForResource(resourceId, session) !== session.userId) {
      throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource not found');
    }
    await next();
  });
}
