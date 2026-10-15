# Carin AI service

FastAPI implementation of the shared internal Carin AI contract. It is stateless, has no user database access, and accepts requests only from the backend/worker using `X-Carin-Service-Key`.

## Run locally

From this directory:

```sh
uv sync --all-groups
cp .env.example .env
```

Set `AI_SERVICE_KEY`, `DASHSCOPE_API_KEY`, `VLM_BASE_URL`, and an exact MinIO host in `MEDIA_ALLOWED_HOSTS` in `.env`. Use the OpenAI-compatible `/v1` endpoint and key for the same Alibaba Model Studio region. The Qwen snapshot and fallback are prefilled; the fallback is skipped when it matches the primary.

```sh
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

The shared contract and Swagger UI are available at `/openapi.json` and `/docs`. The served document uses the same-origin base URL; paths and payload schemas come from the repository OpenAPI contract. Every internal API route requires `X-Carin-Service-Key`.

## Routes

- `GET /internal/v1/capabilities`
- `GET /internal/v1/catalog?version=...&cursor=...&limit=100`
- `POST /internal/v1/analyses`
- `POST /internal/v1/recalculations`
- `POST /internal/ai-service/a-model`
- `POST /internal/ai-service/b-model`

`POST /analyses` accepts the contract's `PhotoAnalysisRequest`; the image must be a signed URL on the exact MinIO host allowlist, with matching `mimeType` and SHA-256. The service refuses redirects, caps downloads at 10 MiB and decoded images at 16 megapixels, strips metadata by re-encoding and resizes the image before sending it to Qwen. The sanitized profile is not sent to the VLM.

Example request (replace the operation ID, signed URL and hash with values issued by the backend):

```json
{
  "contractVersion": "2.0.0",
  "operationId": "2d3b9841-8d78-44d0-8a8b-c3d173f89a34",
  "catalogVersion": "unconfigured",
  "ruleSetVersion": "unconfigured",
  "profile": {
    "profileVersion": 0,
    "ageYears": null,
    "heightCm": null,
    "weightKg": null,
    "sexForReference": null,
    "diagnosisState": "not_provided",
    "conditionIds": [],
    "unsupportedConditionLabels": [],
    "allergyState": "not_provided",
    "allergies": [],
    "activity": null,
    "smoking": null
  },
  "image": {
    "downloadUrl": "http://minio:9000/private/meal.jpg?signature=issued-by-backend",
    "mimeType": "image/jpeg",
    "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
}
```

The bootstrap capabilities response currently advertises no supported food IDs, nutrients, or conditions and uses `unconfigured` artifact versions. `/analyses` exact-matches VLM food names against the loaded catalog. For unmatched food components in photo analyses, it makes a second structured VLM request for visual nutrient estimates. These values are included in component nutrients, coverage, and totals, and carry a `model_estimate` source plus a critical limitation; they are not catalog facts or verified nutrition. If estimation fails or a nutrient is omitted, recognition still succeeds and that nutrient remains unavailable. `/catalog` returns an empty page for the unconfigured bootstrap version. `/recalculations` preserves user-entered portions but returns null nutrients; it rejects catalog food IDs it cannot resolve. Approved T31 catalog/nutrition/rule artifacts remain necessary for supported catalog matches and production C32 acceptance.

For a local end-to-end plumbing test, set `APP_ENV=dev` and
`AI_CATALOG_MODE=synthetic-demo`. The VLM remains provider-backed; service output
is exact-matched against `data/synthetic-demo/catalog.json` and totals are
calculated deterministically from its clearly synthetic values. The capability,
catalog and analysis responses use the shared 2.0.0 wire schema and advertise
`dataMode: synthetic`; the manifest deliberately contains no health conditions
or rules. The API can import this immutable catalog through the normal catalog
import command. Synthetic mode fails startup outside `dev` and `test`; its
numbers are not nutritional facts and do not satisfy T31 or production C32.

The two `/internal/ai-service/` routes are for paired model evaluation. They accept `{"image":{"downloadUrl":"...","mimeType":"image/jpeg","sha256":"..."}}`, using the same signed-MinIO checks as `/analyses`, and return the strict A1V1 JSON object. The neutral route labels map to two fixed model choices in the service; both use the benchmark A1V1 prompt/schema, the configured `VLM_BASE_URL` and credential, `temperature=0`, `enable_thinking=false`, and `max_tokens=1024`. Neither route falls back to another model. The response includes only the `X-Carin-Variant: A1V1` header.

On the locked 25-image paired benchmark, Max was the better overall A1V1 candidate: normalized MAE was 38.321% vs Flash's 47.203%, and mass MAE was 37.7 g vs 57.6 g. Max was slower on average (5.59 s vs 4.06 s). The API still strips image metadata and resizes to 1,600 px before inference, so the benchmark is a candidate-selection reference rather than a runtime accuracy guarantee. These routes deliberately expose direct VLM nutrient guesses to compare models; those numbers are not catalog-grounded and must not replace `/analyses` for user-facing health guidance.

Error responses use the shared `{ "error": { "code", "message", "retryable", "requestId", "details" } }` envelope. Input and successful response bodies are validated against `specs/contracts/ai-service.openapi.yaml` at runtime. The service logs request IDs only and does not log request bodies, profile values, photos, or signed URLs.

## Request protection

The service accepts 5 authenticated API requests per minute by default, shared across all internal routes. Over-limit requests return `429` with `Retry-After` before photo download or model inference. The counter is held in process memory and resets on restart; run one worker to keep the configured quota exact. Set `API_RATE_LIMIT_PER_MINUTE` in `.env` to change the limit. The JSON body is limited to 64 KiB and reading it is limited to 5 seconds. Health-data responses use `Cache-Control: no-store`; response headers and paths do not identify the model. See [SECURITY.md](SECURITY.md) for the rate limit behavior.

## Tests

```sh
uv run pytest
```

Tests use a mocked VLM transport and do not make paid provider calls. The full repository contract checks can be run from the repository root after syncing the project dependencies:

```sh
uv run --project ai-service python specs/validate-contracts.py
```

The reusable HTTP smoke test starts a temporary Uvicorn server and object-storage fixture. The default provider is simulated; `--live` uses the service `.env` for exactly two target paid requests without retries. Both modes then check 20 over-quota requests without extra media/provider work:

```sh
uv run python scripts/smoke_endpoints.py
uv run python scripts/smoke_endpoints.py --live
```

The smoke test sets its temporary API quota to 2/minute; the service default remains 5/minute. The report at [docs/ENDPOINT_SECURITY_SMOKE_2026-10-15.md](docs/ENDPOINT_SECURITY_SMOKE_2026-10-15.md) separates live evidence from simulation and unit checks.

## Dependency artifacts still needed

Issue C32 depends on approved T31 catalog, nutrient sources, rules and capability manifest. They are not present in this checkout. The current unconfigured mode intentionally has empty support and does not synthesize those artifacts. Once they are delivered, wire them into the catalog/rule stores and add provider tests for matched, partial, complete, attention and golden nutrient calculations before advertising any supported scope.
