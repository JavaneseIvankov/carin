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
- `git diff --check` — passed.
- Targeted API database integration was not run: `pnpm exec vitest ...` from `carin-api/` exited 254 because `vitest` is not installed in that module (`carin-api/node_modules` is absent). Docker is available, but the backend test dependencies are not present.

Unverified work / blockers:

- No React Native renderer or test renderer is installed in `carin-app`, so the dashboard was not rendered in a UI test. Native/web navigation, tap behavior, screen-reader output, and device layout remain unverified.
- The CRUD and scan-only app test uses the real mobile repository, request builder, manual actions, and QueryClient invalidation against an in-memory HTTP fixture. It does not exercise the live Hono/PostgreSQL server. Therefore the TSK's rendered UI/E2E acceptance checks, including empty → manual → edit/delete on the real backend and scan-only unchanged against the backend, remain unverified. Do not treat the fixture test as full C27 E2E completion.

Next step: run the recorded UI/E2E acceptance flow when the mobile render/device harness and API test dependencies are available; review this branch before merging.

Worktree state: branch `feat/c27-dashboard-mobile`, based on the C13/C22/C25/C26 dependency stack. The C27 implementation, review fix, and this handoff are committed on this branch. No push or merge was performed.
