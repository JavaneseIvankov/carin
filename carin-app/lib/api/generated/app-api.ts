// Generated from specs/contracts/. Do not edit; run pnpm contracts:generate in carin-app.
export type paths = {
  '/api/v1/account-deletion': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Reauthenticate then revoke access and queue durable purge
     * @description This acknowledgement revokes current/all sessions immediately. Actual DB/object purge can still be pending. A repeated call with a now-revoked session is 401; mobile clears credentials/cache and does not treat this as another account.
     */
    post: operations['deleteAccount'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/analysis-jobs': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Create a durable async photo analysis job and scan
     * @description Requires current AI consent and private photo ownership. Creates profile/artifact snapshot. Returns before AI completion.
     */
    post: operations['createPhotoAnalysis'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/analysis-jobs/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Poll owned job including validated terminal result */
    get: operations['getAnalysisJob'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/analysis-jobs/{id}/retry': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * New attempt job from a retryable terminal job using same frozen snapshot
     * @description Only failed retryable jobs. New job ID, same target snapshot/generation; invalidation or deletion gives 409/404. No request body.
     */
    post: operations['retryAnalysisJob'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/analysis-results/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Read owned immutable analysis result */
    get: operations['getAnalysisResult'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/catalog/conditions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Search condition labels; actual support is explicit */
    get: operations['getConditions'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/catalog/foods': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Search backend-imported catalog and serving/source data */
    get: operations['searchFoods'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/consents/ai-processing': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Grant/revoke current AI processing consent */
    put: operations['setAiConsent'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/consumptions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List actual consumption; scan-only never appears */
    get: operations['listConsumptions'];
    put?: never;
    /**
     * Persist actual consumption without depending on AI completion
     * @description Manual requires scanId/sourceAnalysisResultId null and occurrence new_occurrence. Photo confirmation requires both IDs owned and current revision. Default repeated confirmation returns existing resource; different input is 409. Optional personal evaluation queued against frozen snapshot. catalogVersion is required; scan confirmation while correction is active returns 409 ANALYSIS_PENDING.
     */
    post: operations['createConsumption'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/consumptions/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Read current nutrition snapshot and attention state */
    get: operations['getConsumption'];
    put?: never;
    post?: never;
    /** Remove consumption and dashboard contribution; retained scan remains */
    delete: operations['deleteConsumption'];
    options?: never;
    head?: never;
    /** New current snapshot; stale evaluation cannot overwrite it */
    patch: operations['updateConsumption'];
    trace?: never;
  };
  '/api/v1/dashboard': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Today nutrition and 7-calendar-day recurring attention in account timezone */
    get: operations['getDashboard'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/examination-series': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Comparable chart series with measurement-date ordering */
    get: operations['getExaminationSeries'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/examinations': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List by measurement date/time, keeping comparable series separate */
    get: operations['listExaminations'];
    put?: never;
    /** Save measured result without diagnostic interpretation */
    post: operations['createExamination'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/examinations/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Read owned measured result */
    get: operations['getExamination'];
    put?: never;
    post?: never;
    /** Remove exam and recompute latest/series */
    delete: operations['deleteExamination'];
    options?: never;
    head?: never;
    /** Replace measured record with revision check */
    patch: operations['updateExamination'];
    trace?: never;
  };
  '/api/v1/legal': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get current terms/privacy/AI consent documents */
    get: operations['getLegalRegistry'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/me': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Curated verified account and preferences */
    get: operations['getMe'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /** Update account timezone */
    patch: operations['updateMe'];
    trace?: never;
  };
  '/api/v1/onboarding': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get current account onboarding completion state */
    get: operations['getOnboarding'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/onboarding/complete': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Mark current account onboarding complete */
    post: operations['completeOnboarding'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/photos': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Validate/normalize private photo for a new scan */
    post: operations['uploadPhoto'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/photos/{id}/view': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get authorized expiring photo view URL */
    get: operations['getPhotoView'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/profile': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get current health profile; empty profile version zero */
    get: operations['getProfile'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /** Replace profile fields with version check */
    patch: operations['updateProfile'];
    trace?: never;
  };
  '/api/v1/scans': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List retained scan history newest first */
    get: operations['listScans'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/scans/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Read scan references and current revision */
    get: operations['getScan'];
    put?: never;
    post?: never;
    /** Remove scan/photo, cancel jobs, preserve consumption snapshots */
    delete: operations['deleteScan'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/scans/{id}/corrections': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Queue corrected food/portion revision without another photo */
    post: operations['correctScan'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/health/live': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Process liveness */
    get: operations['getLiveness'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/health/ready': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** DB/schema readiness; AI degradation does not block core record APIs */
    get: operations['getReadiness'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/media/photos/{photoId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Stream private photo using short-lived backend-issued bearer grant
     * @description Public API origin, not a public MinIO endpoint. Token binds photo/user/environment/expiry. Recheck resource/account deletion before streaming. Invalid/expired/deleted grants return the same 404. No token query logging or persistent image caching.
     */
    get: operations['readSignedPhoto'];
    put?: never;
    post?: never;
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
    AccountDeletionAccepted: {
      /** Format: date-time */
      acceptedAt: string;
      /** @constant */
      accessRevoked: true;
      /** @enum {string} */
      status: 'deletion_pending';
    };
    AccountDeletionInput: {
      /** @enum {string} */
      confirmation: 'DELETE_MY_ACCOUNT';
      password: string;
    };
    /** @description Totals and coverage sum known per-component nutrients. Catalog nutrients are deterministic; model_estimate nutrients are per pictured portion for unmatched photo components only. supportStatus describes catalog matching, so unrecognized may include visual estimates while remaining insufficient for personal assessment. */
    ai__AnalysisResult: {
      attentions: components['schemas']['ai__Attention'][];
      catalogVersion: string;
      components: components['schemas']['ai__ComponentResult'][];
      /** Format: date-time */
      computedAt: string;
      contractVersion: components['schemas']['ai__ContractVersion'];
      coverage: components['schemas']['ai__NutrientCoverage'];
      /** @enum {string} */
      dataMode: 'real' | 'synthetic';
      /** @enum {string} */
      inputKind: 'photo' | 'manual' | 'correction';
      limitations: components['schemas']['ai__Limitation'][];
      nutritionDatasetVersion: string;
      /** Format: uuid */
      operationId: string;
      /** @enum {string} */
      overallAttention: 'considerable' | 'needs_attention' | 'insufficient_information';
      profileVersion: number;
      ruleSetVersion: string;
      sources: components['schemas']['ai__Source'][];
      /** @enum {string} */
      supportStatus: 'complete' | 'partial' | 'unrecognized';
      totals: components['schemas']['ai__Nutrients'];
    };
    ai__Attention: {
      adjustments: string[];
      componentIds: string[];
      conditionId: string;
      limitations: string[];
      reason: string;
      ruleId: string;
      sourceIds: string[];
    };
    ai__CatalogFood: {
      aliases: string[];
      catalogVersion: string;
      displayName: string;
      id: string;
      nutrientSourceIds: components['schemas']['ai__NutrientSources'];
      per100g: components['schemas']['ai__Nutrients'];
      preparation: string | null;
      servings: components['schemas']['ai__Serving'][];
      sources: components['schemas']['ai__Source'][];
    };
    ai__CatalogPage: {
      catalogVersion: string;
      items: components['schemas']['ai__CatalogFood'][];
      nextCursor: string | null;
    };
    ai__ComponentInput: {
      catalogFoodId: string | null;
      displayName: string;
      /** Format: uuid */
      id: string;
      portion: components['schemas']['ai__PortionInput'];
      preparation: string | null;
    };
    ai__ComponentResult: {
      catalogFoodId: string | null;
      displayName: string;
      /** Format: uuid */
      id: string;
      /** @enum {string} */
      matchStatus: 'matched' | 'unmatched' | 'unrecognized';
      nutrients: components['schemas']['ai__Nutrients'];
      nutrientSourceIds: components['schemas']['ai__NutrientSources'];
      per100g: components['schemas']['ai__Nutrients'];
      portion: components['schemas']['ai__PortionResult'];
      preparation: string | null;
      sourceIds: string[];
    };
    ai__Condition: {
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
    ai__ContractVersion: '2.0.0';
    ai__Error: {
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
    ai__Limitation: {
      code: string;
      componentIds: string[];
      critical: boolean;
      message: string;
    };
    ai__NutrientCoverage: {
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
    ai__Nutrients: {
      carbohydrateG: number | null;
      energyKcal: number | null;
      fatG: number | null;
      fiberG: number | null;
      proteinG: number | null;
      sodiumMg: number | null;
      sugarsG: number | null;
    };
    ai__NutrientSources: {
      carbohydrateG: string | null;
      energyKcal: string | null;
      fatG: string | null;
      fiberG: string | null;
      proteinG: string | null;
      sodiumMg: string | null;
      sugarsG: string | null;
    };
    ai__PortionInput:
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
    ai__PortionResult: {
      basis: string | null;
      grams: number | null;
      /** @enum {string} */
      origin: 'photo_estimate' | 'user_reported';
      quantity: number | null;
      servingId: string | null;
      sourceId: string | null;
      unit: ('g' | 'serving') | null;
    };
    ai__Serving: {
      grams: number;
      id: string;
      label: string;
      sourceId: string;
    };
    ai__Source: {
      datasetVersion: string;
      id: string;
      itemRef: string;
      /** @enum {string} */
      kind: 'nutrition' | 'portion' | 'health_rule' | 'synthetic' | 'model_estimate';
      title: string;
      url: string | null;
    };
    AnalysisJob: {
      attempts: number;
      /** Format: date-time */
      createdAt: string;
      error: {
        code: string;
        message: string;
        retryable: boolean;
      } | null;
      finishedAt: string | null;
      /** Format: uuid */
      id: string;
      /** @enum {string} */
      inputKind: 'photo' | 'manual' | 'correction';
      result: components['schemas']['ai__AnalysisResult'] | null;
      resultId: string | null;
      scanId: string | null;
      startedAt: string | null;
      /** @enum {string} */
      status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
      /** Format: uuid */
      targetId: string;
      targetRevision: number;
      /** @enum {string} */
      targetType: 'scan' | 'consumption';
    };
    ConsentUpdate: {
      granted: boolean;
      version: string;
    };
    Consumption: {
      attentionJobId: string | null;
      /** @enum {string} */
      attentionState: 'not_requested' | 'pending' | 'available' | 'failed';
      /** Format: date-time */
      consumedAt: string;
      /** Format: date-time */
      createdAt: string;
      /** Format: uuid */
      id: string;
      photoAvailable: boolean;
      revision: number;
      scanId: string | null;
      snapshot: components['schemas']['ConsumptionSnapshot'];
      /** @enum {string} */
      source: 'manual' | 'photo_confirmation';
      sourceAnalysisResultId: string | null;
      timezone: string;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @description Consumption input. photoPortionFraction is required only when an unchanged unmatched photo estimate cannot be scaled from known gram values; 1 means the full pictured portion. */
    ConsumptionComponentInput: {
      catalogFoodId: string | null;
      displayName: string;
      /** Format: uuid */
      id: string;
      /** @description Fraction of the pictured photo estimate consumed, used only when source and actual grams are not both known. */
      photoPortionFraction?: number;
      portion: components['schemas']['ai__PortionInput'];
      preparation: string | null;
    };
    ConsumptionCreate: {
      /** @description Immutable catalog version used for food/serving selection. Corrections use the source result version. 'unavailable' allowed only for manual unmatched input with no catalog. */
      catalogVersion: string;
      components: components['schemas']['ConsumptionComponentInput'][];
      /** Format: date-time */
      consumedAt: string;
      /** @enum {string} */
      occurrence: 'default_confirmation' | 'new_occurrence';
      scanId: string | null;
      /** @enum {string} */
      source: 'manual' | 'photo_confirmation';
      sourceAnalysisResultId: string | null;
      timezone: string;
    };
    ConsumptionPage: {
      items: components['schemas']['Consumption'][];
      nextCursor: string | null;
    };
    /** @description Immutable nutrition snapshot for a consumption. dataMode=unavailable is reserved for unmatched manual inputs with null nutrition and an explicit limitation; it is not an AI-service result mode. */
    ConsumptionSnapshot: {
      attentions: components['schemas']['ai__Attention'][];
      catalogVersion: string;
      components: components['schemas']['ai__ComponentResult'][];
      /** Format: date-time */
      computedAt: string;
      contractVersion: components['schemas']['ai__ContractVersion'];
      coverage: components['schemas']['ai__NutrientCoverage'];
      /**
       * @description unavailable is app-only and allowed only for unmatched manual input with null nutrients and a limitation.
       * @enum {string}
       */
      dataMode: 'real' | 'synthetic' | 'unavailable';
      /** @enum {string} */
      inputKind: 'photo' | 'manual' | 'correction';
      limitations: components['schemas']['ai__Limitation'][];
      nutritionDatasetVersion: string;
      /** Format: uuid */
      operationId: string;
      /** @enum {string} */
      overallAttention: 'considerable' | 'needs_attention' | 'insufficient_information';
      /** @description Optional immutable scale factors used to adapt original photo estimates to consumed portions. */
      photoPortionScales?: {
        /** Format: uuid */
        componentId: string;
        factor: number;
        sourceGrams: number | null;
      }[];
      profileVersion: number;
      ruleSetVersion: string;
      sources: components['schemas']['ai__Source'][];
      /** @enum {string} */
      supportStatus: 'complete' | 'partial' | 'unrecognized';
      totals: components['schemas']['ai__Nutrients'];
    };
    ConsumptionUpdate: {
      /** @description Immutable catalog version used for food/serving selection. Corrections use the source result version. 'unavailable' allowed only for manual unmatched input with no catalog. */
      catalogVersion: string;
      components: components['schemas']['ConsumptionComponentInput'][];
      /** Format: date-time */
      consumedAt: string;
      expectedRevision: number;
      timezone: string;
    };
    CorrectionInput: {
      /** Format: uuid */
      basedOnResultId: string;
      /** @description Immutable catalog version used for food/serving selection. Corrections use the source result version. 'unavailable' allowed only for manual unmatched input with no catalog. */
      catalogVersion: string;
      components: components['schemas']['ai__ComponentInput'][];
      expectedRevision: number;
    };
    CreateAnalysisJob: {
      /** Format: uuid */
      photoId: string;
    };
    Dashboard: {
      attentionWindow: {
        /** Format: date */
        endDate: string;
        /** Format: date */
        startDate: string;
      };
      componentCount: number;
      /** Format: date-time */
      computedAt: string;
      consumptionCount: number;
      consumptionWindow: {
        /** Format: date-time */
        endAt: string;
        /** Format: date-time */
        startAt: string;
      };
      coverage: components['schemas']['ai__NutrientCoverage'];
      /** Format: date */
      date: string;
      latestExaminations: components['schemas']['Examination'][];
      nextActions: {
        code: string;
        label: string;
        target: string;
      }[];
      profileMissingFields: string[];
      recurringAttentions: components['schemas']['RecurringAttention'][];
      timezone: string;
      totals: components['schemas']['ai__Nutrients'];
    };
    Examination: {
      /** Format: date-time */
      createdAt: string;
      /** Format: uuid */
      id: string;
      record: components['schemas']['ExaminationInput'];
      revision: number;
      /** Format: date-time */
      updatedAt: string;
    };
    ExaminationInput:
      | {
          diastolic: number;
          /** Format: date */
          measuredOn: string;
          measuredTime: string | null;
          note: string | null;
          systolic: number;
          timezone: string;
          /** @enum {string} */
          type: 'pressure';
          /** @enum {string} */
          unit: 'mmHg';
        }
      | {
          /** @enum {string} */
          context: 'fasting' | 'random' | 'post_meal' | 'unknown';
          /** Format: date */
          measuredOn: string;
          measuredTime: string | null;
          note: string | null;
          timezone: string;
          /** @enum {string} */
          type: 'glucose';
          /** @enum {string} */
          unit: 'mg/dL';
          value: number;
        }
      | {
          /** Format: date */
          measuredOn: string;
          measuredTime: string | null;
          note: string | null;
          /** @enum {string} */
          subtype: 'total' | 'ldl' | 'hdl';
          timezone: string;
          /** @enum {string} */
          type: 'cholesterol';
          /** @enum {string} */
          unit: 'mg/dL';
          value: number;
        };
    ExaminationPage: {
      items: components['schemas']['Examination'][];
      nextCursor: string | null;
    };
    ExaminationUpdate: {
      expectedRevision: number;
      record: components['schemas']['ExaminationInput'];
    };
    ExamSeries: {
      items: components['schemas']['Examination'][];
      key: string;
      label: string;
      latestExaminationId: string | null;
      /** @enum {string} */
      unit: 'mmHg' | 'mg/dL';
    };
    Health: {
      /** Format: uuid */
      requestId: string;
      /** @enum {string} */
      status: 'ok' | 'degraded';
    };
    LegalDocument: {
      contentMarkdown: string;
      /** Format: date-time */
      effectiveAt: string;
      title: string;
      version: string;
    };
    LegalRegistry: {
      aiProcessing: components['schemas']['LegalDocument'];
      privacy: components['schemas']['LegalDocument'];
      terms: components['schemas']['LegalDocument'];
    };
    Me: {
      acceptedPrivacyVersion: string;
      acceptedTermsVersion: string;
      aiConsent: {
        granted: boolean;
        updatedAt: string | null;
        version: string | null;
      };
      /** Format: date */
      birthDate: string;
      /** Format: email */
      email: string;
      /** @constant */
      emailVerified: true;
      /** Format: uuid */
      id: string;
      name: string;
      settingsRevision: number;
      timezone: string;
    };
    MeUpdate: {
      expectedRevision: number;
      timezone: string;
    };
    OnboardingState: {
      completedAt: string | null;
    };
    Photo: {
      /** Format: date-time */
      createdAt: string;
      height: number;
      /** Format: uuid */
      id: string;
      /** @enum {string} */
      mimeType: 'image/jpeg' | 'image/png';
      sizeBytes: number;
      width: number;
    };
    PhotoView: {
      /** Format: date-time */
      expiresAt: string;
      /** Format: uri */
      url: string;
    };
    Profile: {
      fields: {
        activity: ('sedentary' | 'light' | 'moderate' | 'high') | null;
        allergies: {
          entries: string[];
          /** @enum {string} */
          state: 'not_provided' | 'unknown' | 'none_known' | 'reported';
        };
        clinicianNotes: string | null;
        diagnoses: {
          entries: {
            conditionId: string | null;
            /** Format: uuid */
            id: string;
            label: string;
          }[];
          /** @enum {string} */
          state: 'not_provided' | 'none_known' | 'never_examined' | 'reported';
        };
        familyHistory: {
          entries: {
            conditionId: string | null;
            label: string;
            relation: string | null;
          }[];
          /** @enum {string} */
          state: 'not_provided' | 'unknown' | 'none_known' | 'reported';
        };
        heightCm: number | null;
        sexForReference: ('female' | 'male') | null;
        smoking: ('never' | 'former' | 'current') | null;
        weightKg: number | null;
      };
      personalization: {
        missingFields: string[];
        unsupportedConditions: string[];
      };
      updatedAt: string | null;
      version: number;
    };
    ProfileUpdate: {
      expectedVersion: number;
      fields: {
        activity: ('sedentary' | 'light' | 'moderate' | 'high') | null;
        allergies: {
          entries: string[];
          /** @enum {string} */
          state: 'not_provided' | 'unknown' | 'none_known' | 'reported';
        };
        clinicianNotes: string | null;
        diagnoses: {
          entries: {
            conditionId: string | null;
            /** Format: uuid */
            id: string;
            label: string;
          }[];
          /** @enum {string} */
          state: 'not_provided' | 'none_known' | 'never_examined' | 'reported';
        };
        familyHistory: {
          entries: {
            conditionId: string | null;
            label: string;
            relation: string | null;
          }[];
          /** @enum {string} */
          state: 'not_provided' | 'unknown' | 'none_known' | 'reported';
        };
        heightCm: number | null;
        sexForReference: ('female' | 'male') | null;
        smoking: ('never' | 'former' | 'current') | null;
        weightKg: number | null;
      };
    };
    RecurringAttention: {
      conditionId: string;
      consumptionIds: string[];
      count: number;
      ruleId: string;
    };
    Scan: {
      /** Format: date-time */
      createdAt: string;
      defaultConsumptionId: string | null;
      /** Format: uuid */
      id: string;
      /** Format: uuid */
      latestJobId: string;
      latestResultId: string | null;
      photoId: string | null;
      revision: number;
    };
    ScanPage: {
      items: components['schemas']['Scan'][];
      nextCursor: string | null;
    };
  };
  responses: {
    /** @description Carin error envelope. See domain spec for code-specific semantics. */
    Error: {
      headers: {
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['ai__Error'];
      };
    };
    /** @description Carin error envelope. See domain spec for code-specific semantics. */
    TooManyRequests: {
      headers: {
        /** @description Retry delay seconds */
        'Retry-After'?: number;
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['ai__Error'];
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
  deleteAccount: {
    parameters: {
      query?: never;
      header: {
        /** @description Stable for retry of the same action. Same key/different payload is 409; retention 24h. */
        'Idempotency-Key': string;
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['AccountDeletionInput'];
      };
    };
    responses: {
      /** @description Successful response */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AccountDeletionAccepted'];
        };
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      403: components['responses']['Error'];
      404: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  createPhotoAnalysis: {
    parameters: {
      query?: never;
      header: {
        /** @description Stable for retry of the same action. Same key/different payload is 409; retention 24h. */
        'Idempotency-Key': string;
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateAnalysisJob'];
      };
    };
    responses: {
      /** @description Successful response */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AnalysisJob'];
        };
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      403: components['responses']['Error'];
      404: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  getAnalysisJob: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AnalysisJob'];
        };
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      403: components['responses']['Error'];
      404: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  retryAnalysisJob: {
    parameters: {
      query?: never;
      header: {
        /** @description Stable for retry of the same action. Same key/different payload is 409; retention 24h. */
        'Idempotency-Key': string;
      };
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful response */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AnalysisJob'];
        };
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      403: components['responses']['Error'];
      404: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  getAnalysisResult: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ai__AnalysisResult'];
        };
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      403: components['responses']['Error'];
      404: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  getConditions: {
    parameters: {
      query?: {
        q?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ai__Condition'][];
        };
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      403: components['responses']['Error'];
      404: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  searchFoods: {
    parameters: {
      query?: {
        cursor?: string;
        limit?: number;
        q?: string;
        /** @description Omit for current imported version; request a frozen version for an existing draft/correction. */
        version?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ai__CatalogPage'];
        };
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      403: components['responses']['Error'];
      404: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  setAiConsent: {
    parameters: {
      query?: never;
      header: {
        /** @description Stable for retry of the same action. Same key/different payload is 409; retention 24h. */
        'Idempotency-Key': string;
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ConsentUpdate'];
      };
    };
    responses: {
      /** @description Successful response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Me'];
        };
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      403: components['responses']['Error'];
      404: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  listConsumptions: {
    parameters: {
      query?: {
        cursor?: string;
        from?: string;
        limit?: number;
        to?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ConsumptionPage'];
        };
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      403: components['responses']['Error'];
      404: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  createConsumption: {
    parameters: {
      query?: never;
      header: {
        /** @description Stable for retry of the same action. Same key/different payload is 409; retention 24h. */
        'Idempotency-Key': string;
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ConsumptionCreate'];
      };
    };
    responses: {
      /** @description Existing default confirmation returned for an identical request with a new idempotency key. Same-key replay returns original status/body. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Consumption'];
        };
      };
      /** @description Successful response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Consumption'];
        };
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      403: components['responses']['Error'];
      404: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  getConsumption: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Consumption'];
        };
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      403: components['responses']['Error'];
      404: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  deleteConsumption: {
    parameters: {
      query?: never;
      header: {
        /** @description Stable for retry of the same action. Same key/different payload is 409; retention 24h. */
        'Idempotency-Key': string;
      };
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Deleted/removed from current view */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      403: components['responses']['Error'];
      404: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  updateConsumption: {
    parameters: {
      query?: never;
      header: {
        /** @description Stable for retry of the same action. Same key/different payload is 409; retention 24h. */
        'Idempotency-Key': string;
      };
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ConsumptionUpdate'];
      };
    };
    responses: {
      /** @description Successful response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Consumption'];
        };
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      403: components['responses']['Error'];
      404: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  getDashboard: {
    parameters: {
      query?: {
        /** @description Default today in account timezone */
        date?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Dashboard'];
        };
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      403: components['responses']['Error'];
      404: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  getExaminationSeries: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Series separated by type/context/subtype/unit */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ExamSeries'][];
        };
      };
      401: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  listExaminations: {
    parameters: {
      query?: {
        cursor?: string;
        limit?: number;
        seriesKey?: string;
        type?: 'pressure' | 'glucose' | 'cholesterol';
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ExaminationPage'];
        };
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      403: components['responses']['Error'];
      404: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  createExamination: {
    parameters: {
      query?: never;
      header: {
        /** @description Stable for retry of the same action. Same key/different payload is 409; retention 24h. */
        'Idempotency-Key': string;
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ExaminationInput'];
      };
    };
    responses: {
      /** @description Successful response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Examination'];
        };
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      403: components['responses']['Error'];
      404: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  getExamination: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Examination'];
        };
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      403: components['responses']['Error'];
      404: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  deleteExamination: {
    parameters: {
      query?: never;
      header: {
        /** @description Stable for retry of the same action. Same key/different payload is 409; retention 24h. */
        'Idempotency-Key': string;
      };
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Deleted/removed from current view */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      403: components['responses']['Error'];
      404: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  updateExamination: {
    parameters: {
      query?: never;
      header: {
        /** @description Stable for retry of the same action. Same key/different payload is 409; retention 24h. */
        'Idempotency-Key': string;
      };
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ExaminationUpdate'];
      };
    };
    responses: {
      /** @description Successful response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Examination'];
        };
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      403: components['responses']['Error'];
      404: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  getLegalRegistry: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['LegalRegistry'];
        };
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      403: components['responses']['Error'];
      404: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  getMe: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Me'];
        };
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      403: components['responses']['Error'];
      404: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  updateMe: {
    parameters: {
      query?: never;
      header: {
        /** @description Stable for retry of the same action. Same key/different payload is 409; retention 24h. */
        'Idempotency-Key': string;
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['MeUpdate'];
      };
    };
    responses: {
      /** @description Successful response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Me'];
        };
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      403: components['responses']['Error'];
      404: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  getOnboarding: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OnboardingState'];
        };
      };
      401: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  completeOnboarding: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OnboardingState'];
        };
      };
      401: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  uploadPhoto: {
    parameters: {
      query?: never;
      header: {
        /** @description Stable for retry of the same action. Same key/different payload is 409; retention 24h. */
        'Idempotency-Key': string;
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'multipart/form-data': {
          /** Format: binary */
          file: Blob;
        };
      };
    };
    responses: {
      /** @description Successful response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Photo'];
        };
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      403: components['responses']['Error'];
      404: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  getPhotoView: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PhotoView'];
        };
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      403: components['responses']['Error'];
      404: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  getProfile: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Profile'];
        };
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      403: components['responses']['Error'];
      404: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  updateProfile: {
    parameters: {
      query?: never;
      header: {
        /** @description Stable for retry of the same action. Same key/different payload is 409; retention 24h. */
        'Idempotency-Key': string;
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ProfileUpdate'];
      };
    };
    responses: {
      /** @description Successful response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Profile'];
        };
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      403: components['responses']['Error'];
      404: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  listScans: {
    parameters: {
      query?: {
        cursor?: string;
        limit?: number;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ScanPage'];
        };
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      403: components['responses']['Error'];
      404: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  getScan: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Scan'];
        };
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      403: components['responses']['Error'];
      404: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  deleteScan: {
    parameters: {
      query?: never;
      header: {
        /** @description Stable for retry of the same action. Same key/different payload is 409; retention 24h. */
        'Idempotency-Key': string;
      };
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Deleted/removed from current view */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      403: components['responses']['Error'];
      404: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  correctScan: {
    parameters: {
      query?: never;
      header: {
        /** @description Stable for retry of the same action. Same key/different payload is 409; retention 24h. */
        'Idempotency-Key': string;
      };
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CorrectionInput'];
      };
    };
    responses: {
      /** @description Successful response */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AnalysisJob'];
        };
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      403: components['responses']['Error'];
      404: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  getLiveness: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Health'];
        };
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      403: components['responses']['Error'];
      404: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  getReadiness: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Health'];
        };
      };
      400: components['responses']['Error'];
      401: components['responses']['Error'];
      403: components['responses']['Error'];
      404: components['responses']['Error'];
      409: components['responses']['Error'];
      422: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
  readSignedPhoto: {
    parameters: {
      query: {
        token: string;
      };
      header?: never;
      path: {
        photoId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Normalized photo bytes */
      200: {
        headers: {
          'Cache-Control'?: 'private, no-store';
          [name: string]: unknown;
        };
        content: {
          'image/jpeg': Blob;
          'image/png': Blob;
        };
      };
      404: components['responses']['Error'];
      429: components['responses']['TooManyRequests'];
      503: components['responses']['Error'];
      default: components['responses']['Error'];
    };
  };
}
