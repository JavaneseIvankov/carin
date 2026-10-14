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
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --no-access-log
```

The shared contract and Swagger UI are available at `/openapi.json` and `/docs`. The served document uses the same-origin base URL so Swagger “Try it out” works from localhost or a teammate's LAN address; paths and payload schemas come from the repository OpenAPI contract, not a second copy. All four internal routes require `X-Carin-Service-Key`. Do not expose the AI service directly to the public internet or mobile app.

## Routes

- `GET /internal/v1/capabilities`
- `GET /internal/v1/catalog?version=...&cursor=...&limit=100`
- `POST /internal/v1/analyses`
- `POST /internal/v1/recalculations`

`POST /analyses` accepts the contract's `PhotoAnalysisRequest`; the image must be a signed URL on the exact MinIO host allowlist, with matching `mimeType` and SHA-256. The service refuses redirects, caps downloads at 10 MiB, strips metadata by re-encoding and resizes the image before sending it to Qwen. The sanitized profile is not sent to the VLM.

Example request (replace the operation ID, signed URL and hash with values issued by the backend):

```json
{
  "contractVersion": "1.0.0",
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

The bootstrap capabilities response currently advertises no supported food IDs, nutrients, or conditions and uses `unconfigured` artifact versions. A live VLM call can return candidate food names and a visual portion proposal, but `/analyses` correctly reports `unrecognized`, null nutrients and insufficient information until approved T31 catalog/nutrition/rule artifacts are supplied. `/catalog` returns an empty page for this bootstrap version. `/recalculations` preserves user-entered portions but returns null nutrients; it rejects catalog food IDs it cannot resolve. This lets the team exercise the real HTTP/VLM path without presenting invented nutrition as valid output. It does not complete C32 production acceptance.

Error responses use the shared `{ "error": { "code", "message", "retryable", "requestId", "details" } }` envelope. Input and successful response bodies are validated against `specs/contracts/ai-service.openapi.yaml` at runtime. The service logs request IDs only and does not log request bodies, profile values, photos, or signed URLs.

## Tests

```sh
uv run pytest
```

Tests use a mocked VLM transport and do not make paid provider calls. The full repository contract checks can be run from the repository root after syncing the project dependencies:

```sh
uv run --project ai-service python specs/validate-contracts.py
```

## Dependency artifacts still needed

Issue C32 depends on approved T31 catalog, nutrient sources, rules and capability manifest. They are not present in this checkout. The current unconfigured mode intentionally has empty support and does not synthesize those artifacts. Once they are delivered, wire them into the catalog/rule stores and add provider tests for matched, partial, complete, attention and golden nutrient calculations before advertising any supported scope.
