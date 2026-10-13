# T14 — Versioned catalog import and search

Task / scope: Import AI capability/catalog REST artifacts into immutable PostgreSQL catalog versions; expose authenticated food and condition search with serving/provenance validation. No shared OpenAPI payloads changed and no real nutrition or clinical sources were added.

Changes and affected files:

- `carin-api/src/catalog/{errors,importer,repository,search,routes,import-cli}.ts`: contract-validated all-page import, provenance validation, immutable digest/version persistence, atomic activation, keyset search, frozen pagination, stale-version errors, and `catalog:sync` command.
- `carin-api/src/app.ts`: optional injected catalog route registration following the existing authenticated-module seam.
- `carin-api/src/db/schema/domain.ts`, `carin-api/drizzle/0004_short_secret_warriors.sql`, `carin-api/drizzle/meta/{0004_snapshot.json,_journal.json}`: immutable version/condition metadata, source links, aliases, and user-bound search cursors. C16 independently generated a `0004_*` migration; the orchestrator must sequence/renumber migrations during integration.
- `carin-api/tests/integration/catalog.integration.test.ts`, `carin-api/src/catalog/importer.unit.test.ts`, `carin-api/tests/integration/database.integration.test.ts`: import, versioning, pagination, support flags, provenance, failure atomicity, immutability, and existing catalog fixture metadata.
- `carin-api/package.json`: adds `pnpm run catalog:sync`.
- `docs/superpowers/specs/2026-10-14-t14-catalog-search-design.md`, `docs/superpowers/plans/2026-10-14-t14-catalog-search.md`: design and implementation plan.

Verification: From `carin-api/`, `pnpm run test:unit` passed (84 tests), `pnpm run test:integration` passed (112 tests, disposable PostgreSQL 18.3 Docker), `pnpm run typecheck`, `pnpm run lint`, and `pnpm run build` passed. The focused catalog integration suite was rerun after adding catalog-version deletion protection and passed (9 tests). The database suite applies the generated migration from a clean test database.

Unverified work / blockers: `pnpm run catalog:sync` was not run against a live AI service/database. No approved real source dataset was available or introduced. The `/api/v1/catalog/*` handlers preserve required verified-session auth and register through `createApp({ catalog: { db, resolveSession } })`; the current `src/index.ts` does not mount authenticated modules because Better Auth runtime/session resolution is pending (also noted by the existing legal-consent seam). Wire this dependency when shared auth composition is implemented; do not expose a public bypass. Migration filename/version collision with C16 must be resolved when integration combines branches.

Next step: Run spec review and code review, then integrate both C14 and C16 migration changes with a unique migration sequence and the shared auth runtime when available.

Worktree state: branch `feat/t14-catalog-search`, based on `dev`. Implementation is committed locally; no push. No changes in other worktrees.
