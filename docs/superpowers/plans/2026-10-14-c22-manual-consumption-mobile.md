# C22 Manual Consumption Mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user create, reopen, inspect, edit, and delete a manual food-consumption record with catalog or unmatched foods, while retaining server snapshots and offline drafts.

**Architecture:** Keep request and form mapping in `lib/consumptions`, persist draft form state under the existing account-scoped draft store, and use the generated C21 app API through the existing repository/query layer. Keep food selection reusable and render each route from server state; save success is shown only after the server responds, and retries reuse a draft-persisted idempotency key for the same payload.

**Tech Stack:** Expo Router, React Native, TypeScript, TanStack Query, AsyncStorage, generated OpenAPI operations, Vitest.

---

### Task 1: Model manual-consumption inputs and presentation

**Files:**

- Create: `carin-app/lib/consumptions/consumption.ts`
- Test: `carin-app/lib/consumptions/consumption.unit.test.ts`

- [x] Write unit tests first for decimal-comma portion parsing (`"1,5"` becomes `1.5`), empty/invalid/zero portions, unknown portions, unmatched food payloads (`catalogFoodId: null` and no nutrient values), local date/time conversion with the account timezone, and null nutrient formatting as “Belum tersedia”.
- [x] Run `pnpm exec vitest run lib/consumptions/consumption.unit.test.ts` and confirm the failures name the missing exports/behavior.
- [x] Implement typed form-to-contract mapping using generated `ConsumptionCreate`, `ConsumptionUpdate`, catalog, and consumption schema types; retain component UUIDs in drafts and never infer nutrients for unmatched entries.
- [x] Re-run the focused unit tests and confirm all pass.

### Task 2: Persist drafts and make writes retry-safe

**Files:**

- Create: `carin-app/lib/consumptions/manual-actions.ts`
- Create: `carin-app/lib/consumptions/manual-actions.unit.test.ts`
- Create: `carin-app/lib/consumptions/manual-actions.integration.test.ts`
- Modify: `carin-app/lib/data/drafts.ts` only if the existing scoped draft API lacks a behavior the flow needs.

- [x] Write tests first: a create timeout followed by retry sends the same payload and `Idempotency-Key`; a changed payload gets a new key; the key remains until the acknowledged save is finalized locally; edits and deletes use their own stable keys; offline write rejection leaves the saved draft available and makes no network call; reopening the same scoped draft restores component ids, values, and its pending retry key.
- [x] Run the focused tests and confirm they fail for the missing manual action/store behavior.
- [x] Implement a narrow manual-consumption action layer over injected create/update/delete functions and serial, account-scoped route drafts backed by `createDraftStore`; never queue a write while offline.
- [x] Re-run the focused tests and confirm all pass.

### Task 3: Build the reusable food editor and manual create/edit routes

**Files:**

- Create: `carin-app/components/consumptions/food-editor.tsx`
- Create: `carin-app/components/consumptions/consumption-form.tsx`
- Test: `carin-app/lib/consumptions/consumption.unit.test.ts`
- Test: `carin-app/lib/consumptions/manual-actions.integration.test.ts`
- Modify: `carin-app/app/consumptions/new.tsx`
- Create: `carin-app/app/consumptions/[id]/edit.tsx`

- [x] Add behavior tests for selecting an exact catalog result, explicitly adding “Makanan lain” as unmatched, adding/removing multiple components, unknown portions, decimal commas, and saved form values reopening without camera/media imports or permission requests.
- [x] Run the focused tests and confirm the expected selection/form behavior is absent.
- [x] Implement catalog search with a debounced `searchFoods` query, explicit unmatched entry, known gram/serving inputs, unknown portion, account-timezone date/time inputs, and scoped draft restore/autosave. Make form routes share the same editor; load the selected record before initializing edit fields.
- [x] Re-run focused tests and typecheck.

### Task 4: Render frozen consumption details and explicit mutations

**Files:**

- Create: `carin-app/components/consumptions/consumption-detail.tsx`
- Create: `carin-app/lib/consumptions/attention-presentation.ts`
- Test: `carin-app/lib/consumptions/attention-presentation.unit.test.ts`
- Test: `carin-app/lib/api/query.unit.test.ts`
- Create: `carin-app/app/consumptions/[id].tsx`

- [x] Write tests for returned nutrient values/coverage with nulls left unavailable; pending, available, not-requested, and failed attention states; delete action replay with the same key; and successful mutations invalidating user-scoped queries.
- [x] Run the focused tests and confirm failures correspond to missing detail/state behavior.
- [x] Implement detail reads from `getConsumption`, refresh while attention is pending and on screen resume, preserve the returned snapshot during pending/failed attention, and require a second explicit action before delete. Use existing `useAppWrite` invalidation for create/update/delete so consumption, home, and history queries refresh together.
- [x] Re-run focused tests and typecheck.

### Task 5: Verify, document, and commit C22

**Files:**

- Create: `docs/handoffs/t22-manual-consumption-mobile.md`
- Update: `docs/superpowers/plans/2026-10-14-c22-manual-consumption-mobile.md`

- [x] Run `pnpm run contracts:check`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run test:unit`, and `pnpm run test:integration` from `carin-app/`.
- [x] Run `git diff --check` and inspect the final diff for scope, generated-file, and root-worktree leakage.
- [x] Record the C21 merge commit, changed files, verification results, device/platform limitations, branch state, and next review step in the handoff. Keep TSK 22 `started`.
- [x] Commit the C22 implementation on `feat/c22-manual-consumption-mobile`; do not push.
