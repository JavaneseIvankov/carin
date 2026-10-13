import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { validateResponse } from '../../src/contracts/validation.js';

// Actual provider coverage. Other OpenAPI routes are planned and are not claimed here.
describe('implemented health providers against generated OpenAPI', () => {
  for (const [path, operation, ready, status] of [
    ['/health/live', 'app.getLiveness', false, 200],
    ['/health/ready', 'app.getReadiness', true, 200],
    ['/health/ready', 'app.getReadiness', false, 503],
  ] as const) {
    it(`${path} with readiness=${ready} returns a valid ${status} response`, async () => {
      const app = createApp({ readiness: async () => ready });
      const response = await app.request(path);
      expect(response.status).toBe(status);
      expect(() => validateResponse(operation, response.status, undefined)).toThrow();
      const body = await response.json();
      expect(() =>
        validateResponse(operation, response.status, body, {
          contentType: response.headers.get('content-type') ?? undefined,
          headers: response.headers,
        })
      ).not.toThrow();
      expect(response.headers.get('x-request-id')).toBe(
        status === 200 ? body.requestId : body.error.requestId
      );
    });
  }
});
