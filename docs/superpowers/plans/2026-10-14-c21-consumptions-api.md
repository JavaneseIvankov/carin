# C21 Consumption API Implementation Plan

> Execute in the isolated `feat/c21-consumptions-api` worktree. Keep TSK 21 started for review; do not push.

**Goal:** Persist owner-scoped manual and photo-confirmed consumption with deterministic nutrition snapshots, durable idempotency, and safely fenced personal evaluation.

**Architecture:** Add a focused `modules/consumptions` domain/repository/routes module. Reuse C18 scan ownership/current-result guard and immutable catalog, profile snapshot, analysis-result, consumption, and job tables. Every create/edit transaction writes the consumption revision, nutrition snapshot, evaluation state, optional frozen-profile job, and idempotency response atomically. Extend the existing worker path to validate consumption evaluations against their frozen request/catalog authority, then rely on C16's lease, generation, current-target, deletion, and consent publication fences.

**Invariants:** Manual records have null scan/result references. Photo confirmation calls `lockScanForConfirmation` inside the same transaction that saves the row and requires the owner's current result. Unknown portions, unmatched foods, and missing nutrients remain explicit and never prevent saving. Nutrition is recomputed from the exact versioned catalog and actual portion, then stored immutably per revision. Edit increments revision/generation and installs a new snapshot/evaluation pointer so an old worker cannot publish over it. Replays return their original HTTP status/body; new-key equal default confirmations return the existing record, while changed input conflicts. Explicit `new_occurrence` bypasses the default uniqueness rule.

## File map

- `carin-api/src/modules/consumptions/{nutrition,repository,routes}.ts`: deterministic snapshot math, transactional create/read/list/update/delete, validation/errors, and authenticated contract handlers.
- `carin-api/src/jobs/worker.ts` and `carin-api/src/modules/analyses/result-validation.ts`: frozen manual-consumption evaluation request and provenance/math validation; preserve C16/C18 fences and C18 photo/correction rules.
- `carin-api/src/app.ts`, `carin-api/src/index.ts`: register consumption routes in verified API composition.
- `carin-api/src/modules/consumptions/*.unit.test.ts`, `carin-api/tests/integration/consumptions.integration.test.ts`: portion math, ownership, lifecycle, timeout replay, races, and stale-worker behavior.
- `docs/handoffs/t21-consumptions-api.md`: actual implementation, checks, limitations, commit, and review status.

## Task 1: Pin deterministic actual-portion snapshot behavior

- [x] Add unit tests for half portions, unknown/unmatched components, per-nutrient nulls, source/provenance retention, and totals/coverage.
- [x] Run focused tests and confirm the expected missing behavior fails.
- [x] Implement a pure snapshot builder over canonical component inputs and exact catalog/serving facts. Never accept client nutrition/source claims; round deterministically and retain nulls.
- [x] Re-run unit tests and keep the generated snapshot schema-valid.

## Task 2: Add atomic owner-scoped create/read/list and idempotency

- [x] Add PostgreSQL integration tests for manual references, current owned photo result, pending scan guard, source/catalog checks, stale food/serving selections with no side effects, future-time boundary, owner isolation, unmatched saves, idempotency replay after commit, and competing default submissions.
- [x] Run the focused integration tests and confirm missing route/repository behavior fails for the intended assertions.
- [x] Implement lock order with owner/session/idempotency/source checks; call `lockScanForConfirmation` in this same transaction before writing photo-confirmed consumption.
- [x] Snapshot exact selected inputs/catalog values/profile context. Schedule evaluation only when current consent, profile, and catalog/rule capabilities support it; persist explicit `not_requested` explanations otherwise. Reuse current photo-result attention only for identical inputs and the same frozen profile/catalog.
- [x] Store original response status/body and keep the schema's active-default confirmation unique index authoritative under races.
- [x] Implement owner-filtered GET/list pagination and snapshot/evaluation response composition.

## Task 3: Add immutable revision edits, deletion, and evaluation publication

- [x] Add integration tests for edit math/revision, failed enrichment preserving nutrition, stale worker after edit/delete, source-result purge preserving reused photo attention after create and metadata-only edit, revoked-consent suppression of reuse, same/different duplicate inputs, explicit new occurrence, delete then reconfirm, and snapshot immutability.
- [x] Run the focused integration tests and observe failures before implementation.
- [x] Implement edit as an atomic generation/revision change with a new snapshot, profile snapshot, evaluation/job, and current pointer; preserve historical snapshots and make deletion immediately exclude the resource. Freeze reused photo evaluation output, limitations, and source references into the consumption snapshot only while current AI consent is granted.
- [x] Extend worker validation for frozen manual evaluation and reject stale catalog/profile/component/portion/source or unsupported capability output. Publish only through existing C16 target/lease/consent/deletion fences.
- [x] Keep all nutrition values independent from evaluation pending/failure.

## Task 4: Wire, verify, and hand off

- [x] Register `/api/v1/consumptions` routes in the verified app composition and validate requests/responses through generated OpenAPI types.
- [x] Run API typecheck, lint, unit/integration tests, build, `db:generate` drift check, app contract check, root contract validator, and `git diff --check` from documented working directories.
- [x] Preserve C18 migration `0007` and the migration manifest; existing C18 schema meets the consumption invariants, so no new migration is needed.
- [x] Update this plan and `docs/handoffs/t21-consumptions-api.md`; commit locally with a conventional message. Leave TSK 21 started and do not push.
