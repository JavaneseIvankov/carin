# C29 Durable Scan and Account Deletion Design

Status: draft for review before implementation.

## Goal and scope

Implement scan deletion and account deletion in `carin-api` using the existing
PostgreSQL ownership, generation, lease, and private-media model. The account
deletion request must stop access as soon as its database transaction commits;
database and MinIO cleanup may continue asynchronously and must survive worker
restarts and provider failures.

The wire contract is already defined in `specs/contracts/app-api.openapi.yaml`:
`DELETE /api/v1/scans/{id}` returns 204, and
`POST /api/v1/account-deletion` reauthenticates and returns 202 with
`accessRevoked: true`. C29 does not change either payload. The mobile client
clears credentials and local user data after the account-deletion acknowledgement.

## Shared invariants

- Lock and validate the active user row before changing owned resources. Keep a
  consistent lock order across deletion, media upload completion, and job
  publication: user, target scan or consumption, photo, idempotency row, then
  deletion task. Cleanup completion follows the same order; a claim transaction
  may lock a task by itself but releases it before MinIO I/O. A transaction
  that sees `deletion_status != active` cannot create user data, complete an
  upload, or publish a job result.
- A scan or account becomes unavailable in the same transaction that fences its
  work and records cleanup. Return success only after that transaction commits.
- Job workers may finish an external AI call after cancellation. Publication
  must still require the current job status, lease token, target generation,
  active owner, and active target. Cancellation clears the lease and advances
  the target generation so an old response cannot publish.
- Private media grants recheck both the active account and live photo row when
  streaming. Account or scan deletion therefore invalidates already issued
  grants; a grant is not sufficient authorization by itself.
- The auth boundary checks `deletion_status=active` both when resolving a
  session and when Better Auth creates a new session. Revoking current sessions
  alone is insufficient because password login could otherwise mint another
  session for the tombstone.
- Cleanup task claims use persisted leases and attempt-specific tokens. Storage
  deletion is idempotent. A stale cleanup attempt cannot complete a task claimed
  by a newer attempt.

## Scan deletion

The route authenticates an active session and reserves the existing
session-scoped idempotency key. Unknown, foreign-owned, and already removed scan
IDs have the same 404 behavior. For an owned active scan, one transaction locks
the user and scan, fences the scan generation, cancels queued or processing
analysis jobs, and marks the scan unavailable to reads and writes.

The transaction also marks the scan's root photo `deleting` and inserts a
`kind=photo` deletion task containing its randomized object key. It removes the
scan's analysis results and scan row after preserving any confirmed
photo-consumption record. For each linked `photo_confirmation` consumption, it
sets `scanId` and `sourceAnalysisResultId` to null and sets `photoAvailable` to
false. It leaves `source`, the current nutrition snapshot, and the provenance
inside that snapshot unchanged. Manual consumptions are unaffected. The existing
photo cleanup runner later removes the MinIO object and completes the photo
task; until then, the private photo row remains non-readable.

A retry with the same idempotency key replays the 204 result. A request with a
new key for a scan already removed receives 404. Deleting a scan does not
delete a confirmed consumption or its dashboard contribution.

## Account deletion

The endpoint validates the exact confirmation value and rechecks the current
password through Better Auth's password verifier. The password is never logged,
or persisted in plaintext or in the outbox. To preserve the contract's
same-key/different-payload check without storing a reusable password digest,
compute the idempotency request hash as an HMAC of the canonical request body
under a server secret. Only after successful reauthentication does the endpoint
start the database transaction.

The transaction locks the user row and verifies the account and current session
are still active. It then marks the account `deleting`, advances generations
for all scans and consumptions, cancels queued and processing analysis jobs,
marks every photo `deleting`, collects their object keys plus keys from pending
photo cleanup tasks, and inserts one durable `kind=account` cleanup task. It
revokes all sessions in that same transaction. The account status check also
blocks requests that resolved a session immediately before revocation but reach
their resource transaction after the deletion commit. No new auth session,
write, upload completion, AI publication, or media grant can pass the active
account check after commit.

The 202 response is sent only after this transaction commits. The account row
remains in `deleting` as the minimal database tombstone required by the current
cleanup-task foreign key. Once all object cleanup succeeds and no fenced upload
can still create an object, a final transaction verifies the account task's
lease token and hard-deletes the user row. Existing foreign-key cascades then
remove the remaining authentication, profile, scan, result, consumption,
examination, consent, and task payload. Vendor delete-user hooks remain disabled;
the application service owns this lifecycle.

A repeated account-deletion call using a revoked session returns 401 as specified
by the contract. The mobile client must not treat that response as a second
account or restore local data.

## Durable cleanup and recovery

Extend the worker loop that calls `runPhotoCleanupBatch` to claim due
`kind=account` tasks as well as photo tasks. Account cleanup removes every
distinct object key captured when deletion was accepted and reconciles any
photo task or fenced upload cleanup added while the account tombstone remains.
It uses the existing durable retry metadata and lease-token pattern. A failed
MinIO operation persists the next retry time and leaves the account inaccessible
in `deleting`; a crash after object removal but before database completion safely
repeats the idempotent removal. Only a current task lease may finalize deletion.

After MinIO confirms all keys removed, the worker opens a final transaction,
locks the user and current account task, checks the lease and that no further
photo cleanup remains, then deletes the user row. This keeps PostgreSQL payload
available only to the cleanup worker while preventing it from appearing in API
reads. Scan photo cleanup retains the current per-photo task behavior and retry
policy. The P0 cleanup target remains at most 24 hours; the 202 response does
not claim that object removal has already happened. Backup retention remains
outside the MVP deletion claim, as stated in the domain spec.

## Verification required for implementation

- Delete a scan during an AI request; its late response cannot create a result,
  and linked photo-consumption snapshots remain readable with null source IDs
  and `photoAvailable=false`.
- Delete a scan with no consumption and with one or more linked consumptions;
  ownership, idempotency replay, 404 equivalence, and unrelated rows are intact.
- Accept account deletion while an AI job is queued and while it is processing;
  all sessions and media grants stop working after commit, and neither late AI
  results nor new writes can recreate user data.
- Inject MinIO failure, partial success, worker restart, expired cleanup lease,
  and delayed upload completion. Cleanup retries after a fresh runner and the
  user payload remains inaccessible until final purge.
- Verify that successful account cleanup removes PostgreSQL user-owned rows and
  all private object keys, including keys already present in photo cleanup
  tasks. Verify that a different account cannot access any original resource or
  grant during pending deletion.

## Open design questions for review

1. **Tombstone identity fields:** The current `user` columns require name,
   email, birth date, and accepted legal versions, so `deletion_status=deleting`
   alone does not make the row minimal. Should C29 scrub or null these fields in
   the acceptance transaction (requiring a schema migration), or may they remain
   until the account cleanup completes? The recommended privacy behavior is to
   remove or replace these values immediately while retaining only the user ID,
   deletion status, and cleanup metadata.
2. **Late MinIO upload bound:** The current photo upload reservation lease is
   five minutes and fences database completion, but that lease alone does not
   prove an already-running MinIO `putObject` cannot finish after the account
   task's last removal attempt. Should C29 enforce a storage-operation deadline
   shorter than the lease, or add a durable in-flight upload marker that account
   cleanup drains before final deletion? Final account-task removal must wait
   until this race is closed.
