# T18 Scan and analysis API handoff

Task / scope: C18 automatic photo scans, durable initial and correction jobs,
owner-scoped scan/result reads, and validation before result publication.

Changes and affected files: Added `carin-api/src/modules/analyses/` and
`carin-api/src/modules/scans/` for immutable request/profile snapshots,
catalog-backed result validation, owner reads, corrections, and transactional
job creation. Mounted authenticated routes in `carin-api/src/app.ts`; wired C17
private media runtime into `carin-api/src/index.ts` and the analysis worker;
added validated media runtime settings in `carin-api/src/config.ts`. The worker
now resolves the owned photo URL per claim and rejects invalid AI outputs before
C16 fenced publication. Added unit, verified-app, and PostgreSQL integration
coverage under `carin-api/src/modules/analyses/`,
`carin-api/src/app.verified.unit.test.ts`, and
`carin-api/tests/integration/analysis-scan.integration.test.ts`; adjusted the
existing C16 worker fixture in `carin-api/tests/integration/jobs.integration.test.ts`
to seed a valid frozen catalog/profile. Updated `infra/compose.yaml`,
`infra/.env.example`, `infra/README.md`, and the implementation plan at
`docs/superpowers/plans/2026-10-14-c18-scan-analysis-api.md`.

Verification (all commands completed successfully):

- From `carin-api/`: `pnpm run typecheck`, `pnpm run lint`, `pnpm run test`
  (22 unit-test files / 164 tests and 14 integration-test files / 173 tests,
  including disposable PostgreSQL via Docker), `pnpm run build`, and
  `pnpm run db:generate` (reported no schema changes; existing migrations
  0004–0006 are sufficient).
- From `carin-app/`: `pnpm install --frozen-lockfile` enabled the shared mobile
  contract consumer test; `pnpm run contracts:check` passed.
- From the repository root: after creating the ignored `.venv` from
  `specs/requirements-contracts.txt`, `.venv/bin/python
  specs/validate-contracts.py` passed (2 OpenAPI documents, 38 operations,
  408 local refs, 5 fixtures).
- From the repository root: `git diff --check` passed.

Unverified work / blockers: The disposable PostgreSQL integration tests passed,
but this run did not connect to a live Silo bucket or internal AI deployment.
Compose uses placeholder credentials and fixture mode remains synthetic local
behavior. The confirmation lock helper is implemented and tested as the
transaction boundary for the existing future consumption flow; this branch has
no consumption route to wire yet, so that consumer must call
`lockScanForConfirmation` before persisting confirmation.

Next step: Parent review. Keep TSK 18 `started` until review; do not push this
branch.

Worktree state: Branch `feat/c18-analysis-api`, based on integration commit
`b9c0a58`. Local commit `4cbac74` contains the implementation; the branch is
left unpushed for parent review.
