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
attempt. Upload completion locks user, photo, and idempotency rows in that order,
and rechecks active-account and uploaded-photo state after MinIO returns.

## Cleanup worker boundary

The C29 worker should call `runPhotoCleanupBatch(db, store)` once during worker
startup and repeatedly on its durable worker schedule. The helper selects
uploaded photos at least one hour old, atomically changes them to `deleting`,
and writes object keys to the existing durable `deletion_task` table. It then
claims due deletion tasks using database leases, removes their objects, marks
photos `deleted`, and removes successful tasks. Failed removals retain their
task with persisted retry time and attempt count; a process restart resumes
from the database queue. Calls are safe across multiple worker processes.

The default batch size is 100; callers may provide `{ now, batchSize }` for
deterministic tests and bounded batches. The result reports `scheduled`,
`removed`, and `failed` counts. Do not replace this with an in-memory timer or
delete uploaded object keys directly in C29.

Coordinate account deletion with this lock contract: first lock the user row,
mark the account `deleting`, then transition its photos and cleanup tasks. Keep
the user row until in-flight uploads have observed the deletion state and their
late object keys have been drained. Hard deletion/cascading the user before
that point can remove the foreign-key parent needed to enqueue cleanup for a
PUT that returns late.
