import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { components } from '../../contracts/generated/ai-service.js';
import {
  ContractValidationError,
  contractOperations,
  validateRequest,
  validateResponse,
  validateSchema,
} from '../../contracts/validation.js';

type Schemas = components['schemas'];
export type AiClient = {
  getCapabilities(): Promise<Schemas['CapabilityManifest']>;
  getCatalog(input: { version: string; cursor?: string; limit?: number }): Promise<Schemas['CatalogPage']>;
  analyzePhoto(input: Schemas['PhotoAnalysisRequest']): Promise<Schemas['AnalysisResult']>;
  recalculateComponents(input: Schemas['RecalculationRequest']): Promise<Schemas['AnalysisResult']>;
};
export type FixtureScenario = 'complete' | 'partial' | 'unrecognized' | 'correction' | 'service-failure';
export type AppEnvironment = 'dev' | 'staging' | 'prod' | 'test';

type AdapterErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_RESPONSE'
  | 'SERVICE_UNAVAILABLE'
  | 'TIMEOUT'
  | 'CATALOG_VERSION_UNAVAILABLE'
  | 'MODEL_FAILURE';
export class AiAdapterError extends Error {
  constructor(
    readonly code: AdapterErrorCode,
    message: string,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = 'AiAdapterError';
  }
}

const contractVersion = '1.0.0' as const;
const fixtureRoot = fileURLToPath(new URL('../../../fixtures/ai/', import.meta.url));
const fixtureFiles = {
  complete: 'analysis-complete.json',
  partial: 'analysis-partial.json',
  unrecognized: 'analysis-unrecognized.json',
  correction: 'correction-complete.json',
} as const;
type FixtureKey = keyof typeof fixtureFiles;

function fixture(key: FixtureKey): Schemas['AnalysisResult'] {
  const content = readFileSync(`${fixtureRoot}${fixtureFiles[key]}`, 'utf8');
  const value: unknown = JSON.parse(content);
  validateSchema('ai.AnalysisResult', value);
  return value as Schemas['AnalysisResult'];
}
function requestError(error: unknown): never {
  if (error instanceof AiAdapterError) throw error;
  if (error instanceof ContractValidationError) {
    throw new AiAdapterError('INVALID_REQUEST', 'AI request failed contract validation.', false);
  }
  throw error;
}
function validateAiRequest(operation: string, body: unknown): void {
  try {
    validateRequest(operation, { body, contentType: 'application/json' });
  } catch (error) {
    requestError(error);
  }
}
function sourceReferencesAreComplete(result: Schemas['AnalysisResult']): boolean {
  const sourceIds = new Set(result.sources.map((source) => source.id));
  return result.components.every((component) => {
    const references = [
      ...component.sourceIds,
      ...Object.values(component.nutrientSourceIds).filter((id): id is string => id !== null),
      component.portion.sourceId,
    ].filter((id): id is string => id !== null);
    return references.every((id) => sourceIds.has(id));
  }) && result.attentions.every((attention) => attention.sourceIds.every((id) => sourceIds.has(id)));
}
function validateResultProvenance(
  result: Schemas['AnalysisResult'],
  request: Schemas['PhotoAnalysisRequest'] | Schemas['RecalculationRequest']
): void {
  if (
    result.operationId !== request.operationId ||
    result.profileVersion !== request.profile.profileVersion ||
    result.catalogVersion !== request.catalogVersion ||
    result.ruleSetVersion !== request.ruleSetVersion ||
    result.inputKind !== ('image' in request ? 'photo' : request.inputKind)
  ) {
    throw new AiAdapterError('INVALID_RESPONSE', 'AI response provenance did not match its request.', false);
  }
  const hasSyntheticSource = result.sources.some((source) => source.kind === 'synthetic');
  const hasSyntheticLabel = result.limitations.some((item) => item.code === 'SYNTHETIC_DATA');
  if (
    !sourceReferencesAreComplete(result) ||
    (result.dataMode === 'synthetic' && (!hasSyntheticLabel || (result.supportStatus !== 'unrecognized' && !hasSyntheticSource))) ||
    (result.dataMode === 'real' && hasSyntheticSource)
  ) {
    throw new AiAdapterError('INVALID_RESPONSE', 'AI response provenance is incomplete or mislabeled.', false);
  }
}
function bindRequestedProvenance(
  fixtureResult: Schemas['AnalysisResult'],
  request: Schemas['PhotoAnalysisRequest'] | Schemas['RecalculationRequest']
): Schemas['AnalysisResult'] {
  const result = structuredClone(fixtureResult);
  result.operationId = request.operationId;
  result.profileVersion = request.profile.profileVersion;
  result.catalogVersion = request.catalogVersion;
  result.ruleSetVersion = request.ruleSetVersion;
  for (const source of result.sources) {
    if (source.kind === 'synthetic' && source.id === 'synthetic-rule') {
      source.datasetVersion = request.ruleSetVersion;
    }
  }
  if ('components' in request) {
    if (result.components.length !== request.components.length) {
      throw new AiAdapterError('INVALID_REQUEST', 'Fixture scenario does not match component count.', false);
    }
    result.components = result.components.map((component, index) => {
      const input = request.components[index];
      if (
        !input ||
        component.catalogFoodId !== input.catalogFoodId ||
        input.portion.kind !== 'known' ||
        component.portion.quantity !== input.portion.quantity ||
        component.portion.unit !== input.portion.unit ||
        (input.portion.unit === 'serving' && component.portion.servingId !== input.portion.servingId)
      ) {
        throw new AiAdapterError('INVALID_REQUEST', 'Fixture scenario does not match selected food and portion.', false);
      }
      component.id = input.id;
      return component;
    });
    for (const attention of result.attentions) {
      attention.componentIds = attention.componentIds.map((id) => {
        const originalIndex = fixtureResult.components.findIndex((component) => component.id === id);
        return result.components[originalIndex]?.id ?? id;
      });
    }
  }
  validateResultProvenance(result, request);
  return result;
}
function fixtureCatalog(result: Schemas['AnalysisResult']): Schemas['CatalogPage'] {
  const component = result.components.find((item) => item.matchStatus === 'matched');
  if (!component?.catalogFoodId) return { catalogVersion: result.catalogVersion, items: [], nextCursor: null };
  const sources = result.sources.filter((source) => component.sourceIds.includes(source.id));
  const nutrientSourceIds = component.nutrientSourceIds;
  return {
    catalogVersion: result.catalogVersion,
    items: [
      {
        id: component.catalogFoodId,
        catalogVersion: result.catalogVersion,
        displayName: component.displayName,
        aliases: [],
        preparation: component.preparation,
        per100g: component.per100g,
        servings: component.portion.servingId && component.portion.grams && component.portion.sourceId
          ? [{
              id: component.portion.servingId,
              label: component.portion.basis ?? component.portion.servingId,
              grams: component.portion.grams,
              sourceId: component.portion.sourceId,
            }]
          : [],
        sources,
        nutrientSourceIds,
      },
    ],
    nextCursor: null,
  };
}
function validateResponseBody<T>(operation: string, body: unknown): T {
  try {
    validateResponse(operation, 200, body, { contentType: 'application/json' });
  } catch {
    throw new AiAdapterError('INVALID_RESPONSE', 'AI provider response failed contract validation.', false);
  }
  return body as T;
}

