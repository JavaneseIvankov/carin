# C11 Mobile Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Deliver the C11 mobile email/password auth flows with server-validated persistent sessions, environment-isolated deep links/cookies, guarded health routes, and scoped-cache cleanup.

**Architecture:** Add one Better Auth Expo client using SecureStore; one auth provider under `AppDataProvider` owns session restoration and cache transitions. Authenticated resource requests attach the Better Auth cookie explicitly. A root route guard protects app routes and the five `(auth)` screens implement signup, verification/resend, sign-in, forgot-password, and reset-password. Backend cookie names and app callback configuration vary by environment.

**Tech Stack:** Expo SDK 56, Expo Router, React Native, Better Auth 1.7.7, `@better-auth/expo` 1.7.7, `expo-secure-store` installed with Expo's version resolver, Hono/Better Auth backend, Vitest, pnpm.

---

## File and responsibility map

- `carin-app/lib/auth/environment.ts`: pure mapping from public build environment to URI scheme, local auth storage prefix, and server cookie prefix.
- `carin-app/app.config.ts`: Expo dynamic config that applies the validated environment scheme and leaves the production `app.json` fallback intact.
- `carin-app/lib/auth/client.ts`: single Better Auth Expo client, `/api/auth` base URL, SecureStore adapter, scheme and prefixes.
- `carin-app/lib/auth/provider.tsx`: session restoration/status, sign-in/out and auth operations, user scope handoff to `AppDataProvider`, and server-validated session state.
- `carin-app/components/auth/auth-gate.tsx`: protect health/app routes, leave `(auth)` deep links reachable, and prevent protected-content flashes while restoring.
- `carin-app/lib/api/repository.ts`: attach `authClient.getCookie()` as `Cookie` and omit implicit credential handling for native API calls; retain 401-triggered scope clearing.
- `carin-app/app/_layout.tsx`, `carin-app/app/index.tsx`: compose providers and resolve the root route through the auth state.
- `carin-app/app/(auth)/_layout.tsx`: auth stack and five route registrations.
- `carin-app/app/(auth)/sign-up.tsx`, `verify-email.tsx`, `sign-in.tsx`, `forgot-password.tsx`, `reset-password.tsx`: route-level forms and states, reusing `FormField`, `Button`, and `Text`.
- `carin-app/app/auth/reset.tsx`: exact deep-link bridge matching C09's existing `{scheme}://auth/reset?token=...` link and forwarding the transient token to the reset form route.
- `carin-app/components/auth/auth-screen.tsx`, `legal-checkbox.tsx`, `legal-document-modal.tsx`: shared auth layout, accessible consent checkboxes, and a readable in-app view of versioned legal text.
- `carin-app/lib/auth/registration.ts`, `legal-presentation.ts`, `links.ts`, `routes.ts`: pure registration normalization/validation, readable legal-markdown blocks, safe reset-link parsing, and route decision functions.
- `carin-api/src/auth/runtime.ts`, `carin-api/src/index.ts`: choose the Better Auth server cookie prefix from `APP_ENV` and pass it into runtime options.
- `carin-api/src/auth/runtime.unit.test.ts`: test cookie-prefix selection for dev/staging/prod without changing generated auth tables.
- `infra/.env.example`, `infra/README.md`: document exact development/staging/production app-scheme and trusted-origin pairing.

## Implementation tasks

### Task 1: Environment mapping and Better Auth client

**Files:** create `carin-app/lib/auth/environment.ts`; create `carin-app/lib/auth/environment.unit.test.ts`; create `carin-app/app.config.ts`; create `carin-app/lib/auth/client.ts`; modify `carin-app/package.json`, `carin-app/pnpm-lock.yaml`, `carin-app/.env.example`, and `carin-app/app.json` only if Expo config requires a fallback adjustment.

