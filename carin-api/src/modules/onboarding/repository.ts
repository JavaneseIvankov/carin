import { eq, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { user } from '../../db/schema/index.js';

export class OnboardingAccountNotFoundError extends Error {
  constructor() {
    super('Onboarding account not found');
    this.name = 'OnboardingAccountNotFoundError';
  }
}

export async function readOnboardingCompletion(db: Database, userId: string): Promise<Date | null> {
  const [row] = await db
    .select({ completedAt: user.onboardingCompletedAt })
    .from(user)
    .where(eq(user.id, userId));
  if (!row) throw new OnboardingAccountNotFoundError();
  return row.completedAt;
}

export async function markOnboardingComplete(db: Database, userId: string): Promise<Date> {
  const [row] = await db
    .update(user)
    .set({ onboardingCompletedAt: sql`coalesce(${user.onboardingCompletedAt}, clock_timestamp())` })
    .where(eq(user.id, userId))
    .returning({ completedAt: user.onboardingCompletedAt });
  if (!row || !row.completedAt) throw new OnboardingAccountNotFoundError();
  return row.completedAt;
}
