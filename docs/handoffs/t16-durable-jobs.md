# T16 durable analysis jobs

## Scope and sources

Implement C16 in `carin-api/`: PostgreSQL-backed claim and lease handling,
heartbeat and fencing, bounded retries/deadlines/cancellation, atomic result
publication, owner-scoped job read/retry endpoints, and the AI consent withdrawal
hook. Preserve the shared OpenAPI contract and use the existing `analysis_job`,
`analysis_result`, `scan`, `consumption_evaluation`, and `idempotency_record`
tables.

Requirements come from `specs/00-mvp-scope-and-decisions.md`,
`specs/02-domain-model-and-business-rules.md`,
`specs/03-system-architecture.md`, `specs/05-verification-and-deployment.md`,
the `NEW-JOB-01` and `NEW-CONSENT-01` decisions, and the app API job/consent
operations. P0 limits are a 90-second AI call, five-minute job deadline, at most
three attempts, 120-second renewable lease, and no more than two active jobs per
user. Transient retry delays are 2 and 10 seconds, bounded by the fixed deadline.

## Design

PostgreSQL rows are the queue. Each claim is a short transaction that locks the
owner row before job rows, enforces the per-user active limit, and claims a due
queued row or an expired processing lease using `FOR UPDATE SKIP LOCKED`. Claim
increments the attempt, issues a fresh UUID fencing token, and sets the lease to
the earlier of 120 seconds or the immutable deadline. Heartbeats require the
same still-live token and never move the job deadline.

Worker provider calls happen outside transactions. The worker loads the frozen
job snapshot, invokes the existing schema-validated `AiClient` with its 90-second
timeout, then opens a publication transaction. Lock order is user, job, then
target (scan or consumption). Under those locks publication rechecks current
consent, account status, processing state, token/lease/deadline, generation,
revision, deletion state, and current target pointer. Result insertion, target
pointer/revision/evaluation update, and terminal job update commit together.
Consent revoke already locks the same user before cancelling active jobs; this
serializes withdrawal with publication, and a cancelled job cannot be revived by
grant.

Retries create a new queued job from the original immutable snapshot, with a new
job and operation ID. The retry transaction is owner-scoped, requires a failed
retryable job plus still-current target and consent, and reserves its
session-scoped idempotency key. Job reads return only the caller's row and its
validated stored result. Both endpoints use the existing Hono session and error
envelope patterns.

## Implementation sequence

1. Add focused worker/domain unit tests for retry delays, deadline clamping,
   retryability, provider timeout, and cancellation behavior; verify they fail
   before implementation.
2. Add PostgreSQL integration coverage for concurrent claims, per-user claim
   limit, lease reclaim with a new token, stale heartbeat/publication rejection,
   target edits/deletion, consent withdrawal/regrant, and atomic publication
   across crashes before and after commit. Verify each new case fails first.
3. Implement repository transactions and worker processing in `carin-api/src/jobs/`
   with no in-memory queue; make the repository integration cases pass.
4. Add owner-scoped GET and idempotent terminal retry routes using the generated
   app contract; cover ownership, stale target, no-consent, retry idempotency,
   and new-job-from-snapshot behavior.
5. Exercise consent revoke/publication races, run API checks from
   `carin-api/`, and record actual results and limits below.

## Initial repository findings

- Worktree started clean on `feat/t16-durable-jobs`, based at `d432389` (`dev`).
- The job/result/target tables and queue/lease indexes already exist in the
  baseline schema; a new migration should only be added if tests or code expose
  a missing invariant.
- `lockAndCheckCurrentAiConsent` and `setAiConsent` already lock `user` first;
  revocation cancels queued/processing jobs in that transaction and marks
  pending evaluations `not_requested`.
- `AiClient` already validates wire schemas and uses a 90-second timeout for
  analysis/recalculation requests.
- The generated app contract already defines job GET and retry; no OpenAPI or
  mobile generated-file change is planned.

## Results

Implemented the PostgreSQL queue repository in `carin-api/src/jobs/repository.ts`.
Claims are serialized per account and use `FOR UPDATE SKIP LOCKED`; each claim
increments attempts and replaces the lease token. Heartbeat, failure, cancellation,
and publication all fence by token and use the account-first lock order. Publication
validates the AI result and atomically inserts the result, advances the scan or
evaluation, and completes the job. Fixed deadlines clamp every lease and retry.

Added `carin-api/src/jobs/worker.ts` and the `carin-api/src/worker.ts` entrypoint.
Workers poll PostgreSQL directly (default concurrency two, configurable with
`WORKER_CONCURRENCY`), invoke the existing AI client with its 90-second timeout,
heartbeat active claims, and publish only while their fence remains current. There
is no process-local work queue. Added owner-scoped GET and idempotent terminal retry
routes in `carin-api/src/jobs/routes.ts`, registered only when DB and authenticated
session dependencies are injected. Retries copy the frozen input/target snapshot to
a fresh job and operation ID, with a fresh deadline. Consent withdrawal now stamps
`finishedAt` while cancelling active jobs; a grant does not reopen canceled rows.

The base schema did not include the contract's `startedAt` and `finishedAt` job
timestamps, so added a backfilled migration and schema fields. **Migration conflict
for integration:** this branch has `carin-api/drizzle/0004_analysis_job_lifecycle_timestamps.sql`
and matching `0004_snapshot.json`/journal entry. C14 independently generated its
own `0004_*` migration in a different worktree. Keep the schema change, then
renumber/reconcile the migration and journal/snapshot after those branches are
combined; integration tests here apply this branch's migration sequence alone.

Verification from `carin-api/` in the T16 worktree:

- `pnpm run test` — passed: 82 unit tests and 116 integration tests across 8 and 7 files.
- `pnpm run typecheck` — passed.
- `pnpm run lint` — passed with zero warnings.
- `pnpm run build` — passed.
- `git diff --check` — passed.

Integration coverage includes concurrent claims and the two-live-lease cap, lease
expiry/reclaim and stale attempt rejection, deadline-clamped heartbeat, retry
backoff/attempt/deadline limits, target edit and photo detachment, consent withdrawal
and re-grant, an explicitly ordered withdrawal/publication race, atomic rollback
before commit and duplicate publication after commit, idempotent retry, owner-only
reads, active-job throttling, and a worker call through the shared fixture AI client.

Limits for integration review: this base has no authenticated server session
resolver or job-producing media/domain route, so app registration remains dependency
injected and the default API entrypoint does not expose these routes until auth is
wired. The worker expects `input_snapshot` to already contain the versioned AI
request contract (including a usable private image URL for photo analysis); there is
no media-signing service in this task branch. Verification exercised only the
existing dev fixture AI path, not real AI or deployment/Compose wiring.
