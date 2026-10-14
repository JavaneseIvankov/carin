# C18 Scan and Analysis API Implementation Plan

> **For agentic workers:** Execute this plan inline in the assigned C18 integration worktree. Keep TSK 18 started until review.

**Goal:** Create owner-scoped photo scans, durable automatic analysis and correction jobs, immutable result/scan reads, and safe publication behind existing consent and job fences.

**Architecture:** Add focused `modules/analyses` and `modules/scans` repositories, services, and routes. Reuse the existing PostgreSQL scan/job/result/profile snapshot tables, C16 transactional job queue/publication, C17 media ownership and signed MinIO URL service, current app session resolver, and generated OpenAPI validators. Freeze an AI `ProfileContext` and immutable catalog/rule versions with every scan; resolve the private image URL per worker attempt; validate operation/profile/version/source/math and correction identity before publication.

**Tech Stack:** TypeScript, Hono, Drizzle/PostgreSQL, generated OpenAPI 3.1 schemas, Vitest, existing AI client and private media seam.

---

## File map

- `carin-api/src/modules/analyses/{result-validation,snapshot,repository,routes}.ts`: AI request snapshots, source/math validation, durable photo-job creation, immutable result reads, and authenticated HTTP handlers.
- `carin-api/src/modules/scans/{repository,routes}.ts`: owner-scoped scan reads/list pagination and expected-revision corrections.
- `carin-api/src/jobs/worker.ts`: materialize photo requests from persisted photo metadata plus an injected private URL resolver; run the result validator before fenced publication.
- `carin-api/src/app.ts`, `carin-api/src/index.ts`, `carin-api/src/worker.ts`, `carin-api/src/config.ts`: register protected routes and compose the existing media service/store only from validated runtime configuration.
- `carin-api/src/modules/analyses/*.unit.test.ts`, `carin-api/tests/integration/analysis-scan.integration.test.ts`, `carin-api/tests/integration/jobs.integration.test.ts`: test domain validation, transaction races, ownership, worker fences, and contract responses.
- `docs/handoffs/t18-scan-analysis-api.md`: record changed files, actual checks, remaining platform/provider gates, and worktree state.

## Task 1: Pin analysis result invariants with tests

- [x] Test operation/profile/catalog/rule version mismatches, source-reference gaps, forged catalog values, nutrient/portion math, partial/unrecognized results, and correction component identity.
- [x] Run the focused unit tests and confirm they fail because the validator is absent.
- [x] Implement a pure result validator over an expected request snapshot and a frozen catalog lookup; enforce source dataset/version, component selection, serving grams, nutrient scaling, totals, coverage, and status consistency.
- [x] Rerun the focused unit tests and confirm every valid fixture path passes while malformed AI output fails.

## Task 2: Create automatic scans and initial jobs

- [x] Add PostgreSQL integration tests for current consent, active-session/photo ownership, duplicate photo binding, idempotency replay/conflict, active-job limit, profile version-zero/current snapshots, frozen catalog version, and atomic scan/job/photo attachment.
- [x] Run the focused integration suite and confirm missing C18 routes/repository behavior fail the intended assertions.
- [x] Implement one transaction with lock order `user → session/idempotency → photo → profile/catalog`; insert immutable profile snapshot, revision-1 scan, `photo_analysis` job and latest-job pointer; mark the photo attached; persist the 202 idempotency response.
- [x] Build the stored initial request from contract version, current immutable catalog/rule version, sanitized profile context and photo checksum/MIME. Do not accept client nutrition, profile context, or image URLs.
- [x] Rerun the initial-scan integration tests, including scan-only behavior and cross-account 404 equivalence.

## Task 3: Add correction transactions and scan/result reads

- [x] Add integration tests for stale expected revisions, noncurrent based-on results, unavailable/mismatched catalog versions, half portions, food replacement, unmatched/unknown portions, competing corrections, failed correction preservation, confirmation blocking while pending, and owner isolation.
- [x] Run the focused integration suite and confirm these behaviors fail before implementation.
- [x] Implement corrections against the immutable scan profile snapshot and current result catalog/rule versions; lock the scan, reject an active latest job, increment target generation, enqueue the next revision, and change only the latest-job pointer until publication.
- [x] Implement `GET /api/v1/scans`, `GET /api/v1/scans/{id}`, and `GET /api/v1/analysis-results/{id}` with contract validation and owner filters on every query.
- [x] Rerun focused tests and ensure scan revision/current result change only after successful publication.

## Task 4: Resolve private image URLs in the durable worker

- [x] Add a worker test with an injected photo URL resolver and a result validation failure; confirm no invalid output is inserted or promoted.
- [x] Extend worker options with the injected resolver. Construct the exact AI photo request per claim from the frozen snapshot and live owner-checked C17 photo record; never use a client URL. Keep old internal fixture-request test input compatible while migrating the test to the explicit seam.
- [x] Wire `createMediaService(...).createAiPhotoUrl` into the worker; wire protected media, analysis-job, analysis and scan routes into the verified API composition using the configured MinIO adapter.
- [x] Rerun worker tests and verify stale attempts, deletion, consent withdrawal, and invalid provider responses remain fenced by C16 publication.

## Task 5: Verify and hand off

- [x] Run `pnpm run typecheck`, `pnpm run lint`, `pnpm run test:unit`, API integration tests, `pnpm run build`, `pnpm run db:generate`/drift check, and the root contract validator from their documented directories.
- [x] If Docker/PostgreSQL or required cross-package dependencies are unavailable, record the exact failed/unavailable commands and run all independent available checks.
- [x] Review `git diff --check`, update the implementation plan checkboxes and `docs/handoffs/t18-scan-analysis-api.md`, then commit locally with a conventional message; do not push or mark TSK 18 done.

## Review follow-up: imported capability authority and profile eligibility

- [x] Extend the additive AI capability contract with `supportedRules`, binding an exact rule ID and condition ID to exact citation-source objects. An omitted/empty list declares no publishable health-rule claims.
- [x] Persist the exact imported capability manifest in append-only migration `0007`, with update/delete protection; verify photo-food IDs and rule/condition/source consistency while importing.
- [x] Load the stored manifest for worker validation and fail closed if it is missing or disagrees with immutable catalog version metadata.
- [x] Reject photo matches outside `supportedPhotoFoodIds`; reject attention claims unless the condition is in the frozen profile, is marked supported in the manifest, and the exact rule/condition/source authority matches. A profile-version-zero snapshot cannot publish an attention.
- [x] Add unit and PostgreSQL integration coverage for unsupported photo matches, unbacked/mismatched rule citations, unsupported profile conditions, empty profiles, and missing manifests. Synthetic provider fixtures explicitly declare their supported food/rule/source authority.
- [x] Preserve `lockScanForConfirmation` as the transaction seam. C21 must call it in the transaction that persists consumption confirmation; no C18 confirmation route exists to call it here.
- [x] Re-run API typecheck, lint, unit and integration suites, build, Drizzle no-drift, app contract generation check, root OpenAPI validation, and diff check. Live AI/source validation remains gated by C31 and is unverified.
