# Carin API module guide

`carin-api/` is the Node.js/TypeScript backend package. It has a Hono HTTP
foundation with liveness, readiness, request IDs, safe error responses,
PostgreSQL migrations/schema, and session/ownership middleware hooks. Auth,
domain routes, and worker behavior belong to subsequent implementation tasks.

Run from this directory with Node.js 24 and pnpm 10.33.0:

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
pnpm run test:unit
pnpm run test:integration
pnpm run build
```

The `test` script runs both categories. Each category intentionally permits zero
tests during bootstrap. Add colocated `*.unit.test.ts` or `*.unit.test.tsx` tests
for pure behavior, and `tests/integration/*.integration.test.ts` or
`*.integration.test.tsx` tests for the running API,
database, and provider boundaries as they are implemented. CI runs both categories.
Keep provider/consumer contract tests aligned with `specs/contracts/` and
`specs/05-verification-and-deployment.md`.
The database integration suite starts its own disposable PostgreSQL 18.3 Docker
container pinned by digest; Docker must be available for those tests.

To start the compiled server, set `APP_ENV` to `dev`, `staging`, or `prod` and
provide a PostgreSQL `DATABASE_URL`; `PORT` defaults to `3000`. Then run
`pnpm run build` and `pnpm start`. Invalid required configuration fails startup.
The PostgreSQL readiness repository verifies the expected applied migration
history and schema hash; `/health/ready` fails closed when the database is
unreachable, migrations are missing, or the schema differs. A connection alone
cannot prove readiness. `/health/live` is process-only and remains 200 when
PostgreSQL is unavailable. AI status does not gate readiness. The session
resolver and owner lookup hooks require real server backends from later tasks;
they are not authentication implementations.
