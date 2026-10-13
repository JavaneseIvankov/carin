import { createHmac, timingSafeEqual } from 'node:crypto';

export const MEDIA_GRANT_TTL_MS = 5 * 60 * 1000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const environments = new Set(['dev', 'staging', 'prod']);

export type MediaGrantClaims = {
  photoId: string;
  userId: string;
  environment: string;
  expiresAt: number;
};

type MediaGrantInput = Omit<MediaGrantClaims, 'expiresAt'>;

function assertSecret(secret: string): void {
  if (Buffer.byteLength(secret, 'utf8') < 32)
    throw new Error('Media signing secret must be at least 32 bytes');
}

function signature(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

export function createMediaGrant(
  input: MediaGrantInput,
  secret: string,
  now = Date.now(),
): string {
  assertSecret(secret);
  if (
    !uuidPattern.test(input.photoId) || !uuidPattern.test(input.userId) ||
    !environments.has(input.environment) || !Number.isSafeInteger(now)
  ) {
    throw new Error('Invalid media grant claims');
  }
  const payload = Buffer.from(JSON.stringify({
    version: 1,
    photoId: input.photoId,
    userId: input.userId,
    environment: input.environment,
    expiresAt: now + MEDIA_GRANT_TTL_MS,
  })).toString('base64url');
  return `${payload}.${signature(payload, secret).toString('base64url')}`;
}

export function verifyMediaGrant(
  token: string,
  secret: string,
  now = Date.now(),
  expectedEnvironment?: string,
): MediaGrantClaims | null {
  try {
    if (Buffer.byteLength(secret, 'utf8') < 32 || token.length > 4096) return null;
    const parts = token.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const [payload, encodedSignature] = parts;
    const actualSignature = Buffer.from(encodedSignature, 'base64url');
    const expectedSignature = signature(payload, secret);
    if (
      actualSignature.length !== expectedSignature.length ||
      !timingSafeEqual(actualSignature, expectedSignature)
    ) return null;

    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown;
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return null;
    const claims = decoded as Record<string, unknown>;
    if (
      Object.keys(claims).length !== 5 || claims.version !== 1 ||
      typeof claims.photoId !== 'string' || !uuidPattern.test(claims.photoId) ||
      typeof claims.userId !== 'string' || !uuidPattern.test(claims.userId) ||
      typeof claims.environment !== 'string' || !environments.has(claims.environment) ||
      typeof claims.expiresAt !== 'number' || !Number.isSafeInteger(claims.expiresAt) ||
      claims.expiresAt <= now ||
      (expectedEnvironment !== undefined && claims.environment !== expectedEnvironment)
    ) return null;

    return {
      photoId: claims.photoId,
      userId: claims.userId,
      environment: claims.environment,
      expiresAt: claims.expiresAt,
    };
  } catch {
    return null;
  }
}
