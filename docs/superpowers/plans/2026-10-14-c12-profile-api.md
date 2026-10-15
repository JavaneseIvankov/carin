# C12 Profile and Settings API Implementation Plan

**Goal:** Add contract-valid authenticated profile and timezone endpoints with
atomic optimistic concurrency, scoped idempotency, validated health knowledge
states, and immutable historical snapshots.

**Design:** `docs/superpowers/specs/2026-10-14-c12-profile-api-design.md`.
Use focused route/service/repository modules. Keep persistence and idempotency in
one database transaction; use generated OpenAPI validation at the HTTP boundary.
Do not call the AI service from profile requests. Initially use a local empty
capability provider seam, to be backed by C14's imported manifest.

## Tasks

1. **Add red profile API integration tests.** Extend/create a disposable-Postgres
   test fixture to wire profile and account dependencies. Cover empty virtual v0,
   authentication, all-field round trip, list/state validation, owner isolation,
   first-write race/stale-version conflict, idempotency replay and key reuse,
   and unchanged historical snapshots.
2. **Implement profile repository and service.** Map `health_profile` columns
   to/from the complete contract object. Add a migration changing height/weight
   from `numeric(20,6)` to unconstrained `numeric`, update Drizzle snapshot and
   migration metadata, and leave old migrations untouched. Use a serialized
   account lock and compare-and-swap insert/update. Calculate personalization
   from a capability provider seam; retain unsupported entries and never
   mutate snapshots. Apply capability age bounds using account DOB and timezone.
3. **Implement profile routes.** Register authenticated GET/PATCH routes,
   validate generated request and response schemas, read the idempotency header,
   and map domain errors to shared error envelopes.
4. **Add red timezone PATCH tests, then implement it.** Validate IANA timezones,
   atomically check `settingsRevision`, increment only on an actual change,
   serialize with account settings writes, support session-scoped idempotency,
   and return the complete existing `/me` representation.
5. **Integrate route dependencies.** Wire profile/account routes in `src/app.ts`
   and dependency construction in `src/index.ts` without changing existing
   session resolution or GET `/me`.
6. **Verify and hand off.** Run targeted profile tests, complete backend unit
   and integration suites, typecheck, lint, build, generated-contract validation,
   and `git diff --check`. Review changed files, write a concise handoff, commit
   the feature branch, and set T12 to `review` (never `done`).

## Acceptance checks

- Empty GET does not persist a row and returns the exact contract empty shape.
- First PATCH at expected v0 persists v1; concurrent first writes yield exactly
  one success and one conflict.
- Full object replacement preserves free text and unsupported conditions.
- `reported` is equivalent to a nonempty list for diagnoses, family history, and
  allergies; all other knowledge states require an empty list.
- Same-session same-key/same-payload retries replay status/body; same key with a
  different payload conflicts; keys are retained for the contract's 24 hours.
- Timezone updates use the caller's expected settings revision and validate IANA
  zone identifiers. Same timezone does not spuriously increment the revision.
- Existing profile snapshots and their JSON context remain byte-for-byte
  unchanged after profile edits.
- All responses pass generated OpenAPI validation; no DOB or consent field is
  accepted in profile/timezone request bodies.

## Risks and deferred verification

- C14 capability persistence does not exist yet; C12 only defines the provider
  seam and conservative empty behavior. Capability dependency-specific tests
  remain with C14 per task notes.
- Native/mobile E2E is outside this backend task.
