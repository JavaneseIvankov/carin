# C14 Catalog Import and Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import immutable catalog versions from the internal AI service and serve contract-compatible food and condition searches from PostgreSQL.

**Architecture:** Extend catalog persistence with version metadata, candidate conditions, aliases, and nutrient source mappings. Add an importer that validates and fetches all AI pages before atomically persisting/activating a version, plus repository-backed authenticated search routes using the existing OpenAPI validation and error envelope.

**Tech Stack:** Node.js 24, TypeScript, Hono, Drizzle ORM, PostgreSQL 18, Vitest, existing generated OpenAPI types and AI client.

---

## File map

- `carin-api/src/db/schema/domain.ts`, schema index, and a new Drizzle migration: immutable catalog versions, conditions, aliases, and nutrient provenance.
- `carin-api/src/catalog/importer.ts`, `repository.ts`, `search.ts`, and `routes.ts`: import orchestration, persistence, cursor/filter behavior, and HTTP contract handling.
- `carin-api/src/app.ts`: optional catalog module dependency wiring for tests and runtime composition.
- `carin-api/src/catalog/*.unit.test.ts` and `carin-api/tests/integration/catalog.integration.test.ts`: fail-first validation, paging, immutability, route, and database coverage.
- `carin-api/src/catalog/import-cli.ts`, `carin-api/package.json`: explicit operational catalog synchronization command.
- `docs/handoffs/t14-catalog-search.md`: implementation and verification handoff.

### Task 1: Validate and import immutable AI catalog snapshots

**Files:**
- Modify: `carin-api/src/db/schema/domain.ts`, `carin-api/src/db/schema/index.ts`
- Create: migration generated under `carin-api/drizzle/`
- Create: `carin-api/src/catalog/importer.ts`, `carin-api/src/catalog/repository.ts`
- Test: `carin-api/src/catalog/importer.unit.test.ts`

- [ ] Write failing tests for multi-page manifest/version consistency, repeated cursor rejection, serving/source reference rejection, identical re-import idempotency, and conflicting immutable-version rejection.
- [ ] Run the unit test file and confirm failures are due to missing importer behavior.
- [ ] Add schema migration and importer/repository logic. Fetch and validate all pages before persistence; insert a complete snapshot and flip the current pointer in one transaction.
- [ ] Run importer unit tests and confirm they pass.

### Task 2: Search current and frozen food/condition versions

**Files:**
- Create: `carin-api/src/catalog/search.ts`, `carin-api/src/catalog/routes.ts`
- Modify: `carin-api/src/app.ts`
- Test: `carin-api/src/catalog/search.unit.test.ts`, `carin-api/tests/integration/catalog.integration.test.ts`

- [ ] Write failing tests for empty no-catalog results, explicit unavailable versions, version-bound cursor pagination, query mismatch, stable displayName/id order, aliases, and candidate condition filtering.
- [ ] Run the new tests and confirm expected failures.
- [ ] Implement repository-backed queries and contract-validated authenticated routes. Return serving and source provenance without deriving support rules from candidate labels.
- [ ] Run unit tests, then the PostgreSQL catalog integration test.

### Task 3: Add catalog synchronization entrypoint and handoff

**Files:**
- Create: `carin-api/src/catalog/import-cli.ts`
- Modify: `carin-api/package.json`
- Create: `docs/handoffs/t14-catalog-search.md`

- [ ] Add a `catalog:sync` package script that builds and runs the importer using the configured AI client and database pool.
- [ ] Add handoff with scope, files, exact verification commands/results, limitations, integration conflict points, and worktree/commit state.
- [ ] Run backend `typecheck`, `lint`, `test:unit`, `test:integration`, and `build` from `carin-api/`; record unavailable platform checks.
- [ ] Commit the implementation and handoff with conventional commit messages; leave the worktree clean.
