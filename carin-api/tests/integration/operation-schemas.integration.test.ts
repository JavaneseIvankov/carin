import { describe, expect, it } from 'vitest';
import {
  contractOperations,
  validateRequest,
  validateResponse,
} from '../../src/contracts/validation.js';
import { schemaSample } from '../contracts/schema-samples.js';

// Full schema harness coverage does not assert unimplemented HTTP provider coverage.
describe('all declared operation wire schemas', () => {
  for (const operation of contractOperations()) {
    it(`${operation.id}: accepts schema probes for request and every response`, () => {
      const headers = Object.fromEntries(
        Object.entries(schemaSample(operation.parameters.header) as Record<string, unknown>).map(
          ([name, value]) => [name, String(value)]
        )
      );
      for (const [media, schema] of Object.entries(
        operation.request?.content ?? { 'application/json': undefined }
      )) {
        let body = schema ? schemaSample(schema) : undefined;
        if (media === 'multipart/form-data') {
          const form = new FormData();
          for (const [name, value] of Object.entries(body as Record<string, Blob>))
            form.set(name, value);
          body = form;
        }
        expect(() =>
          validateRequest(operation.id, {
            path: schemaSample(operation.parameters.path) as Record<string, unknown>,
            query: schemaSample(operation.parameters.query) as Record<string, unknown>,
            headers,
            body,
            contentType: media,
          })
        ).not.toThrow();
      }
      for (const [status, response] of Object.entries(operation.responses)) {
        const responseHeaders = Object.fromEntries(
          Object.entries(schemaSample(response.headers) as Record<string, unknown>).map(
            ([name, value]) => [name, String(value)]
          )
        );
        if (!Object.keys(response.content).length) {
          expect(() =>
            validateResponse(operation.id, Number(status), undefined, { headers: responseHeaders })
          ).not.toThrow();
          expect(() =>
            validateResponse(operation.id, Number(status), {}, { headers: responseHeaders })
          ).toThrow();
        }
        for (const [media, schema] of Object.entries(response.content)) {
          expect(() =>
            validateResponse(
              operation.id,
              status === 'default' ? 500 : Number(status),
              schemaSample(schema),
              { contentType: media, headers: responseHeaders }
            )
          ).not.toThrow();
          expect(() =>
            validateResponse(
              operation.id,
              status === 'default' ? 500 : Number(status),
              { unknown: 'invalid probe' },
              { contentType: media, headers: responseHeaders }
            )
          ).toThrow();
        }
      }
    });
  }
});
