# T2 / C02 handoff

Task / scope: Hono HTTP foundation in `carin-api`, including process liveness,
DB/schema readiness seam, request IDs, error envelope, JSON input helper,
session/ownership hooks, and validated startup environment.

Changes and affected files: `carin-api/src/app.ts`, `src/index.ts`, `src/config.ts`,
`src/health/*`, `src/http/*`, integration/unit tests, build configuration,
runtime dependencies, and `carin-api/AGENTS.md`. The public production routes
are `GET /health/live` and `GET /health/ready`. `registerRoutes` allows future
modules to attach handlers; no fixture route is registered in production.

Verification: From `carin-api/`, run `pnpm run typecheck`, `pnpm run lint`,
`pnpm test`, and `pnpm run build` on Node 24/pnpm 10.33. From the compiled
server, missing `APP_ENV` exits with code 1. With a deliberately unreachable
PostgreSQL address, HTTP smoke returned live 200 and ready 503; request ID header
matched each JSON body. Integration tests use Hono `app.request` and injected
probes/fixture handlers.

Unverified work / blockers: No real PostgreSQL schema or migration exists yet,
so production readiness intentionally remains 503 even if PostgreSQL accepts
connections. No PostgreSQL-backed session, ownership repository, real auth, AI,
or product routes are provided by C02. Real database/schema integration should
be exercised once T3 migrations exist.

Next step: T3 should implement `checkSchema` on the readiness repository using
the expected migrated schema, and add a real database integration test proving
ready 200 only after migrations. Future auth/resource modules provide a trusted
`SessionResolver` and owner lookup to `requireSession`/`requireOwnership`.

Worktree state: T2 branch committed separately; preserve the T2 implementation
when integrating subsequent backend tasks.
