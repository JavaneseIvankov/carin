import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { components } from '../../contracts/generated/ai-service.js';
import { loadConfig } from '../../config.js';
import {
  AiAdapterError,
  createAiClient,
  createHttpAiClient,
  type AiClient,
  type FixtureScenario,
} from './index.js';

const operationId = '123e4567-e89b-42d3-a456-426614174000';
const fixtureResponse = (fixtureName = 'analysis-unrecognized'): Record<string, unknown> => {
  const value = JSON.parse(
    readFileSync(new URL(`../../../../specs/fixtures/ai/${fixtureName}.json`, import.meta.url), 'utf8')
  ) as Record<string, unknown>;
  value.operationId = operationId;
  value.profileVersion = 7;
  const sources = value.sources as Array<Record<string, unknown>>;
  const components = value.components as Array<Record<string, unknown>>;
  for (const source of sources) {
    if (source.kind === 'model_estimate') {
      source.itemRef = `${operationId}/${components[0]?.id}`;
    }
  }
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
  contractVersion: '2.0.0',
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
  contractVersion: '2.0.0',
  operationId,
  inputKind: 'correction',
  catalogVersion: 'synthetic-catalog-1',
  ruleSetVersion: 'synthetic-rules-1',
  profile,
  components: [
    {
      id: '123e4567-e89b-42d3-a456-426614174001',
      displayName: 'Makanan contoh sintetis 100 g',
      catalogFoodId: 'fixture-food-001',
      preparation: 'Contoh uji',
      portion: { kind: 'known', quantity: 0.5, unit: 'serving', servingId: 'fixture-serving-100g' },
    },
  ],
};
const recalculationResponse = (): Record<string, unknown> => {
  const value = JSON.parse(
    readFileSync(new URL('../../../../specs/fixtures/ai/correction-complete.json', import.meta.url), 'utf8')
  ) as Record<string, unknown>;
  value.operationId = operationId;
  value.profileVersion = 7;
  const components = value.components as Array<Record<string, unknown>>;
  components[0]!.id = recalculationRequest.components[0]!.id;
  return value;
};

afterEach(() => vi.unstubAllGlobals());

