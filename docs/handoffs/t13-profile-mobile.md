# T13 handoff — mobile profile and settings

**Task / scope:** T13, optional Indonesian health-profile onboarding and editor; profile/settings/legal screens; missing-field actions; authenticated condition search.

**Changes and affected files:** Added the shared `/(onboarding)/health-profile` editor with skip, knowledge-state distinctions, explicit free-text diagnoses, unsupported-condition labels, confirmed clearing, revision conflict recovery, and stable idempotent writes. Added profile summary/actions, timezone and AI-consent settings, full legal-document route, and field-targeted links from Beranda/profile. Reused the legal renderer in registration. Registered existing catalog routes through the verified API composition so condition lookup reaches production. Added helper, repository, and API composition tests plus the design note and implementation plan. No OpenAPI, generated-contract, or migration files changed. TSK T13 remains `started` for orchestrator review.

**Verification:** Commands run from the listed working directories; all passed.

- `carin-app/`: `pnpm run typecheck`, `pnpm run lint`, `pnpm run test:unit` (10 files, 77 tests), `pnpm run test:integration` (6 files, 30 tests), `pnpm run contracts:check`.
- `carin-api/`: `pnpm run test:unit` (15 files, 116 tests), `pnpm run test:integration` (10 files, 143 tests), `pnpm run typecheck`, `pnpm run lint`, `pnpm run build`.
- `git diff --check` passed before final documentation/commit review.

**Unverified work / blockers:** No Android or iOS device/emulator walkthrough was available in this task, so keyboard, safe-area, and screen-reader behavior still need platform QA. The checks above do not establish end-to-end persistence against a running mobile app or a real AI service.

**Next step:** Orchestrator review, then integrate this stacked worktree with the independently reviewed C14 fix and reconcile the activation/profile/catalog migration sequence. Recheck the merged API migration set and run the integration gates on the combined branch.

**Worktree state:** Committed locally as `feat: add optional health profile mobile flow`; no push or merge was performed. The orchestrator should preserve this commit and the stacked prerequisite history during integration.
