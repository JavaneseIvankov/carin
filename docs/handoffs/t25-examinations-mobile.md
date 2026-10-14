# T25 — Mobile Examinations Handoff

Task / scope: C25 mobile examination entry, history, detail/edit/delete, and comparable-series visualization.

Changes and affected files: Added authenticated Expo Router examination flows, a typed measurement form and preview, account-timezone date handling with optional HH:mm time, decimal-comma parsing/formatting, cursor-paginated history and per-series charts with Indonesian labels and accessible summaries, and revision-aware CRUD. A `REVISION_CONFLICT` now preserves the draft and offers an explicit fresh reload before any retry. The work also merges `feat/t11-mobile-auth` because examination API access requires an authenticated scoped session. See `carin-app/app/(tabs)/exams.tsx`, `carin-app/app/exams/`, `carin-app/components/exams/`, and `carin-app/lib/exams/`.

Verification (worktree root: `.worktrees/t25-examinations-mobile`):
- `carin-app/`: `pnpm run typecheck`, `pnpm run lint`, `pnpm test` (103 unit + 32 integration passed), `pnpm run contracts:check`, `pnpm exec expo install --check`, and web export passed.
- `carin-api/`: `pnpm run build` passed. API typecheck, lint, unit (123), and integration (144) suites also passed during the integration verification run.
- `carin-app/`: `EXPO_PUBLIC_API_URL=http://localhost:3000 EXPO_PUBLIC_ENV=development pnpm exec expo export --platform web` passed and exported the examination and auth routes.
- Final spec review approved after conflict recovery, timezone refresh, Indonesian decimal formatting, and same-date ordering fixes. Independent code-quality review approved with no actionable findings.
- Final verification after review: typecheck, lint, all 103 unit + 32 integration tests, contract generation check, Expo dependency check, Prettier, and web export all passed. `git diff --check` passed before staging.

Unverified work / blockers: No Android/iOS emulator or device QA was available, and the web export did not call a live API or verify authentication in a running app. Follow up with platform interaction QA when a device/simulator is available.

Next step: Native device/simulator interaction QA when available. Task is ready for human acceptance in `review`; do not mark `done` without approval.

Worktree state: Branch `feat/t25-examinations-mobile` from `feat/t24-examinations-api`, with the T11 auth prerequisite merged. Commits include `3eed7c7`, `fa828a9`, and `f00265f`; final review follow-ups and this handoff are committed locally. No push. The main `dev` checkout's untracked `.superpowers/` belongs to the user and must be preserved.
