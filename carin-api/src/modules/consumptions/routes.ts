import { Hono, type Context } from 'hono';
import { ContractValidationError, validateRequest, validateResponse } from '../../contracts/validation.js';
import type { Database } from '../../db/client.js';
import { requireSession, type SessionResolver } from '../../http/access.js';
import { ApiError } from '../../http/errors.js';
import type { AppEnv } from '../../http/types.js';
import { AnalysisCatalogUnavailableError } from '../analyses/repository.js';
import { IdempotencyConflict } from '../legal/consent-service.js';
import { ScanAnalysisPendingError, ScanCorrectionError, ScanNotFoundError } from '../scans/repository.js';
import {
  ConsumptionError,
  createConsumption,
  deleteConsumption,
  getConsumption,
  listConsumptions,
  updateConsumption,
} from './repository.js';
import { ConsumptionCatalogInputError } from './nutrition.js';

export type ConsumptionRouteDependencies = { db: Database; resolveSession: SessionResolver };

function requestError(): ApiError {
  return new ApiError(422, 'INVALID_REQUEST', 'Request does not match the API contract');
}

function responseError(): ApiError {
  return new ApiError(500, 'INTERNAL_ERROR', 'Consumption response failed contract validation');
}

function sendResponse(c: Context<AppEnv>, operation: string, status: 200 | 201, body: unknown) {
  try {
    validateResponse(operation, status, body, { contentType: 'application/json' });
  } catch {
    throw responseError();
  }
  return c.json(body, status);
}

function mapConsumptionError(error: unknown): never {
  if (error instanceof IdempotencyConflict)
    throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was already used for another request');
  if (error instanceof AnalysisCatalogUnavailableError)
    throw new ApiError(409, 'CATALOG_VERSION_UNAVAILABLE', 'The requested catalog version is unavailable');
  if (error instanceof ConsumptionCatalogInputError) {
    if (error.reason === 'serving_source_unavailable') {
      throw new ApiError(409, 'CATALOG_VERSION_UNAVAILABLE', 'Catalog serving provenance is unavailable');
    }
    throw new ApiError(422, 'INVALID_INPUT', 'Consumption catalog selection is invalid');
  }
  if (error instanceof ScanNotFoundError)
    throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Scan not found');
  if (error instanceof ScanAnalysisPendingError)
    throw new ApiError(409, 'ANALYSIS_PENDING', 'The scan analysis is still processing');
  if (error instanceof ScanCorrectionError && error.reason === 'revision_conflict')
    throw new ApiError(409, 'SOURCE_REVISION_CONFLICT', 'The source result is no longer current');
  if (error instanceof ContractValidationError)
    throw new ApiError(400, 'INVALID_INPUT', 'Consumption cursor is invalid');
  if (error instanceof ConsumptionError) {
    switch (error.reason) {
      case 'session_invalid':
        throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication session is no longer active');
      case 'not_found':
        throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Consumption not found');
      case 'revision_conflict':
        throw new ApiError(409, 'REVISION_CONFLICT', 'Consumption has changed');
      case 'already_confirmed':
        throw new ApiError(409, 'CONSUMPTION_ALREADY_CONFIRMED', 'This scan already has a different default confirmation');
      case 'catalog_unavailable':
        throw new ApiError(409, 'CATALOG_VERSION_UNAVAILABLE', 'The requested catalog version is unavailable');
      case 'source_changed':
        throw new ApiError(409, 'SOURCE_REVISION_CONFLICT', 'The source result is no longer current');
      case 'time_in_future':
      case 'invalid_timezone':
      case 'invalid_input':
        throw new ApiError(422, 'INVALID_INPUT', 'Consumption input is invalid');
    }
  }
  throw error;
}

