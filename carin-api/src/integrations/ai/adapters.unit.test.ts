import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { components } from '../../contracts/generated/ai-service.js';
import {
  AiAdapterError,
  createFixtureAiClient,
  createHttpAiClient,
  type AiClient,
  type FixtureScenario,
} from './index.js';

const operationId = '123e4567-e89b-42d3-a456-426614174000';
const fixtureResponse = (): Record<string, unknown> => {
  const value = JSON.parse(
    readFileSync(new URL('../../../../specs/fixtures/ai/analysis-unrecognized.json', import.meta.url), 'utf8')
  ) as Record<string, unknown>;
  value.operationId = operationId;
  value.profileVersion = 7;
  return value;
};
const profile: components['schemas']['ProfileContext'] = {
  profileVersion: 7,
  ageYears: null,
  heightCm: null,
  weightKg: null,
  sexForReference: null,
  diagnosisState: 'not_provided',
  conditionIds: [],
  unsupportedConditionLabels: [],
  allergyState: 'not_provided',
  allergies: [],
  activity: null,
  smoking: null,
};
const photoRequest: components['schemas']['PhotoAnalysisRequest'] = {
  contractVersion: '1.0.0',
  operationId,
  catalogVersion: 'synthetic-catalog-1',
  ruleSetVersion: 'synthetic-rules-1',
  profile,
  image: {
    downloadUrl: 'http://minio.internal.invalid/meal.jpg',
    mimeType: 'image/jpeg',
    sha256: 'a'.repeat(64),
  },
};
const recalculationRequest: components['schemas']['RecalculationRequest'] = {
  contractVersion: '1.0.0',
  operationId,
  inputKind: 'correction',
  catalogVersion: 'synthetic-catalog-1',
  ruleSetVersion: 'synthetic-rules-1',
  profile,
  components: [
    {
      id: '123e4567-e89b-42d3-a456-426614174001',
      displayName: 'Makanan uji',
      catalogFoodId: 'fixture-food-001',
      preparation: 'Contoh uji',
      portion: { kind: 'known', quantity: 0.5, unit: 'serving', servingId: 'fixture-serving-100g' },
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe('packaged fixture data', () => {
  it('keeps package-local copies identical to the canonical five fixtures', () => {
    const files = [
      'analysis-complete.json',
      'analysis-partial.json',
      'analysis-unrecognized.json',
      'correction-complete.json',
      'job-failed.json',
    ];
    for (const file of files) {
      const canonical = readFileSync(new URL(`../../../../specs/fixtures/ai/${file}`, import.meta.url));
      const packaged = readFileSync(new URL(`../../../fixtures/ai/${file}`, import.meta.url));
      expect(packaged.equals(canonical)).toBe(true);
    }
  });
});

describe('fixture AI adapter', () => {
  it.each<FixtureScenario>(['complete', 'partial', 'unrecognized'])(
    'returns the explicitly selected %s photo scenario with request provenance',
    async (scenario) => {
      const client = createFixtureAiClient({ environment: 'dev', scenario });
      const result = await client.analyzePhoto(photoRequest);
      expect(result.supportStatus).toBe(scenario);
      expect(result.dataMode).toBe('synthetic');
      expect(result.operationId).toBe(operationId);
      expect(result.profileVersion).toBe(profile.profileVersion);
      expect(result.catalogVersion).toBe(photoRequest.catalogVersion);
      expect(result.ruleSetVersion).toBe(photoRequest.ruleSetVersion);
      expect(result.sources.every((source) => source.kind === 'synthetic')).toBe(true);
    }
  );

  it('serves only explicit synthetic capability and catalog data', async () => {
    const client = createFixtureAiClient({ environment: 'test', scenario: 'complete' });
    const capabilities = await client.getCapabilities();
    expect(capabilities.dataMode).toBe('synthetic');
    expect(capabilities.supportedPhotoFoodIds).toEqual([]);
    expect(capabilities.conditions).toEqual([]);
    const catalog = await client.getCatalog({ version: 'synthetic-catalog-1' });
    expect(catalog.items[0]?.id).toBe('fixture-food-001');
    expect(catalog.items[0]?.sources.every((source) => source.kind === 'synthetic')).toBe(true);
    await expect(client.getCatalog({ version: 'catalog-unpublished-0.1.0' })).rejects.toMatchObject({
      code: 'CATALOG_VERSION_UNAVAILABLE',
    });
  });

  it('uses the correction fixture for recalculation and request component identity', async () => {
    const client = createFixtureAiClient({ environment: 'test', scenario: 'correction' });
    const result = await client.recalculateComponents(recalculationRequest);
    expect(result.inputKind).toBe('correction');
    expect(result.components[0]?.id).toBe(recalculationRequest.components[0]?.id);
    expect(result.components[0]?.portion.grams).toBe(50);
    expect(result.dataMode).toBe('synthetic');
  });

  it('rejects fixture mode outside development and test', () => {
    expect(() => createFixtureAiClient({ environment: 'staging', scenario: 'complete' })).toThrow(
      AiAdapterError
    );
    expect(() => createFixtureAiClient({ environment: 'prod', scenario: 'complete' })).toThrow(
      AiAdapterError
    );
  });

  it('returns service failure only when that scenario is explicitly selected', async () => {
    const client = createFixtureAiClient({ environment: 'test', scenario: 'service-failure' });
    await expect(client.analyzePhoto(photoRequest)).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      retryable: true,
    });
  });
});

describe('internal HTTP AI adapter', () => {
  const makeClient = (fetcher: typeof fetch, timeoutMs = 50): AiClient =>
    createHttpAiClient({
      baseUrl: 'http://ai-service.internal:8000',
      serviceKey: 'test-only-service-key',
      timeoutMs,
      fetch: fetcher,
    });

  it('validates request and response contracts and preserves the requested versions', async () => {
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.operationId).toBe(operationId);
      return Response.json(fixtureResponse());
    });
    const result = await makeClient(fetcher).analyzePhoto(photoRequest);
    expect(result.operationId).toBe(operationId);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('X-Carin-Service-Key')).toBe(
      'test-only-service-key'
    );
  });

  it.each([
    ['invalid JSON', new Response('{', { status: 200, headers: { 'content-type': 'application/json' } })],
    ['invalid schema', Response.json({ operationId })],
    [
      'version mismatch',
      Response.json({ ...fixtureResponse(), profileVersion: 6 })
    ],
  ])('rejects %s from an internal provider', async (_label, response) => {
    const client = makeClient(async () => response);
    await expect(client.analyzePhoto(photoRequest)).rejects.toBeInstanceOf(AiAdapterError);
  });

  it('rejects a request with an unsupported contract version before network access', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = makeClient(fetcher);
    await expect(client.analyzePhoto({ ...photoRequest, contractVersion: '2.0.0' as '1.0.0' })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects invalid response provenance even when the JSON schema passes', async () => {
    const body = { ...fixtureResponse(), operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
    const client = makeClient(async () => Response.json(body));
    await expect(client.analyzePhoto(photoRequest)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('maps timeout and network errors to retryable service errors', async () => {
    const timeoutClient = makeClient((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }), 1);
    await expect(timeoutClient.analyzePhoto(photoRequest)).rejects.toMatchObject({
      code: 'TIMEOUT',
      retryable: true,
    });

    const networkClient = makeClient(async () => {
      throw new TypeError('socket disconnected');
    });
    await expect(networkClient.analyzePhoto(photoRequest)).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      retryable: true,
    });
  });
});
