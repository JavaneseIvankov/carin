# Carin API module guide

`carin-api/` is the Node.js/TypeScript backend package. It currently contains only
the tooling scaffold. The Hono server, worker, database integration, routes, and
behavioral tests belong to subsequent implementation tasks. No health/readiness
endpoint exists yet.

Run from this directory with Node.js 24 and pnpm 10.33.0:

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
pnpm run test:unit
pnpm run test:integration
```

The `test` script runs both categories. Each category intentionally permits zero
tests during bootstrap. Add colocated `*.unit.test.ts` or `*.unit.test.tsx` tests
for pure behavior, and `tests/integration/*.integration.test.ts` or
`*.integration.test.tsx` tests for the running API,
database, and provider boundaries as they are implemented. CI runs both categories.
Keep provider/consumer contract tests aligned with `specs/contracts/` and
`specs/05-verification-and-deployment.md`. The package has no runtime dependencies
yet; add and pin them when the corresponding production behavior is implemented.
