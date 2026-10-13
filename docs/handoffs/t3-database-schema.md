# T3 / C03 database schema handoff

Task / scope: Baseline 1.0.0 PostgreSQL/Drizzle schema, Better Auth schema generation,
reviewed migrations, database invariants, and T2 readiness schema check. Based on
integrated C01/C02 at `dev` commit `788699e`; branch `feat/t3-database-schema`.

Changes and affected files:

- `carin-api/src/auth/{options,generation}.ts`: canonical schema-affecting Better
  Auth settings and generation-only CLI entrypoint. No product auth endpoints.
- `carin-api/src/db/schema/{auth,domain,index}.ts`: CLI-generated UUID auth schema
  and 16 domain tables covering profile/history, consent, catalog/servings, media,
  scans/jobs/results, consumption/history/evaluation, examinations, idempotency,
  deletion/email outboxes. Catalog numerics use six-place numeric decimals.
- `carin-api/drizzle/`: generated baseline plus reviewed custom invariants,
  JSON/catalog immutability, account metadata guard, session ownership trigger,
  photo detachment, deferred active revision/snapshot pointer.
- `carin-api/src/db/{client,migrations,migrate}.ts`, `drizzle.config.ts`: shared
  typed database binding, advisory-lock one-shot migrator, exact migration hash
  and timestamp expectations for runtime readiness.
- `carin-api/src/health/postgres-repository{,.unit.test}.ts`: expected-schema probe
  sharing the existing three-second connection/query deadline.
- `carin-api/tests/integration/database.integration.test.ts`: ten DB tests using
  an isolated ephemeral Docker PostgreSQL instance, never existing DATABASE_URL.
- `carin-api/package.json` and lock: parent-coordinated pins/scripts, including
  better-auth/Expo/auth CLI 1.7.7, drizzle-orm 0.45.4, drizzle-kit 0.31.11.
- `carin-api/docs/database.md`: generation, deployment/runtime assets, storage
  invariants, future-service obligations, test requirements, official references.

Verification: performed from `carin-api/` on Linux, Node 24.18.0/pnpm 10.33.0:

- `pnpm run auth:generate`: passed and regenerated auth.ts byte-identically.
- `pnpm run db:generate`: passed, reports no schema changes after regeneration.
- `pnpm run typecheck`, `pnpm run lint`, `pnpm run build`: passed.
- `pnpm run test:unit`: 18 tests in four files passed.
- `pnpm run test:integration`: 19 tests in two files passed, including ten new
  PostgreSQL baseline tests.
- Built CLI smoke: `pnpm run db:migrate` invoked twice against an additional
  fresh scoped container; exactly two migration records; compiled readiness
  changed false to true. Container removed afterwards.
- From worktree root, existing root `.venv/bin/python specs/validate-contracts.py`:
  passed, 2 OpenAPI documents, 38 operations, 408 refs, 5 fixtures, 3 negatives.
- `git diff --check`: passed. Disposable test containers removed.

Actual database evidence includes empty HTTP readiness 503/migrated 200,
concurrent/repeated migrations, cross-owner FKs and idempotency session rejection,
profile version-zero contexts without a health_profile, duplicate profile/result/
active default-confirmation rejection, explicit occurrence/reconfirmation support,
NaN/unit/knowledge-state rejection, immutable historical profile/catalog/result/
consumption/job inputs, revision+snapshot commit consistency, 24-hour idempotency
response retention, scan purge preserving consumption user_id and provenance while
clearing source pointers/photo flag, and account purge preserving another owner.

Unverified work / blockers: no blocker for T3. No auth route/admission hook,
Resend delivery, endpoint repository ownership filtering, worker fencing or consent
publication transaction, real AI, MinIO cleanup, or native mobile/device testing
is claimed. JSON payload contract validation and expected-revision comparisons
belong to their future application services. Generation options alone do not
prove auth admission/update bypass protection.

Next step: independent spec/quality review, then parent integration. Parent must
update the module guide's old readiness description and note Docker integration
requirements. T4 runtime image must ship `carin-api/drizzle/` beside `dist/`.
T8 must reuse canonical options with real environment/auth hooks; account deletion
must retain a tombstone until durable external cleanup succeeds before hard purge.
Custom trigger/deferrability SQL must remain in deployment migrations.

Worktree state: focused changes committed on `feat/t3-database-schema` in
`.worktrees/t3-database-schema`; no root-dev/task-board/push/deploy changes.
Dependency manifest changes coordinated with parent; preserve/reconcile T5
manifest/lock changes during integration. Existing root work is untouched.
