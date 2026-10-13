import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { registerHealthRoutes } from "./health/handler.js";
import { ApiError, errorResponse } from "./http/errors.js";
import type { AppEnv } from "./http/types.js";
import type { Database } from "./db/client.js";
import type { SessionResolver } from "./http/access.js";
import {
  registerAiConsentRoute,
  registerLegalRegistryRoute,
} from "./modules/legal/routes.js";
import { registerCatalogRoutes, type CatalogRouteDependencies } from "./catalog/routes.js";
import { registerAccountRoutes } from './modules/account/routes.js';
import { registerEmailLandingRoutes } from './modules/email/landing.js';

export type RequestLog = {
  requestId: string;
  method: string;
  status: number;
  durationMs: number;
};

export type AppDependencies = {
  readiness: () => Promise<boolean>;
  log?: (entry: RequestLog) => void;
  registerRoutes?: (app: Hono<AppEnv>) => void;
  legalConsent?: { db: Database; resolveSession: SessionResolver };
  catalog?: CatalogRouteDependencies;
  account?: { db: Database; resolveSession: SessionResolver };
  auth?: { handler: (request: Request) => Promise<Response> };
  appLinkScheme?: string;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createApp({
  readiness,
  log,
  registerRoutes,
  legalConsent,
  catalog,
  account,
  auth,
  appLinkScheme,
}: AppDependencies): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    const supplied = c.req.header("x-request-id");
    const requestId = supplied && uuid.test(supplied) ? supplied : randomUUID();
    c.set("requestId", requestId);
    c.header("x-request-id", requestId);
    const started = performance.now();
    await next();
    log?.({
      requestId,
      method: c.req.method,
      status: c.res.status,
      durationMs: Math.round(performance.now() - started),
    });
  });

  registerHealthRoutes(app, readiness);
  registerLegalRegistryRoute(app);
  if (legalConsent) registerAiConsentRoute(app, legalConsent);
  if (catalog) registerCatalogRoutes(app, catalog);
  if (account) registerAccountRoutes(app, account);
  if (appLinkScheme) registerEmailLandingRoutes(app, appLinkScheme);
  if (auth) app.all('/api/auth/*', (c) => auth.handler(c.req.raw));

  registerRoutes?.(app);

  app.notFound((c) =>
    errorResponse(
      c,
      new ApiError(404, "RESOURCE_NOT_FOUND", "Resource not found"),
    ),
  );
  app.onError((error, c) =>
    errorResponse(
      c,
      error instanceof ApiError
        ? error
        : new ApiError(500, "INTERNAL_ERROR", "Internal server error"),
    ),
  );
  return app;
}
