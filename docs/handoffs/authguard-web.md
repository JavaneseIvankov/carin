# AuthGuard web recovery — review

Task / scope:
- Reproduce startup blocking in the running Expo web app and fix session recovery and web authentication transport.

Changes and affected files:
- `carin-app/lib/auth/session.ts`: limit session restoration to 10 seconds, preserve retry and ignore late responses after timeout.
- `carin-app/components/auth/auth-gate.tsx`: stop the spinner on failure and offer “Masuk kembali”, clearing local scope before opening sign-in.
- `carin-app/app/index.tsx`: let the root AuthGate own restoration UI, avoiding duplicate error messages.
- `carin-app/lib/api/query.ts` and `repository.ts`: web resource requests use browser credentials; native requests retain SecureStore cookies.
- Auth lifecycle and repository integration tests cover timeout, late responses, recovery, and browser credentials.

Verification: commands, working directories, results, platform/device if relevant
- From `carin-app/`: `./node_modules/.bin/tsc --noEmit`, `./node_modules/.bin/eslint . --max-warnings 0`, and `./node_modules/.bin/vitest run` all passed; 44 test files / 337 tests.
- Prettier check on all seven changed app files passed; root `git diff --check` passed.
- Ran Expo web with `EXPO_PUBLIC_API_URL=http://localhost:3000 ./node_modules/.bin/expo start --web --port 8082`.
- Chromium / Playwright checked the actual rendered app: unavailable API shows one recovery message; “Masuk kembali” opens sign-in; guest session opens sign-in; verified session opens Beranda; web data fetches use `credentials: include`; a stalled session exposes recovery after the 10-second deadline.
- Browser session responses were intercepted for guest/verified/stalled cases; resource requests deliberately returned 503. Screenshots and the browser script are in `/tmp/carin-auth-*.png` and `/tmp/carin-auth-browser.cjs` for this workstation.

Unverified work / blockers:
- Local API at port 3000 was unavailable (connection refused), and `infra/.env` was absent. Real backend login, email delivery, persisted cookies, and dashboard data remain unverified. Controlled browser responses do not prove real authentication.
- Android and iOS were not tested.

Next step:
- Review the uncommitted fix, then test with the configured real API and a verified test account. For web, allow the exact Expo origin in the backend's auth/CORS configuration.

Worktree state:
- Uncommitted changes on `dev`; initial worktree was clean. No commit or push performed.

## Follow-up: run app and real API

- User requested running both components. Expo now runs at `http://localhost:8081`; the real API runs at `http://localhost:3000`.
- Docker daemon was unavailable. Created separate Podman containers `carin-local-postgres` (host loopback port 5433) and `carin-local-storage` (host loopback port 9000), using the repository's PostgreSQL version and pinned Silo image. Existing databases were not modified. Migrations applied to the new `carin_local` database.
- Generated local runtime secrets in private files under `/tmp`; no secrets were added to the repository. Start/migrate helper: `/tmp/carin-local-runtime.cjs`, with `start` or `migrate` argument. This is workstation setup, not a replacement for documented deployment configuration.
- The real browser check found missing API CORS headers. Added credentialed CORS for exact configured web origins on `/api/*` in `carin-api/src/app.ts`; `src/index.ts` derives web origins from `AUTH_TRUSTED_ORIGINS`. Unconfigured origins remain blocked. Added five CORS unit cases in `src/app.cors.unit.test.ts`.
- API build, typecheck, lint, and 226 unit tests passed. Real API `/health/ready` returned 200; Chromium loaded the app, restored a real guest session, and navigated to `/sign-in` without a CORS error or restoration overlay.
- Verified-account login and email delivery remain unverified. This new database contains no test account, and the email/AI workers were not started. Android/iOS remain untested.
- Additional uncommitted API files: `src/app.ts`, `src/index.ts`, `src/app.cors.unit.test.ts`; preserve earlier mobile changes.

## Restart local app/API — 2026-10-14

Task / scope: Run `carin-app` and `carin-api` using the existing local setup.
Changes and affected files: No source changes. Restarted `carin-local-postgres` and `carin-local-storage`; rebuilt API and started its existing `/tmp/carin-local-runtime.cjs` helper. Started Expo web on port 8081 with API URL `http://localhost:3000`.
Verification: From `carin-api/`, `./node_modules/.bin/tsc -p tsconfig.build.json` passed. API `GET http://localhost:3000/health/ready` returned 200. App `GET http://localhost:8081` returned 200 and Expo web bundles completed.
Unverified work / blockers: Browser interactions, account login, email/AI workers, Android and iOS were not checked in this restart.
Next step: Open `http://localhost:8081` to use the app.
Worktree state: Existing uncommitted API/mobile changes preserved; this handoff updated. No commit performed.
