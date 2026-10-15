import { Hono, type Context } from 'hono';
import { ContractValidationError, validateRequest, validateResponse } from '../../contracts/validation.js';
import type { Database } from '../../db/client.js';
import { requireSession, type SessionResolver } from '../../http/access.js';
import { ApiError } from '../../http/errors.js';
import type { AppEnv } from '../../http/types.js';
import {
  createExamination,
  deleteExamination,
  ExaminationCursorError,
  ExaminationIdempotencyConflictError,
  ExaminationNotFoundError,
  ExaminationRevisionConflictError,
  ExaminationSessionError,
  ExaminationValidationError,
  getExamination,
  getExaminationSeries,
  listExaminations,
  updateExamination,
} from './service.js';
import type { ExaminationInput } from './types.js';

export type ExaminationRouteDependencies = {
  db: Database;
  resolveSession: SessionResolver;
  cursorSecret: string;
};

function mapError(error: unknown): never {
  if (error instanceof ExaminationNotFoundError)
    throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Examination not found');
  if (error instanceof ExaminationSessionError)
    throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication session is no longer active');
  if (error instanceof ExaminationValidationError)
    throw new ApiError(422, 'INVALID_INPUT', 'Examination input is invalid');
  if (error instanceof ExaminationRevisionConflictError)
    throw new ApiError(409, 'REVISION_CONFLICT', 'Examination has changed');
  if (error instanceof ExaminationIdempotencyConflictError)
    throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was already used for another request');
  if (error instanceof ExaminationCursorError)
    throw new ApiError(400, 'INVALID_INPUT', 'Examination cursor is invalid');
  throw error;
}

function validateResponseOrThrow(operation: string, status: number, body: unknown): void {
  try {
    validateResponse(operation, status, body, status === 204 ? {} : { contentType: 'application/json' });
  } catch {
    throw new ApiError(500, 'INTERNAL_ERROR', 'Examination response is invalid');
  }
}

function parseRequest(operation: string, c: Context<AppEnv>, body?: unknown) {
  try {
    return validateRequest(operation, {
      path: c.req.param(),
      query: new URL(c.req.url).searchParams,
      headers: c.req.header(),
      ...(body === undefined ? {} : { body, contentType: c.req.header('content-type') }),
    });
  } catch (error) {
    if (error instanceof ContractValidationError)
      throw new ApiError(422, 'INVALID_REQUEST', 'Request does not match the API contract');
    throw error;
  }
}

async function jsonBody(c: Context<AppEnv>): Promise<unknown> {
  try { return await c.req.json(); }
  catch { throw new ApiError(422, 'INVALID_REQUEST', 'Request does not match the API contract'); }
}

export function registerExaminationRoutes(app: Hono<AppEnv>, dependencies: ExaminationRouteDependencies): void {
  app.get('/api/v1/examinations', requireSession(dependencies.resolveSession), async (c) => {
    const request = parseRequest('app.listExaminations', c);
    const session = c.get('session');
    try {
      const query = request.query as { cursor?: string; limit?: number; type?: string; seriesKey?: string };
      const result = await listExaminations(dependencies.db, {
        userId: session.userId,
        cursorSecret: dependencies.cursorSecret,
        limit: query.limit ?? 30,
        ...(query.cursor ? { cursor: query.cursor } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.seriesKey ? { seriesKey: query.seriesKey } : {}),
      });
      validateResponseOrThrow('app.listExaminations', 200, result);
      return c.json(result);
    } catch (error) { mapError(error); }
  });

  app.post('/api/v1/examinations', requireSession(dependencies.resolveSession), async (c) => {
    const body = await jsonBody(c);
    const request = parseRequest('app.createExamination', c, body);
    const session = c.get('session');
    if (!session.sessionId) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication session is unavailable');
    try {
      const result = await createExamination(
        dependencies.db,
        { userId: session.userId, sessionId: session.sessionId },
        request.headers['idempotency-key'] as string,
        request.body as ExaminationInput,
      );
      validateResponseOrThrow('app.createExamination', result.status, result.body);
      return c.json(result.body, result.status as 201);
    } catch (error) { mapError(error); }
  });

  app.get('/api/v1/examinations/:id', requireSession(dependencies.resolveSession), async (c) => {
    parseRequest('app.getExamination', c);
    try {
      const session = c.get('session');
      const result = await getExamination(dependencies.db, session.userId, c.req.param('id'));
      validateResponseOrThrow('app.getExamination', 200, result);
      return c.json(result);
    } catch (error) { mapError(error); }
  });

  app.patch('/api/v1/examinations/:id', requireSession(dependencies.resolveSession), async (c) => {
    const body = await jsonBody(c);
    const request = parseRequest('app.updateExamination', c, body);
    const session = c.get('session');
    if (!session.sessionId) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication session is unavailable');
    try {
      const update = request.body as { expectedRevision: number; record: ExaminationInput };
      const result = await updateExamination(
        dependencies.db,
        { userId: session.userId, sessionId: session.sessionId },
        request.headers['idempotency-key'] as string,
        c.req.param('id'),
        update.expectedRevision,
        update.record,
      );
      validateResponseOrThrow('app.updateExamination', result.status, result.body);
      return c.json(result.body, result.status as 200);
    } catch (error) { mapError(error); }
  });

  app.delete('/api/v1/examinations/:id', requireSession(dependencies.resolveSession), async (c) => {
    const request = parseRequest('app.deleteExamination', c);
    const session = c.get('session');
    if (!session.sessionId) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication session is unavailable');
    try {
      const result = await deleteExamination(
        dependencies.db,
        { userId: session.userId, sessionId: session.sessionId },
        request.headers['idempotency-key'] as string,
        c.req.param('id'),
      );
      validateResponseOrThrow('app.deleteExamination', result.status, undefined);
      return c.body(null, 204);
    } catch (error) { mapError(error); }
  });

  app.get('/api/v1/examination-series', requireSession(dependencies.resolveSession), async (c) => {
    parseRequest('app.getExaminationSeries', c);
    try {
      const result = await getExaminationSeries(dependencies.db, c.get('session').userId);
      validateResponseOrThrow('app.getExaminationSeries', 200, result);
      return c.json(result);
    } catch (error) { mapError(error); }
  });
}
