# C27 mobile dashboard handoff

Task / scope: C27 — build the mobile home dashboard and its cards from the authenticated dashboard contract.

Changes and affected files:

- `carin-app/components/dashboard/dashboard-screen.tsx` displays a distinct visible identity for each recurring-attention group and loads the first linked consumption detail to show its reason when the exact rule and condition match.
- `carin-app/lib/dashboard/presentation.ts` provides stable-in-list fallback labels (`Kelompok perhatian N`) and exact-pair reason lookup; the presentation test covers distinct group labels, matching reasons, and linked records.
- `carin-app/lib/dashboard/dashboard-query.integration.test.ts` exercises the mobile repository and manual-consumption actions across an in-memory HTTP boundary for empty, create, edit, delete, and scan-only states.

Verification:

- `pnpm --dir carin-app test` — passed: 24 unit files / 165 tests and 9 integration files / 41 tests.
- `pnpm --dir carin-app run typecheck` — passed.
- `pnpm --dir carin-app run lint` — passed.
- `pnpm --dir carin-app run contracts:check` — passed; generated contracts match OpenAPI.
- `pnpm exec vitest run tests/integration/dashboard.integration.test.ts tests/integration/consumptions.integration.test.ts tests/integration/analysis-scan.integration.test.ts` from `carin-api/` — passed: 3 files / 28 tests against the isolated PostgreSQL integration harness.
- `git diff --check` — passed.

Unverified work / blockers:

- No React Native renderer or test renderer is installed in `carin-app`, so the dashboard was not rendered in a UI test. Native/web navigation, tap behavior, screen-reader output, and device layout remain unverified.
- The CRUD and scan-only app test uses the real mobile repository, request builder, manual actions, and QueryClient invalidation against an in-memory HTTP fixture. The Hono/PostgreSQL suites passed separately, but the mobile client and real server were not joined in one acceptance run. Therefore rendered UI/E2E checks, including empty → manual → edit/delete and scan-only unchanged through the app against the live backend, remain unverified. Do not treat the fixture test or the separate API tests as full C27 E2E completion.

Next step: run the recorded UI/E2E acceptance flow when a mobile render/device harness and app-to-live-API test setup are available; review this branch before merging.

Worktree state: branch `feat/c27-dashboard-mobile`, based on the C13/C22/C25/C26 dependency stack. The C27 implementation, review fix, and this handoff are committed on this branch. No push or merge was performed.
