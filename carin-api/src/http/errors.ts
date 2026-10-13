import type { Context } from 'hono';
import type { AppEnv } from './types.js';

export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 503;

export class ApiError extends Error {
  constructor(
    readonly status: ErrorStatus,
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

export function errorResponse(c: Context<AppEnv>, error: ApiError) {
  return c.json({ error: {
    code: error.code,
    message: error.message,
    retryable: error.retryable,
    requestId: c.get('requestId'),
    details: {},
  } }, error.status);
}
