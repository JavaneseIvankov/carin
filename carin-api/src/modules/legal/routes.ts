import { Hono } from "hono";
import type { Database } from "../../db/client.js";
import { requireSession, type SessionResolver } from "../../http/access.js";
import { ApiError } from "../../http/errors.js";
import type { AppEnv } from "../../http/types.js";
import {
  ContractValidationError,
  validateRequest,
  validateResponse,
} from "../../contracts/validation.js";
import {
  ConsentVersionConflict,
  IdempotencyConflict,
  setAiConsent,
} from "./consent-service.js";
import { getLegalRegistry } from "./registry.js";

export type LegalRouteDependencies = {
  db: Database;
  resolveSession: SessionResolver;
};

export function registerLegalRegistryRoute(app: Hono<AppEnv>) {
  app.get("/api/v1/legal", (c) => {
    const registry = getLegalRegistry();
    try {
      validateResponse("app.getLegalRegistry", 200, registry, {
        contentType: "application/json",
      });
    } catch {
      throw new ApiError(
        500,
        "INTERNAL_ERROR",
        "Legal registry is unavailable",
      );
    }
    return c.json(registry);
  });
}

export function registerAiConsentRoute(
  app: Hono<AppEnv>,
  dependencies: LegalRouteDependencies,
) {
  app.put(
    "/api/v1/consents/ai-processing",
    requireSession(dependencies.resolveSession),
    async (c) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        throw new ApiError(
          422,
          "INVALID_REQUEST",
          "Request does not match the API contract",
        );
      }
      let request: ReturnType<typeof validateRequest>;
      try {
        request = validateRequest("app.setAiConsent", {
          headers: c.req.header(),
          body,
          contentType: c.req.header("content-type"),
        });
      } catch (error) {
        if (error instanceof ContractValidationError)
          throw new ApiError(
            422,
            "INVALID_REQUEST",
            "Request does not match the API contract",
          );
        throw error;
      }
      const session = c.get("session");
      if (!session.sessionId)
        throw new ApiError(
          401,
          "UNAUTHENTICATED",
          "Authentication session is unavailable",
        );
      try {
        const result = await setAiConsent(dependencies.db, {
          userId: session.userId,
          sessionId: session.sessionId,
          key: request.headers["idempotency-key"] as string,
          action: request.body as { version: string; granted: boolean },
        });
        try {
          validateResponse("app.setAiConsent", 200, result, {
            contentType: "application/json",
          });
        } catch {
          throw new ApiError(500, "INTERNAL_ERROR", "Consent update failed");
        }
        return c.json(result);
      } catch (error) {
        if (error instanceof ConsentVersionConflict)
          throw new ApiError(
            409,
            "STALE_LEGAL_VERSION",
            "The submitted legal version is no longer current",
          );
        if (error instanceof IdempotencyConflict)
          throw new ApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "Idempotency key was already used for another request",
          );
        if (
          error instanceof Error &&
          error.message === "Consent account no longer exists"
        )
          throw new ApiError(404, "RESOURCE_NOT_FOUND", "Account not found");
        if (
          error instanceof Error &&
          error.message === "Session is no longer active"
        )
          throw new ApiError(
            401,
            "UNAUTHENTICATED",
            "Authentication session is unavailable",
          );
        throw error;
      }
    },
  );
}
