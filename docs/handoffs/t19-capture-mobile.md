# T19 capture and analysis mobile handoff

## Focused plan

1. Add tests for poll cadence/terminal states, permission denial fallbacks, analysis result rendering rules, and stable request keys.
2. Implement capture with on-demand camera/gallery permission, preview, current AI consent, private upload, and job creation through generated operations.
3. Implement job status/results with active polling, focus/app resume refresh, retry, and source/coverage/limitation presentation.
4. Run documented app checks, record the unavailable native-device verification, and leave TSK 19 started for review.

## Changes

- Added `carin-app/app/food/capture.tsx` for on-demand camera and gallery permission,
  camera capture, preview, blocked-permission Settings/source/manual fallbacks,
  latest legal consent, private photo upload, and analysis-job creation.
- Added `carin-app/app/food/analysis/[id].tsx` for server-backed job status,
  focus/app-resume refresh, foreground polling (2s for 30s, then 5s), retry,
  and result presentation. Scan screens expose no consumption write.
- Added `carin-app/lib/food/` helpers and tests for permission fallbacks, polling,
  provider failures, null/partial/unrecognized values, synthetic labels, source
  attribution, and stable idempotency keys across repository recreation.
- Added Expo SDK 56 `expo-camera` and `expo-image-picker` dependencies and
  permission copy/plugin settings. OpenAPI and generated files are unchanged.

## Verification

Run from `carin-app/`:

- `pnpm install --frozen-lockfile` — passed.
- `pnpm run lint` — passed.
- `pnpm run typecheck` — passed.
- `pnpm run test` — passed: 13 unit files / 94 tests and 6 integration files / 30 tests.
- `pnpm run contracts:check` — passed; generated contracts match OpenAPI.
- `pnpm exec expo install --check` — passed; dependencies are up to date.
- `pnpm exec expo config --type public` — passed; camera/gallery config resolves.

## Unverified work / blockers

- Physical Android/iOS camera and gallery permission flows, app background/reopen,
  and visual accessibility QA require a device; none was available in this run.
- The C18 scan/job creation route is not present in this baseline worktree. The
  client uses the existing generated photo, job, status, and retry operations and
  needs C18 integrated for end-to-end server verification.

## Next step / state

Integrate C18, then exercise upload, job creation, resume, retry, and result rendering
on the agreed demo device. TSK 19 remains `started` pending review.

Commit SHA and final worktree status will be recorded after commit.
