import { Hono, type Context } from 'hono';
import type { Database } from '../../db/client.js';
import { requireSession, type SessionResolver } from '../../http/access.js';
import { ApiError } from '../../http/errors.js';
import type { AppEnv } from '../../http/types.js';
import { ContractValidationError, validateRequest, validateResponse } from '../../contracts/validation.js';
import { IdempotencyConflict } from '../legal/consent-service.js';
import { AnalysisCatalogUnavailableError } from '../analyses/repository.js';
import {
  createScanCorrection,
  getOwnedScan,
  listOwnedScans,
  ScanAnalysisPendingError,
  ScanCorrectionError,
  ScanNotFoundError,
} from './repository.js';

export type ScanRouteDependencies = { db: Database; resolveSession: SessionResolver };

function invalidRequest(): ApiError {
  return new ApiError(422, 'INVALID_REQUEST', 'Request does not match the API contract');
}

function sendResponse(c: Context<AppEnv>, operation: string, status: number, body: unknown) {
  try {
    validateResponse(operation, status, body, { contentType: 'application/json' });
  } catch {
    throw new ApiError(500, 'INTERNAL_ERROR', 'Scan response failed contract validation');
  }
  return c.json(body, status as 200 | 202);
}

function mapCorrectionError(c: Context<AppEnv>, error: unknown): never {
  if (error instanceof IdempotencyConflict)
    throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was already used for another request');
  if (error instanceof AnalysisCatalogUnavailableError)
    throw new ApiError(409, 'CATALOG_VERSION_UNAVAILABLE', 'The requested catalog version is unavailable');
  if (error instanceof ScanNotFoundError)
    throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Scan not found');
  if (error instanceof ScanAnalysisPendingError)
    throw new ApiError(409, 'ANALYSIS_PENDING', 'The scan analysis is still processing');
  if (error instanceof ScanCorrectionError) {
    switch (error.reason) {
      case 'session_invalid':
        throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication session is no longer active');
      case 'consent_required':
        throw new ApiError(403, 'AI_CONSENT_REQUIRED', 'Current AI processing consent is required');
      case 'revision_conflict':
        throw new ApiError(409, 'REVISION_CONFLICT', 'Scan has changed');
      case 'pending':
        throw new ApiError(409, 'ANALYSIS_PENDING', 'A scan analysis is still processing');
      case 'active_limit':
        c.header('Retry-After', '5');
        throw new ApiError(429, 'RATE_LIMITED', 'Too many active analysis jobs', true);
      case 'invalid_component':
        throw new ApiError(422, 'INVALID_INPUT', 'Correction components are not available in the selected catalog version');
    }
  }
  if (error instanceof ContractValidationError)
    throw new ApiError(400, 'INVALID_INPUT', 'Scan cursor is invalid');
  throw error;
}

export function registerScanRoutes(app: Hono<AppEnv>, dependencies: ScanRouteDependencies): void {
  app.get('/api/v1/scans', requireSession(dependencies.resolveSession), async (c) => {
    let request: ReturnType<typeof validateRequest>;
    try {
      request = validateRequest('app.listScans', {
        query: new URL(c.req.url).searchParams,
        headers: c.req.header(),
      });
    } catch (error) {
      if (error instanceof ContractValidationError) throw invalidRequest();
      throw error;
    }
    try {
      const result = await listOwnedScans(dependencies.db, {
        userId: c.get('session').userId,
        cursor: request.query.cursor as string | undefined,
        limit: (request.query.limit as number | undefined) ?? 30,
      });
      return sendResponse(c, 'app.listScans', 200, result);
    } catch (error) {
      return mapCorrectionError(c, error);
    }
  });

  app.get('/api/v1/scans/:id', requireSession(dependencies.resolveSession), async (c) => {
    let request: ReturnType<typeof validateRequest>;
    try {
      request = validateRequest('app.getScan', {
        path: { id: c.req.param('id') },
        headers: c.req.header(),
      });
    } catch (error) {
      if (error instanceof ContractValidationError) throw invalidRequest();
      throw error;
    }
    const result = await getOwnedScan(dependencies.db, c.get('session').userId, request.path.id as string);
    if (!result) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Scan not found');
    return sendResponse(c, 'app.getScan', 200, result);
  });

  app.post('/api/v1/scans/:id/corrections', requireSession(dependencies.resolveSession), async (c) => {
    let request: ReturnType<typeof validateRequest>;
    try {
      let body: unknown;
      try { body = await c.req.json(); } catch { throw new ContractValidationError('app.correctScan.body'); }
      request = validateRequest('app.correctScan', {
        path: { id: c.req.param('id') },
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
      const result = await createScanCorrection(dependencies.db, {
        userId: session.userId,
        sessionId: session.sessionId,
        scanId: request.path.id as string,
        idempotencyKey: request.headers['idempotency-key'] as string,
        correction: request.body as Parameters<typeof createScanCorrection>[1]['correction'],
      });
      return sendResponse(c, 'app.correctScan', 202, result);
    } catch (error) {
      return mapCorrectionError(c, error);
    }
  });
}
