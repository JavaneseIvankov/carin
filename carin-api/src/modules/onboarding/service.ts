import type { Database } from '../../db/client.js';
import { markOnboardingComplete, readOnboardingCompletion } from './repository.js';

export type OnboardingState = { completedAt: string | null };

export async function getOnboardingState(db: Database, userId: string): Promise<OnboardingState> {
  const completedAt = await readOnboardingCompletion(db, userId);
  return { completedAt: completedAt?.toISOString() ?? null };
}

export async function completeOnboarding(db: Database, userId: string): Promise<OnboardingState> {
  const completedAt = await markOnboardingComplete(db, userId);
  return { completedAt: completedAt.toISOString() };
}
