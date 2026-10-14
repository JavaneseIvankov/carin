import { Hono, type Context } from 'hono';
import type { Database } from '../db/client.js';
import { requireSession, type SessionResolver } from '../http/access.js';
import { ApiError } from '../http/errors.js';
import type { AppEnv } from '../http/types.js';
import { ContractValidationError, validateRequest, validateResponse } from '../contracts/validation.js';
import { CatalogImportError } from './errors.js';
import { searchConditions, searchFoods } from './search.js';

export type CatalogRouteDependencies = { db: Database; resolveSession: SessionResolver };

function validateQuery(operation: 'app.searchFoods' | 'app.getConditions', query: URLSearchParams) {
  try {
    return validateRequest(operation, { query });
  } catch (error) {
    if (error instanceof ContractValidationError) throw new ApiError(422, 'INVALID_REQUEST', 'Request does not match the API contract');
    throw error;
  }
}

function sendResponse(c: Context<AppEnv>, operation: string, body: unknown) {
  try {
    validateResponse(operation, 200, body, { contentType: 'application/json' });
  } catch {
    throw new ApiError(500, 'INTERNAL_ERROR', 'Catalog response failed contract validation');
  }
  return c.json(body);
}

function mapSearchError(error: unknown): never {
  if (error instanceof CatalogImportError && error.code === 'CATALOG_VERSION_UNAVAILABLE') {
    throw new ApiError(409, 'CATALOG_VERSION_UNAVAILABLE', 'Requested catalog version is unavailable');
  }
  if (error instanceof Error && error.message === 'INVALID_CATALOG_CURSOR') {
    throw new ApiError(400, 'INVALID_INPUT', 'Catalog cursor does not match this search');
  }
  throw error;
}

export function registerCatalogRoutes(app: Hono<AppEnv>, dependencies: CatalogRouteDependencies): void {
  app.get('/api/v1/catalog/foods', requireSession(dependencies.resolveSession), async (c) => {
    const request = validateQuery('app.searchFoods', new URL(c.req.url).searchParams);
    try {
      const result = await searchFoods(dependencies.db, {
        userId: c.get('session').userId,
        q: request.query.q as string | undefined,
        version: request.query.version as string | undefined,
        cursor: request.query.cursor as string | undefined,
        limit: (request.query.limit as number | undefined) ?? 30,
      });
      return sendResponse(c, 'app.searchFoods', result);
    } catch (error) {
      return mapSearchError(error);
    }
  });

  app.get('/api/v1/catalog/conditions', requireSession(dependencies.resolveSession), async (c) => {
    const request = validateQuery('app.getConditions', new URL(c.req.url).searchParams);
    try {
      const result = await searchConditions(dependencies.db, request.query.q as string | undefined);
      return sendResponse(c, 'app.getConditions', result);
    } catch (error) {
      return mapSearchError(error);
    }
  });
}
