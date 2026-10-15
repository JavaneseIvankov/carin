# Expo Router Auth Guard Refactor Implementation Plan

> **For agentic workers:** Execute this plan inline in the current session. Keep the work isolated in the `feat/onboarding` worktree.

**Goal:** Replace the root sibling redirect guard with Expo Router `Stack.Protected` guards and route-owned loading/fallback behavior.

**Architecture:** Keep auth, app data, and onboarding providers above the root stack. Root stack guards will control public, authenticated, and onboarding route groups; the root index route will handle session restoration and choose sign-in, welcome, or dashboard. Password recovery routes remain public at the same URL paths, while the auth group is available only before a verified session. `lastUnhandled` route-name handling preserves blocked deep links through sign-in/onboarding transitions.

**Tech Stack:** Expo Router 56, React Native, React Context, TanStack Query, Vitest.

---

### Task 1: Define route access and entry decisions

**Files:**
- Create: `carin-app/lib/auth/root-route-access.ts`
- Test: `carin-app/lib/auth/root-route-access.unit.test.ts`

- [ ] Test route access for loading, unauthenticated, onboarding incomplete, onboarding complete, bypassed, and unavailable states.
- [ ] Run `cd carin-app && pnpm exec vitest run lib/auth/root-route-access.unit.test.ts` and confirm the new tests fail because the helper is missing.
- [ ] Implement pure predicates and root entry destination using the existing `AuthStatus` and `OnboardingGateState` types.
- [ ] Re-run the focused Vitest command and confirm all route access cases pass.

### Task 2: Move reset flows out of the auth-only route group

**Files:**
- Move: `carin-app/app/(auth)/forgot-password.tsx` to `carin-app/app/forgot-password.tsx`
- Move: `carin-app/app/(auth)/reset-password.tsx` to `carin-app/app/reset-password.tsx`
- Modify: `carin-app/app/auth/reset.tsx`, `carin-app/app/(auth)/sign-in.tsx`, `carin-app/lib/auth/routes.ts`, and route tests

- [ ] Update route references to the public URLs `/forgot-password` and `/reset-password` while retaining `/auth/reset` callback handling.
- [ ] Test route normalization and public reset destinations.
- [ ] Run the focused auth route Vitest tests and confirm they pass.

### Task 3: Put access guards inside the Expo Router navigators

**Files:**
- Modify: `carin-app/app/_layout.tsx`
- Modify: `carin-app/app/index.tsx`
- Modify: `carin-app/app/(auth)/_layout.tsx`
- Modify: `carin-app/app/(tabs)/_layout.tsx`
- Replace: `carin-app/components/auth/auth-gate.tsx` with `carin-app/components/auth/auth-restoration-state.tsx`
- Delete: `carin-app/lib/auth/root-redirect.ts` and its unit test

- [ ] Declare `Stack.Protected` groups for unauthenticated auth routes, incomplete onboarding routes, dashboard access, and fully authenticated routes.
- [ ] Set `UNSTABLE_routeNamesChangeBehavior="lastUnhandled"`; keep the public index as the fallback and render restoration/retry UI from that route.
- [ ] Add tab-level guards so an unavailable onboarding read can expose the dashboard while blocking other tabs, matching current behavior.
- [ ] Confirm no root-level guard reads router state or calls `router.replace` outside a route.

### Task 4: Verify

**Files:**
- Verify: `carin-app/lib/auth/root-route-access.unit.test.ts`
- Verify: auth/onboarding route unit and integration tests

- [ ] Run `cd carin-app && pnpm run typecheck`.
- [ ] Run `cd carin-app && pnpm run lint`.
- [ ] Run `cd carin-app && pnpm run test:unit` and `pnpm run test:integration`.
- [ ] Inspect the final diff and report that Android device validation remains outstanding unless an Android target is available.
