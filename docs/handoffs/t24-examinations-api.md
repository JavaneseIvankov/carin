Task / scope: C24 — authenticated examination CRUD, revisions/idempotency, cursor pagination, and comparable series.

Changes and affected files: `carin-api/src/modules/examinations/` implements validation, persistence, transactions, routes, and series aggregation. `carin-api/src/app.ts` and `src/index.ts` register the module and derive a purpose-specific cursor key from `BETTER_AUTH_SECRET`. Drizzle migration `0005_examination_unconstrained_measurements.sql` preserves full finite JSON-number precision; migration `0006_examination_integer_pressure.sql` enforces integer pressure storage. Domain helpers/unit tests and PostgreSQL integration coverage are included. OpenAPI contracts are unchanged.

Verification: From `carin-api/`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run build`, `pnpm run test:unit` (107 passed), `pnpm exec vitest run tests/integration/examinations.integration.test.ts` (8 passed), and `pnpm exec vitest run tests/integration --exclude tests/integration/app-consumer.integration.test.ts` (97 passed) succeeded. `pnpm run db:generate` reported no schema changes after migration generation. `git diff --check` passed.

Unverified work / blockers: The unfiltered `pnpm run test:integration` includes 97 passing backend tests but cannot transform `app-consumer.integration.test.ts` because this API worktree has no mobile `expo/tsconfig.base` dependency. Tests do not prove a full device/mobile flow. Contract source files did not change.

Next step: Review this branch, then build the mobile examination screens/graph (C25) on top of this API branch. C24 remains `review` until user approval.

Worktree state: `/home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin/.worktrees/t24-examinations-api`, branch `feat/t24-examinations-api`; commits are local and not pushed. Preserve `.superpowers/` in the primary checkout; it is unrelated and untracked.
