# C08 Better Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mount Better Auth 1.7.7 on the Carin API with server-backed verified sessions, guarded registration/legal consent, and the curated `/api/v1/me` contract.

**Architecture:** Keep Better Auth as the only auth/session provider and inject a Drizzle database plus email delivery seam into a runtime factory. Registration uses a single database transaction for the vendor account rows and mandatory legal consent; raw vendor mutation paths remain unable to write admission or legal metadata. Hono mounts the vendor handler at `/api/auth/*`, while Carin owns `/api/v1/me` and session middleware.

**Tech Stack:** Node.js 24, TypeScript, Hono, Better Auth 1.7.7, `@better-auth/expo` 1.7.7, Drizzle ORM 0.45.4, PostgreSQL, Vitest.

---

### Task 1: Verify the pinned Better Auth extension and transaction APIs

**Files:**
- Inspect: `carin-api/node_modules/better-auth`, `carin-api/node_modules/@better-auth/expo`, `carin-api/src/auth/options.ts`
- Test: `carin-api/src/auth/runtime.unit.test.ts`

- [ ] **Step 1: Install the pinned dependencies and inspect exported types/source.**

```bash
cd carin-api
pnpm install --frozen-lockfile
rg -n "databaseHooks|user\.create|transaction|drizzleAdapter|emailVerification|deleteUser" node_modules/better-auth node_modules/@better-auth/expo
```

- [ ] **Step 2: Add a failing probe for the runtime factory and registration contract.**

```ts
it('exposes a runtime auth handler and registration transaction seam', () => {
  const runtime = createAuthRuntime({ db, baseURL: 'http://test.local', sendEmail: async () => {} });
  expect(runtime.auth.handler).toBeTypeOf('function');
  expect(runtime.registration.create).toBeTypeOf('function');
});
```

- [ ] **Step 3: Record the supported hook/adapter semantics in the implementation comments and choose a mechanism that shares one PostgreSQL transaction.**

The selected mechanism must either execute Better Auth's account creation and `recordMandatoryConsent(tx, userId, versions)` using the same `tx`, or reject the registration before any account row is committed. An after-hook on a separate pool connection is insufficient.

- [ ] **Step 4: Run the focused probe and confirm the expected failure is only the missing runtime factory.**

```bash
pnpm exec vitest run src/auth/runtime.unit.test.ts
```

Expected: the test fails because the runtime factory is not implemented yet.

### Task 2: Implement age/legal admission and atomic registration

**Files:**
- Create: `carin-api/src/auth/admission.ts`
- Create: `carin-api/src/auth/registration.ts`
- Modify: `carin-api/src/auth/options.ts`
- Test: `carin-api/src/auth/admission.unit.test.ts`, `carin-api/tests/integration/auth-registration.integration.test.ts`

- [ ] **Step 1: Write failing tests for Asia/Jakarta calendar admission, stale legal versions, and raw input rejection.**

```ts
it.each([
  ['2008-10-14', true],
  ['2008-10-15', false],
  ['1976-10-14', true],
  ['1975-10-14', false],
])('evaluates DOB %s at the signup date boundary', (birthDate, accepted) => {
  expect(isSignupAgeAllowed(birthDate, new Date('2026-10-14T01:00:00Z'))).toBe(accepted);
});

it('rejects a registration whose legal versions are no longer current', async () => {
  await expect(registerAccount({ ...validInput, acceptedTermsVersion: 'old' })).rejects.toMatchObject({ code: 'STALE_LEGAL_VERSION' });
});

it('does not allow Better Auth raw signup to omit registration admission fields', async () => {
  const response = await request('/api/auth/sign-up/email', { name: 'A', email: 'a@example.test', password: 'password123' });
  expect(response.status).toBe(422);
  expect(await countRows('user')).toBe(0);
});
```

- [ ] **Step 2: Run the focused tests and observe the expected RED failures.**

```bash
pnpm exec vitest run src/auth/admission.unit.test.ts tests/integration/auth-registration.integration.test.ts
```

- [ ] **Step 3: Implement date-only parsing and the registration transaction.**

`isSignupAgeAllowed` compares the Asia/Jakarta calendar date to the DOB, inclusive for ages 18 through 50. The registration transaction validates the current legal registry, creates the Better Auth user/account with server `acceptedAt`, then calls `recordMandatoryConsent` on the same transaction before commit. A failed consent insert rolls back the user and account rows.

- [ ] **Step 4: Add the Better Auth hooks/field configuration that makes `birthDate`, legal versions, and `acceptedAt` non-updateable and disables vendor account deletion.**

