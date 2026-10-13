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
pnpm run test
```

`test` intentionally permits zero tests during bootstrap. Add `*.test.ts` or
`*.test.tsx` files with each implemented feature; Vitest runs them in CI. Keep
provider/consumer contract tests aligned with `specs/contracts/` and
`specs/05-verification-and-deployment.md`. The package has no runtime dependencies
yet; add and pin them when the corresponding production behavior is implemented.