export function createFixtureAiClient(options: {
  environment: AppEnvironment;
  scenario: FixtureScenario;
}): AiClient {
  if (options.environment !== 'dev' && options.environment !== 'test') {
    throw new AiAdapterError('INVALID_REQUEST', 'Synthetic AI fixtures are disabled in this environment.', false);
  }
  return {
    async getCapabilities() {
      const sample = fixture('complete');
      const manifest: Schemas['CapabilityManifest'] = {
        contractVersion,
        catalogVersion: sample.catalogVersion,
        nutritionDatasetVersion: sample.nutritionDatasetVersion,
        ruleSetVersion: sample.ruleSetVersion,
        conditions: [],
        supportedPhotoFoodIds: [],
        nutrients: [],
        dataMode: 'synthetic',
        publishedAt: sample.computedAt,
      };
      validateSchema('ai.CapabilityManifest', manifest);
      return manifest;
    },
    async getCatalog(input) {
      const sample = fixture('complete');
      if (input.version !== sample.catalogVersion) {
        throw new AiAdapterError('CATALOG_VERSION_UNAVAILABLE', 'Requested fixture catalog version is unavailable.', false);
      }
      const page = fixtureCatalog(sample);
      if (input.cursor) page.items = [];
      if (input.limit !== undefined) page.items = page.items.slice(0, input.limit);
      validateSchema('ai.CatalogPage', page);
      return page;
    },
    async analyzePhoto(input) {
      validateAiRequest('ai.analyzePhoto', input);
      if (options.scenario === 'service-failure') {
        throw new AiAdapterError('SERVICE_UNAVAILABLE', 'Synthetic service failure scenario.', true);
      }
      if (options.scenario === 'correction') {
        throw new AiAdapterError('INVALID_REQUEST', 'Correction scenario requires recalculation.', false);
      }
      const result = bindRequestedProvenance(fixture(options.scenario), input);
      return validateResponseBody<Schemas['AnalysisResult']>('ai.analyzePhoto', result);
    },
    async recalculateComponents(input) {
      validateAiRequest('ai.recalculateComponents', input);
      if (options.scenario === 'service-failure') {
        throw new AiAdapterError('SERVICE_UNAVAILABLE', 'Synthetic service failure scenario.', true);
      }
      if (options.scenario !== 'correction' || input.inputKind !== 'correction') {
        throw new AiAdapterError('INVALID_REQUEST', 'Correction scenario must be selected explicitly.', false);
      }
      const result = bindRequestedProvenance(fixture('correction'), input);
      return validateResponseBody<Schemas['AnalysisResult']>('ai.recalculateComponents', result);
    },
  };
}

