# T17 Private Media Design

## Goal

Add private photo upload, owner-issued read grants, and internal AI photo URLs to
`carin-api`. Uploads accept only decoded JPEG/PNG images up to 10 MiB, remove
EXIF metadata, and normalize the longest dimension to at most 1600 px. Every
read verifies the live photo row and active account owner before touching
MinIO.

## Boundaries

- `registerMediaRoutes` receives the existing `SessionResolver`; upload and
  owner-grant routes use `requireSession`. The bearer-grant stream is
  cookie-free by contract.
- The existing `photo` table stores randomized object keys, SHA-256, normalized
  MIME/size, lifecycle, and creation time. The existing `deletion_task` table
  stores cleanup retries. No migration is needed for this scope.
- Image validation and normalization are isolated from Hono, PostgreSQL, and
  MinIO. Object storage is an injected interface with a MinIO adapter.
- Opaque media grants use AES-256-GCM authenticated encryption and bind photo
  ID, owner ID, environment, and a five-minute expiry. The stream handler returns
  the same 404 for invalid, expired, deleted, or cross-account grants.
- Internal AI URLs are generated only from an owner-checked photo row and a
  configured private MinIO endpoint. The generated URL is checked against the
  exact configured origin before it leaves the API and lasts ten minutes.
- Orphan cleanup selects only `uploaded` photos at least one hour old, moves the
  photo row to `deleting`, and inserts its randomized object key into the
  durable `deletion_task` queue in one database transaction. A batch runner
  claims due rows with a lease, retries failures with persisted backoff, marks
  removed photos `deleted`, and removes successful task payloads. C29 can call
  this runner from its durable worker loop.

## Upload and failure flow

The route caps the multipart body while reading it, then checks that it contains
exactly one file and no extra fields. The raw file size and declared MIME must
match the decoded image format. Sharp decodes with pixel limits, applies EXIF
orientation, resizes without enlargement, and encodes a fresh JPEG or PNG so
metadata is not carried forward. The normalized bytes are hashed.

The service reserves each idempotency key under a five-minute database lease
stored in the existing idempotency response JSON. An overlapping request with
the same key and body receives a retryable conflict; it cannot share the first
request's photo row, object key, or failure compensation. Once a lease expires,
a retry receives a new photo row, random object key, and fencing token, so a
late request from the old lease cannot complete or delete the new attempt.

After reservation, the service inserts private photo metadata and uploads the
normalized bytes to MinIO. Completion locks rows in user, photo, then
idempotency order, and rechecks that the account is active, the photo is still
uploaded, and the reservation token still owns the lease. A deletion or cleanup
that wins this ordering prevents a late upload from becoming visible; the late
object key is persisted in the durable deletion queue. MinIO failures attempt
immediate deletion and persist a cleanup task if needed. If cleanup scheduling
also fails, the staged `uploaded` row remains discoverable by the one-hour
orphan sweep. Storage errors return a safe retryable 503.

## HTTP and worker behavior

- `POST /api/v1/photos`: authenticated multipart upload; returns the contract
  `Photo` shape.
- `GET /api/v1/photos/{id}/view`: authenticated ownership check; returns a
  public API URL carrying a five-minute bearer grant.
- `GET /media/photos/{photoId}?token=...`: no cookie required; validates the
  grant, environment, expiry, active account, photo lifecycle, and owner before
  streaming. Sends `Cache-Control: private, no-store` and the normalized MIME.
- `createAiPhotoUrl(userId, photoId)`: worker-facing helper; repeats the
  ownership/account check, requests a ten-minute MinIO presigned read, and
  rejects any URL whose scheme, host, port, credentials, or origin differ from
  the configured internal endpoint.

Request logs continue to contain only request ID, method, status, and duration.
No service logs grants, MinIO signatures, or request query strings.

## Verification

Unit tests cover MIME spoofing, corrupt decode, raw-size limits, EXIF removal,
orientation/resize, grant opacity, tampering and expiry, internal URL host/redirect
rejection, database-write failure before storage, and MinIO failure cleanup.
Disposable-PostgreSQL integration tests cover two-account isolation, active
account rechecks, owner-issued grants, download behavior, and durable orphan
cleanup scheduling/retry after a fresh runner instance, concurrent same-key
reservation fencing, expired-lease takeover, and delayed MinIO completion racing
account deletion and cleanup. Object storage is injected in database integration
tests; the adapter separately exercises the MinIO SDK boundary and presigned URL
validation.

The cleanup contract handed to C29 is `runPhotoCleanupBatch(db, store, now)`.
The caller must invoke it at worker startup and on a recurring schedule; its
queue, lease, attempt count, and retry time live in PostgreSQL, never process
memory. Account deletion must acquire the user row lock before changing photo or
idempotency state, retain the account in `deleting` until in-flight uploads are
fenced and their cleanup drains, and only then hard-delete/cascade its rows.