export function registerConsumptionRoutes(
  app: Hono<AppEnv>,
  dependencies: ConsumptionRouteDependencies,
): void {
  app.get('/api/v1/consumptions', requireSession(dependencies.resolveSession), async (c) => {
    let request: ReturnType<typeof validateRequest>;
    try {
      request = validateRequest('app.listConsumptions', {
        query: new URL(c.req.url).searchParams,
        headers: c.req.header(),
      });
    } catch (error) {
      if (error instanceof ContractValidationError) throw requestError();
      throw error;
    }
    try {
      const result = await listConsumptions(dependencies.db, {
        userId: c.get('session').userId,
        cursor: request.query.cursor as string | undefined,
        limit: (request.query.limit as number | undefined) ?? 30,
        from: request.query.from as string | undefined,
        to: request.query.to as string | undefined,
      });
      try {
        validateResponse('app.listConsumptions', 200, result, { contentType: 'application/json' });
      } catch {
        throw responseError();
      }
      return c.json(result);
    } catch (error) {
      mapConsumptionError(error);
    }
  });

  app.post('/api/v1/consumptions', requireSession(dependencies.resolveSession), async (c) => {
    let request: ReturnType<typeof validateRequest>;
    try {
      let body: unknown;
      try { body = await c.req.json(); } catch { throw new ContractValidationError('app.createConsumption.body'); }
      request = validateRequest('app.createConsumption', {
        headers: c.req.header(),
        body,
        contentType: c.req.header('content-type'),
      });
    } catch (error) {
      if (error instanceof ContractValidationError) throw requestError();
      throw error;
    }
    const session = c.get('session');
    if (!session.sessionId) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication session is unavailable');
    try {
      const result = await createConsumption(dependencies.db, {
        userId: session.userId,
        sessionId: session.sessionId,
        idempotencyKey: request.headers['idempotency-key'] as string,
        body: request.body as Parameters<typeof createConsumption>[1]['body'],
      });
      return sendResponse(c, 'app.createConsumption', result.status, result.body);
    } catch (error) {
      mapConsumptionError(error);
    }
  });

  app.get('/api/v1/consumptions/:id', requireSession(dependencies.resolveSession), async (c) => {
    let request: ReturnType<typeof validateRequest>;
    try {
      request = validateRequest('app.getConsumption', {
        path: { id: c.req.param('id') },
        headers: c.req.header(),
      });
    } catch (error) {
      if (error instanceof ContractValidationError) throw requestError();
      throw error;
    }
    const result = await getConsumption(dependencies.db, c.get('session').userId, request.path.id as string);
    if (!result) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Consumption not found');
    return sendResponse(c, 'app.getConsumption', 200, result);
  });

  app.patch('/api/v1/consumptions/:id', requireSession(dependencies.resolveSession), async (c) => {
    let request: ReturnType<typeof validateRequest>;
    try {
      let body: unknown;
      try { body = await c.req.json(); } catch { throw new ContractValidationError('app.updateConsumption.body'); }
      request = validateRequest('app.updateConsumption', {
        path: { id: c.req.param('id') },
        headers: c.req.header(),
        body,
        contentType: c.req.header('content-type'),
      });
    } catch (error) {
      if (error instanceof ContractValidationError) throw requestError();
      throw error;
    }
    const session = c.get('session');
    if (!session.sessionId) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication session is unavailable');
    try {
      const result = await updateConsumption(dependencies.db, {
        userId: session.userId,
        sessionId: session.sessionId,
        idempotencyKey: request.headers['idempotency-key'] as string,
        consumptionId: request.path.id as string,
        body: request.body as Parameters<typeof updateConsumption>[1]['body'],
      });
      if (!result) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Consumption not found');
      return sendResponse(c, 'app.updateConsumption', 200, result);
    } catch (error) {
      mapConsumptionError(error);
    }
  });

  app.delete('/api/v1/consumptions/:id', requireSession(dependencies.resolveSession), async (c) => {
    let request: ReturnType<typeof validateRequest>;
    try {
      request = validateRequest('app.deleteConsumption', {
        path: { id: c.req.param('id') },
        headers: c.req.header(),
      });
    } catch (error) {
      if (error instanceof ContractValidationError) throw requestError();
      throw error;
    }
    const session = c.get('session');
    if (!session.sessionId) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication session is unavailable');
    try {
      await deleteConsumption(dependencies.db, {
        userId: session.userId,
        sessionId: session.sessionId,
        idempotencyKey: request.headers['idempotency-key'] as string,
        consumptionId: request.path.id as string,
      });
      try {
        validateResponse('app.deleteConsumption', 204, undefined);
      } catch {
        throw responseError();
      }
      return c.body(null, 204);
    } catch (error) {
      mapConsumptionError(error);
    }
  });
}
