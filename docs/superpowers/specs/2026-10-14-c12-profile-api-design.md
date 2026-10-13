# C12 Profile and Settings API Design

## Goal

Implement authenticated health-profile reads and full replacements, plus an
optimistic-concurrency update for the account timezone. Preserve user-reported
health information exactly and keep profile edits independent from immutable
analysis snapshots.

## Contract decisions

- `GET /api/v1/profile` returns a virtual empty profile with `version: 0` and
  `updatedAt: null` when no `health_profile` row exists. A read never creates
  persistence state. This follows the OpenAPI contract while stored rows keep
  their existing database invariant of `version >= 1`.
- `PATCH /api/v1/profile` is a complete replacement of the `fields` object.
  `expectedVersion: 0` inserts the first stored row at version 1; later writes
  compare-and-swap against the current version and increment it exactly once.
  Stale versions return the shared 409 `REVISION_CONFLICT` response.
- `PATCH /api/v1/me` only changes timezone. It compares `expectedRevision` to
  `user.settingsRevision` and increments that revision once when the timezone
  changes. A mismatch returns the same shared revision-conflict error.
- Both PATCH operations require a valid `Idempotency-Key`. Replaying the same
  key and request returns the recorded response; reusing a key with a different
  request returns 409. Idempotency recording and state mutation are atomic.
- Authentication and resource ownership come from the server session. Profile
  IDs, DOB, identity, legal consent, and AI consent are never client-selectable
  through these updates.

## Profile validation and persistence

Validate the generated request schema, then enforce domain invariants before
writing: finite positive measurements; valid enums; bounded clinician notes;
and knowledge-state/list consistency. `reported` requires at least one item;
all other states require an empty list. Keep `unknown`, `not_provided`,
`never_examined`, and `none_known` distinct. Preserve condition IDs, labels,
allergy text, and user-entered unsupported conditions without matching or
discarding them.

Store only the profile fields covered by `health_profile`. Existing height and
weight columns are `numeric(20,6)`, which cannot preserve every finite positive
JSON number allowed by the contract. Use an additive migration to make those
two columns unconstrained PostgreSQL `numeric`, update the Drizzle schema and
schema hash/journal artifacts, and leave historical migrations untouched. This
preserves the numeric value supplied by JSON within PostgreSQL's supported
numeric range, including values outside the current six-decimal/fourteen-digit
limit. If a value exceeds PostgreSQL's numeric range, reject it as invalid
before write rather than allowing a database overflow. A conditional SQL
insert/update must serialize first writes and version increments; if a
concurrent writer wins or the expected version is stale, return a revision
conflict. Never update, rebuild, or copy profile values into existing
`profile_snapshot` rows.

## Personalization capability boundary

Keep capability lookup behind a local provider interface backed by the imported
C14 catalog data when available. Profile routes must not call the AI service at
request time. Only an exact condition ID in an imported manifest with
`personalizationSupported: true` establishes support; search candidates,
labels, and client-supplied IDs alone do not. The manifest's minimum and
maximum supported age bounds further gate support using the account DOB and
the account's current timezone. When DOB is absent or age cannot be calculated,
the condition is unsupported. When current age is outside the inclusive
manifest bounds, mark the condition unsupported and do not include its required
fields in `missingFields`. Preserve all entries regardless of support.
Calculate missing fields only from required fields of exact, age-supported
manifest conditions. Until imported capability data is available, return empty
`missingFields` and mark user-reported condition entries as unsupported. Do not
infer medical support or change OpenAPI for provider availability.

## HTTP shape and module boundaries

Add `src/modules/profile/` with route, service, repository, validation, and
integration tests. Register these routes with the existing optional account
dependencies in `src/app.ts`, then wire dependencies in the actual entrypoint
`src/index.ts`. Reuse the session resolver,
request validation, response validation, error envelope, and idempotency
conventions already present in the API. `GET /api/v1/me` continues to return
identity, DOB, accepted legal versions, timezone/revision, and latest AI
consent; its PATCH response uses that same verified `Me` shape.

## Failure behavior

- Missing or expired session: shared 401 behavior.
- Missing account: shared 404 behavior.
- Invalid timezone, values, or state/list combinations: shared 422 behavior.
- Stale profile/settings version: shared 409 `REVISION_CONFLICT`.
- Reused idempotency key with a different payload: shared 409 conflict.
- Database errors do not return partially mutated profile/settings data.
- No capability provider or empty imported manifest never fails a profile read.

## Verification

Add integration coverage for virtual empty profile; full-field round trip;
knowledge-state and list boundaries; unsupported/free-text retention; owner
isolation; optimistic version conflicts and concurrent first writes; idempotency
replay/conflict; valid/invalid timezone and settings revision conflict; unchanged
historical snapshots; and generated request/response validation. Capability
dependency-specific tests remain with C14, as the task notes require.