const fixtureClient = (scenario: FixtureScenario) => createAiClient(loadConfig({
  APP_ENV: 'dev',
  AI_MODE: 'fixture',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/carin',
}), scenario);

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
      const client = fixtureClient(scenario);
      const result = await client.analyzePhoto(photoRequest);
      expect(result.supportStatus).toBe(scenario);
      expect(result.dataMode).toBe('synthetic');
      expect(result.operationId).toBe(operationId);
      expect(result.profileVersion).toBe(profile.profileVersion);
      expect(result.catalogVersion).toBe(photoRequest.catalogVersion);
      expect(result.ruleSetVersion).toBe(photoRequest.ruleSetVersion);
      expect(result.nutritionDatasetVersion).toBe('synthetic-nutrition-1');
      expect(result.sources.filter((source) => source.id === 'synthetic-rule').every((source) => source.datasetVersion === 'synthetic-rules-1')).toBe(true);
      expect(result.sources.every((source) => source.kind === 'synthetic')).toBe(true);
    }
  );

  it('serves only explicit synthetic capability and catalog data', async () => {
    const client = fixtureClient('complete');
    const capabilities = await client.getCapabilities();
    expect(capabilities.dataMode).toBe('synthetic');
    expect(capabilities.supportedPhotoFoodIds).toEqual(['fixture-food-001']);
    expect(capabilities.conditions.map(({ id }) => id)).toEqual(['fixture-condition']);
    expect(capabilities.supportedRules).toEqual([expect.objectContaining({
      ruleId: 'fixture-rule-001', conditionId: 'fixture-condition',
      sources: [expect.objectContaining({ id: 'synthetic-rule', datasetVersion: 'synthetic-rules-1' })],
    })]);
    const catalog = await client.getCatalog({ version: 'synthetic-catalog-1' });
    expect(catalog.items[0]?.id).toBe('fixture-food-001');
    expect(catalog.items[0]?.sources.every((source) => source.kind === 'synthetic')).toBe(true);
    await expect(client.getCatalog({ version: 'catalog-unpublished-0.1.0' })).rejects.toMatchObject({
      code: 'CATALOG_VERSION_UNAVAILABLE',
    });
  });

  it('uses the correction fixture for recalculation and request component identity', async () => {
    const client = fixtureClient('correction');
    const result = await client.recalculateComponents(recalculationRequest);
    expect(result.inputKind).toBe('correction');
    expect(result.components[0]?.id).toBe(recalculationRequest.components[0]?.id);
    expect(result.components[0]?.portion.grams).toBe(50);
    expect(result.dataMode).toBe('synthetic');
  });

  it('uses recalculation fixtures for manual consumption evaluation jobs', async () => {
    const result = await fixtureClient('correction').recalculateComponents({
      ...recalculationRequest,
      inputKind: 'manual',
    });

    expect(result.inputKind).toBe('manual');
    expect(result.components[0]?.id).toBe(recalculationRequest.components[0]?.id);
  });

  it('preserves every selected fixture component field during recalculation', async () => {
    const client = fixtureClient('correction');
    const request = {
      ...recalculationRequest,
      components: [{
        ...recalculationRequest.components[0]!,
        displayName: 'User-entered meal name',
        preparation: 'Steamed and chopped',
      }],
    } satisfies components['schemas']['RecalculationRequest'];

    const result = await client.recalculateComponents(request);
    const selected = request.components[0]!;
    if (selected.portion.kind !== 'known') throw new Error('test request must use a known portion');
    const component = result.components[0]!;
    expect(component.id).toBe(selected.id);
    expect(component.displayName).toBe(selected.displayName);
    expect(component.catalogFoodId).toBe(selected.catalogFoodId);
    expect(component.preparation).toBe(selected.preparation);
    expect(component.portion.quantity).toBe(selected.portion.quantity);
    expect(component.portion.unit).toBe(selected.portion.unit);
    expect(component.portion.servingId).toBe(
      selected.portion.unit === 'serving' ? selected.portion.servingId : null
    );
  });

  it.each([
    ['catalog', { catalogVersion: 'catalog-not-in-fixtures' }],
    ['rule set', { ruleSetVersion: 'rules-not-in-fixtures' }],
  ])('rejects an unknown %s version for photo analysis', async (_label, patch) => {
    const client = fixtureClient('complete');
    await expect(client.analyzePhoto({ ...photoRequest, ...patch })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });

  it.each([
    ['catalog', { catalogVersion: 'catalog-not-in-fixtures' }],
    ['rule set', { ruleSetVersion: 'rules-not-in-fixtures' }],
  ])('rejects an unknown %s version for correction', async (_label, patch) => {
    const client = fixtureClient('correction');
    await expect(client.recalculateComponents({ ...recalculationRequest, ...patch })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });

  it('selects fixtures only through validated development runtime configuration', () => {
    expect(() => fixtureClient('complete')).not.toThrow();
  });

  it('returns service failure only when that scenario is explicitly selected', async () => {
    const client = fixtureClient('service-failure');
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
      allowedHosts: ['ai-service.internal'],
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

  it('accepts and preserves per-component VLM estimates in an unrecognized photo result', async () => {
    const body = fixtureResponse('analysis-vlm-fallback');
    const result = await makeClient(async () => Response.json(body)).analyzePhoto(photoRequest);

    expect(result.supportStatus).toBe('unrecognized');
    expect(result.components[0]?.nutrients.energyKcal).toBe(320);
    expect(result.totals.energyKcal).toBe(320);
    expect(result.coverage.energyKcal.knownComponentCount).toBe(1);
    expect(result.sources[0]?.kind).toBe('model_estimate');
  });

  it('maps an unavailable AI catalog version to a non-retryable catalog error', async () => {
    const response = Response.json({
      error: {
        code: 'CATALOG_VERSION_UNAVAILABLE',
        message: 'catalogVersion tidak tersedia pada service ini.',
        retryable: false,
        requestId: operationId,
        details: {},
      },
    }, { status: 409 });
    const client = makeClient(async () => response);

    await expect(client.analyzePhoto(photoRequest)).rejects.toMatchObject({
      code: 'CATALOG_VERSION_UNAVAILABLE',
      retryable: false,
      message: 'catalogVersion tidak tersedia pada service ini.',
    });
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
    await expect(client.analyzePhoto({ ...photoRequest, contractVersion: '1.0.0' as '2.0.0' })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects invalid response provenance even when the JSON schema passes', async () => {
    const body = { ...fixtureResponse(), operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
    const client = makeClient(async () => Response.json(body));
    await expect(client.analyzePhoto(photoRequest)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it.each([
    ['component id', (body: Record<string, unknown>) => {
      ((body.components as Array<Record<string, unknown>>)[0]!).id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    }],
    ['selected food', (body: Record<string, unknown>) => {
      ((body.components as Array<Record<string, unknown>>)[0]!).catalogFoodId = 'another-food';
    }],
    ['selected portion', (body: Record<string, unknown>) => {
      (((body.components as Array<Record<string, unknown>>)[0]!.portion) as Record<string, unknown>).quantity = 0.25;
    }],
  ])('rejects a valid-schema recalculation response with mismatched %s', async (_label, alter) => {
    const body = recalculationResponse();
    alter(body);
    const client = makeClient(async () => Response.json(body));
    await expect(client.recalculateComponents(recalculationRequest)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('accepts a valid recalculation response that preserves selected component identity', async () => {
    const client = makeClient(async () => Response.json(recalculationResponse()));
    const result = await client.recalculateComponents(recalculationRequest);
    expect(result.components[0]?.id).toBe(recalculationRequest.components[0]?.id);
    expect(result.components[0]?.portion.quantity).toBe(0.5);
  });

  it('accepts an unknown selected portion with a valid partial response', async () => {
    const request: components['schemas']['RecalculationRequest'] = {
      ...recalculationRequest,
      components: [{
        id: recalculationRequest.components[0]!.id,
        displayName: 'Makanan contoh sintetis 100 g',
        catalogFoodId: 'fixture-food-001',
        preparation: 'Contoh uji',
        portion: { kind: 'unknown' },
      }],
    };
    const body = JSON.parse(
      readFileSync(new URL('../../../../specs/fixtures/ai/analysis-partial.json', import.meta.url), 'utf8')
    ) as Record<string, unknown>;
    body.operationId = operationId;
    body.profileVersion = 7;
    body.inputKind = 'correction';
    const component = (body.components as Array<Record<string, unknown>>)[0]!;
    component.id = request.components[0]!.id;
    component.portion = {
      quantity: null,
      unit: null,
      servingId: null,
      grams: null,
      origin: 'user_reported',
      basis: null,
      sourceId: null,
    };
    body.components = [component];

    const result = await makeClient(async () => Response.json(body)).recalculateComponents(request);
    expect(result.components[0]).toMatchObject({
      id: request.components[0]!.id,
      displayName: request.components[0]!.displayName,
      catalogFoodId: request.components[0]!.catalogFoodId,
      preparation: request.components[0]!.preparation,
      portion: { quantity: null, unit: null, servingId: null, grams: null },
    });
  });

  it('rejects an unknown selected portion response with an estimated gram value', async () => {
    const request: components['schemas']['RecalculationRequest'] = {
      ...recalculationRequest,
      components: [{
        id: recalculationRequest.components[0]!.id,
        displayName: 'Makanan contoh sintetis 100 g',
        catalogFoodId: 'fixture-food-001',
        preparation: 'Contoh uji',
        portion: { kind: 'unknown' },
      }],
    };
    const body = JSON.parse(
      readFileSync(new URL('../../../../specs/fixtures/ai/analysis-partial.json', import.meta.url), 'utf8')
    ) as Record<string, unknown>;
    body.operationId = operationId;
    body.profileVersion = 7;
    body.inputKind = 'correction';
    const component = (body.components as Array<Record<string, unknown>>)[0]!;
    component.id = request.components[0]!.id;
    component.portion = {
      quantity: null,
      unit: null,
      servingId: null,
      grams: 25,
      origin: 'user_reported',
      basis: null,
      sourceId: null,
    };
    body.components = [component];

    const client = makeClient(async () => Response.json(body));
    await expect(client.recalculateComponents(request)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('rejects unapproved hosts and URL credentials, query, or fragment before network access', () => {
    const fetcher = vi.fn<typeof fetch>();
    for (const baseUrl of [
      'https://example.com',
      'http://169.254.169.254:8000',
      'http://[fe80::1]:8000',
      'not a valid URL',
      'http://user:pass@ai-service.internal:8000',
      'http://ai-service.internal:8000?token=secret',
      'http://ai-service.internal:8000#fragment',
    ]) {
      expect(() => createHttpAiClient({
        baseUrl,
        serviceKey: 'test-only-service-key',
        allowedHosts: baseUrl === 'https://example.com'
          ? ['example.com']
          : baseUrl.includes('169.254.169.254')
            ? ['169.254.169.254']
            : baseUrl.includes('fe80::1')
              ? ['[fe80::1]']
              : ['ai-service.internal'],
        fetch: fetcher,
      })).toThrow(AiAdapterError);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('fails closed on redirects so a second host cannot receive the service key', async () => {
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      void init;
      return new Response(null, { status: 302, headers: { location: 'https://public.example/collect' } });
    });
    const client = makeClient(fetcher);
    await expect(client.analyzePhoto(photoRequest)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe('error');
    expect(fetcher.mock.calls[0]?.[0]).toBeInstanceOf(URL);
    expect(new URL(String(fetcher.mock.calls[0]?.[0])).hostname).toBe('ai-service.internal');
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
