import { Hono } from 'hono';
import type { Database } from '../db/client.js';
import { requireSession, type SessionResolver } from '../http/access.js';
import { ApiError } from '../http/errors.js';
import type { AppEnv } from '../http/types.js';
import { ContractValidationError, validateRequest, validateResponse } from '../contracts/validation.js';
import { IdempotencyConflict } from '../modules/legal/consent-service.js';
import { getOwnedJobView, RetryJobError, retryTerminalJob } from './repository.js';

export type AnalysisJobRouteDependencies = {
  db: Database;
  resolveSession: SessionResolver;
};

function invalidRequest(): ApiError {
  return new ApiError(422, 'INVALID_REQUEST', 'Request does not match the API contract');
}

function validateJobResponse(operation: string, status: number, value: unknown): void {
  try {
    validateResponse(operation, status, value, { contentType: 'application/json' });
  } catch {
    throw new ApiError(500, 'INTERNAL_ERROR', 'Analysis job response failed validation');
  }
}

export function registerAnalysisJobRoutes(app: Hono<AppEnv>, dependencies: AnalysisJobRouteDependencies): void {
  app.get('/api/v1/analysis-jobs/:id', requireSession(dependencies.resolveSession), async (c) => {
    let request: ReturnType<typeof validateRequest>;
    try {
      request = validateRequest('app.getAnalysisJob', {
        path: { id: c.req.param('id') },
        headers: c.req.header(),
      });
    } catch (error) {
      if (error instanceof ContractValidationError) throw invalidRequest();
      throw error;
    }
    const session = c.get('session');
    const view = await getOwnedJobView(dependencies.db, session.userId, request.path.id as string);
    if (!view) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Analysis job not found');
    validateJobResponse('app.getAnalysisJob', 200, view);
    return c.json(view);
  });

  app.post('/api/v1/analysis-jobs/:id/retry', requireSession(dependencies.resolveSession), async (c) => {
    let request: ReturnType<typeof validateRequest>;
    try {
      request = validateRequest('app.retryAnalysisJob', {
        path: { id: c.req.param('id') },
        headers: c.req.header(),
      });
    } catch (error) {
      if (error instanceof ContractValidationError) throw invalidRequest();
      throw error;
    }
    const session = c.get('session');
    if (!session.sessionId) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication session is unavailable');
    }
    try {
      const view = await retryTerminalJob(dependencies.db, {
        userId: session.userId,
        sessionId: session.sessionId,
        jobId: request.path.id as string,
        idempotencyKey: request.headers['idempotency-key'] as string,
      });
      if (!view) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Analysis job not found');
      validateJobResponse('app.retryAnalysisJob', 202, view);
      return c.json(view, 202);
    } catch (error) {
      if (error instanceof IdempotencyConflict) {
        throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was already used for another request');
      }
      if (error instanceof RetryJobError) {
        switch (error.reason) {
          case 'consent_required':
            throw new ApiError(403, 'AI_CONSENT_REQUIRED', 'Current AI processing consent is required');
          case 'target_stale':
            throw new ApiError(409, 'ANALYSIS_TARGET_STALE', 'The analysis target has changed');
          case 'not_retryable':
            throw new ApiError(409, 'ANALYSIS_NOT_RETRYABLE', 'The analysis job cannot be retried');
          case 'active_limit':
            c.header('Retry-After', '5');
            throw new ApiError(429, 'RATE_LIMITED', 'Too many active analysis jobs');
          case 'session_invalid':
            throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication session is unavailable');
        }
      }
      throw error;
    }
  });
}
