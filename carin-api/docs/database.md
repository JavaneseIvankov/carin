# Database baseline

Run all commands from `carin-api/` with the pinned Node/pnpm versions in the
module guide. SQL migrations are the deployment source of truth; never use
`drizzle-kit push` against a shared environment.

```sh
pnpm install --frozen-lockfile
pnpm run auth:generate
pnpm run db:generate
pnpm run build
DATABASE_URL='<environment-specific PostgreSQL URL>' pnpm run db:migrate
```

`DATABASE_URL` is mandatory for the migration runner. Deployment runs migrations
as a one-shot step before API/worker traffic, rather than on server startup.
The runner uses a PostgreSQL advisory lock to serialize concurrent deploys and
the Drizzle migrator to apply pending SQL atomically. Repeating a deployment
leaves already-applied migrations and data intact. Never alter an applied SQL
file; append a migration. The readiness probe compares the full ordered applied
migration hashes and timestamps with the bundled migration files and fails
closed for missing, old, changed, or additional records. Both database and schema
queries retain the three-second deadline, including pool checkout.

Ship `drizzle/` (SQL plus `meta/_journal.json`) next to `dist/` in the runtime
image. The build does not copy SQL files. This directory is needed by both the
migration runner and readiness. Migration-log integrity is trusted; readiness
is not a full ongoing audit for administrator changes to individual tables.

## Auth schema ownership

`src/auth/options.ts` is the canonical schema-affecting Better Auth configuration
for generation and the later runtime factory. `src/auth/generation.ts` is only
for CLI loading: it must never be mounted as the application's auth service.
`src/db/schema/auth.ts` is the byte-reproducible output of the pinned `auth@1.7.7`
CLI, matching `better-auth@1.7.7` and `@better-auth/expo@1.7.7`. Regenerate it
rather than editing password/session/account/verification tables by hand.

The generator uses explicit Drizzle/PostgreSQL flags and needs no live database.
The generated UUID schema, additional account fields, and database rate-limit
storage are incorporated in `0000_baseline.sql`. `0001_invariants.sql` adds
application constraints and triggers after generation; these are reviewed SQL
and must remain in deployment. The generated `0002_settings_revision.sql` adds the server-owned integer account
settings revision with default one, and `0003_settings_revision_invariant.sql`
requires it to remain positive. Existing SQL files were preserved.
Custom deferrability and triggers cannot be
reconstructed by `db:generate` alone.

DOB/legal/deletion fields, timezone, and settingsRevision have `input: false`. The SQL trigger also prevents
changing stored registration metadata. These safeguards do **not** implement
registration admission, age/legal validation, email delivery, or mobile auth.
Before mounting auth, T8 must provide validated environment origins/secret,
admission hooks on the vendor signup route, raw-update bypass protection,
Resend/outbox callbacks, session resolution/deletion denial, and real auth tests.
The vendor update-user hook must explicitly protect timezone/settingsRevision,
so settings changes only occur through the Carin service with expectedRevision.
The seven-day/sliding-day session, verified-email requirement, disabled automatic
login, password limits, reset revocation/expiry, disabled vendor delete-user, and
Expo plugin are configured, but no product auth endpoints are mounted here.

## Application schema invariants

`createDatabase(poolOrClient)` binds the generated auth and domain schema for
Drizzle consumers. User-owned rows carry a non-null UUID `user_id` and auth FK.
Composite foreign keys enforce ownership between application resources. Nullable
purge pointers additionally have scalar `ON DELETE SET NULL` references; the
composite `NO ACTION` ownership check runs after detachment and retains `user_id`.
Idempotency's generated session reference is checked by a locking ownership
trigger without changing the library's generated session schema.

Health-profile versions, account settings revisions, and resource revisions start
at one. Settings writes must atomically compare settingsRevision with the submitted
expectedRevision and increment it together with the timezone update; the database
test proves concurrent writes with the same expected revision have one winner. An immutable
profile context snapshot may use version zero when the optional health profile
does not exist, matching AI `ProfileContext`; missing health data stays null or
`not_provided`. No dummy health measurements or fake normal diagnosis are needed.
Catalog nutrients and serving weights are numeric decimals with six fractional
places; PostgreSQL NaN, negative nutrients, and non-positive measurements are
rejected. Profile knowledge states require corresponding empty/reported lists.
Examinations preserve date-only precision, enforce supported units/contexts, and
keep measurement dates separate from server timestamps.

Profile, result, consumption, job-input, and versioned catalog data are protected
against updates. Consent events are append-only until account purge. Published
nutrition/profile/provenance are in immutable `consumption_snapshot` rows;
initial asynchronous evaluation has a separate `consumption_evaluation` row,
so completion does not rewrite the historical JSON. Result uniqueness is per job.
A partial unique index permits one active default scan confirmation, while
`new_occurrence` and an explicit confirmation after soft deletion remain possible.
The active consumption snapshot FK ties owner, consumption, revision, and snapshot
ID and is deferred until commit, allowing atomic revision/snapshot publication.

Deleting a scan cascades its jobs/results, detaches consumption source pointers,
and clears `photo_available`; consumption snapshots/provenance survive. Deleting
an account cascades user data, while catalogs remain shared reference data.
The later deletion workflow must first deny access/revoke sessions, retain the
user tombstone while durable MinIO cleanup runs, and hard-purge the user only
after cleanup succeeds. Outbox success means delete the task/payload, not keep
email tokens indefinitely.

This schema supplies storage invariants, not application services. Future
repositories must perform expected-revision compare-and-swap, server timestamp
updates, same-root job/result checks, current-result confirmation, lease fencing,
consent/deletion publication guards, time/timezone validation, JSON contract
validation, limited outbox payload construction, and transactionally install the
active snapshot pointer. Nullable pointers permit purge and transaction assembly;
creation handlers must still require the appropriate live source and snapshot.

## Verification

```sh
pnpm run typecheck
pnpm run lint
pnpm run test:unit
pnpm run test:integration
pnpm run build
```

Integration tests require Docker. Every run creates a random-named disposable
PostgreSQL 18.3 Alpine container pinned to its image digest, publishes an ephemeral
loopback port, ignores any existing `DATABASE_URL`, uses no persistent/shared
volume, and removes the container in teardown. They exercise the actual SQL and
Drizzle/PostgreSQL boundary, including empty/migrated HTTP readiness,
concurrent/repeated deploys, cross-user FK and session rejection, optional-profile
snapshots, uniqueness, finite numbers, revision/snapshot commit rejection,
immutable history, scan purge retention, and account purge isolation.

Official references used for the pinned workflow:
[Better Auth CLI](https://better-auth.com/docs/concepts/cli),
[Drizzle adapter](https://better-auth.com/docs/adapters/drizzle),
[UUID database configuration](https://better-auth.com/docs/concepts/database),
[auth options](https://better-auth.com/docs/reference/options), and
[Drizzle migrations](https://orm.drizzle.team/docs/drizzle-kit-migrate).