type Fetch = typeof fetch;
export function createHttpAiClient(options: {
  baseUrl: string;
  serviceKey: string;
  timeoutMs?: number;
  fetch?: Fetch;
}): AiClient {
  const endpoint = new URL(options.baseUrl);
  if (!['http:', 'https:'].includes(endpoint.protocol) || !options.serviceKey.trim()) {
    throw new AiAdapterError('INVALID_REQUEST', 'Internal AI service configuration is invalid.', false);
  }
  const timeoutMs = options.timeoutMs ?? 90_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new AiAdapterError('INVALID_REQUEST', 'AI timeout must be positive.', false);
  }
  const fetcher = options.fetch ?? fetch;
  const operations = new Map(contractOperations().map((operation) => [operation.id, operation]));
  async function send<T>(operationId: string, body?: unknown, query?: Record<string, unknown>): Promise<T> {
    const operation = operations.get(operationId);
    if (!operation) throw new AiAdapterError('INVALID_REQUEST', 'Unknown AI operation.', false);
    if (body !== undefined) validateAiRequest(operationId, body);
    else {
      try {
        validateRequest(operationId, { query });
      } catch (error) {
        requestError(error);
      }
    }
    const url = new URL(operation.path, endpoint);
    for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, String(value));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    let responseText: string;
    try {
      response = await fetcher(url, {
        method: operation.method.toUpperCase(),
        headers: {
          accept: 'application/json',
          'X-Carin-Service-Key': options.serviceKey,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
      responseText = await response.text();
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        throw new AiAdapterError('TIMEOUT', 'AI service request timed out.', true);
      }
      throw new AiAdapterError('SERVICE_UNAVAILABLE', 'AI service could not be reached.', true);
    } finally {
      clearTimeout(timer);
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(responseText);
    } catch {
      throw new AiAdapterError('INVALID_RESPONSE', 'AI service returned invalid JSON.', false);
    }
    if (!response.ok) {
      try {
        validateResponse(operationId, response.status, decoded, {
          contentType: response.headers.get('content-type') ?? undefined,
          headers: response.headers,
        });
      } catch {
        throw new AiAdapterError('INVALID_RESPONSE', 'AI service returned an invalid error response.', false);
      }
      const errorBody = decoded as { error: { code: string; message: string; retryable: boolean } };
      throw new AiAdapterError(
        errorBody.error.code === 'MODEL_FAILURE' ? 'MODEL_FAILURE' : 'SERVICE_UNAVAILABLE',
        errorBody.error.message,
        errorBody.error.retryable
      );
    }
    let result: T;
    try {
      validateResponse(operationId, response.status, decoded, {
        contentType: response.headers.get('content-type') ?? undefined,
        headers: response.headers,
      });
      result = decoded as T;
    } catch {
      throw new AiAdapterError('INVALID_RESPONSE', 'AI service response failed contract validation.', false);
    }
    if (operationId === 'ai.analyzePhoto' || operationId === 'ai.recalculateComponents') {
      validateResultProvenance(
        result as Schemas['AnalysisResult'],
        body as Schemas['PhotoAnalysisRequest'] | Schemas['RecalculationRequest']
      );
    }
    if (operationId === 'ai.getCatalog' && (result as Schemas['CatalogPage']).catalogVersion !== query?.version) {
      throw new AiAdapterError('INVALID_RESPONSE', 'AI catalog version did not match the requested version.', false);
    }
    return result;
  }
  return {
    getCapabilities: () => send('ai.getCapabilities'),
    getCatalog: (input) => send('ai.getCatalog', undefined, input),
    analyzePhoto: (input) => send('ai.analyzePhoto', input),
    recalculateComponents: (input) => send('ai.recalculateComponents', input),
  };
}
