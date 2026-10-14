import { betterAuth } from 'better-auth';
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import type { SessionResolver } from '../http/access.js';
import type { Session } from '../http/types.js';
import { authOptions } from './options.js';
import { createAuthDatabaseAdapter } from './transaction.js';

export type AuthMail = {
  kind: 'verification' | 'password-reset';
  to: string;
  url: string;
  token: string;
};

export type AuthRuntime = {
  auth: { handler: (request: Request) => Promise<Response> };
  resolveSession: SessionResolver;
};

export type AuthRuntimeOptions = {
  db: Database;
  baseURL: string;
  secret: string;
  trustedOrigins: string[];
  sendEmail: (mail: AuthMail) => Promise<void>;
};

export function createAuthRuntime({
  db,
  baseURL,
  secret,
  trustedOrigins,
  sendEmail,
}: AuthRuntimeOptions): AuthRuntime {
  const sendVerificationWithCooldown = async (mail: AuthMail): Promise<void> => {
    const key = `verification-email:${createHash('sha256').update(mail.to.trim().toLowerCase()).digest('hex')}`;
    const now = Date.now();
    const claimed = await db.execute(sql`
      INSERT INTO rate_limit (key, count, last_request)
      VALUES (${key}, 1, ${now})
      ON CONFLICT (key) DO UPDATE SET last_request = EXCLUDED.last_request
      WHERE rate_limit.last_request <= EXCLUDED.last_request - 60000
      RETURNING key
    `);
    if (!claimed.rowCount) return;
    try {
      await sendEmail(mail);
    } catch (error) {
      // A newer attempt may have claimed the key while delivery was in flight.
      await db.execute(sql`DELETE FROM rate_limit WHERE key = ${key} AND last_request = ${now}`);
      throw error;
    }
  };

  const auth = betterAuth({
    ...authOptions,
    baseURL,
    secret,
    trustedOrigins,
    advanced: { ...authOptions.advanced, disableOriginCheck: false },
    database: createAuthDatabaseAdapter(db),
    emailVerification: {
      ...authOptions.emailVerification,
      sendVerificationEmail: async ({ user, url, token }) =>
        sendVerificationWithCooldown({ kind: 'verification', to: user.email, url, token }),
    },
    emailAndPassword: {
      ...authOptions.emailAndPassword,
      sendResetPassword: async ({ user, url, token }) =>
        sendEmail({ kind: 'password-reset', to: user.email, url, token }),
    },
  });

  const handler = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (request.method !== 'POST' || !url.pathname.endsWith('/sign-up/email')) {
      return auth.handler(request);
    }
    const headers = new Headers(request.headers);
    headers.delete('content-length');
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      try {
        const body = await request.clone().json() as Record<string, unknown>;
        if (!('acceptedAt' in body)) body.acceptedAt = new Date().toISOString();
        headers.set('content-type', 'application/json');
        return auth.handler(new Request(request, { headers, body: JSON.stringify(body) }));
      } catch {
        return auth.handler(request);
      }
    }
    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const form = await request.clone().formData();
      if (!form.has('acceptedAt')) form.set('acceptedAt', new Date().toISOString());
      return auth.handler(new Request(request, { headers, body: form }));
    }
    return auth.handler(request);
  };

  const resolveSession: SessionResolver = async (request) => {
    const result = await auth.api.getSession({
      headers: request.headers,
      query: { disableCookieCache: true },
    });
    if (!result) return null;
    const session: Session = {
      userId: result.user.id,
      emailVerified: result.user.emailVerified,
      sessionId: result.session.id,
    };
    return session;
  };

  return { auth: { handler }, resolveSession };
}