- [x] **Step 1: Add failing environment mapping tests.** Cover `development` and `dev` mapping to scheme `carin-dev`, staging to `carin-staging`, production aliases `prod`/`production` mapping to scheme `carin`, environment-specific `storagePrefix`/`cookiePrefix`, and rejection of an unknown environment.
- [x] **Step 2: Run the focused test and confirm it fails.** Run from `carin-app`: `pnpm exec vitest run lib/auth/environment.unit.test.ts`; expect a missing-module/test failure before implementation.
- [x] **Step 3: Implement the pure mapping and Expo config.** Export one typed mapping function from `environment.ts`; use it in `app.config.ts` to return the existing Expo config with only `scheme` overridden. Preserve `name`, slug, plugins, iOS/Android, and web values from `app.json`.
- [x] **Step 4: Add the auth client dependencies.** Run from `carin-app`: `pnpm add better-auth@1.7.7 @better-auth/expo@1.7.7`, then `pnpm exec expo install expo-secure-store`. Keep the Expo-selected SecureStore version and lockfile changes.
- [x] **Step 5: Create the client.** In `lib/auth/client.ts`, use `createAuthClient` from `better-auth/react`, `expoClient` from `@better-auth/expo/client`, and `expo-secure-store`. Set base URL to `${requireApiUrl()}/api/auth`, scheme/storage prefix/cookie prefix from the pure mapping, and export one client instance.
- [x] **Step 6: Run focused tests and Expo config resolution.** Run `pnpm exec vitest run lib/auth/environment.unit.test.ts` and `pnpm exec expo config --type public`; confirm each supported environment emits the mapped scheme and no secret appears in public config.

### Task 2: Environment-specific server cookie prefix

**Files:** modify `carin-api/src/auth/runtime.ts`, `carin-api/src/index.ts`, `carin-api/src/auth/runtime.unit.test.ts`, `infra/.env.example`, and `infra/README.md`.

- [x] **Step 1: Add failing runtime tests.** Assert the runtime uses `carin-dev`, `carin-staging`, or `carin-prod` as the Better Auth cookie prefix for `APP_ENV=dev`, `staging`, or `prod`; retain the existing auth runtime handler and landing URL assertions.
- [x] **Step 2: Run the focused backend test.** Run from `carin-api`: `pnpm exec vitest run src/auth/runtime.unit.test.ts`; expect the new prefix assertion to fail before implementation.
- [x] **Step 3: Pass the explicit environment prefix into runtime.** Add a required cookie-prefix argument to `createAuthRuntime`, set `advanced.cookiePrefix` while preserving the existing database ID and origin settings, and pass `carin-${config.appEnv}` from `src/index.ts`.
- [x] **Step 4: Align local environment docs.** Make the development example use `APP_LINK_SCHEME=carin-dev` and `AUTH_TRUSTED_ORIGINS=carin-dev://`; document corresponding staging (`carin-staging://`) and production (`carin://`) pairings and matching mobile build values.
- [x] **Step 5: Run focused backend checks.** Run from `carin-api`: `pnpm exec vitest run src/auth/runtime.unit.test.ts`, `pnpm run typecheck`, and `pnpm run lint`; expect all to pass.

### Task 3: Persistent session owner, cookie transport, and route guard

**Files:** create `carin-app/lib/auth/provider.tsx`, `carin-app/lib/auth/routes.ts`, `carin-app/lib/auth/routes.unit.test.ts`, and `carin-app/components/auth/auth-gate.tsx`; modify `carin-app/lib/api/repository.ts`, `carin-app/lib/api/query.ts`, `carin-app/lib/data/provider.tsx` only if its existing API needs a minimal extension, `carin-app/app/_layout.tsx`, `carin-app/app/index.tsx`, and `carin-app/lib/data/shell.integration.test.ts` or a colocated auth integration test.

- [x] **Step 1: Write failing route-decision tests.** Cover: a guest may access `(auth)` routes; a guest is redirected from `(tabs)` and resource routes to sign-in; an authenticated user is redirected from sign-in/sign-up to tabs; `loading` never grants access or redirects before server restoration completes.
- [x] **Step 2: Run the focused route tests and confirm failure.** Run from `carin-app`: `pnpm exec vitest run lib/auth/routes.unit.test.ts`.
- [x] **Step 3: Implement pure route decisions and the auth provider.** Provider state is `loading | authenticated | unauthenticated`; on mount call the Better Auth session endpoint and establish `setSessionUser(user.id)` only after a successful server response with a verified session. On invalidation/account change, await `clearSession` before exposing the next user's scope. Expose typed `signIn`, `signOut`, `signUp`, resend, reset-request, and reset-password actions through context.
- [x] **Step 4: Write failing cookie transport tests.** Extend repository tests to assert authenticated requests await the supplied cookie getter, send the result in the `Cookie` header, use `credentials: 'omit'`, and on 401 invoke unauthorized cleanup without returning cached data as authorized. Preserve existing `Idempotency-Key` and multipart behavior.
- [x] **Step 5: Implement the transport change.** Add an injectable async cookie getter to `createAppRepository`; have `useAppRepository` provide `authClient.getCookie()`. Do not persist the cookie in AsyncStorage or a second store. Keep response and scope-generation checks intact.
- [x] **Step 6: Add route guard and root composition.** Place `AuthProvider` inside `AppDataProvider`; keep the theme outside both. Render a neutral restoration state until server validation completes, redirect guest app routes to sign-in with a safe return destination, allow guest auth routes and authenticated reset-recovery routes, and direct other authenticated auth routes to the requested destination or tabs. Make `/` resolve to the correct destination from auth state rather than always redirecting to tabs.
- [x] **Step 7: Test lifecycle failures.** Add integration tests for server session restoration, offline/error restoration retry, sign-out despite network failure (local app state and scoped cache still clear), a revoked-session 401, and account A to account B switching without restoring A's cache.
- [x] **Step 8: Run focused mobile checks.** Run from `carin-app`: `pnpm exec vitest run lib/auth/routes.unit.test.ts lib/data/shell.integration.test.ts`, then `pnpm run typecheck`.

