# T20 Mobile Correction handoff

Task / scope: Build scan correction and component/portion editing in the mobile app.

Changes and affected files:

- Added the correction route and reusable food editor for component replacement, removal/addition, catalog/free-text input, grams/servings/unknown portions, and correction job states.
- Preserved result/catalog/revision bindings and account-scoped drafts. Drafts flush before route changes; pre-hydration exits do not overwrite existing drafts, and successful navigation cannot re-save a removed draft.
- Kept confirmation tied to the latest valid correction result; pending states disable consumption, and failed states expose retry or explicit return.
- Added integration and unit coverage for portion scaling, retry identity, draft lifecycle, and screen action states.

Verification from `carin-app/`:

- `pnpm run test:unit`: 115 tests passed.
- `pnpm run test:integration`: 33 tests passed.
- `pnpm run typecheck`, `pnpm run lint`, and `pnpm run contracts:check`: passed.
- `git diff --check`: passed.
- Independent follow-up review of `8826813` confirmed both draft lifecycle findings resolved; focused correction tests passed (3 files / 17 tests), with no blockers.

Unverified work / blockers: No device E2E was run. No push or merge was performed.

Next step: Human review of T20, then integrate `feat/c20-component-correction-mobile`.

Worktree state: clean on `feat/c20-component-correction-mobile`; implementation commits are `d107d80`, `fe96939`, and `8826813`.
