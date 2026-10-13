# C11 mobile authentication and persistent session design

## Status and scope

This design covers C11, the mobile authentication flow and persistent Better Auth session for `carin-app`. It depends on C08/C09 (Better Auth, verification/reset email and landing links) and C10 (mobile app shell and user-scoped data client). The implementation branch is `feat/t11-mobile-auth`, based on current `dev` with C08/C09 included. The root `dev` worktree remains untouched.

The task includes registration, email verification instructions/resend, sign-in, forgot-password, reset-password deep links, session restoration, protected routes, and clearing account-scoped cache on logout or invalidated session. It does not implement onboarding/profile, legal document authoring, backend auth policies, or real inbox acceptance that depends on unavailable email credentials.

## Chosen architecture

Use one Better Auth Expo client backed by SecureStore, with the Expo plugin configuration matching the server's pinned Better Auth version. Compose `AppDataProvider` outside a single app auth provider so the latter can use C10's existing `setSessionUser`/`clearSession` boundary. Only a session validated by the server can establish the user ID scope. Authenticated requests in the existing API/network layer must send the Better Auth session cookie; do not create a parallel bearer-token/session mechanism. When the session ends, changes user, expires, or an authenticated API request returns 401, clear the departing scoped queries, mutations, and persisted read/draft data.

The root navigation guard waits for the initial `get-session` result before rendering protected tabs or redirecting. `(auth)` routes remain available without a session, including verification and reset deep links. Authenticated users are redirected away from sign-in/register toward the protected app; unverified accounts do not receive an application session and cannot reach health resources. Do not add a second token/session store or treat cached user state as proof of authentication.

Keep one screen per existing UX route: `(auth)/sign-up`, `verify-email`, `sign-in`, `forgot-password`, and `reset-password`. Forms reuse existing app form/button primitives and Bahasa Indonesia copy. Registration fetches the public legal registry from `GET /api/v1/legal`, starts mandatory terms/privacy consent unchecked, requires a DOB within 18–50, uses `Pengguna` when name is blank, and submits the displayed legal versions. A stale legal version is shown as a retry requiring the user to review/accept the current documents. Server admission checks remain authoritative.

Forgot-password always shows generic confirmation. Verification and reset links follow the backend HTTPS landing flow; reset token is accepted only from the app link, used once with the new password, and never persisted or logged by app code. Successful verification does not log in automatically. Successful password reset routes to sign-in; old sessions are revoked by the server.

## Environment and deep links

Resolve Expo native scheme and Better Auth cookie/storage prefix from explicit build environment, with distinct `carin-dev`, `carin-staging`, and `carin` production identities. Keep API origin in `EXPO_PUBLIC_API_URL`; no server secret is bundled. Keep callback origins/schemes allowlisted by the backend. The scheme and client storage prefix must agree for each build so a session or reset link cannot cross environments.

Validate the pinned Better Auth Expo client/plugin API against the repository's Expo SDK 56 and Better Auth 1.7.7 instead of assuming compatibility from the SDK 55 example in the architecture notes. Native development builds are the acceptance target for SecureStore, cookie persistence, and links; Expo Go or web tests alone do not establish native behavior.

## Failure and state behavior

- While restoring a session, show a neutral loading state and do not flash protected content.
- On network failure during restoration, show an actionable retry/error state; do not invent a logged-in session from local cached identity.
- Signup submits once, shows field-level validation where safe, and directs accepted submissions to verification instructions. Resend uses backend cooldown and generic feedback.
- Unverified sign-in shows verification guidance and does not establish app data scope.
- Expired/revoked session clears the current user scope before redirecting to sign-in; the user's draft is not transferred to another account.
- Invalid, expired, missing, or reused reset links show a recoverable state with a path to request another email; never expose tokens in UI diagnostics or logs.
- Logout calls server sign-out, then clears local scoped state even if the request fails; navigation returns to sign-in.

## Verification

Add unit tests for environment scheme/prefix selection, registration input and legal-version handling, link parsing/token edge cases, and navigation access decisions. Add provider/repository integration tests for restoring a session, unverified sign-in, user switch/cache clearing, 401 revocation, logout failure, and reset completion. Use the existing Expo package scripts for typecheck, lint, unit, and integration tests; run Prettier on changed files.

Record native development-build checks separately: signup email/verification, session cookie surviving app restart, expired session, logout/reset revocation, invalid deep link, and denied unverified access. These checks require a reachable API and email delivery configuration; report them as unverified when the environment is unavailable rather than substituting fixtures as proof.

## Alternatives considered

1. **Chosen: centralized auth provider and route guard.** The session lifecycle, user-scoped cache transition, and deep-link routing have one owner and can be tested together.
2. **Screen-local Better Auth calls with a thin route check.** Less initial scaffolding, but it duplicates lifecycle/error behavior and risks inconsistent cache cleanup across auth routes.
3. **Hosted web authentication.** It reduces native form code but does not match the specified in-app forms and creates another handoff for persistent native session and reset deep links.