### Task 4: Registration and email-verification routes

**Files:** create `carin-app/app/(auth)/_layout.tsx`, `carin-app/app/(auth)/sign-up.tsx`, `carin-app/app/(auth)/verify-email.tsx`, `carin-app/components/auth/auth-screen.tsx`, `carin-app/components/auth/legal-checkbox.tsx`, `carin-app/components/auth/legal-document-modal.tsx`, `carin-app/lib/auth/registration.ts`, `carin-app/lib/auth/registration.unit.test.ts`, `carin-app/lib/auth/legal-presentation.ts`, `carin-app/lib/auth/legal-presentation.unit.test.ts`, and `carin-app/lib/auth/legal.ts`.

- [x] **Step 1: Add failing registration logic tests.** Cover blank name becoming `Pengguna`; invalid email; password shorter than 8 or longer than 128; invalid/future DOB; age immediately below 18 and above 50; exactly 18 and 50; unchecked terms/privacy rejection; both consent versions included unchanged in signup payload.
- [x] **Step 2: Run focused registration tests.** Run from `carin-app`: `pnpm exec vitest run lib/auth/registration.unit.test.ts` and verify failure before implementation.
- [x] **Step 3: Implement legal document presentation tests and helper.** Convert API Markdown into typed heading, paragraph, quote, and list blocks; remove Markdown link syntax while preserving linked text. Add tests for headings, quote markers, lists, inline emphasis, links, and blank-line handling so draft warnings remain legible.
- [x] **Step 4: Implement current legal registry loading and document modal.** Type `GET /api/v1/legal` from generated `LegalRegistry`; load current terms/privacy versions and display each full document in a scrollable modal opened from its checkbox label. If versions change between load and signup, show the new version and require both checkboxes to be accepted again before retry. Keep any API-provided draft/review warnings visible; do not bundle draft text as final legal copy.
- [x] **Step 5: Implement the signup screen.** Use `FormField`, `Button`, `Text`, the legal modal, safe-area layout, keyboard-aware scrolling, and Indonesian labels. Name is optional; email, password, DOB, terms, and privacy are required; do not precheck legal boxes. Prevent duplicate submit, show server errors without exposing internals, and navigate accepted requests to verification instructions without establishing a session.
- [x] **Step 6: Implement verification instructions and resend.** Show the submitted email without treating it as proof; call Better Auth resend with the configured HTTPS callback; show generic response and cooldown; provide a best-effort `Buka email` action through Expo Linking with an unsupported-client fallback, plus a sign-in action and retry state.
- [x] **Step 7: Run focused checks.** Run from `carin-app`: `pnpm exec vitest run lib/auth/registration.unit.test.ts lib/auth/legal-presentation.unit.test.ts`, `pnpm run typecheck`, and `pnpm run lint`.

### Task 5: Sign-in and password reset routes

**Files:** create `carin-app/app/(auth)/sign-in.tsx`, `carin-app/app/(auth)/forgot-password.tsx`, `carin-app/app/(auth)/reset-password.tsx`, `carin-app/app/auth/reset.tsx`, `carin-app/lib/auth/links.ts`, `carin-app/lib/auth/links.unit.test.ts`, and related route integration tests.

