import { describe, expect, it } from 'vitest';
import {
  prepareAppRequest,
  type AppOperation,
  type AppRequestInput,
} from '../../../carin-app/lib/api/contracts.js';
import { contractOperations, validateRequest } from '../../src/contracts/validation.js';
import { schemaSample } from '../contracts/schema-samples.js';

// Consumer serialization against provider schemas; no unimplemented route is invoked.
describe('mobile resource consumer against shared provider contracts', () => {
  for (const operation of contractOperations().filter((value) => value.id.startsWith('app.'))) {
    const name = operation.id.slice(4) as AppOperation;
    it(`${name}: serializes a request accepted by the same runtime schema`, () => {
      const path = schemaSample(operation.parameters.path) as Record<string, unknown>;
      const query = schemaSample(operation.parameters.query) as Record<string, unknown>;
      const headers = Object.fromEntries(
        Object.entries(schemaSample(operation.parameters.header) as Record<string, unknown>).map(
          ([key, value]) => [key, String(value)]
        )
      );
      const content = Object.entries(operation.request?.content ?? {})[0];
      const body = content ? schemaSample(content[1]) : undefined;
      const request = prepareAppRequest(name, {
        path,
        query,
        headers,
        body,
      } as AppRequestInput<AppOperation>);
      expect(request.method.toLowerCase()).toBe(operation.method);
      const url = new URL(request.path, 'https://api.example.invalid');
      const decodedPath: Record<string, string> = {};
      const names = [...operation.path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
      const pattern = new RegExp(`^${operation.path.replace(/\{[^}]+\}/g, '([^/]+)')}$`);
      const match = url.pathname.match(pattern);
      expect(match).not.toBeNull();
      names.forEach((key, index) => {
        decodedPath[key] = decodeURIComponent(match![index + 1]);
      });
      const decodedBody =
        typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
      expect(() =>
        validateRequest(operation.id, {
          path: decodedPath,
          query: url.searchParams,
          headers: request.headers,
          body: decodedBody,
          contentType: request.headers['content-type'] ?? content?.[0],
        })
      ).not.toThrow();
    });
  }
});
