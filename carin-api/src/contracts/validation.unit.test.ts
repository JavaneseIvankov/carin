import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ContractValidationError,
  contractOperations,
  validateRequest,
  validateResponse,
  validateSchema,
} from './validation.js';
import { schemaSample } from '../../tests/contracts/schema-samples.js';
import { contracts } from './generated/schemas.js';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const fixture = (name = 'analysis-complete') =>
  JSON.parse(
    readFileSync(new URL(`../../../specs/fixtures/ai/${name}.json`, import.meta.url), 'utf8')
  );

describe('generated contract validation', () => {
  it('accepts every shared result fixture through app and internal AI response schemas', () => {
    for (const name of [
      'analysis-complete',
      'analysis-partial',
      'analysis-unrecognized',
      'correction-complete',
    ]) {
      const body = fixture(name);
      expect(() => validateSchema('ai.AnalysisResult', body)).not.toThrow();
      expect(() => validateResponse('ai.analyzePhoto', 200, body)).not.toThrow();
      expect(() => validateResponse('ai.recalculateComponents', 200, body)).not.toThrow();
    }
    expect(() => validateResponse('app.getAnalysisJob', 200, fixture('job-failed'))).not.toThrow();
  });

  it('rejects unknown fields, wrong types, contract versions and malformed formats without mutation', () => {
    for (const patch of [
      { unknown: true },
      { contractVersion: '2.0.0' },
      { computedAt: 'yesterday' },
      { operationId: 'invalid' },
      { profileVersion: '1' },
    ]) {
      const body = { ...fixture(), ...patch };
      const original = structuredClone(body);
      expect(() => validateSchema('ai.AnalysisResult', body)).toThrow(ContractValidationError);
      expect(body).toEqual(original);
    }
    const nested = fixture();
    nested.components[0].portion.unexpected = true;
    expect(() => validateSchema('ai.AnalysisResult', nested)).toThrow(ContractValidationError);
  });

  it('keeps Error.details open but the envelope closed and does not expose payloads in failures', () => {
    const body = {
      error: {
        code: 'INVALID_INPUT',
        message: 'Invalid',
        retryable: false,
        requestId: id,
        details: { arbitrary: { reason: true } },
      },
    };
    expect(() => validateResponse('app.updateMe', 422, body)).not.toThrow();
    expect(() => validateResponse('ai.analyzePhoto', 500, body)).not.toThrow();
    expect(() =>
      validateResponse('app.updateMe', 422, { ...body, password: 'do-not-disclose' })
    ).toThrow(ContractValidationError);
    try {
      validateResponse('app.updateMe', 422, { password: 'do-not-disclose' });
    } catch (error) {
      expect(String(error)).not.toContain('do-not-disclose');
    }
  });

  it('separates path, query, headers and JSON body validation', () => {
    expect(() =>
      validateRequest('app.updateMe', {
        headers: { 'Idempotency-Key': id, cookie: 'vendor-session' },
        body: { expectedRevision: 1, timezone: 'Asia/Jakarta' },
        contentType: 'application/json; charset=utf-8',
      })
    ).not.toThrow();
    expect(() =>
      validateRequest('app.updateMe', {
        body: { expectedRevision: 1, timezone: 'Asia/Jakarta', 'Idempotency-Key': id },
      })
    ).toThrow(ContractValidationError);
    expect(() => validateRequest('app.getPhotoView', { path: { id: 'not-uuid' } })).toThrow(
      ContractValidationError
    );
    expect(() => validateRequest('app.getPhotoView', { path: { id } })).not.toThrow();
    expect(() => validateRequest('app.getLiveness', { body: {} })).toThrow(ContractValidationError);
    expect(() =>
      validateRequest('app.updateMe', {
        headers: { 'idempotency-key': id },
        body: { expectedRevision: 1, timezone: 'Asia/Jakarta' },
        contentType: 'text/plain',
      })
    ).toThrow(ContractValidationError);
  });

  it('decodes serialized queries strictly and rejects unknown, repeated and malformed fields', () => {
    expect(
      validateRequest('app.searchFoods', { query: new URLSearchParams('limit=10&q=nasi') }).query
    ).toEqual({ limit: 10, q: 'nasi' });
    for (const value of [
      'limit=NaN',
      'limit=1.2',
      'limit=1e2',
      'limit=+1',
      'limit=01',
      'limit=',
      'limit=0',
      'limit=101',
      'limit=1&limit=2',
      'unknown=1',
    ]) {
      expect(() =>
        validateRequest('app.searchFoods', { query: new URLSearchParams(value) })
      ).toThrow(ContractValidationError);
    }
    expect(() =>
      validateRequest('ai.getCatalog', { query: new URLSearchParams('limit=10') })
    ).toThrow(ContractValidationError);
    expect(() => validateRequest('app.searchFoods', { query: { limit: '10' } })).toThrow(
      ContractValidationError
    );
  });

  it('validates binary multipart transport separately from JSON and unknown fields', () => {
    const form = new FormData();
    form.set('file', new Blob(['bytes'], { type: 'image/jpeg' }), 'photo.jpg');
    const input = {
      headers: { 'idempotency-key': id },
      body: form,
      contentType: 'multipart/form-data; boundary=test',
    };
    expect(() => validateRequest('app.uploadPhoto', input)).not.toThrow();
    form.set('unexpected', 'value');
    expect(() => validateRequest('app.uploadPhoto', input)).toThrow(ContractValidationError);
    form.delete('unexpected');
    form.append('file', new Blob(['second']), 'second.jpg');
    expect(() => validateRequest('app.uploadPhoto', input)).toThrow(ContractValidationError);
    expect(() =>
      validateRequest('app.uploadPhoto', { ...input, body: { file: 'pretend-bytes' } })
    ).toThrow(ContractValidationError);
    expect(() =>
      validateResponse('app.readSignedPhoto', 200, new Uint8Array([1]), {
        contentType: 'image/jpeg',
        headers: { 'cache-control': 'private, no-store' },
      })
    ).not.toThrow();
    expect(() =>
      validateResponse('app.readSignedPhoto', 200, 'pretend-bytes', { contentType: 'image/jpeg' })
    ).toThrow(ContractValidationError);
  });

  it('rejects malformed dates, emails, URIs and invalid discriminated portion variants', () => {
    const me = schemaSample(contracts.schema.$defs['app.Me']) as Record<string, unknown>;
    for (const patch of [
      { birthDate: '2026-02-30' },
      { email: 'not-an-email' },
      { id: 'not-a-uuid' },
    ]) {
      expect(() => validateSchema('app.Me', { ...me, ...patch })).toThrow(ContractValidationError);
    }
    const result = fixture();
    result.sources[0].url = '/relative-is-not-a-uri';
    expect(() => validateSchema('ai.AnalysisResult', result)).toThrow(ContractValidationError);
    for (const portion of [
      { kind: 'unknown', quantity: 1 },
      { kind: 'known', quantity: 0, unit: 'g' },
      { kind: 'known', quantity: 1, unit: 'kg' },
    ]) {
      expect(() => validateSchema('ai.PortionInput', portion)).toThrow(ContractValidationError);
    }
  });

  it('rejects invalid status codes and invalid header syntax with safe boundary errors', () => {
    expect(() =>
      validateResponse('app.getLiveness', 999, schemaSample(contracts.schema.$defs['ai.Error']))
    ).toThrow(ContractValidationError);
    let thrown: unknown;
    try {
      validateRequest('app.getLiveness', { headers: { 'bad\nheader': 'private-value' } });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ContractValidationError);
    expect(String(thrown)).not.toContain('private-value');
  });

  it('requires an empty body for responses declaring no content', () => {
    expect(() => validateResponse('app.deleteScan', 204, undefined)).not.toThrow();
    for (const body of [null, {}, '']) {
      expect(() => validateResponse('app.deleteScan', 204, body)).toThrow(ContractValidationError);
    }
  });

  it('compiles schemas for all declared operations and rejects unknown schema and operation IDs', () => {
    expect(contractOperations()).toHaveLength(40);
    expect(() => validateSchema('ai.NotAContract', {})).toThrow('Unknown schema');
    expect(() => validateRequest('app.notAnOperation', {})).toThrow('Unknown operation');
    expect(() =>
      validateRequest('app.searchFoods', { contentType: 'application/json' })
    ).not.toThrow();
  });
});
