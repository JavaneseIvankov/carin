import { Hono, type Context } from 'hono';
import type { Database } from '../../db/client.js';
import { requireSession, type SessionResolver } from '../../http/access.js';
import { ApiError } from '../../http/errors.js';
import type { AppEnv } from '../../http/types.js';
import { ContractValidationError, validateRequest, validateResponse } from '../../contracts/validation.js';
import { IdempotencyConflict } from '../legal/consent-service.js';
import {
  AnalysisCatalogUnavailableError,
  CreateAnalysisError,
  createPhotoAnalysisJob,
  getOwnedAnalysisResult,
} from './repository.js';

export type AnalysisRouteDependencies = { db: Database; resolveSession: SessionResolver };

function invalidRequest(): ApiError {
  return new ApiError(422, 'INVALID_REQUEST', 'Request does not match the API contract');
}

function sendResponse(c: Context<AppEnv>, operation: string, status: number, body: unknown) {
  try {
    validateResponse(operation, status, body, { contentType: 'application/json' });
  } catch {
    throw new ApiError(500, 'INTERNAL_ERROR', 'Analysis response failed contract validation');
  }
  return c.json(body, status as 200 | 202);
}

function mapCreateError(c: Context<AppEnv>, error: unknown): never {
  if (error instanceof IdempotencyConflict)
    throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was already used for another request');
  if (error instanceof AnalysisCatalogUnavailableError || (error instanceof CreateAnalysisError && error.reason === 'catalog_unavailable'))
    throw new ApiError(409, 'CATALOG_VERSION_UNAVAILABLE', 'The current analysis catalog is unavailable');
  if (error instanceof CreateAnalysisError) {
    switch (error.reason) {
      case 'session_invalid':
        throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication session is no longer active');
      case 'consent_required':
        throw new ApiError(403, 'AI_CONSENT_REQUIRED', 'Current AI processing consent is required');
      case 'photo_not_found':
        throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Photo not found');
      case 'photo_unavailable':
        throw new ApiError(409, 'ANALYSIS_TARGET_STALE', 'Photo is already attached to a scan or is unavailable');
      case 'active_limit':
        c.header('Retry-After', '5');
        throw new ApiError(429, 'RATE_LIMITED', 'Too many active analysis jobs', true);
    }
  }
  throw error;
}

export function registerAnalysisRoutes(app: Hono<AppEnv>, dependencies: AnalysisRouteDependencies): void {
  app.post('/api/v1/analysis-jobs', requireSession(dependencies.resolveSession), async (c) => {
    let request: ReturnType<typeof validateRequest>;
    try {
      let body: unknown;
      try { body = await c.req.json(); } catch { throw new ContractValidationError('app.createPhotoAnalysis.body'); }
      request = validateRequest('app.createPhotoAnalysis', {
        headers: c.req.header(),
        body,
        contentType: c.req.header('content-type'),
      });
    } catch (error) {
      if (error instanceof ContractValidationError) throw invalidRequest();
      throw error;
    }
    const session = c.get('session');
    if (!session.sessionId) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication session is unavailable');
    try {
      const result = await createPhotoAnalysisJob(dependencies.db, {
        userId: session.userId,
        sessionId: session.sessionId,
        idempotencyKey: request.headers['idempotency-key'] as string,
        photoId: (request.body as { photoId: string }).photoId,
      });
      return sendResponse(c, 'app.createPhotoAnalysis', 202, result);
    } catch (error) {
      return mapCreateError(c, error);
    }
  });

  app.get('/api/v1/analysis-results/:id', requireSession(dependencies.resolveSession), async (c) => {
    let request: ReturnType<typeof validateRequest>;
    try {
      request = validateRequest('app.getAnalysisResult', {
        path: { id: c.req.param('id') },
        headers: c.req.header(),
      });
    } catch (error) {
      if (error instanceof ContractValidationError) throw invalidRequest();
      throw error;
    }
    const result = await getOwnedAnalysisResult(dependencies.db, c.get('session').userId, request.path.id as string);
    if (!result) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Analysis result not found');
    return sendResponse(c, 'app.getAnalysisResult', 200, result);
  });
}
