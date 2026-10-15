# Endpoint and API rate-limit smoke test

Date: 2026-10-15
Branch: `feat/t32-real-ai-service`
Image: `lefood-14.jpg`

## Current code: simulated-provider smoke

The final single-quota implementation was tested through local HTTP with the same image-normalization path and a simulated provider. The test temporarily set the API quota to 2 authenticated requests per minute. Both aliases returned valid A1V1 JSON, then 20 alternating calls across A, B, and `/internal/v1/analyses` returned `429`. There were no additional photo downloads after the two allowed calls.

| Endpoint | HTTP | Time | Schema |
| --- | ---: | ---: | --- |
| `/internal/ai-service/a-model` | 200 | 0.088 s | Valid |
| `/internal/ai-service/b-model` | 200 | 0.063 s | Valid |

These timings are from a local simulated provider, not model latency. [Machine-readable smoke output](endpoint-security-simulated.json).

## Live Alibaba response sample

Before simplifying the limiter to one API quota, each alias was called once against Alibaba through the local HTTP service. Both responses passed the A1V1 schema. The recorded times include local HTTP, fixture image download/normalization, provider response, and JSON validation.

| Endpoint | HTTP | Time | Schema | Estimated portion |
| --- | ---: | ---: | --- | ---: |
| `/internal/ai-service/a-model` | 200 | 5.445 s | Valid | 100 g |
| `/internal/ai-service/b-model` | 200 | 2.596 s | Valid | 175 g |

This is one request per alias, not an average or a mobile end-to-end benchmark. The two live calls used a local image-storage fixture; they did not verify signed URLs against a deployed MinIO service. No more paid calls were made when the limiter was simplified. [Original live smoke output](endpoint-security-live.json).

## Checks and limits

- `uv run pytest -q`: 39 tests passed.
- Repository contract validator: 2 OpenAPI documents, 40 operations, 438 local references, 5 fixtures, and the math/coverage/provenance checks passed.
- `uv lock --check` and Python compile checks passed.
- The final API limit is 5 authenticated requests per minute by default, shared across internal routes in one process. The smoke test temporarily lowered it to 2 to check rejection behavior.
- The counter is in process memory and resets at restart. Each worker has its own counter; run one worker for a single shared quota.
- The API limiter test used a simulated provider. Production T31 nutrition artifacts are still missing, so `/internal/v1/analyses` remains null-safe and is not ready to provide validated nutrition guidance.
