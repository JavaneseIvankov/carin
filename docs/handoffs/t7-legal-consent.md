# T7 / C07 legal and consent handoff

Task / scope: T7/C07 only. Implement the public legal version registry, consent
event recording for mandatory registration terms/privacy and optional AI
processing, stale-version rejection, and a transaction guard for withdrawal.

Changes and affected files:

- `carin-api/src/modules/legal/registry.ts`: three versioned Indonesian draft
  documents, each marked as pending qualified review and linked to the official
  JDIH Kemkomdigi record for UU 27/2022. No company identity, processor, contact,
  retention period, or compliance guarantee was invented.
- `carin-api/src/modules/legal/consent-service.ts`: signup consent helper,
  current AI grant check for C16 publication, idempotent grant/revoke storage,
  server-side event timestamps, queued-job cancellation, and pending evaluation
  limitation on withdrawal.
- `carin-api/src/modules/legal/routes.ts`, `carin-api/src/app.ts`,
  `carin-api/src/http/types.ts`: public registry route and contract-validated
  consent route with session-scoped idempotency.
- `carin-api/src/modules/legal/README.md`: T8 signup integration requirements
  and the C16 publication transaction contract.
- `carin-api/tests/integration/legal-consent.integration.test.ts`: disposable
  PostgreSQL coverage for current registry, signup records, stale versions,
  optional consent, profile/manual/exam access without AI consent, idempotent
  grant/retry, and withdrawal effects.

Verification (Linux, Node 24.18.0, pnpm 10.33.0):

- From `carin-api/`: `pnpm install --frozen-lockfile` — passed.
- From `carin-api/`: `pnpm run typecheck` — passed.
- From `carin-api/`: `pnpm run lint` — passed.
- From `carin-api/`: `pnpm run test:unit` — 47 tests passed.
- From `carin-api/`: `pnpm run test:integration` — 102 tests passed across 6 files, including 7 new T7 cases; disposable PostgreSQL containers were used.
- From `carin-api/`: `pnpm run build` — passed.
- From `carin-app/`: `pnpm install --frozen-lockfile` — passed.
- From `carin-app/`: `pnpm run contracts:check` — generated outputs match OpenAPI.
- From repo root, using the existing checkout's `.venv/bin/python`: `python specs/validate-contracts.py` — passed; 2 OpenAPI documents, 38 operations, 408 references, 5 fixtures, and 3 negative probes.
- From worktree root: `git diff --check` — passed.

Unverified work / blockers:

- Better Auth signup is T8 scope. T8 must create the user with current terms and
  privacy versions and a server-generated `acceptedAt`, then call
  `recordMandatoryConsent` in that same account-creation transaction. T3 makes
  those fields immutable after insert.
- The consent PUT route is implemented and integration-tested with an injected
  session resolver. Production wiring awaits T8's Better Auth server resolver,
  which must supply the session row ID. The public GET registry is wired in
  `createApp` now.
- C16 must call `lockAndCheckCurrentAiConsent(tx, userId)` immediately before
  publishing any new AI output in its publication transaction. No worker, lease,
  or attempt lifecycle code was changed here.
- Terms, privacy, and AI processing texts remain drafts. Their review and
  approval are outstanding; implementation is not evidence of legal compliance.
- Core profile, manual consumption, and examination HTTP routes are outside T7;
  integration coverage confirms their T3-backed records can be written for a
  user with no AI consent.

Next step: independent review, then integrate T8 signup/session wiring and C16
publication guard using the documented seams.

Worktree state: committed on `feat/t7-legal-consent` in `.worktrees/t7-legal-consent`;
no merge, push, or task-board status change performed.
