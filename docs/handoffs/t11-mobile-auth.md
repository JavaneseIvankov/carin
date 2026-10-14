# C11 — Mobile auth and persistent session handoff

Task / scope: C11, mobile Better Auth client and persistent verified session flow.

Changes and affected files: environment-specific schemes, SecureStore client, backend cookie-prefix alignment, server-verified session owner, explicit native cookie transport, guarded routes, registration/legal consent and email verification, sign-in, forgot/reset password, HTTPS callback setup, and cache/session race protections. See branch commits `bd87844` through `9f9baa3` for implementation and focused fixes.

Verification:

- From `carin-app/`: `pnpm run test` passed (9 unit files / 71 tests; 5 integration files / 27 tests); `pnpm run typecheck`, `pnpm run lint`, and `pnpm run contracts:check` passed.
- Expo public config resolved without secrets for `EXPO_PUBLIC_ENV=development`, `staging`, and `production`, with schemes `carin-dev`, `carin-staging`, and `carin`.
- From `carin-api/`: `pnpm run typecheck`, `pnpm run lint`, `pnpm test` (12 unit files / 101 tests; 8 integration files / 123 tests), and `pnpm run build` passed.
- Review: Task 4 spec and quality reviews passed; Task 5 spec and quality reviews passed; Task 3 route/session review findings were fixed in `25b4952` and `9f9baa3`, then re-reviewed.

Unverified work / blockers: No Android/iOS development build or live email/deep-link smoke test was run. `adb`, `xcrun`, and `eas` are unavailable in this environment. Resend/verification/reset require a reachable HTTPS API URL; the checked-in localhost HTTP example supports local API work but cannot send these email flows. Native cookie persistence after restart, real Resend delivery, revoked/expired session behavior on device, and invalid-link handling remain device/provider acceptance checks.

Next step: Hand C11 to the task owner for review. C12 is the next unblocked profile API task; its declared C03/C05/C06/C08 dependencies are available in the existing project history.

Worktree state: `feat/t11-mobile-auth`, clean and committed through `9f9baa3`; no push performed. The branch is based on `feat/t9-resend` and includes the C08/C09 dependency commits. Integrate with its dependency ancestry intact.
