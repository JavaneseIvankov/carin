import { AsyncLocalStorage } from 'node:async_hooks';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { eq } from 'drizzle-orm';
import type { AppConfig } from '../config.js';
import type { Database } from '../db/client.js';
import type { SessionResolver } from '../http/access.js';
import type { Session } from '../http/types.js';
import { authOptions } from './options.js';
import { createAuthDatabaseAdapter } from './transaction.js';
import { user } from '../db/schema/index.js';

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
  verifyPassword: (request: Request, password: string) => Promise<boolean>;
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
  const deliverAuthMail = async (mail: AuthMail) => {
    try {
      await sendEmail(mail);
    } catch {
      const context = emailRequestContext.getStore();
      if (context) context.queueFailed = true;
      onEmailQueueFailure?.(mail.kind);
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
        deliverAuthMail({
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
    const [account] = await db.select({ deletionStatus: user.deletionStatus })
      .from(user).where(eq(user.id, result.user.id)).limit(1);
    if (!account || account.deletionStatus !== 'active') return null;
    const session: Session = {
      userId: result.user.id,
      emailVerified: result.user.emailVerified,
      sessionId: result.session.id,
    };
    return session;
  };

  const verifyPassword = async (request: Request, password: string): Promise<boolean> => {
    try {
      const result = await auth.api.verifyPassword({ headers: request.headers, body: { password } });
      return result.status;
    } catch (error) {
      if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 400) return false;
      throw error;
    }
  };

  return { auth: { handler, options: auth.options }, resolveSession, verifyPassword };
}
