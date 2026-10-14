# AI Service Progress

Last updated: 2026-10-14
Branch: `feat/t32-real-ai-service`
Scope: C32 AI service for the shared Carin API contract

## Status

The FastAPI service bootstrap is implemented and locally verified. The HTTP and provider integration can be exercised, but production nutrition results are not enabled yet: the approved T31 catalog, nutrient sources, rules, and capability manifest are not present in this checkout. A live Alibaba Model Studio request has also not been tested because no provider credentials are configured.

## Implemented

- Contract-backed routes: `GET /internal/v1/capabilities`, `GET /internal/v1/catalog`, `POST /internal/v1/analyses`, and `POST /internal/v1/recalculations`.
- Shared service-key authentication, request/response validation, and the standard error envelope. Swagger UI and the served OpenAPI document are available at `/docs` and `/openapi.json`.
- Alibaba-compatible VLM adapter configured for `qwen3.7-flash-2026-07-15`, with `qwen3.7-flash` as the image-capable fallback.
- Signed MinIO URL checks, exact host allowlist, redirect refusal, 10 MiB download limit, MIME and SHA-256 verification, and image metadata removal/re-encoding before provider submission.
- Stateless service behavior: profile data is not sent to the VLM and request bodies, photos, profile values, and signed URLs are not logged.
- Safe unconfigured behavior: unsupported nutrition values remain null rather than being guessed. Catalog support is empty until approved artifacts are installed.

## Verification completed

- `uv run pytest -q` from `ai-service`: **14 passed**. Provider calls are mocked; this does not verify live Qwen availability or quality.
- `uv run --project ai-service python specs/validate-contracts.py` from the repository root: **passed** (2 OpenAPI documents, 38 operations, 408 local references, 5 fixtures, contract math/coverage/provenance checks, and 3 negative probes).
- `uv lock --check` and `python -m compileall -q app tests` from `ai-service`: **passed**.
- Local Uvicorn smoke test: capabilities, catalog, recalculations, and OpenAPI responded successfully. Recalculation correctly returned partial output with null nutrient values while artifacts were unconfigured. This used a temporary service key and did not call Alibaba.

## Remaining work

1. Obtain and validate the versioned T31 food catalog, nutrient sources, rules, and capability manifest; then replace the empty bootstrap stores.
2. Add fixture-backed tests for complete, partial, unrecognized, and attention cases, including golden nutrient calculations and recalculation behavior.
3. Configure the provider key and endpoint locally, then run a small live Qwen smoke test and record latency, errors, and output validation. Do not commit credentials.
4. Re-run the contract validator and acceptance checks against the approved artifacts before treating C32 as production-ready.

## Run locally

From `ai-service/`, run `uv sync --all-groups`, copy `.env.example` to `.env`, and configure `AI_SERVICE_KEY`, `DASHSCOPE_API_KEY`, `VLM_BASE_URL`, and the exact signed MinIO hostname in `MEDIA_ALLOWED_HOSTS`. Start the service with:

```sh
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --no-access-log
```

Keep the service internal to the backend/worker network; all four API routes require `X-Carin-Service-Key`.
