import type { BetterAuthOptions } from 'better-auth';
import { expo } from '@better-auth/expo';

// Schema-affecting options are shared by generation and the future runtime factory.
// T8 must supply registration admission/hooks and outbox email delivery before mount.
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
      birthDate: { type: 'string', required: true, input: false },
      acceptedTermsVersion: { type: 'string', required: true, input: false },
      acceptedPrivacyVersion: { type: 'string', required: true, input: false },
      acceptedAt: { type: 'date', required: true, input: false },
      deletionStatus: {
        type: 'string',
        required: true,
        input: false,
        defaultValue: 'active',
      },
      timezone: {
        type: 'string',
        required: true,
        input: false,
        defaultValue: 'Asia/Jakarta',
      },
    },
  },
  plugins: [expo()],
} satisfies BetterAuthOptions;
