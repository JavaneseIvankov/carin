import { Client as MinioClient } from 'minio';
import type { Readable } from 'node:stream';
import { isInternalHost } from '../../config.js';

export const AI_MEDIA_URL_TTL_SECONDS = 10 * 60;
const MAX_OBJECT_BYTES = 10 * 1024 * 1024;
const disallowedRedirectParameters = new Set([
  'callback', 'host', 'location', 'redirect', 'return', 'target', 'url',
]);

export type MinioEndpoint = {
  url: URL;
  protocol: 'http:' | 'https:';
  hostname: string;
  port: number;
};

export type MinioMediaConfig = {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
};

export type MediaObjectStore = {
  putObject(input: {
    key: string;
    bytes: Buffer;
    mimeType: 'image/jpeg' | 'image/png';
    checksum: string;
  }): Promise<void>;
  readObject(key: string): Promise<Buffer>;
  removeObject(key: string): Promise<void>;
  presignRead(key: string, expiresSeconds: number): Promise<string>;
};

function isMinioPrivateHost(hostname: string): boolean {
  return hostname.toLowerCase() === 'minio' || isInternalHost(hostname);
}

export function parseMinioEndpoint(input: string): MinioEndpoint {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('MINIO_ENDPOINT must be a valid private URL');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username || url.password || url.search || url.hash ||
    !['', '/'].includes(url.pathname) || !isMinioPrivateHost(url.hostname)
  ) {
    throw new Error('MINIO_ENDPOINT must use an internal host without credentials or path');
  }
  return {
    url,
    protocol: url.protocol as 'http:' | 'https:',
    hostname: url.hostname.toLowerCase(),
    port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
  };
}

export function assertMinioObjectUrl(
  input: string,
  endpoint: MinioEndpoint,
  bucket: string,
  key: string,
): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('MinIO signed URL is invalid');
  }
  const expectedPath = `/${bucket}/${key}`;
  if (
    url.origin !== endpoint.url.origin ||
    !isMinioPrivateHost(url.hostname) ||
    url.username || url.password || url.hash ||
    decodePath(url.pathname) !== expectedPath ||
    [...url.searchParams.keys()].some((name) => disallowedRedirectParameters.has(name.toLowerCase()))
  ) {
    throw new Error('MinIO signed URL escaped its configured private object');
  }
  return url;
}

function decodePath(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return '';
  }
}

async function collectBounded(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_OBJECT_BYTES) {
      stream.destroy();
      throw new Error('Stored media object exceeded its size limit');
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, size);
}

export function createMinioMediaObjectStore(config: MinioMediaConfig): MediaObjectStore {
  const endpoint = parseMinioEndpoint(config.endpoint);
  if (!config.bucket || !config.accessKey || !config.secretKey)
    throw new Error('MinIO bucket and credentials are required');
  const client = new MinioClient({
    endPoint: endpoint.hostname,
    port: endpoint.port,
    useSSL: endpoint.protocol === 'https:',
    accessKey: config.accessKey,
    secretKey: config.secretKey,
    pathStyle: true,
  });

  return {
    async putObject({ key, bytes, mimeType, checksum }) {
      await client.putObject(config.bucket, key, bytes, bytes.byteLength, {
        'Content-Type': mimeType,
        'X-Amz-Meta-Sha256': checksum,
      });
    },
    async readObject(key) {
      return collectBounded(await client.getObject(config.bucket, key));
    },
    async removeObject(key) {
      await client.removeObject(config.bucket, key);
    },
    async presignRead(key, expiresSeconds) {
      const url = await client.presignedGetObject(config.bucket, key, expiresSeconds);
      return assertMinioObjectUrl(url, endpoint, config.bucket, key).toString();
    },
  };
}
