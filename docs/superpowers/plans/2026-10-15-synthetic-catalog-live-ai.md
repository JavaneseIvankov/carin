# Synthetic Catalog with Live AI Integration Plan

> **For agentic workers:** Execute inline in this worktree. Keep TDD order for behavior changes.

**Goal:** Exercise the real photo model through the existing API and app flow using an explicitly synthetic, versioned food catalog.

**Architecture:** AI service loads a development-only synthetic bundle and publishes the shared capability/catalog contracts. Real VLM proposals are matched by normalized exact name or alias; nutrient totals are deterministic projections of synthetic per-100g data. Carin API imports that version through its existing importer. End-to-end testing uses an isolated stack so the shared active catalog remains untouched.

**Tech Stack:** FastAPI/Python, JSON artifacts, Hono/TypeScript API, Docker Compose, Expo, agent-device.

---

## File map

- `ai-service/data/synthetic-demo/`: synthetic versioned capability, catalog and source data for dev live testing.
- `ai-service/app/config.py`: explicit catalog mode with a dev-only guard.
- `ai-service/app/service.py`: catalog projections, exact alias matching, deterministic nutrient totals and safe unknown handling.
- `ai-service/app/main.py`: load the selected catalog mode once and serve version-aware endpoints.
- `ai-service/tests/test_api.py`: provider-independent contract behavior tests.
- `ai-service/Dockerfile` and `infra/compose.yaml`: include bundle and development mode wiring.
- `infra/README.md`: isolated live-test setup and synthetic-data limitations.
- `carin-api/src/integrations/ai/adapters.unit.test.ts`: preserve synthetic provenance and contract behavior.

## Task 1: Define the synthetic bundle

- [ ] Add a small synthetic set with recognizable names/aliases, explicit synthetic nutrition/portion sources, stable version IDs, no health rules, and no production publication claim.
- [ ] Validate it against the shared wire schemas and assert every synthetic source uses a `.invalid` URL.
- [ ] Confirm ordinary service startup still advertises the empty `unconfigured` bundle.

## Task 2: Implement service catalog behavior test-first

- [ ] Add failing tests for capability/catalog pagination, exact normalized alias match, deterministic nutrients, partial/unrecognized output, and version mismatch short-circuiting before media fetch.
- [ ] Run the focused AI service tests and confirm those assertions fail for the missing behavior.
- [ ] Implement guarded bundle loading, capability/catalog responses, match/compute logic, provenance, and safe null/coverage handling.
- [ ] Run the focused tests, then all AI service tests and the artifact/contract validators.

## Task 3: Wire the integration environment

- [ ] Copy the selected bundle into the AI service image and add an explicit dev-only mode setting.
- [ ] Update Compose and README so the API importer can import the exact same snapshot without changing the normal unconfigured default.
- [ ] Run API unit/type/lint/build checks and Compose configuration tests.

## Task 4: Validate through isolated API and phone

- [ ] Start a distinct Compose project/database/MinIO namespace and confirm API, worker and AI service health.
- [ ] Import the synthetic catalog into only that database and verify the active version and source labels.
- [ ] Point Expo at that API, run camera/photo analysis with agent-device, and verify the job result screen shows matched synthetic output and source/limitation labels.
- [ ] Record device/model result, test commands, and any remaining limitation in the handoff.