- [ ] **Step 5: Run the focused tests and confirm GREEN.**

```bash
pnpm exec vitest run src/auth/admission.unit.test.ts tests/integration/auth-registration.integration.test.ts
```

### Task 3: Mount the runtime and expose verified server sessions

**Files:**
- Create: `carin-api/src/auth/runtime.ts`
- Create: `carin-api/src/auth/session.ts`
- Modify: `carin-api/src/app.ts`, `carin-api/src/index.ts`, `carin-api/src/http/access.ts`, `carin-api/src/http/types.ts`
- Test: `carin-api/src/auth/session.unit.test.ts`, `carin-api/tests/integration/auth-session.integration.test.ts`

- [ ] **Step 1: Write failing integration tests for cookie login, unverified denial, expiry, and logout.**

```ts
it('resolves only an active Better Auth session and preserves its row id', async () => {
  const session = await resolveSession(new Request(url, { headers: { cookie } }));
  expect(session).toMatchObject({ userId, sessionId, emailVerified: true });
});

it('rejects an unverified account before protected resources', async () => {
  const response = await app.request('/api/v1/me', { headers: { cookie } });
  expect(response.status).toBe(403);
});

it('stops accepting an expired or logged-out session', async () => {
  await expireSession(sessionId);
  expect(await app.request('/api/v1/me', { headers: { cookie } })).toHaveStatus(401);
  await signOut(cookie);
  expect(await app.request('/api/v1/me', { headers: { cookie } })).toHaveStatus(401);
});
```

- [ ] **Step 2: Run the tests to verify RED.**

```bash
pnpm exec vitest run src/auth/session.unit.test.ts tests/integration/auth-session.integration.test.ts
```

- [ ] **Step 3: Implement `createAuthRuntime` with the Drizzle adapter, injected base URL/config, and injectable verification/reset mail sender.**

Mount `auth.handler` for every method at `/api/auth/*`; do not add JWT or refresh endpoints. The session resolver must call Better Auth's server session API against the request cookie and map the returned session row/user to `Session`, including `sessionId`.

- [ ] **Step 4: Wire runtime creation into `createApp`/`index.ts` without changing readiness or existing legal routes.**

- [ ] **Step 5: Run the focused auth session tests and confirm GREEN.**

### Task 4: Implement the curated `/api/v1/me` endpoint

**Files:**
- Create: `carin-api/src/modules/account/routes.ts`
- Create: `carin-api/src/modules/account/service.ts`
- Modify: `carin-api/src/app.ts`
- Test: `carin-api/tests/integration/me.integration.test.ts`

- [ ] **Step 1: Write failing tests for the exact `Me` response, no AI consent by default, and immutable DOB/legal fields.**

```ts
it('returns the verified account and current AI consent state', async () => {
  const response = await app.request('/api/v1/me', { headers: { cookie } });
  expect(await response.json()).toEqual(expect.objectContaining({ id: userId, emailVerified: true, birthDate, aiConsent: { version: null, granted: false, updatedAt: null } }));
});

it('does not expose account mutation fields through the C08 account route', async () => {
  expect((await app.request('/api/v1/me', { method: 'PATCH', headers: { cookie } })).status).toBe(404);
});
```

- [ ] **Step 2: Run the tests and observe RED.**

```bash
pnpm exec vitest run tests/integration/me.integration.test.ts
```

- [ ] **Step 3: Implement a read-only GET using the auth user row and latest `ai_processing` event.**

Use `requireSession` and validate both request and response through the generated app contract. Do not return passwords, account tokens, sessions, or server-only fields.

- [ ] **Step 4: Run the focused tests and confirm GREEN.**

### Task 5: Verify the complete auth boundary and commit

**Files:**
- Modify: `carin-api/src/auth/*.ts`, `carin-api/src/modules/account/*.ts`, and related tests only as needed

- [ ] **Step 1: Run all backend tests and static checks.**

```bash
cd carin-api
pnpm test
pnpm run typecheck
pnpm run lint
pnpm run build
```

- [ ] **Step 2: Run contract and database verification from the repository instructions.**

```bash
cd ..
python specs/validate-contracts.py
```

Check that Better Auth 1.7.7 generated/vendor routes, UUID schema, transaction rollback, verified-cookie session, logout, expiry, age boundaries, and raw mutation bypass cases are covered by actual tests.

- [ ] **Step 3: Commit the isolated feature branch.**

```bash
git add docs/superpowers/plans/2026-10-14-c08-better-auth.md carin-api
git commit -m "feat: implement Better Auth account sessions"
```
