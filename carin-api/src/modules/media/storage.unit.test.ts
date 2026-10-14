import { describe, expect, it } from 'vitest';
import {
  assertMinioObjectUrl,
  parseMinioEndpoint,
} from './storage.js';

describe('private MinIO endpoint policy', () => {
  it('accepts a private service endpoint and rejects a public or credentialed endpoint', () => {
    expect(parseMinioEndpoint('http://minio:9000')).toMatchObject({
      protocol: 'http:',
      hostname: 'minio',
      port: 9000,
    });
    expect(() => parseMinioEndpoint('https://objects.example.com')).toThrow();
    expect(() => parseMinioEndpoint('http://user:pass@minio:9000')).toThrow();
    expect(() => parseMinioEndpoint('http://minio:9000/proxy')).toThrow();
  });

  it('requires a presigned URL to stay on the exact internal MinIO origin and object path', () => {
    const endpoint = parseMinioEndpoint('http://minio:9000');
    const key = 'photos/f5aaeadb-09de-4c25-b352-9759e779e1a6';
    const signed = `http://minio:9000/carin/${key}?X-Amz-Signature=valid`;

    expect(assertMinioObjectUrl(signed, endpoint, 'carin', key).hostname).toBe('minio');
    expect(() => assertMinioObjectUrl(
      `http://attacker.invalid/carin/${key}?X-Amz-Signature=valid`, endpoint, 'carin', key,
    )).toThrow();
    expect(() => assertMinioObjectUrl(
      `http://minio:9000/carin/${key}?redirect=https://attacker.invalid`, endpoint, 'carin', key,
    )).toThrow();
    expect(() => assertMinioObjectUrl(
      `http://minio:9001/carin/${key}?X-Amz-Signature=valid`, endpoint, 'carin', key,
    )).toThrow();
    expect(() => assertMinioObjectUrl(
      `http://minio:9000/carin/photos/other?X-Amz-Signature=valid`, endpoint, 'carin', key,
    )).toThrow();
  });
});
