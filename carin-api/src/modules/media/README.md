# Private media module

This module accepts one JPEG or PNG upload (raw maximum 10 MiB), decodes and
re-encodes it without metadata, and keeps the longest edge at or below 1600 px.
Photo rows contain a random object key, normalized checksum, MIME, byte size,
and lifecycle. The raw upload is not written to storage.

`createApp` mounts the media routes when `AppDependencies.media` is supplied.
That dependency must include the existing `SessionResolver`, a repository, a
private object store, deployment environment, signing secret, public API
origin, MinIO endpoint, and bucket. Upload and owner-view routes use the shared
`requireSession` middleware; this module does not create an authentication
implementation. The executable server should supply these dependencies when
the session resolver is available.

The owner-view route returns a five-minute opaque AES-256-GCM API URL grant.
Each stream decrypts and validates the grant, then re-reads the photo and active
account owner from PostgreSQL before fetching the object. The worker helper
`createAiPhotoUrl` performs the same live owner check and validates that the
ten-minute MinIO URL remains on the configured internal endpoint and expected
bucket/key.

Upload idempotency reservations have a five-minute lease stored in the existing
`idempotency_record.response_body` JSONB field. A live lease serializes duplicate
requests. Expired leases rotate to a distinct photo row and random object key;
the reservation token fences late completion and compensation from an earlier
attempt. A separate durable upload-operation row fences the MinIO PUT itself.
The worker treats an in-flight upload as live until its storage deadline plus a
drain grace period has elapsed, so account deletion cannot purge the user and
queue before a late PUT has settled. Upload completion locks user, photo, and
idempotency rows in that order, and rechecks active-account and uploaded-photo
state after MinIO returns. If completion throws, the repository rereads the
persisted result with the same lock order: it returns a committed 201 response,
atomically fences and queues a confirmed pending attempt, or reports an unknown
state. Unknown state preserves the object and returns 503; the service never
compensates by deleting a possibly committed object.

## Durable cleanup worker

The worker entry point runs `runPhotoCleanupWorker(db, store)` alongside the
analysis worker. It repeatedly calls `runPhotoCleanupBatch`, which selects
uploaded photos at least one hour old, atomically changes them to `deleting`,
and writes object keys to the durable `deletion_task` table. It claims due photo
tasks using database leases, removes their objects, marks photos `deleted`, and
removes successful tasks. Failed removals retain their task with persisted retry
time and attempt count; a process restart resumes from the database queue. Calls
are safe across multiple worker processes.

The same batch processes account-deletion tasks. It recomputes object keys from
the tombstoned user's photos and pending photo tasks, waits for live upload
operations to drain, retries object removal durably, and hard-deletes the user
only after the final transaction confirms every key is gone and no upload can
still complete. Account acceptance immediately scrubs name, email, image, birth
date, timezone, and legal-version fields, revokes sessions and auth accounts,
fences scans/jobs, and records a keyed request digest for idempotent replay.

The default batch size is 100; callers may provide `{ now, batchSize }` for
deterministic tests and bounded batches. The result reports `scheduled`,
`removed`, `failed`, `accountsPurged`, and `deferred` counts. Do not replace the
database queue with an in-memory timer or delete uploaded object keys directly
in request handlers.

Coordinate account deletion with this lock contract: first lock the user row,
mark the account `deleting`, then transition its photos and cleanup tasks. Keep
the user row until in-flight uploads have observed the deletion state and their
late object keys have been drained. Hard deletion/cascading the user before
that point can remove the foreign-key parent needed to enqueue cleanup for a
PUT that returns late.
