import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

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

function encryptionKey(secret: string): Buffer {
  return createHash('sha256')
    .update('carin-private-media-grant-v1\0', 'utf8')
    .update(secret, 'utf8')
    .digest();
}

const grantAad = Buffer.from('carin-private-media-grant-v1', 'utf8');

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
  const plaintext = Buffer.from(JSON.stringify({
    version: 1,
    photoId: input.photoId,
    userId: input.userId,
    environment: input.environment,
    expiresAt: now + MEDIA_GRANT_TTL_MS,
  }), 'utf8');
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), nonce);
  cipher.setAAD(grantAad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return `v1.${Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString('base64url')}`;
}

export function verifyMediaGrant(
  token: string,
  secret: string,
  now = Date.now(),
  expectedEnvironment?: string,
): MediaGrantClaims | null {
  try {
    if (
      Buffer.byteLength(secret, 'utf8') < 32 || token.length > 4096 ||
      !/^v1\.[A-Za-z0-9_-]+$/.test(token)
    ) return null;
    const [version, encodedCiphertext] = token.split('.');
    if (version !== 'v1' || !encodedCiphertext) return null;
    const encrypted = Buffer.from(encodedCiphertext, 'base64url');
    if (encrypted.toString('base64url') !== encodedCiphertext || encrypted.length < 29) return null;
    const nonce = encrypted.subarray(0, 12);
    const tag = encrypted.subarray(12, 28);
    const ciphertext = encrypted.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), nonce);
    decipher.setAAD(grantAad);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const decoded = JSON.parse(plaintext.toString('utf8')) as unknown;
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
