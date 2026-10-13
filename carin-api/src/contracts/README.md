# Generated contracts and validation

The two OpenAPI 3.1.1 documents in `specs/contracts/` are the wire source of truth.
`generated/app-api.ts` and `generated/ai-service.ts` are provider/worker types;
`carin-app/lib/api/generated/` contains consumer types and app-only route metadata.
The mobile serializer exposes application operations only. Generated AI types do
not create a mobile AI client or configure an internal AI URL.

Install the pinned Python contract requirements as described in
`specs/05-verification-and-deployment.md`, then install the frozen app and API
package locks. From `carin-app/`:

```sh
pnpm run contracts:generate
pnpm run contracts:check
```

Generation uses Python/PyYAML already pinned by the contract validator and
`openapi-typescript` 7.13.0 plus the existing Prettier configuration. `CONTRACTS_PYTHON`
can select a Python interpreter; otherwise the repository `.venv/bin/python` is
used when available, then `python3`. All reference resolution is local to the two
contract documents; unknown files, missing pointers and network refs fail.
Generated output contains no timestamps or machine paths. Commit all six artifacts;
CI checks their exact contents and tests modified/missing artifact detection.

The generator derives JSON Schema 2020-12 `$defs`, a stable versioned schema ID,
and separate request, response, path, query and declared-header schemas. Ajv 8.20.0
and ajv-formats 2.1.1 validate these schemas, never an entire OpenAPI document.
Unknown JSON fields fail for closed objects; `Error.error.details` remains an open
dictionary exactly as specified. Values are never coerced, defaulted or removed.
UUID, date, date-time, email and URI formats are checked. Validation errors contain
only a known boundary name, without submitted values, arbitrary field names or
vendor headers.

Use `validateSchema(name, decodedValue)`, `validateRequest(operationId, input)` and
`validateResponse(operationId, status, decodedBody, transport)` at provider,
consumer and worker boundaries. IDs are prefixed `app.` or `ai.`. `validateRequest`
returns validated path/query/header values for downstream logic. Supply parsed JSON
as `body`; HTTP JSON parsing and mapping failures to HTTP responses belong to the
route adapter. Supply `URLSearchParams` to parse serialized query parameters;
integers reject empty, decimal, exponent, repeated and noncanonical representations.
Decoded query objects must already contain the declared number/boolean types.
Required path/query/idempotency fields are validated independently of the body.
Only declared resource headers are schema fields; cookie/auth/transport headers
continue to use their own middleware and SDK contracts.

Multipart bodies require `FormData`, with each binary property holding a `Blob`.
Duplicate fields and extra fields fail. Binary responses require `Blob` or
`Uint8Array` plus an explicit matching media type. Multipart boundaries come from
the actual transport, so the app serializer does not set a content-type header for
multipart. JPEG/PNG sniffing, 10 MiB admission, decode, normalization, EXIF removal,
ownership and byte streaming belong to the media task (T17); this harness verifies
wire transport, not image safety or native file URI integration. Response headers
are validated when present; the OpenAPI header definitions currently do not mark
them required. Domain code must enforce required media caching policy.

The **same** result schema validates fixture and real-provider envelopes. Fixture
JSON remains synthetic and unchanged. These tests do not promote it to real mode,
assert provenance quality, evaluate AI, or establish catalog/clinical approval.
Business invariants beyond JSON Schema remain domain/worker responsibilities.

## Coverage gates

From `carin-api/`, `pnpm run test:unit` checks negative payloads, formats, versions,
query serialization, safe errors and binary transport. `pnpm run test:integration`
contains:

- All 38 operations: generated schema probes for each request and declared response.
  Probes assert wire compatibility and are not domain-valid demo/provider fixtures.
- All 34 app operations: the actual mobile serializer's output is decoded and
  accepted by the same provider runtime schema.
- Actual Hono `/health/live` and `/health/ready`: 200 and readiness 503 envelopes,
  content type and request ID correlation. Readiness uses an injected check here;
  this does not prove PostgreSQL/schema readiness against a live database.

Only health HTTP providers exist at this baseline. Future resource and AI routes
must add real endpoint cases to the provider harness when implemented. A successful
schema probe does not establish provider implementation, auth, transactions or
ownership. Running tests does not establish Android/iOS compatibility; native
multipart transport must be verified on the selected demo device during T17.

Raw `/api/auth/*` routes are deliberately absent from these resource models.
**T8 gate:** once T3 supplies the canonical server config and pinned Better Auth
SDK/plugin schema, auth integration must exercise those actual routes through that
SDK/generated upstream schema, including custom signup hooks. T5 does not invent
a resource auth schema, weaken the vendor gate, or claim raw auth provider coverage.

`openapi-typescript` declares a TypeScript `^5.x` peer while the existing scaffold
pins 6.0.3. Generation and both package typechecks pass with 6.0.3 in this task;
no scaffold downgrade was made. Keep this upstream peer mismatch recorded when
changing the generator or TypeScript pin.

References: [openapi-typescript Node API](https://openapi-ts.dev/node),
[Ajv JSON Schema 2020-12](https://ajv.js.org/json-schema.html),
[Ajv formats](https://ajv.js.org/packages/ajv-formats.html).
