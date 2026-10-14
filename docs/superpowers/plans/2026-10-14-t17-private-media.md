# T17 Private Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement private normalized photo uploads, five-minute owner media grants, ten-minute internal AI read URLs, and durable one-hour orphan cleanup.

**Architecture:** Keep upload normalization, grants, MinIO, PostgreSQL access, cleanup, and Hono routes in focused files under `carin-api/src/modules/media/`. Mount routes through `createApp` only when the existing session resolver and media dependencies are injected. Reuse the existing `photo`, `deletion_task`, and `idempotency_record` tables, avoiding shared schema and migration changes.

**Tech Stack:** TypeScript, Hono, Drizzle/PostgreSQL, MinIO SDK, Sharp, Vitest, disposable PostgreSQL Docker container.

---

### Task 1: Decode and normalize images

**Files:**
- Create: `carin-api/src/modules/media/image.ts`
- Test: `carin-api/src/modules/media/image.unit.test.ts`
- Modify: `carin-api/package.json`, `carin-api/pnpm-lock.yaml`

- [x] Write tests using real Sharp-generated JPEG/PNG buffers for a spoofed MIME, corrupt bytes, an input above 10 MiB, EXIF removal, EXIF orientation, and resize to a 1600 px longest edge.
- [x] Run `pnpm exec vitest run src/modules/media/image.unit.test.ts` from `carin-api/`; each behavior is covered.
- [x] Add the pinned `sharp` dependency and implement bounded multipart reading plus `normalizePhoto(bytes, declaredMime)` returning bytes, decoded MIME, width, height, and SHA-256.
- [x] Keep the original bytes in memory only; the returned bytes are re-encoded with no metadata and never exceed the contract's stored-size limit.
- [x] Rerun the focused unit test and then `pnpm run typecheck` from `carin-api/`.

### Task 2: Validate media configuration, grants, and private URLs

**Files:**
- Create: `carin-api/src/modules/media/grants.ts`
- Create: `carin-api/src/modules/media/grants.unit.test.ts`
- Create: `carin-api/src/modules/media/storage.ts`
- Create: `carin-api/src/modules/media/storage.unit.test.ts`
- Modify: `carin-api/package.json`, `carin-api/pnpm-lock.yaml`

- [x] Write tests for grant photo/owner/environment binding, five-minute expiry, tampering, and exact MinIO origin checks that reject public hosts, credentials, redirects, and mismatched ports.
- [x] Run the grant and storage unit tests against the implementation.
- [x] Add a pinned MinIO SDK dependency and implement the object-store interface with private upload, stream read, idempotent remove, and ten-minute presigned read.
- [x] Implement opaque AES-256-GCM encrypted grants with authenticated claims and safe 404 validation results.
- [x] Rerun the focused unit tests and `pnpm run typecheck`.

### Task 3: Build Drizzle ownership and durable cleanup services

**Files:**
- Create: `carin-api/src/modules/media/repository.ts`
- Create: `carin-api/src/modules/media/cleanup.ts`
- Create: `carin-api/src/modules/media/cleanup.unit.test.ts`

- [x] Write disposable-PostgreSQL coverage for cleanup lease/retry transitions, including a failed storage delete followed by a due retry.
- [x] Run cleanup integration coverage using fresh runner calls against the persisted queue.
- [x] Implement database operations over existing `photo`, `user`, and `deletion_task` tables. Schedule uploaded photos at least one hour old; persist task state, lease, attempt count, and backoff in PostgreSQL.
- [x] Make successful object removal mark the photo `deleted` and erase the completed task payload; keep failure details out of persisted payloads.
- [x] Rerun cleanup integration coverage and `pnpm run typecheck`.

### Task 4: Add media service and contract routes

**Files:**
- Create: `carin-api/src/modules/media/service.ts`
- Create: `carin-api/src/modules/media/routes.ts`
- Create: `carin-api/src/modules/media/service.unit.test.ts`
- Modify: `carin-api/src/app.ts`
- Modify: `carin-api/tests/integration/http.integration.test.ts`

- [x] Write tests proving a reservation insert failure never calls MinIO, a MinIO failure attempts object removal and durable cleanup, completion-write failures remove stored objects, and route mounting uses the injected `SessionResolver` for upload and grant issuance.
- [x] Run focused service tests and media route integration tests.
- [x] Implement upload staging, object upload, owner grant issuance, cookie-free token stream with live ownership/account rechecks, and worker-facing `createAiPhotoUrl(userId, photoId)`.
- [x] Validate responses against `app.uploadPhoto`, `app.getPhotoView`, and `app.readSignedPhoto`; set `private, no-store`; ensure logs contain no URL or grant.
- [x] Mount routes through optional `AppDependencies.media`, requiring `resolveSession` for session routes.
- [x] Rerun focused unit tests, media HTTP integration tests, and `pnpm run typecheck`.

### Task 5: Verify PostgreSQL isolation and restart-safe cleanup

**Files:**
- Create: `carin-api/tests/integration/media.integration.test.ts`
- Create: `carin-api/tests/integration/media-cleanup.integration.test.ts`
- Create: `carin-api/src/modules/media/README.md`
- Create: `docs/handoffs/t17-private-media.md`

- [x] Write disposable-PostgreSQL tests for account A/B isolation, deleted-account denial, invalid/expired grant response equivalence, task persistence across fresh cleanup-runner instances, and retry after storage removal failure.
- [x] Run the new media integration tests and verify the module against real PostgreSQL; MinIO is injected in integration tests and its URL policy is unit-tested.
- [x] Retain the existing `photo`/`deletion_task` schema and migration sequence; no migration was needed.
- [x] Run `pnpm run typecheck`, `pnpm run lint`, `pnpm run test:unit`, the API integration tests, and `pnpm run build`. The unfiltered API integration script also picks up an app consumer test which cannot transform because `carin-app` lacks installed Expo dependencies; all API integration suites pass when that cross-app suite is excluded.
- [x] Record the C29 cleanup worker boundary, changed files, verification results, and platform limitation in the handoff document.

### Task 6: Fence concurrent uploads and keep grants opaque

**Files:**
- Modify: `carin-api/src/modules/media/grants.ts`
- Modify: `carin-api/src/modules/media/repository.ts`
- Modify: `carin-api/src/modules/media/service.ts`
- Modify: `carin-api/tests/integration/media.integration.test.ts`

- [x] Encrypt grant claims with AES-256-GCM and test that base64url token contents do not expose photo, user, or environment claims.
- [x] Store a five-minute reservation lease and fencing token in the existing idempotency JSONB; return a retryable conflict to concurrent same-key uploads and give expired retries distinct photo/object identities.
- [x] Serialize completion under user → photo → idempotency locks, recheck active account and uploaded lifecycle after MinIO returns, and durably queue late object cleanup when deletion wins.
- [x] Reconcile completion exceptions under the same locks; return persisted success, fence and queue a confirmed pending upload, and preserve the object when database state remains ambiguous.
- [x] Add barrier-based duplicate upload and delayed-PUT versus deletion/cleanup/retry integration tests.
- [x] Add fault injection where completion commits then throws; verify the photo stays uploaded and its signed read remains usable.
- [x] Document the C29 account deletion lock order and require the user row to remain until in-flight PUTs and their durable object cleanup have settled.
- [x] Run lint, typecheck, unit tests, API integration tests (excluding the Expo-dependent app consumer suite), and build.
