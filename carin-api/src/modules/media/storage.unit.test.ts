import { EventEmitter } from 'node:events';
import * as http from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertMinioObjectUrl,
  createMinioHttpTransport,
  parseMinioEndpoint,
} from './storage.js';

afterEach(() => vi.useRealTimers());

describe('MinIO request timeout', () => {
  it('forwards the response callback when MinIO passes request options as an object', () => {
    const request = new EventEmitter() as http.ClientRequest;
    const options = { host: 'minio', path: '/carin/photo', method: 'PUT' };
    const callback = vi.fn();
    const baseRequest = vi.fn((
      receivedOptions: unknown,
      responseCallback?: (response: http.IncomingMessage) => void,
    ) => {
      expect(receivedOptions).toBe(options);
      if (responseCallback) request.once('response', responseCallback);
      return request;
    });
    const baseTransport = { request: baseRequest } as unknown as typeof http;
    const transport = createMinioHttpTransport(baseTransport, 100);

    transport.request(options, callback);
    const response = new EventEmitter() as http.IncomingMessage;
    request.emit('response', response);

    expect(callback).toHaveBeenCalledWith(response);
  });

  it('clears the deadline after the response body ends even if request close is delayed', () => {
    vi.useFakeTimers();
    const request = new EventEmitter() as http.ClientRequest;
    const destroy = vi.fn();
    Object.assign(request, { destroy });
    const baseTransport = {
      request: vi.fn(() => request),
    } as unknown as typeof http;
    const transport = createMinioHttpTransport(baseTransport, 100);

    const outgoing = transport.request({ host: 'minio', path: '/carin/photo', method: 'PUT' });
    const response = new EventEmitter();
    outgoing.emit('response', response);
    response.emit('end');
    vi.advanceTimersByTime(101);

    expect(destroy).not.toHaveBeenCalled();
  });
});

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
