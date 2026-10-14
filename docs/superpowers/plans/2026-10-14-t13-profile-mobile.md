# T13 Profile Mobile Implementation Plan

> **For agentic workers:** Execute this plan inline in the T13 worktree. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver optional Indonesian health-profile onboarding and editable profile, settings, consent, and legal screens without blocking general nutrition, manual records, or examinations.

**Architecture:** Expo Router files stay thin and render focused profile/settings screens. A profile utility module owns field labels, knowledge-state transitions, and request construction; typed `useAppRead`/`useAppWrite` remain the only resource data path. The existing API catalog router is registered in the production composition root so condition search reaches its implemented endpoint.

**Tech Stack:** Expo 56, React Native, TypeScript, Expo Router, TanStack Query, Vitest, Hono.

---

## Files and responsibilities

- `carin-app/lib/profile/profile.ts`: profile response helpers, form/request mapping, field-target labels, state transition confirmation, and idempotency-key creation.
- `carin-app/lib/profile/profile.unit.test.ts`: pure domain and request behavior tests.
- `carin-app/lib/profile/profile.integration.test.ts`: repository-backed API request/conflict/consent tests.
- `carin-app/components/profile/*`: focused profile fields, condition search, missing-field actions, legal rendering where reuse requires profile-specific wiring.
- `carin-app/app/(onboarding)/health-profile.tsx`: shared create/edit form with skip and conflict recovery.
- `carin-app/app/(tabs)/profile.tsx`: profile status and links to edit, settings, and legal documents.
- `carin-app/app/settings.tsx`: timezone and AI consent controls using current server revisions and registry versions.
- `carin-app/app/legal/[document].tsx`: full readable legal content for Terms, Privacy, and AI processing.
- `carin-app/app/(tabs)/index.tsx`: profile missing-data actions to exact editor fields.
- `carin-api/src/index.ts`: pass the verified session resolver and database to the existing catalog routes.
- `carin-api/src/app.verified.unit.test.ts`: exercise the production application composition boundary and confirm the catalog route is mounted behind session resolution.
- `docs/handoffs/t13-profile-mobile.md`: task handoff and verification evidence.

## Task 1: Lock profile invariants with unit tests

- [x] Test knowledge labels distinguish not provided, unknown, no known conditions, and never examined.
- [x] Test a state change with existing entries requests confirmation; a cancelled transition preserves the entries.
- [x] Test missing-field labels/routes and profile form conversion preserve free-text conditions with null catalog IDs.
- [x] Run the targeted profile unit test first and confirm expected failures before implementation.
- [x] Implement only the helpers required by those tests and rerun the targeted test.

## Task 2: Make real catalog search reachable

- [x] Inspect the existing catalog route and add a test at the production composition boundary for `/api/v1/catalog/conditions`.
- [x] Run the targeted API test and confirm the route is absent/fails before the runtime wiring change.
- [x] Register the existing authenticated catalog routes through `createVerifiedApp` in the production runtime.
- [x] Run the targeted API test and API typecheck/lint/build.

## Task 3: Build profile editor and optional route

- [x] Use `getProfile` and `getMe` to load the current account/profile; show loading and retry states.
- [x] Add labeled fields and distinct diagnosis/family-history/allergy knowledge choices.
- [x] Add debounced catalog search, explicit “Tambah kondisi lain”, and visible unsupported status.
- [x] Confirm before transitions that discard entries; preserve all entries when cancelled.
- [x] Submit complete fields with expected profile version and a stable retry key; show 409 recovery that retains the draft and offers to reload the revision before retry.
- [x] Make “Isi nanti” return to tabs without a profile save; keep general app routes independent.

## Task 4: Add targeted missing-data, settings, and legal actions

- [x] Show server `profileMissingFields` as individually labeled actions on Beranda and profile, each opening the requested editor field.
- [x] Add timezone editing with `settingsRevision` compare-and-swap and conflict recovery.
- [x] Render current AI-processing registry text beside an explicit consent checkbox; link to full document; grant with the active version and allow explicit revoke.
- [x] Add full legal route for terms, privacy, and AI processing with readable parsed Markdown and version/effective date.
- [x] Verify missing-field mapping, settings/legal request metadata, consent grant/revoke, current-version consent status, version-refresh draft reset, and legal Markdown parsing with helper/repository tests.

## Task 5: Verify and hand off

- [x] Run app unit/integration tests, typecheck, lint, and contract generation check from `carin-app/`.
- [x] Run API unit/integration tests, typecheck, lint, and build from `carin-api/`.
- [x] Record platform/device QA limitations and integration gates in `docs/handoffs/t13-profile-mobile.md`.
- [x] Review changed files and worktree diff, then commit all T13 files as `feat: add optional health profile mobile flow`.
