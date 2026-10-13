# Legal and consent module

`GET /api/v1/legal` is public and is registered by `createApp`. The AI consent
route follows the OpenAPI contract and must be registered with the authenticated
Better Auth session resolver and the shared Drizzle database when the auth server
is wired. The resolver must include the server-owned session row ID for
session-scoped idempotency.

The current Terms, privacy, and AI processing texts are initial Indonesian drafts
in `registry.ts`. Their shared version is `2026-10-14-draft.1`; all three documents
are explicitly marked as drafts pending qualified review. Do not publish these
texts as final or infer legal compliance from the API implementation. Before
publication, complete the missing operator, processor, contact, and retention
decisions through the appropriate review process.

At signup, T8 must insert the user with current `acceptedTermsVersion`,
`acceptedPrivacyVersion`, and server-generated `acceptedAt`, then call
`recordMandatoryConsent(tx, userId, versions)` in the same database transaction.
The T3 trigger makes those registration fields read-only after insertion. The
helper rejects stale versions and appends immutable terms/privacy events. AI
consent is not part of this step.

`PUT /api/v1/consents/ai-processing` validates the OpenAPI body/header, rejects a
stale document version, stores grant/revoke events with PostgreSQL's server-side
timestamp, and persists idempotent responses for the contract's 24-hour window.
Withdrawal and cancellation of queued jobs share a transaction. Pending
consumption evaluations linked to those queued jobs become `not_requested` with
an `ai_consent_withdrawn` limitation. Processing jobs are left for the worker
publication guard; this module does not cancel worker attempts or change lease
state.

## C16 publication requirement

Every worker transaction that writes or exposes a newly completed AI result must
call `lockAndCheckCurrentAiConsent(tx, userId)` immediately before publication
and commit the result only when it returns `true`. The helper locks the account
row, then checks that the newest AI consent event is a grant for the current
registry version. The withdrawal transaction takes the same account lock, so the
two operations serialize. A worker that sees `false` must withhold the result;
re-grant does not revive a previously cancelled job. Existing history is not
removed by consent withdrawal.
