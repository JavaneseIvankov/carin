import { createTracingId } from './request-id-core';

export function createRequestId(randomUUID = () => globalThis.crypto.randomUUID()): string {
  return createTracingId(randomUUID);
}
