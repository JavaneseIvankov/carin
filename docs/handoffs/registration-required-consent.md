Task / scope:
- Fix registration consent visibility and document loading on web and development phones, on branch `fix/registration-required-consent`.

Changes and affected files:
- `carin-app/app/(auth)/sign-up.tsx`: always show both mandatory consent checkboxes; disable acceptance when current documents are unavailable and disable registration until both are accepted.
- `carin-app/components/auth/legal-checkbox.tsx`: support unavailable document versions and disabled checkbox/document actions.
- `carin-app/lib/auth/legal.ts`: remove the custom Cache-Control request header rejected by the existing API CORS allowlist, use no-store fetch caching, and abort stalled requests after ten seconds.
- `carin-app/lib/config.ts`, `lib/config.native.ts`, and `lib/api-url.ts`: resolve development loopback API URLs through the browser/Expo host so phones reach the development machine. Explicit remote hosts and staging/production URLs are preserved.
- Added legal loader and development host unit coverage; documented setup in the app README.
- Workstation-only: added `http://192.168.18.183:8081` to existing runtime trusted origins under `/tmp` and restarted API. No credentials added to the repository.

Verification: commands, working directories, results, platform/device if relevant
- From `carin-app/`: `./node_modules/.bin/tsc --noEmit` and `./node_modules/.bin/eslint . --max-warnings 0` passed.
- From `carin-app/`: `./node_modules/.bin/vitest run` passed: 46 files, 345 tests.
- Prettier checks passed for changed TypeScript files; repository `git diff --check` passed.
- Real API Chromium checks via `/tmp/carin-consent-browser.cjs` and `/tmp/carin-consent-lan-browser.cjs`, desktop width 1280 and phone width 390: consent checkboxes load, registration requires both selections, documents open/close, failed requests keep consent disabled, retry recovers. Tested localhost and LAN web addresses. No accounts created.
- Screenshots: `/tmp/carin-consent-1280.png`, `/tmp/carin-consent-390.png`.

Unverified work / blockers:
- Physical Android/iOS and native Expo runtime were not tested. Browser phone viewport is web verification only.
- Account creation, email verification, and real AI were not tested in this task.

Next step:
- Review changes; open `http://192.168.18.183:8081/sign-up` from a phone on the same LAN, or reload Expo native and inspect registration.

Worktree state:
- Changes are uncommitted on the requested branch. Existing API CORS and mobile session recovery changes, their tests, and `docs/handoffs/authguard-web.md` were preserved. No commit or push performed.
