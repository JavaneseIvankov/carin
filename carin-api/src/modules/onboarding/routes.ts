import { Hono } from 'hono';
import { validateResponse } from '../../contracts/validation.js';
import type { Database } from '../../db/client.js';
import { requireSession, type SessionResolver } from '../../http/access.js';
import { ApiError } from '../../http/errors.js';
import type { AppEnv } from '../../http/types.js';
import { completeOnboarding, getOnboardingState } from './service.js';
import { OnboardingAccountNotFoundError } from './repository.js';

export type OnboardingRouteDependencies = { db: Database; resolveSession: SessionResolver };

type OnboardingOperation = 'app.getOnboarding' | 'app.completeOnboarding';

function assertOnboardingResponse(operation: OnboardingOperation, state: unknown): void {
  try {
    validateResponse(operation, 200, state, { contentType: 'application/json' });
  } catch {
    throw new ApiError(500, 'INTERNAL_ERROR', 'Onboarding response failed contract validation');
  }
}

function accountError(error: unknown): never {
  if (error instanceof OnboardingAccountNotFoundError) {
    throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Account not found');
  }
  throw error;
}

export function registerOnboardingRoutes(
  app: Hono<AppEnv>,
  dependencies: OnboardingRouteDependencies
): void {
  app.get('/api/v1/onboarding', requireSession(dependencies.resolveSession), async (c) => {
    const session = c.get('session');
    let state;
    try {
      state = await getOnboardingState(dependencies.db, session.userId);
    } catch (error) {
      accountError(error);
    }
    assertOnboardingResponse('app.getOnboarding', state);
    return c.json(state);
  });

  app.post('/api/v1/onboarding/complete', requireSession(dependencies.resolveSession), async (c) => {
    const session = c.get('session');
    let state;
    try {
      state = await completeOnboarding(dependencies.db, session.userId);
    } catch (error) {
      accountError(error);
    }
    assertOnboardingResponse('app.completeOnboarding', state);
    return c.json(state);
  });
}
