Task / scope: T1/C01 tooling and automated checks only. No API or AI behavior was implemented.

Changes and affected files: `carin-app/` now pins its existing resolved Expo 56
dependencies and adds TypeScript, ESLint/Expo, and Vitest scripts/configuration.
The existing TypeScript 6 alias/deprecation and one scaffold JSX lint issue were
resolved. `carin-api/` is a tooling-only TypeScript package with its own lockfile,
unit/integration test scripts, and module guide. `.github/workflows/checks.yml` runs both packages'
checks and contract validation. `specs/requirements-contracts.in/.txt` pins direct
and transitive Python validator packages; root/module/spec docs describe setup.

Verification (13 October 2026, Linux x86_64, Node 24.18.0, pnpm 10.33.0,
Python 3.14.7): From each package directory, `pnpm install --frozen-lockfile`,
`pnpm run typecheck`, `pnpm run lint`, `pnpm run test:unit`, and
`pnpm run test:integration` passed. Both categories in both packages explicitly
reported no test files. From repo root, a fresh `.venv` install
using `specs/requirements-contracts.txt` and
`.venv/bin/python specs/validate-contracts.py` passed: 2 OpenAPI documents,
38 operations, 408 local refs, and 5 fixtures. App Prettier check passed.
Temporary negative probes confirmed the validator rejected an invalid JSON
Schema type, API typecheck rejected a number assigned to string, app lint
rejected an unused variable. In each package, a temporary failing unit test
failed only `test:unit`, and a temporary failing integration test failed only
`test:integration`; the other category reported no tests in each case.
All probe files were removed.

Unverified work / blockers: GitHub Actions has not run on a remote runner.
There are no product feature tests yet, and no API implementation, Android/iOS
device run, or real AI verification in this task.

Next step: T2 implements Hono routes and adds provider/integration tests with
its behavior; mobile features add tests with each feature. Run CI on the branch
or pull request and use the release checklist for device/platform acceptance.

Worktree state: focused changes committed on `chore/t1-tooling`; no existing
root checkout changes were touched.
