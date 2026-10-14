import * as Crypto from 'expo-crypto';
import { createTracingId } from './request-id-core';

export function createRequestId(): string {
  return createTracingId(Crypto.randomUUID);
}
