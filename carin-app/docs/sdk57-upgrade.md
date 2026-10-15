# SDK 57 upgrade handoff

Task / scope: Upgrade the mobile app from Expo SDK 56 to 57 for the user's iPhone Expo Go 57.

Changes and affected files: `package.json` and `pnpm-lock.yaml` align Expo modules, Router, React Native 0.86.3, Reanimated 4.5.1, Worklets 0.10.1, and Expo ESLint config. An explicit `@expo/dom-webview` dependency prevents the old SDK 56 peer from remaining installed.

Verification (from `carin-app/`):

- `./node_modules/.bin/tsc --noEmit`: passed.
- `./node_modules/.bin/eslint . --max-warnings 0`: passed.
- `./node_modules/.bin/vitest run`: 56 files, 396 tests passed.
- `npm exec --yes -- expo-doctor`: all 21 checks passed after fixing dom-webview.
- `./node_modules/.bin/expo export --platform ios --output-dir /tmp/carin-sdk57-ios`: passed, 3794 modules bundled.
- `expo start -c --tunnel`: running in a desktop terminal; its iOS manifest reports SDK 57.0.0.

Unverified work / blockers: Physical iPhone rendering, permissions, and Android remain unverified. The local API was unreachable on port 3000; authenticated/data screens require the backend. The existing openapi-typescript/TypeScript peer warning remains outside this upgrade's scope.

Next step: Scan the current terminal QR using iPhone Camera, open Expo Go 57, and verify rendered screens.

Worktree state: Upgrade is uncommitted. Preserve the pre-existing user change in `infra/.env.example`. Local ignored env changes from setup must remain private.

## Local backend testing session (2026-10-15)

Task / scope: Start the local backend so the user can test registration/login on iPhone.

Changes: Started Docker Desktop and the existing Compose stack with the `email` profile using the `desktop-linux` context. Migrations and bucket initialization exited successfully. Updated ignored local env files to use a temporary HTTPS tunnel for mobile API requests, Better Auth, media URLs and trusted origins. Restarted Expo through a Cloudflare HTTPS proxy after the ngrok tunnel failed; a separate desktop terminal displays an exps:// QR for iPhone. No authentication bypass or test account was created.

Verification: API and PostgreSQL/MinIO containers are healthy; email worker is running. Through the public HTTPS tunnel, `/health/live`, `/health/ready`, `/api/v1/legal`, and `/api/auth/get-session` returned 200. A nonexistent account on `/api/auth/sign-in/email` with the Expo origin returned the expected 401 `INVALID_EMAIL_OR_PASSWORD`. The restarted Expo iOS manifest returned 200 with SDK 57.0.0.

Unverified: Successful user login and actual email delivery require the user's registration/inbox test. AI analysis worker was not started; this session enables auth testing. Temporary tunnel URLs require updating local env and restarting API/email-worker/Expo when regenerated.

Next step: Scan the current Expo QR, register a user if needed, verify the received email, then sign in.

Worktree state: Runtime/env changes are private and uncommitted; preserve the SDK upgrade and pre-existing infra example changes.
