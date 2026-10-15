// Generated from specs/contracts/. Do not edit; run pnpm contracts:generate in carin-app.
export const contracts = {
  operations: {
    'ai.analyzePhoto': {
      method: 'post',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
      },
      path: '/internal/v1/analyses',
      request: {
        content: {
          'application/json': {
            $ref: '#/$defs/ai.PhotoAnalysisRequest',
          },
        },
        required: true,
      },
      responses: {
        '200': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.AnalysisResult',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'ai.getCapabilities': {
      method: 'get',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
      },
      path: '/internal/v1/capabilities',
      request: null,
      responses: {
        '200': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.CapabilityManifest',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'ai.getCatalog': {
      method: 'get',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {
            cursor: {
              maxLength: 500,
              minLength: 1,
              type: 'string',
            },
            limit: {
              default: 100,
              maximum: 200,
              minimum: 1,
              type: 'integer',
            },
            version: {
              maxLength: 500,
              minLength: 1,
              type: 'string',
            },
          },
          required: ['version'],
          type: 'object',
        },
      },
      path: '/internal/v1/catalog',
      request: null,
      responses: {
        '200': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.CatalogPage',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'ai.recalculateComponents': {
      method: 'post',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
      },
      path: '/internal/v1/recalculations',
      request: {
        content: {
          'application/json': {
            $ref: '#/$defs/ai.RecalculationRequest',
          },
        },
        required: true,
      },
      responses: {
        '200': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.AnalysisResult',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.completeOnboarding': {
      method: 'post',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/onboarding/complete',
      request: null,
      responses: {
        '200': {
          content: {
            'application/json': {
              $ref: '#/$defs/app.OnboardingState',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.correctScan': {
      method: 'post',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {
            'idempotency-key': {
              format: 'uuid',
              type: 'string',
            },
          },
          required: ['idempotency-key'],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {
            id: {
              format: 'uuid',
              type: 'string',
            },
          },
          required: ['id'],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/scans/{id}/corrections',
      request: {
        content: {
          'application/json': {
            $ref: '#/$defs/app.CorrectionInput',
          },
        },
        required: true,
      },
      responses: {
        '202': {
          content: {
            'application/json': {
              $ref: '#/$defs/app.AnalysisJob',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '403': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.createConsumption': {
      method: 'post',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {
            'idempotency-key': {
              format: 'uuid',
              type: 'string',
            },
          },
          required: ['idempotency-key'],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/consumptions',
      request: {
        content: {
          'application/json': {
            $ref: '#/$defs/app.ConsumptionCreate',
          },
        },
        required: true,
      },
      responses: {
        '200': {
          content: {
            'application/json': {
              $ref: '#/$defs/app.Consumption',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '201': {
          content: {
            'application/json': {
              $ref: '#/$defs/app.Consumption',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '403': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.createExamination': {
      method: 'post',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {
            'idempotency-key': {
              format: 'uuid',
              type: 'string',
            },
          },
          required: ['idempotency-key'],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/examinations',
      request: {
        content: {
          'application/json': {
            $ref: '#/$defs/app.ExaminationInput',
          },
        },
        required: true,
      },
      responses: {
        '201': {
          content: {
            'application/json': {
              $ref: '#/$defs/app.Examination',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '403': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.createPhotoAnalysis': {
      method: 'post',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {
            'idempotency-key': {
              format: 'uuid',
              type: 'string',
            },
          },
          required: ['idempotency-key'],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/analysis-jobs',
      request: {
        content: {
          'application/json': {
            $ref: '#/$defs/app.CreateAnalysisJob',
          },
        },
        required: true,
      },
      responses: {
        '202': {
          content: {
            'application/json': {
              $ref: '#/$defs/app.AnalysisJob',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '403': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.deleteAccount': {
      method: 'post',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {
            'idempotency-key': {
              format: 'uuid',
              type: 'string',
            },
          },
          required: ['idempotency-key'],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/account-deletion',
      request: {
        content: {
          'application/json': {
            $ref: '#/$defs/app.AccountDeletionInput',
          },
        },
        required: true,
      },
      responses: {
        '202': {
          content: {
            'application/json': {
              $ref: '#/$defs/app.AccountDeletionAccepted',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '403': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.deleteConsumption': {
      method: 'delete',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {
            'idempotency-key': {
              format: 'uuid',
              type: 'string',
            },
          },
          required: ['idempotency-key'],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {
            id: {
              format: 'uuid',
              type: 'string',
            },
          },
          required: ['id'],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/consumptions/{id}',
      request: null,
      responses: {
        '204': {
          content: {},
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '403': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.deleteExamination': {
      method: 'delete',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {
            'idempotency-key': {
              format: 'uuid',
              type: 'string',
            },
          },
          required: ['idempotency-key'],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {
            id: {
              format: 'uuid',
              type: 'string',
            },
          },
          required: ['id'],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/examinations/{id}',
      request: null,
      responses: {
        '204': {
          content: {},
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '403': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.deleteScan': {
      method: 'delete',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {
            'idempotency-key': {
              format: 'uuid',
              type: 'string',
            },
          },
          required: ['idempotency-key'],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {
            id: {
              format: 'uuid',
              type: 'string',
            },
          },
          required: ['id'],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/scans/{id}',
      request: null,
      responses: {
        '204': {
          content: {},
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '403': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.getAnalysisJob': {
      method: 'get',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {
            id: {
              format: 'uuid',
              type: 'string',
            },
          },
          required: ['id'],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/analysis-jobs/{id}',
      request: null,
      responses: {
        '200': {
          content: {
            'application/json': {
              $ref: '#/$defs/app.AnalysisJob',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '403': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.getAnalysisResult': {
      method: 'get',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {
            id: {
              format: 'uuid',
              type: 'string',
            },
          },
          required: ['id'],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/analysis-results/{id}',
      request: null,
      responses: {
        '200': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.AnalysisResult',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '403': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.getConditions': {
      method: 'get',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {
            q: {
              maxLength: 200,
              type: 'string',
            },
          },
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/catalog/conditions',
      request: null,
      responses: {
        '200': {
          content: {
            'application/json': {
              items: {
                $ref: '#/$defs/ai.Condition',
              },
              type: 'array',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '403': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.getConsumption': {
      method: 'get',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {
            id: {
              format: 'uuid',
              type: 'string',
            },
          },
          required: ['id'],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/consumptions/{id}',
      request: null,
      responses: {
        '200': {
          content: {
            'application/json': {
              $ref: '#/$defs/app.Consumption',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '403': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.getDashboard': {
      method: 'get',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {
            date: {
              format: 'date',
              type: 'string',
            },
          },
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/dashboard',
      request: null,
      responses: {
        '200': {
          content: {
            'application/json': {
              $ref: '#/$defs/app.Dashboard',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '403': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.getExamination': {
      method: 'get',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {
            id: {
              format: 'uuid',
              type: 'string',
            },
          },
          required: ['id'],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/examinations/{id}',
      request: null,
      responses: {
        '200': {
          content: {
            'application/json': {
              $ref: '#/$defs/app.Examination',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '403': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.getExaminationSeries': {
      method: 'get',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/examination-series',
      request: null,
      responses: {
        '200': {
          content: {
            'application/json': {
              items: {
                $ref: '#/$defs/app.ExamSeries',
              },
              type: 'array',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.getLegalRegistry': {
      method: 'get',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/legal',
      request: null,
      responses: {
        '200': {
          content: {
            'application/json': {
              $ref: '#/$defs/app.LegalRegistry',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '403': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.getLiveness': {
      method: 'get',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
      },
      path: '/health/live',
      request: null,
      responses: {
        '200': {
          content: {
            'application/json': {
              $ref: '#/$defs/app.Health',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '403': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.getMe': {
      method: 'get',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/me',
      request: null,
      responses: {
        '200': {
          content: {
            'application/json': {
              $ref: '#/$defs/app.Me',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '403': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.getOnboarding': {
      method: 'get',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/onboarding',
      request: null,
      responses: {
        '200': {
          content: {
            'application/json': {
              $ref: '#/$defs/app.OnboardingState',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.getPhotoView': {
      method: 'get',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {
            id: {
              format: 'uuid',
              type: 'string',
            },
          },
          required: ['id'],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/photos/{id}/view',
      request: null,
      responses: {
        '200': {
          content: {
            'application/json': {
              $ref: '#/$defs/app.PhotoView',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '403': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.getProfile': {
      method: 'get',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/profile',
      request: null,
      responses: {
        '200': {
          content: {
            'application/json': {
              $ref: '#/$defs/app.Profile',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '403': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.getReadiness': {
      method: 'get',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
      },
      path: '/health/ready',
      request: null,
      responses: {
        '200': {
          content: {
            'application/json': {
              $ref: '#/$defs/app.Health',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '403': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.getScan': {
      method: 'get',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {
            id: {
              format: 'uuid',
              type: 'string',
            },
          },
          required: ['id'],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/scans/{id}',
      request: null,
      responses: {
        '200': {
          content: {
            'application/json': {
              $ref: '#/$defs/app.Scan',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '403': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.listConsumptions': {
      method: 'get',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {
            cursor: {
              maxLength: 500,
              minLength: 1,
              type: 'string',
            },
            from: {
              format: 'date-time',
              type: 'string',
            },
            limit: {
              default: 30,
              maximum: 100,
              minimum: 1,
              type: 'integer',
            },
            to: {
              format: 'date-time',
              type: 'string',
            },
          },
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/consumptions',
      request: null,
      responses: {
        '200': {
          content: {
            'application/json': {
              $ref: '#/$defs/app.ConsumptionPage',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '403': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.listExaminations': {
      method: 'get',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {
            cursor: {
              maxLength: 500,
              minLength: 1,
              type: 'string',
            },
            limit: {
              default: 30,
              maximum: 100,
              minimum: 1,
              type: 'integer',
            },
            seriesKey: {
              maxLength: 500,
              minLength: 1,
              type: 'string',
            },
            type: {
              enum: ['pressure', 'glucose', 'cholesterol'],
              type: 'string',
            },
          },
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/examinations',
      request: null,
      responses: {
        '200': {
          content: {
            'application/json': {
              $ref: '#/$defs/app.ExaminationPage',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '403': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.listScans': {
      method: 'get',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {
            cursor: {
              maxLength: 500,
              minLength: 1,
              type: 'string',
            },
            limit: {
              default: 30,
              maximum: 100,
              minimum: 1,
              type: 'integer',
            },
          },
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/scans',
      request: null,
      responses: {
        '200': {
          content: {
            'application/json': {
              $ref: '#/$defs/app.ScanPage',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '403': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.readSignedPhoto': {
      method: 'get',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {
            photoId: {
              format: 'uuid',
              type: 'string',
            },
          },
          required: ['photoId'],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {
            token: {
              maxLength: 4096,
              minLength: 1,
              type: 'string',
            },
          },
          required: ['token'],
          type: 'object',
        },
      },
      path: '/media/photos/{photoId}',
      request: null,
      responses: {
        '200': {
          content: {
            'image/jpeg': {
              format: 'binary',
              type: 'string',
            },
            'image/png': {
              format: 'binary',
              type: 'string',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'cache-control': {
                const: 'private, no-store',
                type: 'string',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.retryAnalysisJob': {
      method: 'post',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {
            'idempotency-key': {
              format: 'uuid',
              type: 'string',
            },
          },
          required: ['idempotency-key'],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {
            id: {
              format: 'uuid',
              type: 'string',
            },
          },
          required: ['id'],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/analysis-jobs/{id}/retry',
      request: null,
      responses: {
        '202': {
          content: {
            'application/json': {
              $ref: '#/$defs/app.AnalysisJob',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '403': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.searchFoods': {
      method: 'get',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {
            cursor: {
              maxLength: 500,
              minLength: 1,
              type: 'string',
            },
            limit: {
              default: 30,
              maximum: 100,
              minimum: 1,
              type: 'integer',
            },
            q: {
              maxLength: 200,
              type: 'string',
            },
            version: {
              maxLength: 500,
              minLength: 1,
              type: 'string',
            },
          },
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/catalog/foods',
      request: null,
      responses: {
        '200': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.CatalogPage',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '403': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.setAiConsent': {
      method: 'put',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {
            'idempotency-key': {
              format: 'uuid',
              type: 'string',
            },
          },
          required: ['idempotency-key'],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/consents/ai-processing',
      request: {
        content: {
          'application/json': {
            $ref: '#/$defs/app.ConsentUpdate',
          },
        },
        required: true,
      },
      responses: {
        '200': {
          content: {
            'application/json': {
              $ref: '#/$defs/app.Me',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '403': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.updateConsumption': {
      method: 'patch',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {
            'idempotency-key': {
              format: 'uuid',
              type: 'string',
            },
          },
          required: ['idempotency-key'],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {
            id: {
              format: 'uuid',
              type: 'string',
            },
          },
          required: ['id'],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/consumptions/{id}',
      request: {
        content: {
          'application/json': {
            $ref: '#/$defs/app.ConsumptionUpdate',
          },
        },
        required: true,
      },
      responses: {
        '200': {
          content: {
            'application/json': {
              $ref: '#/$defs/app.Consumption',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '403': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.updateExamination': {
      method: 'patch',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {
            'idempotency-key': {
              format: 'uuid',
              type: 'string',
            },
          },
          required: ['idempotency-key'],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {
            id: {
              format: 'uuid',
              type: 'string',
            },
          },
          required: ['id'],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/examinations/{id}',
      request: {
        content: {
          'application/json': {
            $ref: '#/$defs/app.ExaminationUpdate',
          },
        },
        required: true,
      },
      responses: {
        '200': {
          content: {
            'application/json': {
              $ref: '#/$defs/app.Examination',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '403': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.updateMe': {
      method: 'patch',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {
            'idempotency-key': {
              format: 'uuid',
              type: 'string',
            },
          },
          required: ['idempotency-key'],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/me',
      request: {
        content: {
          'application/json': {
            $ref: '#/$defs/app.MeUpdate',
          },
        },
        required: true,
      },
      responses: {
        '200': {
          content: {
            'application/json': {
              $ref: '#/$defs/app.Me',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '403': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.updateProfile': {
      method: 'patch',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {
            'idempotency-key': {
              format: 'uuid',
              type: 'string',
            },
          },
          required: ['idempotency-key'],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/profile',
      request: {
        content: {
          'application/json': {
            $ref: '#/$defs/app.ProfileUpdate',
          },
        },
        required: true,
      },
      responses: {
        '200': {
          content: {
            'application/json': {
              $ref: '#/$defs/app.Profile',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '403': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
    'app.uploadPhoto': {
      method: 'post',
      parameters: {
        header: {
          additionalProperties: false,
          properties: {
            'idempotency-key': {
              format: 'uuid',
              type: 'string',
            },
          },
          required: ['idempotency-key'],
          type: 'object',
        },
        path: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
        query: {
          additionalProperties: false,
          properties: {},
          required: [],
          type: 'object',
        },
      },
      path: '/api/v1/photos',
      request: {
        content: {
          'multipart/form-data': {
            additionalProperties: false,
            properties: {
              file: {
                format: 'binary',
                type: 'string',
              },
            },
            required: ['file'],
            type: 'object',
          },
        },
        required: true,
      },
      responses: {
        '201': {
          content: {
            'application/json': {
              $ref: '#/$defs/app.Photo',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '400': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '401': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '403': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '404': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '409': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '422': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        '429': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {
              'retry-after': {
                minimum: 1,
                type: 'integer',
              },
            },
            required: [],
            type: 'object',
          },
        },
        '503': {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
        default: {
          content: {
            'application/json': {
              $ref: '#/$defs/ai.Error',
            },
          },
          headers: {
            additionalProperties: false,
            properties: {},
            required: [],
            type: 'object',
          },
        },
      },
    },
  },
  schema: {
    $defs: {
      'ai.AnalysisResult': {
        additionalProperties: false,
        properties: {
          attentions: {
            items: {
              $ref: '#/$defs/ai.Attention',
            },
            type: 'array',
          },
          catalogVersion: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          components: {
            items: {
              $ref: '#/$defs/ai.ComponentResult',
            },
            maxItems: 30,
            minItems: 1,
            type: 'array',
          },
          computedAt: {
            format: 'date-time',
            type: 'string',
          },
          contractVersion: {
            $ref: '#/$defs/ai.ContractVersion',
          },
          coverage: {
            $ref: '#/$defs/ai.NutrientCoverage',
          },
          dataMode: {
            enum: ['real', 'synthetic'],
            type: 'string',
          },
          inputKind: {
            enum: ['photo', 'manual', 'correction'],
            type: 'string',
          },
          limitations: {
            items: {
              $ref: '#/$defs/ai.Limitation',
            },
            type: 'array',
          },
          nutritionDatasetVersion: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          operationId: {
            format: 'uuid',
            type: 'string',
          },
          overallAttention: {
            enum: ['considerable', 'needs_attention', 'insufficient_information'],
            type: 'string',
          },
          profileVersion: {
            minimum: 0,
            type: 'integer',
          },
          ruleSetVersion: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          sources: {
            items: {
              $ref: '#/$defs/ai.Source',
            },
            type: 'array',
          },
          supportStatus: {
            enum: ['complete', 'partial', 'unrecognized'],
            type: 'string',
          },
          totals: {
            $ref: '#/$defs/ai.Nutrients',
          },
        },
        required: [
          'contractVersion',
          'operationId',
          'inputKind',
          'supportStatus',
          'overallAttention',
          'profileVersion',
          'catalogVersion',
          'nutritionDatasetVersion',
          'ruleSetVersion',
          'computedAt',
          'components',
          'totals',
          'coverage',
          'attentions',
          'limitations',
          'sources',
          'dataMode',
        ],
        type: 'object',
      },
      'ai.Attention': {
        additionalProperties: false,
        properties: {
          adjustments: {
            items: {
              maxLength: 500,
              minLength: 1,
              type: 'string',
            },
            type: 'array',
          },
          componentIds: {
            items: {
              format: 'uuid',
              type: 'string',
            },
            minItems: 1,
            type: 'array',
            uniqueItems: true,
          },
          conditionId: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          limitations: {
            items: {
              maxLength: 500,
              minLength: 1,
              type: 'string',
            },
            type: 'array',
          },
          reason: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          ruleId: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          sourceIds: {
            items: {
              maxLength: 500,
              minLength: 1,
              type: 'string',
            },
            minItems: 1,
            type: 'array',
            uniqueItems: true,
          },
        },
        required: [
          'ruleId',
          'conditionId',
          'componentIds',
          'reason',
          'adjustments',
          'sourceIds',
          'limitations',
        ],
        type: 'object',
      },
      'ai.CapabilityManifest': {
        additionalProperties: false,
        properties: {
          catalogVersion: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          conditions: {
            items: {
              $ref: '#/$defs/ai.Condition',
            },
            type: 'array',
          },
          contractVersion: {
            $ref: '#/$defs/ai.ContractVersion',
          },
          dataMode: {
            enum: ['real', 'synthetic'],
            type: 'string',
          },
          nutrients: {
            items: {
              enum: [
                'energyKcal',
                'carbohydrateG',
                'proteinG',
                'fatG',
                'fiberG',
                'sugarsG',
                'sodiumMg',
              ],
              type: 'string',
            },
            type: 'array',
            uniqueItems: true,
          },
          nutritionDatasetVersion: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          publishedAt: {
            format: 'date-time',
            type: 'string',
          },
          ruleSetVersion: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          supportedPhotoFoodIds: {
            items: {
              maxLength: 500,
              minLength: 1,
              type: 'string',
            },
            type: 'array',
            uniqueItems: true,
          },
          supportedRules: {
            description:
              'Exact rule, supported-condition and citation-source authority for rule outputs. Omission declares no publishable health-rule claims.',
            items: {
              $ref: '#/$defs/ai.SupportedRule',
            },
            type: 'array',
            uniqueItems: true,
          },
        },
        required: [
          'contractVersion',
          'catalogVersion',
          'nutritionDatasetVersion',
          'ruleSetVersion',
          'conditions',
          'supportedPhotoFoodIds',
          'nutrients',
          'dataMode',
          'publishedAt',
        ],
        type: 'object',
      },
      'ai.CatalogFood': {
        additionalProperties: false,
        properties: {
          aliases: {
            items: {
              maxLength: 500,
              minLength: 1,
              type: 'string',
            },
            type: 'array',
          },
          catalogVersion: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          displayName: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          id: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          nutrientSourceIds: {
            $ref: '#/$defs/ai.NutrientSources',
          },
          per100g: {
            $ref: '#/$defs/ai.Nutrients',
          },
          preparation: {
            anyOf: [
              {
                maxLength: 500,
                minLength: 1,
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
          servings: {
            items: {
              $ref: '#/$defs/ai.Serving',
            },
            type: 'array',
          },
          sources: {
            items: {
              $ref: '#/$defs/ai.Source',
            },
            type: 'array',
          },
        },
        required: [
          'id',
          'catalogVersion',
          'displayName',
          'aliases',
          'preparation',
          'per100g',
          'servings',
          'sources',
          'nutrientSourceIds',
        ],
        type: 'object',
      },
      'ai.CatalogPage': {
        additionalProperties: false,
        properties: {
          catalogVersion: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          items: {
            items: {
              $ref: '#/$defs/ai.CatalogFood',
            },
            type: 'array',
          },
          nextCursor: {
            anyOf: [
              {
                maxLength: 500,
                minLength: 1,
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
        },
        required: ['catalogVersion', 'items', 'nextCursor'],
        type: 'object',
      },
      'ai.ComponentInput': {
        additionalProperties: false,
        properties: {
          catalogFoodId: {
            anyOf: [
              {
                maxLength: 500,
                minLength: 1,
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
          displayName: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          id: {
            format: 'uuid',
            type: 'string',
          },
          portion: {
            $ref: '#/$defs/ai.PortionInput',
          },
          preparation: {
            anyOf: [
              {
                maxLength: 500,
                minLength: 1,
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
        },
        required: ['id', 'displayName', 'catalogFoodId', 'preparation', 'portion'],
        type: 'object',
      },
      'ai.ComponentResult': {
        additionalProperties: false,
        properties: {
          catalogFoodId: {
            anyOf: [
              {
                maxLength: 500,
                minLength: 1,
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
          displayName: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          id: {
            format: 'uuid',
            type: 'string',
          },
          matchStatus: {
            enum: ['matched', 'unmatched', 'unrecognized'],
            type: 'string',
          },
          nutrientSourceIds: {
            $ref: '#/$defs/ai.NutrientSources',
          },
          nutrients: {
            $ref: '#/$defs/ai.Nutrients',
          },
          per100g: {
            $ref: '#/$defs/ai.Nutrients',
          },
          portion: {
            $ref: '#/$defs/ai.PortionResult',
          },
          preparation: {
            anyOf: [
              {
                maxLength: 500,
                minLength: 1,
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
          sourceIds: {
            items: {
              maxLength: 500,
              minLength: 1,
              type: 'string',
            },
            type: 'array',
            uniqueItems: true,
          },
        },
        required: [
          'id',
          'displayName',
          'catalogFoodId',
          'preparation',
          'matchStatus',
          'portion',
          'nutrients',
          'sourceIds',
          'nutrientSourceIds',
          'per100g',
        ],
        type: 'object',
      },
      'ai.Condition': {
        additionalProperties: false,
        properties: {
          displayName: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          id: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          personalizationSupported: {
            type: 'boolean',
          },
          requiredNutrients: {
            items: {
              enum: [
                'energyKcal',
                'carbohydrateG',
                'proteinG',
                'fatG',
                'fiberG',
                'sugarsG',
                'sodiumMg',
              ],
              type: 'string',
            },
            type: 'array',
          },
          requiredProfileFields: {
            items: {
              maxLength: 500,
              minLength: 1,
              type: 'string',
            },
            type: 'array',
          },
          supportedAgeMaximum: {
            anyOf: [
              {
                minimum: 0,
                type: 'integer',
              },
              {
                type: 'null',
              },
            ],
          },
          supportedAgeMinimum: {
            anyOf: [
              {
                minimum: 0,
                type: 'integer',
              },
              {
                type: 'null',
              },
            ],
          },
        },
        required: [
          'id',
          'displayName',
          'personalizationSupported',
          'requiredProfileFields',
          'requiredNutrients',
          'supportedAgeMinimum',
          'supportedAgeMaximum',
        ],
        type: 'object',
      },
      'ai.ContractVersion': {
        enum: ['1.0.0'],
        type: 'string',
      },
      'ai.Error': {
        additionalProperties: false,
        properties: {
          error: {
            additionalProperties: false,
            properties: {
              code: {
                maxLength: 500,
                minLength: 1,
                type: 'string',
              },
              details: {
                additionalProperties: true,
                properties: {},
                required: [],
                type: 'object',
              },
              message: {
                maxLength: 500,
                minLength: 1,
                type: 'string',
              },
              requestId: {
                format: 'uuid',
                type: 'string',
              },
              retryable: {
                type: 'boolean',
              },
            },
            required: ['code', 'message', 'retryable', 'requestId', 'details'],
            type: 'object',
          },
        },
        required: ['error'],
        type: 'object',
      },
      'ai.Limitation': {
        additionalProperties: false,
        properties: {
          code: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          componentIds: {
            items: {
              format: 'uuid',
              type: 'string',
            },
            type: 'array',
            uniqueItems: true,
          },
          critical: {
            type: 'boolean',
          },
          message: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
        },
        required: ['code', 'message', 'componentIds', 'critical'],
        type: 'object',
      },
      'ai.NutrientCoverage': {
        additionalProperties: false,
        properties: {
          carbohydrateG: {
            additionalProperties: false,
            properties: {
              knownComponentCount: {
                minimum: 0,
                type: 'integer',
              },
              totalComponentCount: {
                minimum: 0,
                type: 'integer',
              },
            },
            required: ['knownComponentCount', 'totalComponentCount'],
            type: 'object',
          },
          energyKcal: {
            additionalProperties: false,
            properties: {
              knownComponentCount: {
                minimum: 0,
                type: 'integer',
              },
              totalComponentCount: {
                minimum: 0,
                type: 'integer',
              },
            },
            required: ['knownComponentCount', 'totalComponentCount'],
            type: 'object',
          },
          fatG: {
            additionalProperties: false,
            properties: {
              knownComponentCount: {
                minimum: 0,
                type: 'integer',
              },
              totalComponentCount: {
                minimum: 0,
                type: 'integer',
              },
            },
            required: ['knownComponentCount', 'totalComponentCount'],
            type: 'object',
          },
          fiberG: {
            additionalProperties: false,
            properties: {
              knownComponentCount: {
                minimum: 0,
                type: 'integer',
              },
              totalComponentCount: {
                minimum: 0,
                type: 'integer',
              },
            },
            required: ['knownComponentCount', 'totalComponentCount'],
            type: 'object',
          },
          proteinG: {
            additionalProperties: false,
            properties: {
              knownComponentCount: {
                minimum: 0,
                type: 'integer',
              },
              totalComponentCount: {
                minimum: 0,
                type: 'integer',
              },
            },
            required: ['knownComponentCount', 'totalComponentCount'],
            type: 'object',
          },
          sodiumMg: {
            additionalProperties: false,
            properties: {
              knownComponentCount: {
                minimum: 0,
                type: 'integer',
              },
              totalComponentCount: {
                minimum: 0,
                type: 'integer',
              },
            },
            required: ['knownComponentCount', 'totalComponentCount'],
            type: 'object',
          },
          sugarsG: {
            additionalProperties: false,
            properties: {
              knownComponentCount: {
                minimum: 0,
                type: 'integer',
              },
              totalComponentCount: {
                minimum: 0,
                type: 'integer',
              },
            },
            required: ['knownComponentCount', 'totalComponentCount'],
            type: 'object',
          },
        },
        required: [
          'energyKcal',
          'carbohydrateG',
          'proteinG',
          'fatG',
          'fiberG',
          'sugarsG',
          'sodiumMg',
        ],
        type: 'object',
      },
      'ai.NutrientSources': {
        additionalProperties: false,
        properties: {
          carbohydrateG: {
            anyOf: [
              {
                maxLength: 500,
                minLength: 1,
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
          energyKcal: {
            anyOf: [
              {
                maxLength: 500,
                minLength: 1,
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
          fatG: {
            anyOf: [
              {
                maxLength: 500,
                minLength: 1,
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
          fiberG: {
            anyOf: [
              {
                maxLength: 500,
                minLength: 1,
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
          proteinG: {
            anyOf: [
              {
                maxLength: 500,
                minLength: 1,
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
          sodiumMg: {
            anyOf: [
              {
                maxLength: 500,
                minLength: 1,
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
          sugarsG: {
            anyOf: [
              {
                maxLength: 500,
                minLength: 1,
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
        },
        required: [
          'energyKcal',
          'carbohydrateG',
          'proteinG',
          'fatG',
          'fiberG',
          'sugarsG',
          'sodiumMg',
        ],
        type: 'object',
      },
      'ai.Nutrients': {
        additionalProperties: false,
        properties: {
          carbohydrateG: {
            anyOf: [
              {
                minimum: 0,
                type: 'number',
              },
              {
                type: 'null',
              },
            ],
          },
          energyKcal: {
            anyOf: [
              {
                minimum: 0,
                type: 'number',
              },
              {
                type: 'null',
              },
            ],
          },
          fatG: {
            anyOf: [
              {
                minimum: 0,
                type: 'number',
              },
              {
                type: 'null',
              },
            ],
          },
          fiberG: {
            anyOf: [
              {
                minimum: 0,
                type: 'number',
              },
              {
                type: 'null',
              },
            ],
          },
          proteinG: {
            anyOf: [
              {
                minimum: 0,
                type: 'number',
              },
              {
                type: 'null',
              },
            ],
          },
          sodiumMg: {
            anyOf: [
              {
                minimum: 0,
                type: 'number',
              },
              {
                type: 'null',
              },
            ],
          },
          sugarsG: {
            anyOf: [
              {
                minimum: 0,
                type: 'number',
              },
              {
                type: 'null',
              },
            ],
          },
        },
        required: [
          'energyKcal',
          'carbohydrateG',
          'proteinG',
          'fatG',
          'fiberG',
          'sugarsG',
          'sodiumMg',
        ],
        type: 'object',
      },
      'ai.PhotoAnalysisRequest': {
        additionalProperties: false,
        properties: {
          catalogVersion: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          contractVersion: {
            $ref: '#/$defs/ai.ContractVersion',
          },
          image: {
            additionalProperties: false,
            properties: {
              downloadUrl: {
                format: 'uri',
                type: 'string',
              },
              mimeType: {
                enum: ['image/jpeg', 'image/png'],
                type: 'string',
              },
              sha256: {
                pattern: '^[a-f0-9]{64}$',
                type: 'string',
              },
            },
            required: ['downloadUrl', 'mimeType', 'sha256'],
            type: 'object',
          },
          operationId: {
            format: 'uuid',
            type: 'string',
          },
          profile: {
            $ref: '#/$defs/ai.ProfileContext',
          },
          ruleSetVersion: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
        },
        required: [
          'contractVersion',
          'operationId',
          'catalogVersion',
          'ruleSetVersion',
          'profile',
          'image',
        ],
        type: 'object',
      },
      'ai.PortionInput': {
        oneOf: [
          {
            additionalProperties: false,
            properties: {
              kind: {
                enum: ['unknown'],
                type: 'string',
              },
            },
            required: ['kind'],
            type: 'object',
          },
          {
            additionalProperties: false,
            properties: {
              kind: {
                enum: ['known'],
                type: 'string',
              },
              quantity: {
                exclusiveMinimum: 0,
                type: 'number',
              },
              unit: {
                enum: ['g'],
                type: 'string',
              },
            },
            required: ['kind', 'quantity', 'unit'],
            type: 'object',
          },
          {
            additionalProperties: false,
            properties: {
              kind: {
                enum: ['known'],
                type: 'string',
              },
              quantity: {
                exclusiveMinimum: 0,
                type: 'number',
              },
              servingId: {
                maxLength: 500,
                minLength: 1,
                type: 'string',
              },
              unit: {
                enum: ['serving'],
                type: 'string',
              },
            },
            required: ['kind', 'quantity', 'unit', 'servingId'],
            type: 'object',
          },
        ],
      },
      'ai.PortionResult': {
        additionalProperties: false,
        properties: {
          basis: {
            anyOf: [
              {
                maxLength: 500,
                minLength: 1,
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
          grams: {
            anyOf: [
              {
                exclusiveMinimum: 0,
                type: 'number',
              },
              {
                type: 'null',
              },
            ],
          },
          origin: {
            enum: ['photo_estimate', 'user_reported'],
            type: 'string',
          },
          quantity: {
            anyOf: [
              {
                exclusiveMinimum: 0,
                type: 'number',
              },
              {
                type: 'null',
              },
            ],
          },
          servingId: {
            anyOf: [
              {
                maxLength: 500,
                minLength: 1,
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
          sourceId: {
            anyOf: [
              {
                maxLength: 500,
                minLength: 1,
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
          unit: {
            anyOf: [
              {
                enum: ['g', 'serving'],
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
        },
        required: ['quantity', 'unit', 'servingId', 'grams', 'origin', 'basis', 'sourceId'],
        type: 'object',
      },
      'ai.ProfileContext': {
        additionalProperties: false,
        properties: {
          activity: {
            anyOf: [
              {
                enum: ['sedentary', 'light', 'moderate', 'high'],
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
          ageYears: {
            anyOf: [
              {
                maximum: 150,
                minimum: 0,
                type: 'integer',
              },
              {
                type: 'null',
              },
            ],
          },
          allergies: {
            items: {
              maxLength: 500,
              minLength: 1,
              type: 'string',
            },
            type: 'array',
          },
          allergyState: {
            enum: ['not_provided', 'unknown', 'none_known', 'reported'],
            type: 'string',
          },
          conditionIds: {
            items: {
              maxLength: 500,
              minLength: 1,
              type: 'string',
            },
            type: 'array',
            uniqueItems: true,
          },
          diagnosisState: {
            enum: ['not_provided', 'none_known', 'never_examined', 'reported'],
            type: 'string',
          },
          heightCm: {
            anyOf: [
              {
                exclusiveMinimum: 0,
                type: 'number',
              },
              {
                type: 'null',
              },
            ],
          },
          profileVersion: {
            minimum: 0,
            type: 'integer',
          },
          sexForReference: {
            anyOf: [
              {
                enum: ['female', 'male'],
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
          smoking: {
            anyOf: [
              {
                enum: ['never', 'former', 'current'],
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
          unsupportedConditionLabels: {
            items: {
              maxLength: 500,
              minLength: 1,
              type: 'string',
            },
            type: 'array',
          },
          weightKg: {
            anyOf: [
              {
                exclusiveMinimum: 0,
                type: 'number',
              },
              {
                type: 'null',
              },
            ],
          },
        },
        required: [
          'profileVersion',
          'ageYears',
          'heightCm',
          'weightKg',
          'sexForReference',
          'diagnosisState',
          'conditionIds',
          'unsupportedConditionLabels',
          'allergyState',
          'allergies',
          'activity',
          'smoking',
        ],
        type: 'object',
      },
      'ai.RecalculationRequest': {
        additionalProperties: false,
        properties: {
          catalogVersion: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          components: {
            items: {
              $ref: '#/$defs/ai.ComponentInput',
            },
            maxItems: 30,
            minItems: 1,
            type: 'array',
          },
          contractVersion: {
            $ref: '#/$defs/ai.ContractVersion',
          },
          inputKind: {
            enum: ['manual', 'correction'],
            type: 'string',
          },
          operationId: {
            format: 'uuid',
            type: 'string',
          },
          profile: {
            $ref: '#/$defs/ai.ProfileContext',
          },
          ruleSetVersion: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
        },
        required: [
          'contractVersion',
          'operationId',
          'inputKind',
          'catalogVersion',
          'ruleSetVersion',
          'profile',
          'components',
        ],
        type: 'object',
      },
      'ai.Serving': {
        additionalProperties: false,
        properties: {
          grams: {
            exclusiveMinimum: 0,
            type: 'number',
          },
          id: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          label: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          sourceId: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
        },
        required: ['id', 'label', 'grams', 'sourceId'],
        type: 'object',
      },
      'ai.Source': {
        additionalProperties: false,
        properties: {
          datasetVersion: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          id: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          itemRef: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          kind: {
            enum: ['nutrition', 'portion', 'health_rule', 'synthetic'],
            type: 'string',
          },
          title: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          url: {
            anyOf: [
              {
                format: 'uri',
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
        },
        required: ['id', 'kind', 'title', 'datasetVersion', 'itemRef', 'url'],
        type: 'object',
      },
      'ai.SupportedRule': {
        additionalProperties: false,
        description:
          'Immutable capability authority binding one rule to a supported condition and its exact citation sources.',
        properties: {
          conditionId: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          ruleId: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          sources: {
            items: {
              $ref: '#/$defs/ai.Source',
            },
            minItems: 1,
            type: 'array',
            uniqueItems: true,
          },
        },
        required: ['ruleId', 'conditionId', 'sources'],
        type: 'object',
      },
      'app.AccountDeletionAccepted': {
        additionalProperties: false,
        properties: {
          acceptedAt: {
            format: 'date-time',
            type: 'string',
          },
          accessRevoked: {
            const: true,
          },
          status: {
            enum: ['deletion_pending'],
            type: 'string',
          },
        },
        required: ['status', 'acceptedAt', 'accessRevoked'],
        type: 'object',
      },
      'app.AccountDeletionInput': {
        additionalProperties: false,
        properties: {
          confirmation: {
            enum: ['DELETE_MY_ACCOUNT'],
            type: 'string',
          },
          password: {
            maxLength: 128,
            minLength: 1,
            type: 'string',
          },
        },
        required: ['password', 'confirmation'],
        type: 'object',
      },
      'app.AnalysisJob': {
        additionalProperties: false,
        properties: {
          attempts: {
            maximum: 3,
            minimum: 0,
            type: 'integer',
          },
          createdAt: {
            format: 'date-time',
            type: 'string',
          },
          error: {
            anyOf: [
              {
                additionalProperties: false,
                properties: {
                  code: {
                    maxLength: 500,
                    minLength: 1,
                    type: 'string',
                  },
                  message: {
                    maxLength: 500,
                    minLength: 1,
                    type: 'string',
                  },
                  retryable: {
                    type: 'boolean',
                  },
                },
                required: ['code', 'message', 'retryable'],
                type: 'object',
              },
              {
                type: 'null',
              },
            ],
          },
          finishedAt: {
            anyOf: [
              {
                format: 'date-time',
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
          id: {
            format: 'uuid',
            type: 'string',
          },
          inputKind: {
            enum: ['photo', 'manual', 'correction'],
            type: 'string',
          },
          result: {
            anyOf: [
              {
                $ref: '#/$defs/ai.AnalysisResult',
              },
              {
                type: 'null',
              },
            ],
          },
          resultId: {
            anyOf: [
              {
                format: 'uuid',
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
          scanId: {
            anyOf: [
              {
                format: 'uuid',
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
          startedAt: {
            anyOf: [
              {
                format: 'date-time',
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
          status: {
            enum: ['queued', 'processing', 'completed', 'failed', 'cancelled'],
            type: 'string',
          },
          targetId: {
            format: 'uuid',
            type: 'string',
          },
          targetRevision: {
            minimum: 1,
            type: 'integer',
          },
          targetType: {
            enum: ['scan', 'consumption'],
            type: 'string',
          },
        },
        required: [
          'id',
          'scanId',
          'targetType',
          'targetId',
          'targetRevision',
          'inputKind',
          'status',
          'attempts',
          'createdAt',
          'startedAt',
          'finishedAt',
          'resultId',
          'result',
          'error',
        ],
        type: 'object',
      },
      'app.ConsentUpdate': {
        additionalProperties: false,
        properties: {
          granted: {
            type: 'boolean',
          },
          version: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
        },
        required: ['version', 'granted'],
        type: 'object',
      },
      'app.Consumption': {
        additionalProperties: false,
        properties: {
          attentionJobId: {
            anyOf: [
              {
                format: 'uuid',
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
          attentionState: {
            enum: ['not_requested', 'pending', 'available', 'failed'],
            type: 'string',
          },
          consumedAt: {
            format: 'date-time',
            type: 'string',
          },
          createdAt: {
            format: 'date-time',
            type: 'string',
          },
          id: {
            format: 'uuid',
            type: 'string',
          },
          photoAvailable: {
            type: 'boolean',
          },
          revision: {
            minimum: 1,
            type: 'integer',
          },
          scanId: {
            anyOf: [
              {
                format: 'uuid',
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
          snapshot: {
            $ref: '#/$defs/app.ConsumptionSnapshot',
          },
          source: {
            enum: ['manual', 'photo_confirmation'],
            type: 'string',
          },
          sourceAnalysisResultId: {
            anyOf: [
              {
                format: 'uuid',
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
          timezone: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          updatedAt: {
            format: 'date-time',
            type: 'string',
          },
        },
        required: [
          'id',
          'revision',
          'source',
          'scanId',
          'sourceAnalysisResultId',
          'photoAvailable',
          'consumedAt',
          'timezone',
          'createdAt',
          'updatedAt',
          'snapshot',
          'attentionState',
          'attentionJobId',
        ],
        type: 'object',
      },
      'app.ConsumptionCreate': {
        additionalProperties: false,
        properties: {
          catalogVersion: {
            description:
              "Immutable catalog version used for food/serving selection. Corrections use the source result version. 'unavailable' allowed only for manual unmatched input with no catalog.",
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          components: {
            items: {
              $ref: '#/$defs/ai.ComponentInput',
            },
            maxItems: 30,
            minItems: 1,
            type: 'array',
          },
          consumedAt: {
            format: 'date-time',
            type: 'string',
          },
          occurrence: {
            enum: ['default_confirmation', 'new_occurrence'],
            type: 'string',
          },
          scanId: {
            anyOf: [
              {
                format: 'uuid',
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
          source: {
            enum: ['manual', 'photo_confirmation'],
            type: 'string',
          },
          sourceAnalysisResultId: {
            anyOf: [
              {
                format: 'uuid',
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
          timezone: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
        },
        required: [
          'source',
          'scanId',
          'sourceAnalysisResultId',
          'occurrence',
          'consumedAt',
          'timezone',
          'components',
          'catalogVersion',
        ],
        type: 'object',
      },
      'app.ConsumptionPage': {
        additionalProperties: false,
        properties: {
          items: {
            items: {
              $ref: '#/$defs/app.Consumption',
            },
            type: 'array',
          },
          nextCursor: {
            anyOf: [
              {
                maxLength: 500,
                minLength: 1,
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
        },
        required: ['items', 'nextCursor'],
        type: 'object',
      },
      'app.ConsumptionSnapshot': {
        additionalProperties: false,
        description:
          'Immutable nutrition snapshot for a consumption. dataMode=unavailable is reserved for unmatched manual inputs with null nutrition and an explicit limitation; it is not an AI-service result mode.',
        properties: {
          attentions: {
            items: {
              $ref: '#/$defs/ai.Attention',
            },
            type: 'array',
          },
          catalogVersion: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          components: {
            items: {
              $ref: '#/$defs/ai.ComponentResult',
            },
            type: 'array',
          },
          computedAt: {
            format: 'date-time',
            type: 'string',
          },
          contractVersion: {
            $ref: '#/$defs/ai.ContractVersion',
          },
          coverage: {
            $ref: '#/$defs/ai.NutrientCoverage',
          },
          dataMode: {
            description:
              'unavailable is app-only and allowed only for unmatched manual input with null nutrients and a limitation.',
            enum: ['real', 'synthetic', 'unavailable'],
            type: 'string',
          },
          inputKind: {
            enum: ['photo', 'manual', 'correction'],
            type: 'string',
          },
          limitations: {
            items: {
              $ref: '#/$defs/ai.Limitation',
            },
            type: 'array',
          },
          nutritionDatasetVersion: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          operationId: {
            format: 'uuid',
            type: 'string',
          },
          overallAttention: {
            enum: ['considerable', 'needs_attention', 'insufficient_information'],
            type: 'string',
          },
          profileVersion: {
            minimum: 0,
            type: 'integer',
          },
          ruleSetVersion: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          sources: {
            items: {
              $ref: '#/$defs/ai.Source',
            },
            type: 'array',
          },
          supportStatus: {
            enum: ['complete', 'partial', 'unrecognized'],
            type: 'string',
          },
          totals: {
            $ref: '#/$defs/ai.Nutrients',
          },
        },
        required: [
          'attentions',
          'catalogVersion',
          'components',
          'computedAt',
          'contractVersion',
          'coverage',
          'dataMode',
          'inputKind',
          'limitations',
          'nutritionDatasetVersion',
          'operationId',
          'overallAttention',
          'profileVersion',
          'ruleSetVersion',
          'sources',
          'supportStatus',
          'totals',
        ],
        type: 'object',
      },
      'app.ConsumptionUpdate': {
        additionalProperties: false,
        properties: {
          catalogVersion: {
            description:
              "Immutable catalog version used for food/serving selection. Corrections use the source result version. 'unavailable' allowed only for manual unmatched input with no catalog.",
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          components: {
            items: {
              $ref: '#/$defs/ai.ComponentInput',
            },
            maxItems: 30,
            minItems: 1,
            type: 'array',
          },
          consumedAt: {
            format: 'date-time',
            type: 'string',
          },
          expectedRevision: {
            minimum: 1,
            type: 'integer',
          },
          timezone: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
        },
        required: ['expectedRevision', 'consumedAt', 'timezone', 'components', 'catalogVersion'],
        type: 'object',
      },
      'app.CorrectionInput': {
        additionalProperties: false,
        properties: {
          basedOnResultId: {
            format: 'uuid',
            type: 'string',
          },
          catalogVersion: {
            description:
              "Immutable catalog version used for food/serving selection. Corrections use the source result version. 'unavailable' allowed only for manual unmatched input with no catalog.",
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          components: {
            items: {
              $ref: '#/$defs/ai.ComponentInput',
            },
            maxItems: 30,
            minItems: 1,
            type: 'array',
          },
          expectedRevision: {
            minimum: 1,
            type: 'integer',
          },
        },
        required: ['expectedRevision', 'basedOnResultId', 'components', 'catalogVersion'],
        type: 'object',
      },
      'app.CreateAnalysisJob': {
        additionalProperties: false,
        properties: {
          photoId: {
            format: 'uuid',
            type: 'string',
          },
        },
        required: ['photoId'],
        type: 'object',
      },
      'app.Dashboard': {
        additionalProperties: false,
        properties: {
          attentionWindow: {
            additionalProperties: false,
            properties: {
              endDate: {
                format: 'date',
                type: 'string',
              },
              startDate: {
                format: 'date',
                type: 'string',
              },
            },
            required: ['startDate', 'endDate'],
            type: 'object',
          },
          componentCount: {
            minimum: 0,
            type: 'integer',
          },
          computedAt: {
            format: 'date-time',
            type: 'string',
          },
          consumptionCount: {
            minimum: 0,
            type: 'integer',
          },
          consumptionWindow: {
            additionalProperties: false,
            properties: {
              endAt: {
                format: 'date-time',
                type: 'string',
              },
              startAt: {
                format: 'date-time',
                type: 'string',
              },
            },
            required: ['startAt', 'endAt'],
            type: 'object',
          },
          coverage: {
            $ref: '#/$defs/ai.NutrientCoverage',
          },
          date: {
            format: 'date',
            type: 'string',
          },
          latestExaminations: {
            items: {
              $ref: '#/$defs/app.Examination',
            },
            type: 'array',
          },
          nextActions: {
            items: {
              additionalProperties: false,
              properties: {
                code: {
                  maxLength: 500,
                  minLength: 1,
                  type: 'string',
                },
                label: {
                  maxLength: 500,
                  minLength: 1,
                  type: 'string',
                },
                target: {
                  maxLength: 500,
                  minLength: 1,
                  type: 'string',
                },
              },
              required: ['code', 'label', 'target'],
              type: 'object',
            },
            type: 'array',
          },
          profileMissingFields: {
            items: {
              maxLength: 500,
              minLength: 1,
              type: 'string',
            },
            type: 'array',
          },
          recurringAttentions: {
            items: {
              $ref: '#/$defs/app.RecurringAttention',
            },
            type: 'array',
          },
          timezone: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          totals: {
            $ref: '#/$defs/ai.Nutrients',
          },
        },
        required: [
          'date',
          'timezone',
          'consumptionWindow',
          'attentionWindow',
          'consumptionCount',
          'componentCount',
          'totals',
          'coverage',
          'recurringAttentions',
          'latestExaminations',
          'profileMissingFields',
          'nextActions',
          'computedAt',
        ],
        type: 'object',
      },
      'app.ExamSeries': {
        additionalProperties: false,
        properties: {
          items: {
            items: {
              $ref: '#/$defs/app.Examination',
            },
            type: 'array',
          },
          key: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          label: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          latestExaminationId: {
            anyOf: [
              {
                format: 'uuid',
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
          unit: {
            enum: ['mmHg', 'mg/dL'],
            type: 'string',
          },
        },
        required: ['key', 'label', 'unit', 'items', 'latestExaminationId'],
        type: 'object',
      },
      'app.Examination': {
        additionalProperties: false,
        properties: {
          createdAt: {
            format: 'date-time',
            type: 'string',
          },
          id: {
            format: 'uuid',
            type: 'string',
          },
          record: {
            $ref: '#/$defs/app.ExaminationInput',
          },
          revision: {
            minimum: 1,
            type: 'integer',
          },
          updatedAt: {
            format: 'date-time',
            type: 'string',
          },
        },
        required: ['id', 'revision', 'record', 'createdAt', 'updatedAt'],
        type: 'object',
      },
      'app.ExaminationInput': {
        oneOf: [
          {
            additionalProperties: false,
            properties: {
              diastolic: {
                minimum: 1,
                type: 'integer',
              },
              measuredOn: {
                format: 'date',
                type: 'string',
              },
              measuredTime: {
                anyOf: [
                  {
                    pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
                    type: 'string',
                  },
                  {
                    type: 'null',
                  },
                ],
              },
              note: {
                anyOf: [
                  {
                    maxLength: 2000,
                    type: 'string',
                  },
                  {
                    type: 'null',
                  },
                ],
              },
              systolic: {
                minimum: 1,
                type: 'integer',
              },
              timezone: {
                maxLength: 500,
                minLength: 1,
                type: 'string',
              },
              type: {
                enum: ['pressure'],
                type: 'string',
              },
              unit: {
                enum: ['mmHg'],
                type: 'string',
              },
            },
            required: [
              'measuredOn',
              'measuredTime',
              'timezone',
              'note',
              'type',
              'unit',
              'systolic',
              'diastolic',
            ],
            type: 'object',
          },
          {
            additionalProperties: false,
            properties: {
              context: {
                enum: ['fasting', 'random', 'post_meal', 'unknown'],
                type: 'string',
              },
              measuredOn: {
                format: 'date',
                type: 'string',
              },
              measuredTime: {
                anyOf: [
                  {
                    pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
                    type: 'string',
                  },
                  {
                    type: 'null',
                  },
                ],
              },
              note: {
                anyOf: [
                  {
                    maxLength: 2000,
                    type: 'string',
                  },
                  {
                    type: 'null',
                  },
                ],
              },
              timezone: {
                maxLength: 500,
                minLength: 1,
                type: 'string',
              },
              type: {
                enum: ['glucose'],
                type: 'string',
              },
              unit: {
                enum: ['mg/dL'],
                type: 'string',
              },
              value: {
                exclusiveMinimum: 0,
                type: 'number',
              },
            },
            required: [
              'measuredOn',
              'measuredTime',
              'timezone',
              'note',
              'type',
              'unit',
              'context',
              'value',
            ],
            type: 'object',
          },
          {
            additionalProperties: false,
            properties: {
              measuredOn: {
                format: 'date',
                type: 'string',
              },
              measuredTime: {
                anyOf: [
                  {
                    pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
                    type: 'string',
                  },
                  {
                    type: 'null',
                  },
                ],
              },
              note: {
                anyOf: [
                  {
                    maxLength: 2000,
                    type: 'string',
                  },
                  {
                    type: 'null',
                  },
                ],
              },
              subtype: {
                enum: ['total', 'ldl', 'hdl'],
                type: 'string',
              },
              timezone: {
                maxLength: 500,
                minLength: 1,
                type: 'string',
              },
              type: {
                enum: ['cholesterol'],
                type: 'string',
              },
              unit: {
                enum: ['mg/dL'],
                type: 'string',
              },
              value: {
                exclusiveMinimum: 0,
                type: 'number',
              },
            },
            required: [
              'measuredOn',
              'measuredTime',
              'timezone',
              'note',
              'type',
              'unit',
              'subtype',
              'value',
            ],
            type: 'object',
          },
        ],
      },
      'app.ExaminationPage': {
        additionalProperties: false,
        properties: {
          items: {
            items: {
              $ref: '#/$defs/app.Examination',
            },
            type: 'array',
          },
          nextCursor: {
            anyOf: [
              {
                maxLength: 500,
                minLength: 1,
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
        },
        required: ['items', 'nextCursor'],
        type: 'object',
      },
      'app.ExaminationUpdate': {
        additionalProperties: false,
        properties: {
          expectedRevision: {
            minimum: 1,
            type: 'integer',
          },
          record: {
            $ref: '#/$defs/app.ExaminationInput',
          },
        },
        required: ['expectedRevision', 'record'],
        type: 'object',
      },
      'app.Health': {
        additionalProperties: false,
        properties: {
          requestId: {
            format: 'uuid',
            type: 'string',
          },
          status: {
            enum: ['ok', 'degraded'],
            type: 'string',
          },
        },
        required: ['status', 'requestId'],
        type: 'object',
      },
      'app.LegalDocument': {
        additionalProperties: false,
        properties: {
          contentMarkdown: {
            minLength: 1,
            type: 'string',
          },
          effectiveAt: {
            format: 'date-time',
            type: 'string',
          },
          title: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          version: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
        },
        required: ['version', 'title', 'contentMarkdown', 'effectiveAt'],
        type: 'object',
      },
      'app.LegalRegistry': {
        additionalProperties: false,
        properties: {
          aiProcessing: {
            $ref: '#/$defs/app.LegalDocument',
          },
          privacy: {
            $ref: '#/$defs/app.LegalDocument',
          },
          terms: {
            $ref: '#/$defs/app.LegalDocument',
          },
        },
        required: ['terms', 'privacy', 'aiProcessing'],
        type: 'object',
      },
      'app.Me': {
        additionalProperties: false,
        properties: {
          acceptedPrivacyVersion: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          acceptedTermsVersion: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          aiConsent: {
            additionalProperties: false,
            properties: {
              granted: {
                type: 'boolean',
              },
              updatedAt: {
                anyOf: [
                  {
                    format: 'date-time',
                    type: 'string',
                  },
                  {
                    type: 'null',
                  },
                ],
              },
              version: {
                anyOf: [
                  {
                    maxLength: 500,
                    minLength: 1,
                    type: 'string',
                  },
                  {
                    type: 'null',
                  },
                ],
              },
            },
            required: ['version', 'granted', 'updatedAt'],
            type: 'object',
          },
          birthDate: {
            format: 'date',
            type: 'string',
          },
          email: {
            format: 'email',
            type: 'string',
          },
          emailVerified: {
            const: true,
          },
          id: {
            format: 'uuid',
            type: 'string',
          },
          name: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          settingsRevision: {
            minimum: 1,
            type: 'integer',
          },
          timezone: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
        },
        required: [
          'id',
          'email',
          'emailVerified',
          'name',
          'birthDate',
          'timezone',
          'settingsRevision',
          'acceptedTermsVersion',
          'acceptedPrivacyVersion',
          'aiConsent',
        ],
        type: 'object',
      },
      'app.MeUpdate': {
        additionalProperties: false,
        properties: {
          expectedRevision: {
            minimum: 1,
            type: 'integer',
          },
          timezone: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
        },
        required: ['expectedRevision', 'timezone'],
        type: 'object',
      },
      'app.OnboardingState': {
        additionalProperties: false,
        properties: {
          completedAt: {
            anyOf: [
              {
                format: 'date-time',
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
        },
        required: ['completedAt'],
        type: 'object',
      },
      'app.Photo': {
        additionalProperties: false,
        properties: {
          createdAt: {
            format: 'date-time',
            type: 'string',
          },
          height: {
            maximum: 1600,
            minimum: 1,
            type: 'integer',
          },
          id: {
            format: 'uuid',
            type: 'string',
          },
          mimeType: {
            enum: ['image/jpeg', 'image/png'],
            type: 'string',
          },
          sizeBytes: {
            maximum: 10485760,
            minimum: 1,
            type: 'integer',
          },
          width: {
            maximum: 1600,
            minimum: 1,
            type: 'integer',
          },
        },
        required: ['id', 'mimeType', 'sizeBytes', 'width', 'height', 'createdAt'],
        type: 'object',
      },
      'app.PhotoView': {
        additionalProperties: false,
        properties: {
          expiresAt: {
            format: 'date-time',
            type: 'string',
          },
          url: {
            format: 'uri',
            type: 'string',
          },
        },
        required: ['url', 'expiresAt'],
        type: 'object',
      },
      'app.Profile': {
        additionalProperties: false,
        properties: {
          fields: {
            additionalProperties: false,
            properties: {
              activity: {
                anyOf: [
                  {
                    enum: ['sedentary', 'light', 'moderate', 'high'],
                    type: 'string',
                  },
                  {
                    type: 'null',
                  },
                ],
              },
              allergies: {
                additionalProperties: false,
                properties: {
                  entries: {
                    items: {
                      maxLength: 500,
                      minLength: 1,
                      type: 'string',
                    },
                    type: 'array',
                  },
                  state: {
                    enum: ['not_provided', 'unknown', 'none_known', 'reported'],
                    type: 'string',
                  },
                },
                required: ['state', 'entries'],
                type: 'object',
              },
              clinicianNotes: {
                anyOf: [
                  {
                    maxLength: 5000,
                    type: 'string',
                  },
                  {
                    type: 'null',
                  },
                ],
              },
              diagnoses: {
                additionalProperties: false,
                properties: {
                  entries: {
                    items: {
                      additionalProperties: false,
                      properties: {
                        conditionId: {
                          anyOf: [
                            {
                              maxLength: 500,
                              minLength: 1,
                              type: 'string',
                            },
                            {
                              type: 'null',
                            },
                          ],
                        },
                        id: {
                          format: 'uuid',
                          type: 'string',
                        },
                        label: {
                          maxLength: 500,
                          minLength: 1,
                          type: 'string',
                        },
                      },
                      required: ['id', 'conditionId', 'label'],
                      type: 'object',
                    },
                    type: 'array',
                  },
                  state: {
                    enum: ['not_provided', 'none_known', 'never_examined', 'reported'],
                    type: 'string',
                  },
                },
                required: ['state', 'entries'],
                type: 'object',
              },
              familyHistory: {
                additionalProperties: false,
                properties: {
                  entries: {
                    items: {
                      additionalProperties: false,
                      properties: {
                        conditionId: {
                          anyOf: [
                            {
                              maxLength: 500,
                              minLength: 1,
                              type: 'string',
                            },
                            {
                              type: 'null',
                            },
                          ],
                        },
                        label: {
                          maxLength: 500,
                          minLength: 1,
                          type: 'string',
                        },
                        relation: {
                          anyOf: [
                            {
                              maxLength: 500,
                              minLength: 1,
                              type: 'string',
                            },
                            {
                              type: 'null',
                            },
                          ],
                        },
                      },
                      required: ['conditionId', 'label', 'relation'],
                      type: 'object',
                    },
                    type: 'array',
                  },
                  state: {
                    enum: ['not_provided', 'unknown', 'none_known', 'reported'],
                    type: 'string',
                  },
                },
                required: ['state', 'entries'],
                type: 'object',
              },
              heightCm: {
                anyOf: [
                  {
                    exclusiveMinimum: 0,
                    type: 'number',
                  },
                  {
                    type: 'null',
                  },
                ],
              },
              sexForReference: {
                anyOf: [
                  {
                    enum: ['female', 'male'],
                    type: 'string',
                  },
                  {
                    type: 'null',
                  },
                ],
              },
              smoking: {
                anyOf: [
                  {
                    enum: ['never', 'former', 'current'],
                    type: 'string',
                  },
                  {
                    type: 'null',
                  },
                ],
              },
              weightKg: {
                anyOf: [
                  {
                    exclusiveMinimum: 0,
                    type: 'number',
                  },
                  {
                    type: 'null',
                  },
                ],
              },
            },
            required: [
              'heightCm',
              'weightKg',
              'sexForReference',
              'diagnoses',
              'familyHistory',
              'allergies',
              'clinicianNotes',
              'activity',
              'smoking',
            ],
            type: 'object',
          },
          personalization: {
            additionalProperties: false,
            properties: {
              missingFields: {
                items: {
                  maxLength: 500,
                  minLength: 1,
                  type: 'string',
                },
                type: 'array',
              },
              unsupportedConditions: {
                items: {
                  maxLength: 500,
                  minLength: 1,
                  type: 'string',
                },
                type: 'array',
              },
            },
            required: ['missingFields', 'unsupportedConditions'],
            type: 'object',
          },
          updatedAt: {
            anyOf: [
              {
                format: 'date-time',
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
          version: {
            minimum: 0,
            type: 'integer',
          },
        },
        required: ['version', 'updatedAt', 'fields', 'personalization'],
        type: 'object',
      },
      'app.ProfileUpdate': {
        additionalProperties: false,
        properties: {
          expectedVersion: {
            minimum: 0,
            type: 'integer',
          },
          fields: {
            additionalProperties: false,
            properties: {
              activity: {
                anyOf: [
                  {
                    enum: ['sedentary', 'light', 'moderate', 'high'],
                    type: 'string',
                  },
                  {
                    type: 'null',
                  },
                ],
              },
              allergies: {
                additionalProperties: false,
                properties: {
                  entries: {
                    items: {
                      maxLength: 500,
                      minLength: 1,
                      type: 'string',
                    },
                    type: 'array',
                  },
                  state: {
                    enum: ['not_provided', 'unknown', 'none_known', 'reported'],
                    type: 'string',
                  },
                },
                required: ['state', 'entries'],
                type: 'object',
              },
              clinicianNotes: {
                anyOf: [
                  {
                    maxLength: 5000,
                    type: 'string',
                  },
                  {
                    type: 'null',
                  },
                ],
              },
              diagnoses: {
                additionalProperties: false,
                properties: {
                  entries: {
                    items: {
                      additionalProperties: false,
                      properties: {
                        conditionId: {
                          anyOf: [
                            {
                              maxLength: 500,
                              minLength: 1,
                              type: 'string',
                            },
                            {
                              type: 'null',
                            },
                          ],
                        },
                        id: {
                          format: 'uuid',
                          type: 'string',
                        },
                        label: {
                          maxLength: 500,
                          minLength: 1,
                          type: 'string',
                        },
                      },
                      required: ['id', 'conditionId', 'label'],
                      type: 'object',
                    },
                    type: 'array',
                  },
                  state: {
                    enum: ['not_provided', 'none_known', 'never_examined', 'reported'],
                    type: 'string',
                  },
                },
                required: ['state', 'entries'],
                type: 'object',
              },
              familyHistory: {
                additionalProperties: false,
                properties: {
                  entries: {
                    items: {
                      additionalProperties: false,
                      properties: {
                        conditionId: {
                          anyOf: [
                            {
                              maxLength: 500,
                              minLength: 1,
                              type: 'string',
                            },
                            {
                              type: 'null',
                            },
                          ],
                        },
                        label: {
                          maxLength: 500,
                          minLength: 1,
                          type: 'string',
                        },
                        relation: {
                          anyOf: [
                            {
                              maxLength: 500,
                              minLength: 1,
                              type: 'string',
                            },
                            {
                              type: 'null',
                            },
                          ],
                        },
                      },
                      required: ['conditionId', 'label', 'relation'],
                      type: 'object',
                    },
                    type: 'array',
                  },
                  state: {
                    enum: ['not_provided', 'unknown', 'none_known', 'reported'],
                    type: 'string',
                  },
                },
                required: ['state', 'entries'],
                type: 'object',
              },
              heightCm: {
                anyOf: [
                  {
                    exclusiveMinimum: 0,
                    type: 'number',
                  },
                  {
                    type: 'null',
                  },
                ],
              },
              sexForReference: {
                anyOf: [
                  {
                    enum: ['female', 'male'],
                    type: 'string',
                  },
                  {
                    type: 'null',
                  },
                ],
              },
              smoking: {
                anyOf: [
                  {
                    enum: ['never', 'former', 'current'],
                    type: 'string',
                  },
                  {
                    type: 'null',
                  },
                ],
              },
              weightKg: {
                anyOf: [
                  {
                    exclusiveMinimum: 0,
                    type: 'number',
                  },
                  {
                    type: 'null',
                  },
                ],
              },
            },
            required: [
              'heightCm',
              'weightKg',
              'sexForReference',
              'diagnoses',
              'familyHistory',
              'allergies',
              'clinicianNotes',
              'activity',
              'smoking',
            ],
            type: 'object',
          },
        },
        required: ['expectedVersion', 'fields'],
        type: 'object',
      },
      'app.RecurringAttention': {
        additionalProperties: false,
        properties: {
          conditionId: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
          consumptionIds: {
            items: {
              format: 'uuid',
              type: 'string',
            },
            minItems: 2,
            type: 'array',
            uniqueItems: true,
          },
          count: {
            minimum: 2,
            type: 'integer',
          },
          ruleId: {
            maxLength: 500,
            minLength: 1,
            type: 'string',
          },
        },
        required: ['ruleId', 'conditionId', 'count', 'consumptionIds'],
        type: 'object',
      },
      'app.Scan': {
        additionalProperties: false,
        properties: {
          createdAt: {
            format: 'date-time',
            type: 'string',
          },
          defaultConsumptionId: {
            anyOf: [
              {
                format: 'uuid',
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
          id: {
            format: 'uuid',
            type: 'string',
          },
          latestJobId: {
            format: 'uuid',
            type: 'string',
          },
          latestResultId: {
            anyOf: [
              {
                format: 'uuid',
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
          photoId: {
            anyOf: [
              {
                format: 'uuid',
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
          revision: {
            minimum: 1,
            type: 'integer',
          },
        },
        required: [
          'id',
          'revision',
          'photoId',
          'createdAt',
          'latestJobId',
          'latestResultId',
          'defaultConsumptionId',
        ],
        type: 'object',
      },
      'app.ScanPage': {
        additionalProperties: false,
        properties: {
          items: {
            items: {
              $ref: '#/$defs/app.Scan',
            },
            type: 'array',
          },
          nextCursor: {
            anyOf: [
              {
                maxLength: 500,
                minLength: 1,
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
        },
        required: ['items', 'nextCursor'],
        type: 'object',
      },
    },
    $id: 'urn:carin:contracts:1.0.0',
    $schema: 'https://json-schema.org/draft/2020-12/schema',
  },
  version: '1.0.0',
};
