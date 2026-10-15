# AI Service Progress

Last updated: 2026-10-15
Branch: `feat/t32-real-ai-service`
Scope: C32 AI service for the shared Carin API contract

## Status

The FastAPI service and both A1V1 evaluation routes are implemented. Both aliases have returned valid responses from live Alibaba calls. The service remains a bootstrap: production nutrition results are not enabled because the approved T31 catalog, nutrient sources, rules, and capability manifest are not present in this checkout.

## Implemented

- Contract-backed routes: `GET /internal/v1/capabilities`, `GET /internal/v1/catalog`, `POST /internal/v1/analyses`, and `POST /internal/v1/recalculations`.
- Two A1V1 evaluation routes: `/internal/ai-service/a-model` and `/internal/ai-service/b-model`. They use the locked benchmark prompt/schema and fixed generation settings, have no cross-model fallback, and do not reveal model identity in the URL or response headers. Their direct nutrient estimates are for evaluation only; production `/analyses` remains source-backed/null-safe.
- One API rate limit shared by authenticated internal routes: 5 requests/minute by default, configurable through `API_RATE_LIMIT_PER_MINUTE`. Over-limit responses use HTTP `429` and `Retry-After`. The counter is process-local and resets after restart; use one worker for the configured limit to apply as one shared quota. No Redis is required.
- Service-key authentication, signed image URL host checks, redirect refusal, a 10 MiB image download limit, MIME and SHA-256 verification, metadata removal, and JPEG normalization before provider submission.
- Request and response validation against the shared OpenAPI contract. Profile data is not sent to the VLM, and request bodies, photos, profile values, and signed URLs are not logged.
- Safe unconfigured behavior: unsupported nutrition values remain null until approved artifacts are installed.

## Verification

- The real HTTP smoke script tests a simulated provider by default and can make exactly two live Alibaba requests with `--live`. It also checks invalid service keys, body limits, the A1V1 response schema, and 20 over-limit requests without extra photo downloads. Results are recorded in `docs/ENDPOINT_SECURITY_SMOKE_2026-10-15.md`.
- On the live smoke sample, A returned HTTP 200 in 5.445 s and B returned HTTP 200 in 2.596 s. This was one request per alias, not a latency benchmark. The real calls were made before the rate-limit code was simplified; the final rate-limit behavior is checked with the simulated-provider smoke run.
- Final implementation checks: `uv run pytest -q` **39 passed**; compile and `uv lock --check` passed; contract validator passed with 2 OpenAPI documents, 40 operations, and 438 local references.

## Remaining work

1. Obtain and validate the versioned T31 food catalog, nutrient sources, rules, and capability manifest; then replace the empty bootstrap stores.
2. Add fixture-backed tests for complete, partial, unrecognized, and attention cases, including golden nutrient calculations and recalculation behavior.
3. Run the contract validator and acceptance checks against the approved artifacts before treating C32 as production-ready.

## Run locally

From `ai-service/`, run `uv sync --all-groups`, copy `.env.example` to `.env`, and configure `AI_SERVICE_KEY`, `DASHSCOPE_API_KEY`, `VLM_BASE_URL`, and the exact signed MinIO hostname in `MEDIA_ALLOWED_HOSTS`. Start with one worker so the in-memory rate limit is shared by all API routes in that process:

```sh
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
```
