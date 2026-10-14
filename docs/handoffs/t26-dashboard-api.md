# T26 Dashboard API handoff

Task / scope: Implement the authenticated `GET /api/v1/dashboard` endpoint from C26, scoped to the active account and one consistent database snapshot.

Changes and affected files:

- Added the dashboard module: read-only repeatable-read repository, contract-validated route, nutrient and recurring-attention aggregation, neutral next actions, and latest examination per comparable series.
- Added account-local date windows including daylight-saving boundaries and integration coverage for empty/non-empty days, boundary timestamps, pending evaluations, completed attention grouping, soft deletion, foreign-user isolation, and examination ordering.
- Mounted dashboard in the verified API app and wired the shared session resolver.
- Merged the current C21 snapshot-consent fix (`331103d`) so dashboard attention reads only frozen, consent-gated consumption snapshots.
- During C24/C21 integration, normalized the examination schema migration history after the C21 migrations: retained C21's existing migration sequence and generated one follow-up examination constraints migration (`0008`). `db:generate` reports no schema drift.

Verification from `carin-api/` in this worktree:

- `pnpm run test`: 26 unit-test files / 213 tests passed; 17 integration-test files / 203 tests passed.
- `pnpm run typecheck`, `pnpm run lint`, and `pnpm run build`: passed.
- `pnpm run db:generate`: no schema changes.
- Root `specs/validate-contracts.py`: 2 OpenAPI documents, 38 operations, local reference and fixture checks passed.
- `carin-app/ pnpm run contracts:check`: generated mobile contracts match OpenAPI.
- Focused dashboard tests: 4 files / 35 tests passed.

Unverified work / blockers: Independent C26 spec and code-quality review is pending. No live AI behavior is involved; dashboard calculations use stored snapshots only. No push or deployment was performed.

Next step: Obtain independent review, resolve any findings, rerun affected checks, then set T26 to `review` in `tsk` (never `done` without user approval).

Worktree state: `feat/c26-dashboard-api`; dashboard implementation and handoff are uncommitted at handoff authoring time. Preserve the existing merged C21 and C24 commits and all current user-owned files in the root `dev` worktree.
