# C24 Examination API Implementation Plan

> **For delegated implementation:** use `subagent-driven-development` to execute this plan task-by-task. Work only in `.worktrees/t24-examinations-api` on `feat/t24-examinations-api`; verify the branch before editing. Commit each coherent task. Do not push or mark T24 done.

**Goal:** Implement authenticated CRUD, revision/idempotency, opaque cursor pagination, and comparable examination series for pressure, glucose, and cholesterol.

**Architecture:** Add a `carin-api/src/modules/examinations/` module with pure validation, repository, transactional service, and Hono routes. Reuse generated contract validators, current session resolution, `idempotency_record`, and existing domain series helpers. Register routes through injected API dependencies. Preserve exact measurement precision in an additive numeric migration.

**Stack:** TypeScript, Hono, Drizzle, PostgreSQL, Vitest; the existing generated App OpenAPI contract is authoritative.

## Tasks

1. **Schema and migration** — update examination numeric columns to unconstrained numeric and generate additive migration plus journal/snapshot. Add a test that stores/reads a finite value with more than six fractional digits.
2. **Input/domain validation** — implement validated discriminated examination types, strict local date/time and IANA timezone checks, future-in-local-time rejection, positive finite numeric checks, series key, canonical JSON/hash, and opaque signed cursor helpers. Add unit tests before implementation.
3. **Repository** — implement user-scoped active-session check, owner-scoped reads, insert, revision CAS, soft delete, ordered page reads, series aggregation/latest, and database-clock timestamp predicates. Keep measurement and idempotency changes in the same transaction.
4. **Service** — implement create/read/list/update/delete/series operations, 24h idempotency, replay/conflict semantics, revision conflict behavior, stable ordering/cursors, and transaction-safe rollback. Add service/integration tests for concurrency and replay.
5. **Routes and app wiring** — define injected module deps; validate request and response against generated operations; map module errors to stable API errors; register only when examination dependencies are provided. Integration test real authenticated HTTP requests.
6. **Acceptance verification and handoff** — cover AC-EXAM-01..05 and listed design cases; run API checks and schema generation; add `docs/handoffs/t24-examinations-api.md`; commit all work, leave branch clean, set T24 to `review`, and verify the board status. Record unavailable checks accurately.
