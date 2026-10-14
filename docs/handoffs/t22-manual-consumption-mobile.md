# T22 — Manual Consumption Mobile Handoff

Task / scope: Implement the mobile manual-consumption flow for create, reopen, detail, edit, and delete. T22 remains `started` pending parent/reviewer checks.

Changes and affected files:

- `carin-app/app/consumptions/new.tsx`, `[id].tsx`, and `[id]/edit.tsx` now provide account-timezone entry, server-backed detail, revision-aware edit, retryable delete, and scoped persisted drafts.
- `carin-app/components/consumptions/` adds the shared catalog/free-text food editor, consumption form, and snapshot/attention detail presentation.
- `carin-app/lib/consumptions/` adds contract mapping and decimal-comma/timezone validation, attention presentation, catalog query, and retry-safe create/update/delete actions.
- `carin-app/lib/api/query-cache.ts` and `query.ts` keep successful writes invalidating only the active user’s query scope; focused tests cover this boundary.
- `carin-app/app/(tabs)/history.tsx` adds consumption history and a manual-entry action, with stale/offline state.
- Unit and integration tests cover unmatched/unknown portions, exact catalog selection, decimal commas, timeout retries with identical payload/key (including after acknowledgment and reopen), edit/delete request keys, persisted drafts, and scoped invalidation.
- The C22 plan is in `docs/superpowers/plans/2026-10-14-c22-manual-consumption-mobile.md`.

Verification: From `carin-app/`, `pnpm run contracts:check`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run test:unit` (19 files, 124 tests), and `pnpm run test:integration` (7 files, 34 tests) all passed. From the worktree root, `git diff --check` passed. The manual routes/editor have no camera, photo-upload, or scan-analysis imports. T22 branch includes the parent-merged C21 API commit `73c6047`; C22 app changes were based on the preserved C19 app files from `234c1fd`.

Unverified work / blockers: No Android or iOS device/Expo interaction session was available, and tests use the app repository boundary rather than a live backend/AI service. Parent/reviewer should exercise the create/detail/edit/delete tap flows and verify platform layout/accessibility before changing T22 from `started`.

Next step: Review the C22 branch and perform the mobile/device checks. Keep T22 `started` until those checks are accepted.

Worktree state: Implementation and this handoff are committed on `feat/c22-manual-consumption-mobile`; C21 merge is included; nothing was pushed.
