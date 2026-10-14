# T26 Dashboard API handoff

Task / scope: Implement the authenticated `GET /api/v1/dashboard` endpoint from C26, scoped to the active account and one consistent database snapshot.

Changes and affected files:

- Added the dashboard module: read-only repeatable-read repository, contract-validated route, nutrient and recurring-attention aggregation, neutral next actions, and latest examination per comparable series.
- Added account-local date windows including daylight-saving boundaries and integration coverage for empty/non-empty days, boundary timestamps, pending evaluations, completed attention grouping, soft deletion, foreign-user isolation, and examination ordering.
- Latest-examination selection compares timed instants across time zones with each date-only reading's timezone-local day interval. A date-only interval wins only when it is wholly later; overlaps use `createdAt`/ID because measurement order is unknowable. Date-only readings remain dates, not fabricated timestamps.
- Follow-up review fixed ordering edge cases: date-only boundaries enumerate candidate zone offsets so a midnight rollback that briefly returns to the prior civil date still uses the first occurrence; timestamp tie-breaks retain PostgreSQL's microsecond precision rather than relying on decoded JavaScript `Date` values. Regression coverage includes Havana and St. John's midnight rollbacks and opposing UUID order for sub-millisecond creation times.
- Completed personal evaluation attentions are read from the owner-scoped `analysis_result` referenced by the active `consumption_evaluation`; the stored AI result is contract-validated and used only when evaluation state is completed. Frozen photo attention remains preserved in the consumption snapshot.
- Mounted dashboard in the verified API app and wired the shared session resolver.
- Merged the current C21 snapshot-consent fix (`331103d`) so dashboard attention reads only frozen, consent-gated consumption snapshots.
- During C24/C21 integration, normalized the examination schema migration history after the C21 migrations: retained C21's existing migration sequence and generated one follow-up examination constraints migration (`0008`). `db:generate` reports no schema drift.

Verification from `carin-api/` in this worktree:

- `pnpm run test`: 26 unit-test files / 214 tests passed; 17 integration-test files / 208 tests passed.
- `pnpm run typecheck`, `pnpm run lint`, and `pnpm run build`: passed.
- `pnpm exec drizzle-kit check` and `git diff --check`: passed; no schema changes were made by this follow-up.
- Root `.venv/bin/python specs/validate-contracts.py`: 2 OpenAPI documents, 38 operations, 417 local refs, 5 fixtures, and negative probes passed.
- `carin-app/ pnpm run contracts:check`: generated mobile contracts match OpenAPI.
- Focused dashboard integration: 4 tests passed, including result-backed attentions and cross-zone timed readings.
- Focused examination integration: 14 tests passed, including repeated-midnight and sub-millisecond ordering without inventing a measurement time. Domain window tests cover midnight rollback, DST gaps, and skipped civil dates.

Unverified work / blockers: Independent C26 re-review of the latest timezone-boundary and examination-ordering fixes is pending. No live AI behavior is involved; dashboard calculations use stored snapshots only. No push or deployment was performed.

Next step: Obtain independent review, resolve any findings, rerun affected checks, then set T26 to `review` in `tsk` (never `done` without user approval).

Worktree state: `feat/c26-dashboard-api`; implementation commits are `d024fd7`, `a21cc58`, `8d65ee7`, and `3d5ae28`, plus the uncommitted timezone-boundary follow-up and this handoff update pending commit. Preserve the existing merged C21 and C24 commits and all current user-owned files in the root `dev` worktree.
