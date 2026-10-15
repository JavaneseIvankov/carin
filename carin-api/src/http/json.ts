import type { Context } from 'hono';
import { ApiError } from './errors.js';
import type { AppEnv } from './types.js';

export async function readValidatedJson<T>(c: Context<AppEnv>, valid: (value: unknown) => value is T): Promise<T> {
  if (!c.req.header('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new ApiError(400, 'INVALID_INPUT', 'Expected JSON body');
  }
  let value: unknown;
  try {
    value = await c.req.json();
  } catch {
    throw new ApiError(400, 'INVALID_INPUT', 'Malformed JSON');
  }
  if (!valid(value)) throw new ApiError(422, 'INVALID_INPUT', 'Invalid input');
  return value;
}
