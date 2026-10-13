# C24 Examination API Design

## Goal and scope

Implement the authenticated Carin API examination resource and comparable-series read model described by `AC-EXAM-01` through `AC-EXAM-05`. Support pressure, glucose, and cholesterol records, ownership, optimistic revisions, idempotent writes, cursor pagination, and series latest selection. Do not interpret measurements, apply clinical thresholds, or merge unlike measurements.

## Contract and behavior

- Wire shapes and statuses remain as defined in `specs/contracts/app-api.openapi.yaml`: list/create `/api/v1/examinations`, item get/replace/delete `/api/v1/examinations/{id}`, and series `/api/v1/examination-series`.
- Parse and validate every request/response with the generated OpenAPI operations. Reject non-finite/non-positive values, non-integer pressure values, invalid IANA timezones, invalid date/time forms, and future local measurement instants. Date-only records remain date-only; never synthesize a time.
- Series identity is the existing domain key: type + context/subtype + unit. Pressure systolic and diastolic share one record/series. Follow the architecture list order exactly: measuredOn DESC, measuredTime DESC NULLS LAST, createdAt DESC, id DESC. Thus actual times sort ahead of date-only records on the same date; date-only records tie by createdAt/id without inventing midnight. Date-only same-day ties are deterministic.
- Lists sort measuredOn DESC, measuredTime DESC NULLS LAST, createdAt DESC, id DESC. Cursors are opaque, HMAC-protected, and bind owner, filter tuple, limit, and last sort tuple; derive the cursor signing key from the existing `BETTER_AUTH_SECRET` with a purpose-specific context. A cursor cannot be replayed under another user/filter/limit.
- Item reads and mutations always scope by authenticated `session.userId`; foreign and deleted IDs are indistinguishable 404s. Updates replace the full record and compare `expectedRevision`; delete soft-deletes atomically so only that record leaves current lists/series.
- Create, update, and delete require a valid active session and UUID idempotency key. Reserve key, mutate resource, and save status/body/resource ID in one database transaction. Scope key by user/session/action/idempotency key, retain 24 hours, replay exact successful response, reject key reuse with a different canonical request hash as `IDEMPOTENCY_CONFLICT`.

## Persistence

Use the existing `examination` table and `idempotency_record`; do not add a separate latest cache. Keep revision increment and edit/delete atomic. Add an additive migration converting numeric measurement columns to unconstrained PostgreSQL `numeric`, matching the profile fix: the API accepts every positive finite JSON number, which can require more than six fractional digits. Update the Drizzle schema, migration journal, and snapshot only through Drizzle generation. Pressure remains an integer at the API boundary and stored in numeric columns without int4 ceiling mismatch. Existing rows and invariants must survive migration.

## Boundaries and error behavior

Preserve stable error envelope and use `INVALID_INPUT` for malformed inputs, `UNAUTHENTICATED` for inactive sessions, `RESOURCE_NOT_FOUND` for unknown/foreign/deleted resources, `REVISION_CONFLICT` for stale writes, and `IDEMPOTENCY_CONFLICT` for changed payload reuse. Database failure rolls back both mutation and idempotency reservation. Do not emit measurement values or notes to logs.

## Verification

PostgreSQL integration tests cover create/list/get, two distinct persisted records, backdated insertion, deterministic date-only tie order, same-day timed order, series context/subtype separation and latest ID, idempotency replay/conflict, concurrent revision updates, edit/delete series recomputation, user isolation, future local instant validation including timezone boundaries, and full numeric precision. Unit tests cover canonical request/hash, cursor tamper/binding, timezone/date validation, and sort/series helpers. Run API typecheck, lint, unit/integration suites, build, Drizzle generation stability, and contract validation where dependencies are available.