- [x] **Step 1: Add failing reset-link parsing tests.** Match the actual C09 landing link path `auth/reset`; cover missing token, empty token, repeated `token` parameters, URL-encoded token characters, wrong scheme/route, and a valid token extracted only from the expected environment scheme and path. Ensure stringification/error output never includes the token.
- [x] **Step 2: Run the focused link tests.** Run from `carin-app`: `pnpm exec vitest run lib/auth/links.unit.test.ts` and verify failure before implementation.
- [x] **Step 3: Implement sign-in.** Submit email/password through Better Auth; on verified success wait for provider session and cache scope transition before routing to the requested in-app destination or tabs. Show non-sensitive invalid-credential feedback; distinguish the vendor's unverified-email response only enough to offer verification/resend.
- [x] **Step 4: Implement forgot-password.** Submit email with the fixed HTTPS backend reset landing URL; always render the same generic confirmation for known and unknown addresses and expose no account-existence details.
- [x] **Step 5: Implement the reset-link bridge and form.** `app/auth/reset.tsx` must match the backend's existing `{scheme}://auth/reset?token=...` route, reject invalid/duplicate token params, and forward a valid token only as a transient Expo Router param to `(auth)/reset-password`. The form must never put it in SecureStore/AsyncStorage or diagnostics. Require valid new password and confirmation; submit once; route success to sign-in; route expired/reused/error links to a recoverable request-new-email state.
- [x] **Step 6: Add auth flow integration tests.** Verify signup does not scope a user before verification, unverified sign-in does not open protected routes, successful sign-in establishes scope after server validation, forgot responses are generic, reset success clears prior session state and directs to sign-in, and invalid links remain on recoverable auth state.
- [x] **Step 7: Run focused checks.** Run from `carin-app`: `pnpm exec vitest run lib/auth/links.unit.test.ts` plus auth integration tests, then `pnpm run typecheck` and `pnpm run lint`.

### Task 6: Full verification and handoff

**Files:** implementation files above; update `infra/README.md` or `carin-app/README.md` only for validated build/environment instructions; add `docs/handoffs/t11-mobile-auth.md` with the final verification record.

- [x] **Step 1: Format changed files.** From `carin-app`, run `pnpm exec prettier --write` on changed mobile TypeScript/config/JSON files. Format changed backend files using the API package's configured formatter only if its manifest defines one; otherwise use the existing API lint formatter conventions.
- [x] **Step 2: Run mobile suite.** From `carin-app`, run `pnpm run typecheck`, `pnpm run lint`, `pnpm run test:unit`, `pnpm run test:integration`, and `pnpm run contracts:check`; record exact results.
- [x] **Step 3: Run backend suite for cookie-prefix changes.** From `carin-api`, run `pnpm run typecheck`, `pnpm run lint`, `pnpm test`, and `pnpm run build`; record exact results.
- [x] **Step 4: Verify Expo public config for all environments.** Run `pnpm exec expo config --type public` with `EXPO_PUBLIC_ENV=development`, `staging`, and `production`; assert schemes `carin-dev`, `carin-staging`, and `carin`, and ensure no secret value is present.
- [ ] **Step 5: Run native build/link checks when infrastructure is available.** Build and install Android development build (and iOS on macOS); test verification and reset emails, restart cookie persistence, revoked/expired session, logout cache clearing, invalid deep link, and unverified route denial. UNVERIFIED: `adb`, `xcrun`, and `eas` are unavailable in this environment; no native device build or live email/deep-link smoke test was run.
- [x] **Step 6: Review repository state and handoff.** Run `git diff --check`, inspect `git status`, ensure no env/secret files are staged, summarize changed files and checks in the handoff, then set `tsk status T11 review` and verify with `tsk list T11 --json`. Do not mark `done` or push the branch.

## Plan self-review

- **Spec coverage:** client/SecureStore and environment identity: Tasks 1–2; server cookie prefix/origin docs: Task 2; validated session, API cookie, cache cleanup, route protection: Task 3; signup/legal/DOB/verification: Task 4; sign-in/forgot/reset and invalid links: Task 5; unit/integration/native acceptance and task-board handoff: Task 6.
- **Placeholder scan:** no undecided marker or unassigned implementation behavior remains. Native infrastructure/device-dependent checks are explicitly conditional and must be reported as unverified when unavailable.
- **Type/interface consistency:** `AuthProvider` consumes the existing `setSessionUser` and `clearSession`; `useAppRepository` injects the single Better Auth client's async `getCookie`; mobile environment mapping emits the same server cookie prefix (`carin-dev`, `carin-staging`, `carin-prod`) chosen from `APP_ENV`.
- **External API detail:** Better Auth Expo documentation says native resource requests should await `authClient.getCookie()`, send it as `Cookie`, and use `credentials: 'omit'`; it also requires `expo-secure-store`. This plan corrects the existing repository transport, which currently relies on `credentials: 'include'`. See [Better Auth Expo integration](https://better-auth.com/docs/integrations/expo) and [Better Auth cookie options](https://better-auth.com/docs/concepts/cookies).
