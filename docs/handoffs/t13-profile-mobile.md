# T13 handoff — mobile profile and settings

**Task / scope:** T13, optional Indonesian health-profile onboarding and editor; profile/settings/legal screens; missing-field actions; authenticated condition search.

**Changes and affected files:** Added the shared `/(onboarding)/health-profile` editor with skip, knowledge-state distinctions, explicit free-text diagnoses, unsupported-condition labels, confirmed clearing, revision conflict recovery, and stable idempotent writes. Added profile summary/actions, timezone and AI-consent settings, full legal-document route, and field-targeted links from Beranda/profile. Consent status now requires a grant for the current legal version; the profile summary checks consent against the loaded registry, shows registry loading/retry states, and represents account consent as loading/error/unavailable until `getMe` succeeds. Conflict reloads only clear conflict after a successful refetch, even when cached data remains after an error. Reused the legal renderer in registration. Registered existing catalog routes through the verified API composition so condition lookup reaches production. Added helper, repository, and API composition tests plus the design note and implementation plan. No OpenAPI, generated-contract, or migration files changed. TSK T13 remains `started` for orchestrator review.

**Verification:** Commands run from the listed working directories; all passed.

- `carin-app/`: `pnpm run typecheck`, `pnpm run lint`, `pnpm run test:unit` (10 files, 82 tests), `pnpm run test:integration` (6 files, 30 tests), `pnpm run contracts:check`; focused `pnpm exec vitest run lib/profile/profile.unit.test.ts` (11 tests).
- `carin-api/`: `pnpm run test:unit` (15 files, 116 tests), `pnpm run test:integration` (10 files, 143 tests), `pnpm run typecheck`, `pnpm run lint`, `pnpm run build`.
- `git diff --check` passed before final documentation/commit review.

**Unverified work / blockers:** No Android or iOS device/emulator walkthrough was available in this task, so keyboard, safe-area, and screen-reader behavior still need platform QA. The checks above do not establish end-to-end persistence against a running mobile app or a real AI service.

**Next step:** Orchestrator review, then integrate this stacked worktree with the independently reviewed C14 fix and reconcile the activation/profile/catalog migration sequence. Recheck the merged API migration set and run the integration gates on the combined branch.

**Worktree state:** T13 implementation and consent-version review fix are committed locally; no push or merge was performed. The orchestrator should preserve these commits and the stacked prerequisite history during integration.
