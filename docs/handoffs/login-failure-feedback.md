Task / scope:
- Fix misleading wrong-password feedback and login requests failing on development HTTP web; work on `dev`.

Changes and affected files:
- `carin-app/lib/auth/flows.ts` and `app/(auth)/sign-in.tsx`: only explicit Better Auth INVALID_EMAIL_OR_PASSWORD is shown as invalid credentials; distinguish unverified email, throttling, and service/network failures. Apply the same handling to thrown errors; preserve verification recovery.
- `carin-app/lib/request-id*.ts`, `lib/auth/client.ts`, and `lib/api/repository.ts`: logging UUID generation cannot block HTTP LAN auth/resource requests when crypto.randomUUID is unavailable. Native retains Expo Crypto; web uses browser crypto with tracing-only fallback UUIDs compatible with API validation.
- `lib/auth/flows.unit.test.ts` and `lib/request-id.unit.test.ts`: failure classification and UUID availability boundary tests.
- `lib/config.unit.test.ts`: fix existing import of a removed resolveApiUrl export to test the active development URL helper. `lib/api-url.ts` and `lib/config.native.ts`: normalize all trailing URL slashes consistently so existing URL tests pass.

Verification: commands, working directories, results, platform/device if relevant
- From `carin-app/`: `./node_modules/.bin/tsc --noEmit` and `./node_modules/.bin/eslint . --max-warnings 0` passed.
- From `carin-app/`: `./node_modules/.bin/vitest run` passed: 48 files / 358 tests. After adding one additional absent-WebCrypto case, targeted `./node_modules/.bin/vitest run lib/request-id.unit.test.ts` passed all 3 tests.
- Prettier checks for changed TypeScript files and root `git diff --check` passed.
- From `carin-api/`: `PATH=/tmp/carin-test-bin:$PATH ./node_modules/.bin/vitest run tests/integration/auth.integration.test.ts` passed 22 tests on a disposable PostgreSQL container. Temporary docker wrapper delegates to Podman. This tests actual registration/password hashing/verification/sign-in without using user accounts or sending real mail.
- `/tmp/carin-login-inspect.cjs`: after fixing request tracing, actual web login request reached the API from HTTP LAN; deliberately nonexistent test credentials returned expected 401 INVALID_EMAIL_OR_PASSWORD. Before the fix session restoration blocked the form.
- `/tmp/carin-login-browser.cjs`: 10 Chromium phone viewport checks passed on HTTP LAN and HTTPS: wrong credentials, unverified email, server failure, 429, and aborted network request. Controlled session/sign-in responses were intercepted; these UI checks do not establish a real user session.

Unverified work / blockers:
- User account login and password were not inspected; no passwords, verification flags, or account records changed.
- Awaiting optional clarification whether the user has opened their email verification link and which platform was used. Verified email remains mandatory.
- Physical native Android/iOS were not tested.

Next step:
- Reload the running app and retry via its HTTPS development URL. If login still fails, capture the safe response status/code and platform; do not request or log a password.

Worktree state:
- Uncommitted changes on `dev`; no commit or push. Existing credential-bearing modification to `infra/.env.example` is preserved and must not be committed.
