# AI Service Progress

Last updated: 2026-10-16
Branch: `dev` (integrated from `feat/t32-real-ai-service`)
Scope: C32 AI service for the shared Carin API contract

## Current dev integration

Task / scope: Merge AI-service commit `536d4ae` into the current app/API code and preserve valid partial photo analyses. The merge is recorded in `dc6e7eb`.

Changes: The single-call VLM path is retained. Unknown component mass or individual nutrients may be `null`; recognized food and known values remain available without an extra fallback call. Missing fields, invalid structure, negative/nonfinite values and truncated responses remain errors. The provider prompt/schema, API regression tests, README and AI data policy spec describe the same behavior. Draft catalog and health-rule activation remain separate work.

Verification (2026-10-16): Using the isolated Python 3.12.13 environment, `python -m pytest -q` from `ai-service/` passed all 113 tests. The three new endpoint cases first reproduced HTTP 503, then passed with HTTP 200 after the fix. From the repository root, `python ai-service/validate_data_artifacts.py` and `python specs/validate-contracts.py` passed. From `carin-api/`, the targeted adapter, analysis-validation, consumption-nutrition and evaluation Vitest suites passed all 78 tests. `git diff --check` passed.

Unverified work: The merged runtime has not been rebuilt/deployed, and this integration pass did not call a live provider or operate a phone. Next step: rebuild the AI-service container and verify photo analysis, explicit consumption confirmation and dashboard intake on the connected device.

Worktree state: Main workspace is on `dev`. The earlier `real-ai-live-integration` worktree is preserved at detached `623d216`; the source feature branches are preserved. This integration has not been pushed.

## Status

The FastAPI service and both A1V1 evaluation routes are implemented. `/internal/v1/analyses` now returns seven per-portion nutrient estimates from a single structured VLM call, even without a catalog match. These are labeled `model_estimate`, not verified catalog facts. Disease-based recommendations are not implemented; the existing 2.0.0 contract still requires an insufficient personal-assessment status in this situation.

## 2026-10-16: dev integration and MVP estimates

- Fast-forwarded `feat/t32-real-ai-service` from `8a53051` to `origin/dev` at `1578724`. Preserved all pre-existing draft data/scripts/tests. Resolved the stash-application conflict in `data/capability-manifest.json` by retaining local catalog/rule metadata and using dev's existing `contractVersion: 2.0.0`.
- Updated only the production VLM prompt/internal schema: visual geometry before mass, best-effort recipe assumptions, seven numeric per-component nutrient estimates, explicit gram/milligram units, strict JSON, `temperature=0`, `enable_thinking=false`, and a 4096-token output ceiling. User profiles are not sent to the VLM. The two locked A1V1 benchmark prompts/routes retain their original payloads.
- Inline estimates populate the existing component nutrient, provenance, total and coverage fields without a second request. Catalog values take precedence; duplicate food names keep separate component identities. A legacy second-call failure preserves valid inline estimates.
- No OpenAPI schema/path/type/enum or generated consumer change was made beyond the changes already brought in from `dev`. Numeric nutrition is available while the existing `overallAttention` continues to describe the unimplemented personal assessment.
- Verification: AI-service tests **111 passed**; shared contract validator **PASS** (2 documents, 42 operations, 453 local references, 6 fixtures, 3 negative probes); draft artifact validator **PASS**.
- Live smoke: one existing LeFood-Set image, real provider plus ASGI endpoint dispatch and local HTTP media download. HTTP **200**, **1 provider call**, all **7 nutrient totals numeric**, **5.425 s** endpoint time. See [sanitized live result](docs/nutrition-estimation-live-2026-10-16.json). This verifies execution/format only; no MAE or medical recommendation evaluation was run.
- Backend checks: TypeScript build **PASS**; **65 targeted consumer/analysis-validator tests passed**. The exact live result was also accepted by the compiled backend's source, portion, total/coverage and status validation. The pnpm wrapper initially stopped on ignored dependency build scripts; running the installed TypeScript/Vitest entry points directly succeeded without changing dependency permissions or repository configuration.
- Handoff: implementation and pre-existing data work remain uncommitted on `feat/t32-real-ai-service`; no push or draft catalog/rule activation. A pre-merge stash backup is retained. Profile-based recommendation rules are the next integration step and are not part of the verified nutrition-estimation output.

The historical implementation notes and original endpoint benchmark below describe the earlier service state.

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
