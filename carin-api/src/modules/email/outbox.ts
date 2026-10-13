import { createHmac } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { emailTask, rateLimit, verification } from '../../db/schema/index.js';
import type { AuthMail } from '../../auth/runtime.js';
import { getOptionalAuthTransactionDatabase, type AuthTransactionDatabase } from '../../auth/transaction.js';

export type QueuedAuthMail = AuthMail & { userId: string };
export type EnqueueResult = 'queued' | 'cooldown' | 'expired';

function verificationExpiry(token: string): Date | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const exp = (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: unknown }).exp;
    return typeof exp === 'number' && Number.isFinite(exp) ? new Date(exp * 1000) : null;
  } catch {
    return null;
  }
}

async function tokenExpiry(db: Database | AuthTransactionDatabase, mail: QueuedAuthMail): Promise<Date | null> {
  if (mail.kind === 'verification') return verificationExpiry(mail.token);
  const [entry] = await db
    .select({ expiresAt: verification.expiresAt })
    .from(verification)
    .where(eq(verification.identifier, `reset-password:${mail.token}`))
    .limit(1);
  return entry?.expiresAt ?? null;
}

function cooldownKey(mail: QueuedAuthMail, secret: string): string {
  const digest = createHmac('sha256', secret)
    .update(`${mail.kind}\0${mail.to.trim().toLowerCase()}`)
    .digest('hex');
  return `carin-email-${mail.kind}-${digest}`;
}

export async function enqueueAuthMail(
  db: Database,
  secret: string,
  mail: QueuedAuthMail,
  now = new Date(),
): Promise<EnqueueResult> {
  const authTransaction = getOptionalAuthTransactionDatabase();
  const expiresAt = await tokenExpiry(authTransaction ?? db, mail);
  if (!expiresAt || expiresAt.getTime() <= now.getTime()) return 'expired';

  const enqueue = async (tx: Database | AuthTransactionDatabase): Promise<EnqueueResult> => {
    const key = cooldownKey(mail, secret);
    const admitted = await tx
      .insert(rateLimit)
      .values({ key, count: 1, lastRequest: now.getTime() })
      .onConflictDoUpdate({
        target: rateLimit.key,
        set: { count: 1, lastRequest: now.getTime() },
        setWhere: sql`${rateLimit.lastRequest} <= ${now.getTime() - 60_000}`,
      })
      .returning({ id: rateLimit.id });
    if (admitted.length === 0) return 'cooldown';

    await tx.insert(emailTask).values({
      userId: mail.userId,
      kind: mail.kind === 'password-reset' ? 'password_reset' : 'verification',
      payload: { to: mail.to, url: mail.url },
      expiresAt,
    });
    return 'queued';
  };

  return authTransaction ? enqueue(authTransaction) : db.transaction(enqueue);
}
