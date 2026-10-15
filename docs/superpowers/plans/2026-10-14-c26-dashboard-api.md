# C26 Dashboard API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve a user-scoped dashboard computed from one consistent PostgreSQL snapshot for the selected account-local date.

**Architecture:** Add a pure date-window and aggregation layer, a read-only repeatable-read repository over active consumption snapshots/evaluations and examination rows, then mount an authenticated Hono route that validates the existing OpenAPI response. Reuse domain nutrition/time helpers and the examination row serializer; do not cache or infer clinical guidance.

**Tech Stack:** TypeScript, Hono, Drizzle ORM, PostgreSQL, Vitest, existing OpenAPI validators.

---

### Task 1: Selected local-date windows and pure summary aggregation

**Files:**
- Modify: `carin-api/src/domain/time-window.ts`
- Modify: `carin-api/src/domain/domain.unit.test.ts`
- Create: `carin-api/src/modules/dashboard/summary.ts`
- Create: `carin-api/src/modules/dashboard/summary.unit.test.ts`

- [x] Add a failing test for `getDashboardWindowForDate('2026-03-09', 'America/New_York')` and assert seven dates plus a half-open local-midnight UTC window across the DST change.
- [x] Add failing summary tests proving null nutrients stay null, daily component/count totals are separate, completed attentions group once per consumption by `(ruleId, conditionId)`, and groups below two are omitted.
- [x] Implement selected-date windows using the existing local-boundary search and implement pure aggregation over validated dashboard inputs.
- [x] Run `pnpm exec vitest run src/domain/domain.unit.test.ts src/modules/dashboard/summary.unit.test.ts` from `carin-api/` and verify the tests pass.

### Task 2: Snapshot-consistent dashboard repository

**Files:**
- Create: `carin-api/src/modules/dashboard/repository.ts`
- Modify: `carin-api/src/modules/examinations/service.ts`
- Create: `carin-api/tests/integration/dashboard.integration.test.ts`

- [x] Add PostgreSQL integration cases for empty and partial intake, foreign-user isolation, half-open day boundary, edit/delete visibility, pending/failed evaluation exclusion, completed evaluation grouping, and latest examination per series.
- [x] Implement one read-only `REPEATABLE READ` transaction that verifies the session/account, reads current profile/timezone, daily active snapshot rows, completed seven-day evaluations, and active examinations.
- [x] Aggregate daily nutrients only from current immutable snapshots; keep unknown values null and counts separate; group only completed attention rules and include linked consumption IDs when count is at least two.
- [x] Select latest examination by `seriesKey`, measured date, measured time (`NULLS LAST`), creation time, and ID; serialize through the existing examination mapping.
- [x] Run the focused integration tests and inspect results for all required edge cases.

### Task 3: Authenticated route, contract checks, and handoff

**Files:**
- Create: `carin-api/src/modules/dashboard/routes.ts`
- Modify: `carin-api/src/app.ts`
- Modify: `carin-api/src/index.ts`
- Modify: `carin-api/src/app.verified.unit.test.ts`
- Modify: `docs/handoffs/t26-dashboard-api.md`

- [x] Add a failing app test proving `/api/v1/dashboard` is session-protected before database access.
- [x] Add `GET /api/v1/dashboard`, validate the optional date and contract response, and return neutral profile/next-action data without health recommendations.
- [x] Run API typecheck, lint, unit/integration tests, build, contract validator, OpenAPI validation, and `db:generate` drift check from their documented directories.
- [ ] Commit the implementation, obtain spec and quality review, and leave T26 in `review` with a handoff recording platform/environment limits.
