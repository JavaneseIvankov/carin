import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
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
import { registerAccountRoutes, type AccountRouteDependencies } from './modules/account/routes.js';
import { registerEmailLandingRoutes } from './modules/email/landing.js';
import { registerProfileRoutes } from './modules/profile/routes.js';
import { registerAnalysisJobRoutes, type AnalysisJobRouteDependencies } from "./jobs/routes.js";
import { registerMediaRoutes, type MediaRouteDependencies } from "./modules/media/routes.js";
import { registerAnalysisRoutes, type AnalysisRouteDependencies } from './modules/analyses/routes.js';
import { registerScanRoutes, type ScanRouteDependencies } from './modules/scans/routes.js';
import { registerConsumptionRoutes, type ConsumptionRouteDependencies } from './modules/consumptions/routes.js';
import { registerExaminationRoutes } from './modules/examinations/routes.js';
import { registerDashboardRoutes, type DashboardRouteDependencies } from './modules/dashboard/routes.js';
import { isInternalHost, type AppConfig } from './config.js';

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
  account?: AccountRouteDependencies;
  examinations?: { db: Database; resolveSession: SessionResolver; cursorSecret: string };
  dashboard?: DashboardRouteDependencies;
  auth?: { handler: (request: Request) => Promise<Response> };
  appLinkScheme?: string;
  trustedWebOrigins?: string[];
  analysisJobs?: AnalysisJobRouteDependencies;
  analyses?: AnalysisRouteDependencies;
  scans?: ScanRouteDependencies;
  consumptions?: ConsumptionRouteDependencies;
  media?: MediaRouteDependencies;
  corsOrigins?: string[];
  appEnv?: AppConfig['appEnv'];
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createApp({
  readiness,
  log,
  registerRoutes,
  legalConsent,
  catalog,
  account,
  examinations,
  auth,
  appLinkScheme,
  trustedWebOrigins = [],
  analysisJobs,
  analyses,
  scans,
  consumptions,
  media,
  dashboard,
  corsOrigins,
  appEnv,
}: AppDependencies): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const allowedOrigins = corsOrigins?.filter((origin) => origin.startsWith('http://') || origin.startsWith('https://')) ?? [];
  app.use(
    '*',
    cors({
      origin: (origin) => {
        if (!origin) return undefined;
        if (allowedOrigins.includes(origin)) return origin;
        if (appEnv === 'dev') {
          try {
            const parsed = new URL(origin);
            if (isInternalHost(parsed.hostname)) return origin;
          } catch {
            return undefined;
          }
        }
        return undefined;
      },
      credentials: true,
      allowHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    }),
  );
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

  app.use('/api/*', cors({
    origin: (origin) => trustedWebOrigins.includes(origin) ? origin : '',
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Idempotency-Key', 'X-Request-ID'],
    exposeHeaders: ['X-Request-ID'],
  }));

  registerHealthRoutes(app, readiness);
  registerLegalRegistryRoute(app);
  if (legalConsent) registerAiConsentRoute(app, legalConsent);
  if (catalog) registerCatalogRoutes(app, catalog);
  if (account) {
    registerAccountRoutes(app, account);
    registerProfileRoutes(app, account);
  }
  if (appLinkScheme) registerEmailLandingRoutes(app, appLinkScheme);
  if (examinations) registerExaminationRoutes(app, examinations);
  if (dashboard) registerDashboardRoutes(app, dashboard);
  if (auth) app.all('/api/auth/*', (c) => auth.handler(c.req.raw));
  if (analysisJobs) registerAnalysisJobRoutes(app, analysisJobs);
  if (analyses) registerAnalysisRoutes(app, analyses);
  if (scans) registerScanRoutes(app, scans);
  if (consumptions) registerConsumptionRoutes(app, consumptions);
  if (media) registerMediaRoutes(app, media);

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

export type VerifiedAppDependencies = Omit<
  AppDependencies,
  'account' | 'catalog' | 'legalConsent'
> & {
  db: Database;
  resolveSession: SessionResolver;
  accountDeletion?: Pick<AccountRouteDependencies, 'verifyPassword' | 'deletionSecret'>;
};

export function createVerifiedApp({ db, resolveSession, accountDeletion, ...dependencies }: VerifiedAppDependencies) {
  const resources = { db, resolveSession };
  return createApp({
    ...dependencies,
    account: { ...resources, ...accountDeletion },
    legalConsent: resources,
    catalog: resources,
    analysisJobs: dependencies.analysisJobs ?? resources,
    analyses: dependencies.analyses ?? resources,
    scans: dependencies.scans ?? resources,
    consumptions: dependencies.consumptions ?? resources,
    dashboard: dependencies.dashboard ?? resources,
  });
}
