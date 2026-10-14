import { and, desc, eq } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { consentEvent, user } from '../../db/schema/index.js';

export class AccountNotFoundError extends Error {}

export async function getMe(db: Database, userId: string) {
  const [account] = await db
    .select({
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      name: user.name,
      birthDate: user.birthDate,
      timezone: user.timezone,
      settingsRevision: user.settingsRevision,
      acceptedTermsVersion: user.acceptedTermsVersion,
      acceptedPrivacyVersion: user.acceptedPrivacyVersion,
    })
    .from(user)
    .where(eq(user.id, userId));
  if (!account) throw new AccountNotFoundError();

  const [latestAiConsent] = await db
    .select({
      version: consentEvent.version,
      granted: consentEvent.granted,
      updatedAt: consentEvent.createdAt,
    })
    .from(consentEvent)
    .where(
      and(
        eq(consentEvent.userId, userId),
        eq(consentEvent.kind, 'ai_processing'),
      ),
    )
    .orderBy(desc(consentEvent.createdAt), desc(consentEvent.id))
    .limit(1);

  return {
    ...account,
    emailVerified: true as const,
    aiConsent: {
      version: latestAiConsent?.version ?? null,
      granted: latestAiConsent?.granted ?? false,
      updatedAt: latestAiConsent?.updatedAt?.toISOString() ?? null,
    },
  };
}
