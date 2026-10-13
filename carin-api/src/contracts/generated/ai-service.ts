// Generated from specs/contracts/. Do not edit; run pnpm contracts:generate in carin-app.
export type paths = {
  '/internal/v1/analyses': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Recognize photo, calculate source-backed nutrition, evaluate supported rules
     * @description operationId is backend-owned correlation ID. Signed URL host must be allowlisted MinIO; never arbitrary URLs. Response operationId, profileVersion and artifact versions must match request. Backend timeout is 90s. Result may be complete/partial/unrecognized; runtime failures use non-2xx.
     */
    post: operations['analyzePhoto'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/internal/v1/capabilities': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get explicit support and artifact versions */
    get: operations['getCapabilities'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/internal/v1/catalog': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Export immutable reference catalog for backend import */
    get: operations['getCatalog'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/internal/v1/recalculations': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Calculate latest structured components and supported attention without a photo
     * @description Use requested immutable catalog/rule versions and profile snapshot; no previous nutrient totals from mobile are accepted. Unmatched/unknown portion is a partial result, not INVALID_INPUT. Stateless deterministic calculation plus supported explanation.
     */
    post: operations['recalculateComponents'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
};
export type webhooks = Record<string, never>;
export type components = {
  schemas: {
    AnalysisResult: {
      attentions: components['schemas']['Attention'][];
      catalogVersion: string;
      components: components['schemas']['ComponentResult'][];
      /** Format: date-time */
      computedAt: string;
      contractVersion: components['schemas']['ContractVersion'];
      coverage: components['schemas']['NutrientCoverage'];
      /** @enum {string} */
      dataMode: 'real' | 'synthetic';
      /** @enum {string} */
      inputKind: 'photo' | 'manual' | 'correction';
      limitations: components['schemas']['Limitation'][];
      nutritionDatasetVersion: string;
      /** Format: uuid */
      operationId: string;
      /** @enum {string} */
      overallAttention: 'considerable' | 'needs_attention' | 'insufficient_information';
      profileVersion: number;
      ruleSetVersion: string;
      sources: components['schemas']['Source'][];
      /** @enum {string} */
      supportStatus: 'complete' | 'partial' | 'unrecognized';
      totals: components['schemas']['Nutrients'];
    };
    Attention: {
      adjustments: string[];
      componentIds: string[];
      conditionId: string;
      limitations: string[];
      reason: string;
      ruleId: string;
      sourceIds: string[];
    };
    CapabilityManifest: {
      catalogVersion: string;
      conditions: components['schemas']['Condition'][];
      contractVersion: components['schemas']['ContractVersion'];
      /** @enum {string} */
      dataMode: 'real' | 'synthetic';
      nutrients: (
        'energyKcal' | 'carbohydrateG' | 'proteinG' | 'fatG' | 'fiberG' | 'sugarsG' | 'sodiumMg'
      )[];
      nutritionDatasetVersion: string;
      /** Format: date-time */
      publishedAt: string;
      ruleSetVersion: string;
      supportedPhotoFoodIds: string[];
    };
    CatalogFood: {
      aliases: string[];
      catalogVersion: string;
      displayName: string;
      id: string;
      nutrientSourceIds: components['schemas']['NutrientSources'];
      per100g: components['schemas']['Nutrients'];
      preparation: string | null;
      servings: components['schemas']['Serving'][];
      sources: components['schemas']['Source'][];
    };
    CatalogPage: {
      catalogVersion: string;
      items: components['schemas']['CatalogFood'][];
      nextCursor: string | null;
    };
    ComponentInput: {
      catalogFoodId: string | null;
      displayName: string;
      /** Format: uuid */
      id: string;
      portion: components['schemas']['PortionInput'];
      preparation: string | null;
    };
    ComponentResult: {
      catalogFoodId: string | null;
      displayName: string;
      /** Format: uuid */
      id: string;
      /** @enum {string} */
      matchStatus: 'matched' | 'unmatched' | 'unrecognized';
      nutrients: components['schemas']['Nutrients'];
      nutrientSourceIds: components['schemas']['NutrientSources'];
      per100g: components['schemas']['Nutrients'];
      portion: components['schemas']['PortionResult'];
      preparation: string | null;
      sourceIds: string[];
    };
    Condition: {
      displayName: string;
      id: string;
      personalizationSupported: boolean;
      requiredNutrients: (
        'energyKcal' | 'carbohydrateG' | 'proteinG' | 'fatG' | 'fiberG' | 'sugarsG' | 'sodiumMg'
      )[];
      requiredProfileFields: string[];
      supportedAgeMaximum: number | null;
      supportedAgeMinimum: number | null;
    };
    /** @enum {string} */
    ContractVersion: '1.0.0';
    Error: {
      error: {
        code: string;
        details: {
          [key: string]: unknown;
        };
        message: string;
        /** Format: uuid */
        requestId: string;
        retryable: boolean;
      };
    };
    Limitation: {
      code: string;
      componentIds: string[];
      critical: boolean;
      message: string;
    };
    NutrientCoverage: {
      carbohydrateG: {
        knownComponentCount: number;
        totalComponentCount: number;
      };
      energyKcal: {
        knownComponentCount: number;
        totalComponentCount: number;
      };
      fatG: {
        knownComponentCount: number;
        totalComponentCount: number;
      };
      fiberG: {
        knownComponentCount: number;
        totalComponentCount: number;
      };
      proteinG: {
        knownComponentCount: number;
        totalComponentCount: number;
      };
      sodiumMg: {
        knownComponentCount: number;
        totalComponentCount: number;
      };
      sugarsG: {
        knownComponentCount: number;
        totalComponentCount: number;
      };
    };
    Nutrients: {
      carbohydrateG: number | null;
      energyKcal: number | null;
      fatG: number | null;
      fiberG: number | null;
      proteinG: number | null;
      sodiumMg: number | null;
      sugarsG: number | null;
    };
    NutrientSources: {
      carbohydrateG: string | null;
      energyKcal: string | null;
      fatG: string | null;
      fiberG: string | null;
      proteinG: string | null;
      sodiumMg: string | null;
      sugarsG: string | null;
    };
    PhotoAnalysisRequest: {
      catalogVersion: string;
      contractVersion: components['schemas']['ContractVersion'];
      image: {
        /** Format: uri */
        downloadUrl: string;
        /** @enum {string} */
        mimeType: 'image/jpeg' | 'image/png';
        sha256: string;
      };
      /** Format: uuid */
      operationId: string;
      profile: components['schemas']['ProfileContext'];
      ruleSetVersion: string;
    };
    PortionInput:
      | {
          /** @enum {string} */
          kind: 'unknown';
        }
      | {
          /** @enum {string} */
          kind: 'known';
          quantity: number;
          /** @enum {string} */
          unit: 'g';
        }
      | {
          /** @enum {string} */
          kind: 'known';
          quantity: number;
          servingId: string;
          /** @enum {string} */
          unit: 'serving';
        };
    PortionResult: {
      basis: string | null;
      grams: number | null;
      /** @enum {string} */
      origin: 'photo_estimate' | 'user_reported';
      quantity: number | null;
      servingId: string | null;
      sourceId: string | null;
      unit: ('g' | 'serving') | null;
    };
    ProfileContext: {
      activity: ('sedentary' | 'light' | 'moderate' | 'high') | null;
      ageYears: number | null;
      allergies: string[];
      /** @enum {string} */
      allergyState: 'not_provided' | 'unknown' | 'none_known' | 'reported';
      conditionIds: string[];
      /** @enum {string} */
      diagnosisState: 'not_provided' | 'none_known' | 'never_examined' | 'reported';
      heightCm: number | null;
      profileVersion: number;
      sexForReference: ('female' | 'male') | null;
      smoking: ('never' | 'former' | 'current') | null;
      unsupportedConditionLabels: string[];
      weightKg: number | null;
    };
    RecalculationRequest: {
      catalogVersion: string;
      components: components['schemas']['ComponentInput'][];
      contractVersion: components['schemas']['ContractVersion'];
      /** @enum {string} */
      inputKind: 'manual' | 'correction';
      /** Format: uuid */
      operationId: string;
      profile: components['schemas']['ProfileContext'];
      ruleSetVersion: string;
    };
    Serving: {
      grams: number;
      id: string;
      label: string;
      sourceId: string;
    };
    Source: {
      datasetVersion: string;
      id: string;
      itemRef: string;
      /** @enum {string} */
      kind: 'nutrition' | 'portion' | 'health_rule' | 'synthetic';
      title: string;
      url: string | null;
    };
  };
  responses: {
    /** @description Structured error; code examples INVALID_INPUT, UNSUPPORTED_VERSION, CATALOG_VERSION_UNAVAILABLE, SERVICE_UNAVAILABLE, MODEL_FAILURE. No successful result body on error. */
    Error: {
      headers: {
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
    /** @description Structured error; code examples INVALID_INPUT, UNSUPPORTED_VERSION, CATALOG_VERSION_UNAVAILABLE, SERVICE_UNAVAILABLE, MODEL_FAILURE. No successful result body on error. */
    TooManyRequests: {
      headers: {
        /** @description Retry delay seconds */
        'Retry-After'?: number;
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
  };
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
};
export type $defs = Record<string, never>;
export interface operations {
  analyzePhoto: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['PhotoAnalysisRequest'];
      };
    };
    responses: {
      /** @description Validated result */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AnalysisResult'];
        };
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  getCapabilities: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Supported scope; synthetic data must be marked */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CapabilityManifest'];
        };
      };
      401: components['responses']['Error'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  getCatalog: {
    parameters: {
      query: {
        cursor?: string;
        limit?: number;
        version: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Page; all pages use requested version */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CatalogPage'];
        };
      };
      401: components['responses']['Error'];
      404: components['responses']['Error'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  recalculateComponents: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['RecalculationRequest'];
      };
    };
    responses: {
      /** @description Latest result */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AnalysisResult'];
        };
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
}
