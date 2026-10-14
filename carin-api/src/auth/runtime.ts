import { AsyncLocalStorage } from 'node:async_hooks';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { AppConfig } from '../config.js';
import type { Database } from '../db/client.js';
import type { SessionResolver } from '../http/access.js';
import type { Session } from '../http/types.js';
import { authOptions } from './options.js';
import { createAuthDatabaseAdapter } from './transaction.js';

export type AuthMail = {
  kind: 'verification' | 'password-reset';
  userId: string;
  to: string;
  url: string;
  token: string;
};

export function createVerificationLandingUrl(url: string, baseURL: string): string {
  const link = new URL(url);
  const base = new URL(baseURL);
  if (link.origin !== base.origin || !link.pathname.endsWith('/api/auth/verify-email') || !link.searchParams.get('token')) {
    throw new Error('AUTH_VERIFICATION_LINK_INVALID');
  }
  link.searchParams.set('callbackURL', new URL('/auth/verified', base).toString());
  return link.toString();
}

export function createResetLandingUrl(token: string, baseURL: string): string {
  const link = new URL('/auth/reset', baseURL);
  link.searchParams.set('token', token);
  return link.toString();
}

export type AuthRuntime = {
  auth: {
    handler: (request: Request) => Promise<Response>;
    options: Pick<BetterAuthOptions, 'advanced' | 'trustedOrigins'>;
  };
  resolveSession: SessionResolver;
};

export type AuthRuntimeOptions = {
  db: Database;
  baseURL: string;
  secret: string;
  trustedOrigins: string[];
  appEnv: AppConfig['appEnv'];
  sendEmail: (mail: AuthMail) => Promise<void>;
  onEmailQueueFailure?: (kind: AuthMail['kind']) => void;
};

export function createAuthRuntime({
  db,
  baseURL,
  secret,
  trustedOrigins,
  appEnv,
  sendEmail,
  onEmailQueueFailure,
}: AuthRuntimeOptions): AuthRuntime {
  const emailRequestContext = new AsyncLocalStorage<{ queueFailed: boolean }>();
  const deliverAuthMail = async (mail: AuthMail): Promise<boolean> => {
    try {
      await sendEmail(mail);
      return true;
    } catch {
      const context = emailRequestContext.getStore();
      if (context) context.queueFailed = true;
      onEmailQueueFailure?.(mail.kind);
      return false;
    }
  };
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
    const delivered = await deliverAuthMail(mail);
    if (!delivered) {
      // A newer attempt may have claimed the key while delivery was in flight.
      await db.execute(sql`DELETE FROM rate_limit WHERE key = ${key} AND last_request = ${now}`);
    }
  };

  const auth = betterAuth({
    ...authOptions,
    baseURL,
    secret,
    trustedOrigins,
    advanced: { ...authOptions.advanced, cookiePrefix: `carin-${appEnv}`, disableOriginCheck: false },
    database: createAuthDatabaseAdapter(db),
    emailVerification: {
      ...authOptions.emailVerification,
      sendVerificationEmail: async ({ user, url, token }) =>
        sendVerificationWithCooldown({
          kind: 'verification',
          userId: user.id,
          to: user.email,
          url: createVerificationLandingUrl(url, baseURL),
          token,
        }),
    },
    emailAndPassword: {
      ...authOptions.emailAndPassword,
      sendResetPassword: async ({ user, token }) =>
        deliverAuthMail({
          kind: 'password-reset',
          userId: user.id,
          to: user.email,
          url: createResetLandingUrl(token, baseURL),
          token,
        }),
    },
  });

  const handler = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const state = { queueFailed: false };
    const run = (incoming: Request) => emailRequestContext.run(state, () => auth.handler(incoming));
    let response: Response;
    if (request.method === 'POST' && url.pathname.endsWith('/sign-up/email')) {
      const headers = new Headers(request.headers);
      headers.delete('content-length');
      const contentType = request.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        let body: Record<string, unknown> | undefined;
        try {
          const parsed = await request.clone().json() as unknown;
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            body = parsed as Record<string, unknown>;
          }
        } catch {
          body = undefined;
        }
        if (body) {
          if (!('acceptedAt' in body)) body.acceptedAt = new Date().toISOString();
          headers.set('content-type', 'application/json');
          response = await run(new Request(request, { headers, body: JSON.stringify(body) }));
        } else response = await run(request);
      } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
        const form = await request.clone().formData();
        if (!form.has('acceptedAt')) form.set('acceptedAt', new Date().toISOString());
        response = await run(new Request(request, { headers, body: form }));
      } else {
        response = await run(request);
      }
    } else {
      response = await run(request);
    }

    if (state.queueFailed && request.method === 'POST' && url.pathname.endsWith('/sign-up/email')) {
      return Response.json(
        { code: 'AUTH_EMAIL_QUEUE_FAILED', message: 'Registration could not be completed. Please try again.' },
        { status: 503 },
      );
    }
    return response;
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

  return { auth: { handler, options: auth.options }, resolveSession };
}
