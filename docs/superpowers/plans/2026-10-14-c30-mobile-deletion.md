# C30 Mobile Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit account deletion and scan deletion flows that explain consequences and clear local private state only after server acceptance.

**Architecture:** Keep request/idempotency and outcome mapping in focused `lib/deletion` helpers, then connect those helpers to profile, analysis detail, and history screens. Account deletion calls the existing generated API operation and uses the auth lifecycle to clear the local session and scoped cache after a valid 202 acknowledgement; scan deletion invalidates the scan/history reads after 204 and leaves consumption snapshots untouched.

**Tech Stack:** Expo Router, React Native, TypeScript, TanStack Query, generated OpenAPI client types, Vitest.

---

### Task 1: Deletion action helpers

**Files:**
- Create: `carin-app/lib/deletion/actions.ts`
- Test: `carin-app/lib/deletion/actions.unit.test.ts`

- [x] Write tests for account deletion acceptance, rejected password retaining local session, stable retry key, scan deletion key, and deletion errors.
- [x] Run the focused unit test and confirm expected missing-export failure.
- [x] Implement small typed helpers using the existing idempotency key utility.
- [x] Run focused tests; commit is consolidated after final verification.

### Task 2: Account deletion screen and local cleanup

**Files:**
- Create: `carin-app/app/account/delete.tsx`
- Modify: `carin-app/app/(tabs)/profile.tsx`
- Modify: `carin-app/lib/auth/provider.tsx` only if existing `signOut` cannot close local scope after server acceptance.
- Test: `carin-app/lib/deletion/actions.unit.test.ts`

- [x] Add a profile entry to the confirmation screen.
- [x] Require password and exact `DELETE_MY_ACCOUNT` confirmation from the OpenAPI contract.
- [x] Explain immediate access revocation and that photo/data purge may still be pending.
- [x] On 202 only, clear session, scoped read cache, drafts, and previews through the auth/data lifecycle; show a recoverable message for wrong password or service failure without clearing anything.
- [x] Run focused unit and API integration tests; commit is consolidated after final verification.

### Task 3: Scan deletion controls

**Files:**
- Modify: `carin-app/app/food/analysis/[id].tsx`
- Modify: `carin-app/app/(tabs)/history.tsx`
- Create: `carin-app/components/food/scan-deletion-control.tsx`
- Test: `carin-app/lib/deletion/actions.unit.test.ts` and `carin-app/lib/deletion/actions.integration.test.ts`

- [x] Explain photo and active-job removal, and that existing consumption snapshots remain with `Foto sumber telah dihapus` provenance.
- [x] Offer cancel and explicit confirm from analysis detail and history.
- [x] On 204, remove scan from current UI and invalidate scoped scan/consumption reads; do not delete consumption.
- [x] Show retryable feedback on request failure and explain server file cleanup may continue after acceptance.
- [x] Run focused unit and API integration tests; commit is consolidated after final verification.

### Task 4: Verify and hand back

**Files:**
- Update: TSK task 30 handoff notes.

- [x] Run contract check, typecheck, lint, unit tests, and integration tests from `carin-app/`.
- [x] Record commands/results, device limitations, branch/head, and unverified behavior in TSK; set task to `review`.
- [x] Commit focused changes.
