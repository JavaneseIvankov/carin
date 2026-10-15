# Per-Component VLM Nutrition Fallback Implementation Plan

> **For agentic workers:** Execute inline task-by-task using the approved T37 design and TDD. Keep every provider and consumer on the same contract version.

**Goal:** Add explicitly sourced VLM nutrient estimates for unmatched photo components and include known estimates in result totals and coverage.

**Architecture:** The AI Service first runs existing component recognition and catalog matching. When photo components remain unmatched, it makes a second structured VLM request scoped to those component IDs, merges valid per-portion estimates into the existing `nutrients` fields, and recalculates totals/coverage. Catalog-backed components retain deterministic values. Carin API validates provenance and math, stores the same result snapshot, and the app labels VLM values. Manual and correction paths remain catalog-only.

**Tech Stack:** FastAPI/Pydantic/httpx, OpenAPI 3.1.1, TypeScript/Hono/Ajv, Expo/React Native/Vitest, agent-device on Android.

---

## Files and boundaries

- `specs/contracts/ai-service.openapi.yaml`: contract 2.0.0, `model_estimate` source kind, and updated result semantics.
- `specs/contracts/app-api.openapi.yaml`: shared nested result contract version/reference where required.
- `specs/validate-contracts.py` and `specs/fixtures/ai/*.json`: synthetic contract fixtures must permit sourced model estimates and enforce totals/coverage.
- Generated contracts under `carin-app/lib/api/generated/` and `carin-api/src/contracts/generated/`: regenerate only with the repository script.
- `ai-service/app/provider.py`: structured per-component VLM estimation request and strict response validation.
- `ai-service/app/main.py`, `ai-service/app/service.py`: call estimator only for unmatched photo components; merge values and provenance; keep recognition successful on fallback failure.
- `ai-service/tests/test_api.py`, new `ai-service/tests/test_provider.py`: request shape, parsing, matching, merge, and failure cases.
- `carin-api/src/integrations/ai/index.ts`: response provenance rules for `model_estimate` and contract version.
- `carin-api/src/modules/analyses/result-validation.ts`: permit model sourced nutrients only on unmatched photo components; validate catalog math separately and include estimates in total/coverage recomputation.
- API tests under `carin-api/src/integrations/ai/` and `carin-api/src/modules/analyses/`: provenance, version, status, total, and snapshot coverage.
- `carin-app/lib/food/analysis-presentation.ts`, its unit test, and `carin-app/app/food/analysis/[id].tsx`: source label for VLM-derived values in component and total details.
- `carin-app/components/consumptions/consumption-detail.tsx` and its tests if needed: preserve/show labels after photo confirmation from the stored snapshot.
- `ai-service/README.md`, `specs/04-ai-data-and-policy.md`: document scope, contract version, and limits.

## Task 1: Contract 2.0.0 and generated types

**Files:** OpenAPI AI/App contracts; all generated contract outputs; AI request/result builders and fixtures that hardcode contract version.

- [ ] Add a failing contract assertion that `ContractVersion` accepts only `2.0.0`, and that `Source.kind` accepts `model_estimate`.
- [ ] Run the focused new AI Service contract test with `cd ai-service && uv run pytest tests/test_api.py -q` and the focused API validator test with `cd carin-api && pnpm exec vitest run src/modules/analyses/result-validation.unit.test.ts`.
- [ ] Update both contract document headers/info and AI `ContractVersion`; describe `unrecognized` as no catalog match while allowing sourced visual nutrients and totals. Change `specs/validate-contracts.py` so unmatched nutrients require `model_estimate` provenance and unrecognized totals are nullable only when no estimate exists.
- [ ] Change exact `1.0.0` contract constants/builders to `2.0.0`; leave unrelated artifact versions untouched.
- [ ] Run `pnpm run contracts:generate` and `pnpm run contracts:check` from `carin-app/`.
- [ ] Update the five analysis fixture contract versions and add a synthetic model-estimate fixture that includes source references, a numeric total, and matching per-nutrient coverage.
- [ ] Verify `python specs/validate-contracts.py` from the repository root.

## Task 2: Provider estimates per requested component

**Files:** `ai-service/app/provider.py`; new `ai-service/tests/test_provider.py`.

- [ ] Write a failing test that the estimator sends only requested component IDs/names and parses one nullable per-portion nutrient object per ID.
- [ ] Write failing tests for an extra ID, missing ID, duplicate ID, negative/non-finite values, malformed JSON, and provider timeout; each response must be rejected as a model failure.
- [ ] Add strict Pydantic models and a JSON schema containing `componentId` plus energy, carbohydrate, protein, and fat. Missing nutrients remain null; do not ask for per-100-g values, health advice, fiber, sugar, sodium, or full-photo totals.
- [ ] Add `VLMClient.estimate_component_nutrients(image_data, mime_type, components)` using the existing configured model and retry/fallback policy. Validate result IDs equal the request ID set exactly and every number is finite and nonnegative.
- [ ] Run `cd ai-service && uv run pytest tests/test_provider.py -q` and confirm pass.

