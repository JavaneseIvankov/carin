import type { BetterAuthOptions } from 'better-auth';
import { APIError } from 'better-auth';
import { expo } from '@better-auth/expo';
import { validateRegistrationAdmission, RegistrationAdmissionError } from './admission.js';
import { getAuthTransactionDatabase } from './transaction.js';
import { recordMandatoryConsent } from '../modules/legal/consent-service.js';
import { getLegalRegistry } from '../modules/legal/registry.js';

function asAuthError(error: unknown): never {
  if (error instanceof RegistrationAdmissionError) {
    throw APIError.from('BAD_REQUEST', {
      code: error.code,
      message: error.message,
    });
  }
  throw error;
}

export const authOptions = {
  appName: 'Carin',
  basePath: '/api/auth',
  advanced: { database: { generateId: 'uuid' } },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    autoSignIn: false,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: 3600,
    revokeSessionsOnPasswordReset: true,
  },
  emailVerification: {
    expiresIn: 3600,
    autoSignInAfterVerification: false,
    sendOnSignUp: true,
  },
  session: { expiresIn: 7 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
  rateLimit: { enabled: true, storage: 'database' },
  user: {
    deleteUser: { enabled: false },
    additionalFields: {
      birthDate: { type: 'string', required: true, input: true, returned: false },
      acceptedTermsVersion: { type: 'string', required: true, input: true, returned: false },
      acceptedPrivacyVersion: { type: 'string', required: true, input: true, returned: false },
      acceptedAt: { type: 'date', required: true, input: true, returned: false },
      onboardingCompletedAt: {
        type: 'date',
        required: false,
        input: false,
        returned: false,
      },
      deletionStatus: {
        type: 'string',
        required: true,
        input: false,
        returned: false,
        defaultValue: 'active',
      },
      settingsRevision: {
        type: 'number',
        required: true,
        input: false,
        returned: false,
        defaultValue: 1,
      },
      timezone: {
        type: 'string',
        required: true,
        input: false,
        returned: false,
        defaultValue: 'Asia/Jakarta',
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (data) => {
          try {
            const metadata = validateRegistrationAdmission(data, new Date());
            return { data: metadata };
          } catch (error) {
            return asAuthError(error);
          }
        },
      },
      update: {
        before: async (data) => {
          for (const field of [
            'birthDate',
            'acceptedTermsVersion',
            'acceptedPrivacyVersion',
            'acceptedAt',
          ]) {
            if (field in data) {
              throw APIError.from('BAD_REQUEST', {
                code: 'FIELD_NOT_ALLOWED',
                message: `${field} cannot be updated`,
              });
            }
          }
        },
      },
    },
    account: {
      create: {
        before: async (data) => {
          try {
            const current = getLegalRegistry();
            await recordMandatoryConsent(getAuthTransactionDatabase(), String(data.userId), {
              terms: current.terms.version,
              privacy: current.privacy.version,
            });
          } catch (error) {
            return asAuthError(error);
          }
        },
      },
    },
  },
  plugins: [expo()],
} satisfies BetterAuthOptions;
