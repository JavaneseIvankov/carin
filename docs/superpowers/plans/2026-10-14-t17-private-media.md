# T17 Private Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement private normalized photo uploads, five-minute owner media grants, ten-minute internal AI read URLs, and durable one-hour orphan cleanup.

**Architecture:** Keep upload normalization, grants, MinIO, PostgreSQL access, cleanup, and Hono routes in focused files under `carin-api/src/modules/media/`. Mount routes through `createApp` only when the existing session resolver and media dependencies are injected. Reuse the existing `photo` and `deletion_task` tables, avoiding shared schema and migration changes.

**Tech Stack:** TypeScript, Hono, Drizzle/PostgreSQL, MinIO SDK, Sharp, Vitest, disposable PostgreSQL Docker container.

---

### Task 1: Decode and normalize images

**Files:**
- Create: `carin-api/src/modules/media/image.ts`
- Test: `carin-api/src/modules/media/image.unit.test.ts`
- Modify: `carin-api/package.json`, `carin-api/pnpm-lock.yaml`

- [ ] Write tests using real Sharp-generated JPEG/PNG buffers for a spoofed MIME, corrupt bytes, an input above 10 MiB, EXIF removal, EXIF orientation, and resize to a 1600 px longest edge.
- [ ] Run `pnpm exec vitest run src/modules/media/image.unit.test.ts` from `carin-api/`; confirm each missing behavior fails.
- [ ] Add the pinned `sharp` dependency and implement bounded multipart reading plus `normalizePhoto(bytes, declaredMime)` returning bytes, decoded MIME, width, height, and SHA-256.
- [ ] Keep the original bytes in memory only; the returned bytes must be re-encoded with no metadata and never exceed the contract's stored-size limit.
- [ ] Rerun the focused unit test and then `pnpm run typecheck` from `carin-api/`.

### Task 2: Validate media configuration, grants, and private URLs

**Files:**
- Create: `carin-api/src/modules/media/grants.ts`
- Create: `carin-api/src/modules/media/grants.unit.test.ts`
- Create: `carin-api/src/modules/media/storage.ts`
- Create: `carin-api/src/modules/media/storage.unit.test.ts`
- Modify: `carin-api/package.json`, `carin-api/pnpm-lock.yaml`

- [ ] Write tests for grant photo/owner/environment binding, five-minute expiry, tampering, and exact MinIO origin checks that reject public hosts, credentials, redirects, and mismatched ports.
- [ ] Run `pnpm exec vitest run src/modules/media/grants.unit.test.ts src/modules/media/storage.unit.test.ts` from `carin-api/`; confirm the tests fail because the functions do not exist.
- [ ] Add a pinned MinIO SDK dependency and implement the object-store interface with private upload, stream read, idempotent remove, and ten-minute presigned read.
- [ ] Implement opaque base64url HMAC grants with constant-time signature comparison and safe 404 validation results.
- [ ] Rerun the focused unit tests and `pnpm run typecheck`.

### Task 3: Build Drizzle ownership and durable cleanup services

**Files:**
- Create: `carin-api/src/modules/media/repository.ts`
- Create: `carin-api/src/modules/media/cleanup.ts`
- Create: `carin-api/src/modules/media/cleanup.unit.test.ts`

- [ ] Write repository-facing tests for owner/account/lifecycle filtering and cleanup lease/retry transitions, including a failed storage delete followed by a due retry.
- [ ] Run the focused unit test and confirm it fails on missing repository and cleanup functions.
- [ ] Implement database operations over existing `photo`, `user`, and `deletion_task` tables. Schedule only uploaded photos at least one hour old; persist deletion task state, lease, attempt count, and backoff in PostgreSQL.
- [ ] Make successful object removal mark the photo `deleted` and erase the completed task payload; keep failure details out of persisted payloads.
- [ ] Rerun the focused tests and `pnpm run typecheck`.

### Task 4: Add media service and contract routes

**Files:**
- Create: `carin-api/src/modules/media/service.ts`
- Create: `carin-api/src/modules/media/routes.ts`
- Create: `carin-api/src/modules/media/service.unit.test.ts`
- Modify: `carin-api/src/app.ts`
- Modify: `carin-api/tests/integration/http.integration.test.ts`

- [ ] Write tests proving a database insert failure never calls MinIO, a MinIO failure attempts object removal and durable cleanup, and route mounting uses the injected `SessionResolver` for upload and grant issuance.
- [ ] Run the focused unit tests and confirm they fail on missing service/route behavior.
- [ ] Implement upload staging, object upload, owner grant issuance, cookie-free token stream with live ownership/account rechecks, and worker-facing `createAiPhotoUrl(userId, photoId)`.
- [ ] Validate responses against `app.uploadPhoto`, `app.getPhotoView`, and `app.readSignedPhoto`; set `private, no-store`; ensure logs contain no URL or grant.
- [ ] Mount routes through optional `AppDependencies.media`, requiring `resolveSession` for session routes.
- [ ] Rerun focused unit tests, HTTP integration tests, and `pnpm run typecheck`.

### Task 5: Verify PostgreSQL isolation and restart-safe cleanup

**Files:**
- Create: `carin-api/tests/integration/media.integration.test.ts`
- Create: `carin-api/tests/integration/media-cleanup.integration.test.ts`
- Create: `carin-api/src/modules/media/README.md`
- Create: `docs/handoffs/t17-private-media.md`

- [ ] Write disposable-PostgreSQL tests for account A/B upload/view/read isolation, deleted-account denial, invalid/expired grant response equivalence, task persistence across fresh cleanup-runner instances, and retry after storage removal failure.
- [ ] Run each new integration test from `carin-api/`; confirm the tests fail for missing behavior before implementation.
- [ ] Implement only the fixes required to satisfy the tests; retain the existing `photo`/`deletion_task` schema and migration sequence.
- [ ] Run from `carin-api/`: `pnpm run typecheck`, `pnpm run lint`, `pnpm run test:unit`, `pnpm run test:integration`, and `pnpm run build`.
- [ ] Record the C29 cleanup worker boundary, all changed files, verification results, and platform limitations in the handoff document.