## Task 3: AI Service fallback merge and safe degradation

**Files:** `ai-service/app/service.py`, `ai-service/app/main.py`, `ai-service/tests/test_api.py`.

- [ ] Add failing endpoint tests for (a) all matched: no estimator call; (b) unmatched: estimates mapped by component ID; (c) mixed matched/unmatched: matched catalog values unchanged and only unmatched IDs estimated; (d) per-nutrient null: null preserved; (e) unknown portion: estimate remains per pictured portion without inventing grams; (f) nonfood: no estimator call.
- [ ] Add failing endpoint tests for estimator exception and malformed response. Both must return the recognition result with null fallback nutrients and a component-scoped limitation.
- [ ] Add a pure merge helper that only updates unmatched photo components. Keep `per100g` null, attach one `model_estimate` source, point each known nutrient's `nutrientSourceIds` to it, and include its ID in that component's `sourceIds`.
- [ ] Recalculate totals and `knownComponentCount`/`totalComponentCount` from merged component nutrients; preserve `supportStatus` based on catalog matching and keep `overallAttention=insufficient_information` when critical limitations apply.
- [ ] In `/analyses`, call the estimator only when recognized food has unmatched components. Catch provider/parse errors only around the fallback call so initial recognition success is preserved.
- [ ] Run `cd ai-service && uv run pytest tests/test_provider.py tests/test_api.py -q` and confirm pass.

## Task 4: Carin API validation and snapshot path

**Files:** `carin-api/src/integrations/ai/index.ts`; `carin-api/src/modules/analyses/result-validation.ts` and colocated tests; snapshot/repository tests only if current persistence path drops a field.

- [ ] Add failing tests showing unmatched components may carry nonnegative nutrients only when each value references a `model_estimate` source on a photo result; reject model estimates on manual/correction, matched components, per100g, or missing provenance.
- [ ] Add failing tests showing an `unrecognized` result with model estimates passes when its totals/coverage recompute exactly, while catalog-only fixtures keep their existing behavior.
- [ ] Require model estimate source version `vlm-estimate-v1`, null URL, and source references from the same component. Allow this source in both real and synthetic catalog modes; continue rejecting synthetic catalog sources from real mode.
- [ ] In result math validation, accept sourced model estimates without catalog multiplication, keep catalog nutrients bound to the requested food artifact, and recompute totals/coverage over both kinds.
- [ ] Update API adapter contract version checks and add a round-trip snapshot assertion for model-estimated nutrients, source, and coverage.
- [ ] Run `cd carin-api && pnpm run test:unit` and `pnpm run typecheck`.

## Task 5: Mobile labels and persisted result display

**Files:** `carin-app/lib/food/analysis-presentation.ts`, `analysis-presentation.unit.test.ts`, `app/food/analysis/[id].tsx`, and consumption detail only if snapshot presentation needs it.

- [ ] Add a failing presentation test for a mixed catalog/model result. Assert VLM-derived nutrient source labels are explicit, catalog source labels remain distinct, and `null` is shown as unavailable.
- [ ] Add a failing presentation test for all-unmatched model estimates; show the nutrient values while retaining the unrecognized status and critical limitation.
- [ ] Add the smallest UI label that identifies model-backed values as “Estimasi visual VLM” at the component and nutrient detail; show existing source and limitation information without calling the estimates verified nutrition.
- [ ] Verify photo confirmation snapshots preserve the per-component nutrient/source fields and history details render the same source label when applicable.
- [ ] Run `cd carin-app && pnpm run test:unit`, `pnpm run test:integration`, `pnpm run typecheck`, `pnpm run lint`, and `pnpm run contracts:check`.

## Task 6: Contract verification and Android live test

**Files:** `ai-service/README.md`, `specs/04-ai-data-and-policy.md`, contract fixtures/tests, live phone only.

- [ ] Update docs with AI catalog mode behavior, contract 2.0.0, VLM-estimate provenance, known null behavior, and explicit non-clinical limitation.
- [ ] Run from repo root: `python specs/validate-contracts.py`; run `cd ai-service && uv run pytest`; run the API/app checks listed above.
- [ ] Read `.agents/skills/agent-device-live-testing/SKILL.md` and follow its exact daemon/session instructions. Discover the connected Android device, open the installed Expo Go app/session, and verify a real photo analysis containing an unmatched component shows an estimate label, totals, and limitations.
- [ ] If no connected phone, provider key, or reachable API is available, record the exact blocker and finish all contract, unit, integration, type, and lint checks without claiming live validation.

## Self-review

- Scope covers every T37 surface: AI provider, AI wire contract, API validation and persistence, app labels, and Android validation.
- The full-photo A1V1 benchmark endpoint remains unchanged and is not used by production fallback.
- Catalog-matched values stay catalog-derived; only unmatched photo components may receive model estimates; manual/correction paths stay unchanged.
- Version, provenance, null behavior, totals, coverage, and insufficient personal assessment remain explicit.
