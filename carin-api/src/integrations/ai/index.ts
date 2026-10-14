import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { components } from '../../contracts/generated/ai-service.js';
import { isInternalHost, type AppConfig } from '../../config.js';
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
  const canonical = fixture('complete');
  if (
    request.catalogVersion !== canonical.catalogVersion || request.ruleSetVersion !== canonical.ruleSetVersion
  ) {
    throw new AiAdapterError('INVALID_REQUEST', 'Requested versions are unavailable in the synthetic fixture dataset.', false);
  }
  if (
    fixtureResult.catalogVersion !== canonical.catalogVersion ||
    fixtureResult.nutritionDatasetVersion !== canonical.nutritionDatasetVersion ||
    fixtureResult.ruleSetVersion !== canonical.ruleSetVersion ||
    fixtureResult.sources.some((source) =>
      (source.id === 'synthetic-nutrition' && source.datasetVersion !== canonical.nutritionDatasetVersion) ||
      (source.id === 'synthetic-rule' && source.datasetVersion !== canonical.ruleSetVersion)
    )
  ) {
    throw new AiAdapterError('INVALID_RESPONSE', 'Fixture provenance does not match the canonical synthetic dataset.', false);
  }
  const result = structuredClone(fixtureResult);
  result.operationId = request.operationId;
  result.profileVersion = request.profile.profileVersion;
  if (!('image' in request)) result.inputKind = request.inputKind;
  result.attentions = result.attentions.filter((attention) =>
    request.profile.profileVersion > 0 && request.profile.conditionIds.includes(attention.conditionId),
  );
  const citedRuleSources = new Set(result.attentions.flatMap(({ sourceIds }) => sourceIds));
  result.sources = result.sources.filter((source) =>
    !(source.kind === 'synthetic' && source.datasetVersion === result.ruleSetVersion && !citedRuleSources.has(source.id)),
  );
  const profile = request.profile;
  const fixtureRuleEligible = profile.profileVersion > 0 && profile.conditionIds.includes('fixture-condition') &&
    profile.weightKg !== null && profile.ageYears !== null && profile.ageYears >= 18 && profile.ageYears <= 80 &&
    result.components.length > 0 && result.components.every(({ nutrients }) => nutrients.energyKcal !== null);
  const hasProfileFacts = profile.heightCm !== null || profile.weightKg !== null || profile.sexForReference !== null ||
    profile.diagnosisState !== 'not_provided' || profile.conditionIds.length > 0 ||
    profile.unsupportedConditionLabels.length > 0 || profile.allergyState !== 'not_provided' ||
    profile.allergies.length > 0 || profile.activity !== null || profile.smoking !== null;
  const hasUnsupportedConditions = profile.unsupportedConditionLabels.length > 0 ||
    profile.conditionIds.some((conditionId) => conditionId !== 'fixture-condition' || !fixtureRuleEligible);
  if (profile.profileVersion === 0 || !hasProfileFacts || hasUnsupportedConditions) {
    result.overallAttention = 'insufficient_information';
  } else if (result.attentions.length === 0 && result.overallAttention === 'needs_attention') {
    result.overallAttention = 'considerable';
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
      component.displayName = input.displayName;
      component.catalogFoodId = input.catalogFoodId;
      component.preparation = input.preparation;
      component.portion.quantity = input.portion.quantity;
      component.portion.unit = input.portion.unit;
      component.portion.servingId = input.portion.unit === 'serving' ? input.portion.servingId : null;
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

function createFixtureAiClient(options: {
  config: Pick<AppConfig, 'appEnv' | 'aiMode'>;
  scenario: FixtureScenario;
}): AiClient {
  if (
    options.config.aiMode !== 'fixture' ||
    options.config.appEnv !== 'dev'
  ) {
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
        conditions: [{
          id: 'fixture-condition',
          displayName: 'Synthetic fixture condition',
          personalizationSupported: true,
          requiredProfileFields: ['weightKg'],
          requiredNutrients: ['energyKcal'],
          supportedAgeMinimum: 18,
          supportedAgeMaximum: 80,
        }],
        supportedPhotoFoodIds: ['fixture-food-001'],
        supportedRules: [{
          ruleId: 'fixture-rule-001',
          conditionId: 'fixture-condition',
          sources: [sample.sources.find((source) => source.id === 'synthetic-rule')!],
        }],
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
      if (options.scenario !== 'correction' || !['manual', 'correction'].includes(input.inputKind)) {
        throw new AiAdapterError('INVALID_REQUEST', 'Recalculation fixture scenario must be selected explicitly.', false);
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
  allowedHosts: readonly string[];
  timeoutMs?: number;
  fetch?: Fetch;
}): AiClient {
  let endpoint: URL;
  try {
    endpoint = new URL(options.baseUrl);
  } catch {
    throw new AiAdapterError('INVALID_REQUEST', 'Internal AI service configuration is invalid.', false);
  }
  const allowedHosts = new Set(options.allowedHosts.map((host) => host.trim().toLowerCase()).filter(Boolean));
  if (
    !['http:', 'https:'].includes(endpoint.protocol) || !options.serviceKey.trim() || allowedHosts.size === 0 ||
    [...allowedHosts].some((host) => !isInternalHost(host)) || !isInternalHost(endpoint.hostname) ||
    !allowedHosts.has(endpoint.hostname.toLowerCase()) || endpoint.username || endpoint.password ||
    endpoint.search || endpoint.hash || /[?#]/.test(options.baseUrl)
  ) {
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
        redirect: 'error',
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
      if (operationId === 'ai.recalculateComponents') {
        const recalculation = body as Schemas['RecalculationRequest'];
        const components = (result as Schemas['AnalysisResult']).components;
        const selectedFieldsMatch = components.length === recalculation.components.length &&
          components.every((component, index) => {
            const selected = recalculation.components[index];
            if (!selected) return false;
            const selectedComponentMatches = component.id === selected.id &&
              component.displayName === selected.displayName &&
              component.catalogFoodId === selected.catalogFoodId &&
              component.preparation === selected.preparation;
            if (!selectedComponentMatches) return false;
            if (selected.portion.kind === 'unknown') {
              return component.portion.quantity === null &&
                component.portion.unit === null &&
                component.portion.servingId === null &&
                component.portion.grams === null;
            }
            return component.portion.quantity === selected.portion.quantity &&
              component.portion.unit === selected.portion.unit &&
              component.portion.servingId === (selected.portion.unit === 'serving' ? selected.portion.servingId : null);
          });
        if (!selectedFieldsMatch) {
          throw new AiAdapterError('INVALID_RESPONSE', 'AI recalculation changed the selected component or portion.', false);
        }
      }
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

export function createAiClient(config: AppConfig, scenario: FixtureScenario = 'complete'): AiClient {
  if (config.aiMode === 'fixture') {
    return createFixtureAiClient({ config, scenario });
  }
  if (!config.aiServiceUrl || !config.aiServiceKey || config.aiServiceAllowedHosts.length === 0) {
    throw new AiAdapterError('INVALID_REQUEST', 'Real AI service configuration is incomplete.', false);
  }
  return createHttpAiClient({
    baseUrl: config.aiServiceUrl,
    serviceKey: config.aiServiceKey,
    allowedHosts: config.aiServiceAllowedHosts,
  });
}
