# T5 / C05 contract generation and harness

Task / scope: Generate app/internal-AI wire types from the two OpenAPI contracts,
provide schema-derived runtime validation and consumer/provider harnesses, and
make generated drift fail CI. Base: `788699e`; branch: `chore/t5-contract-codegen`.
No contract or fixture payload changed.

Changes and affected files:

- `scripts/contract_bundle.py`, `scripts/generate-contracts.mjs` and their tests:
  resolve all local references without network, derive JSON Schema 2020-12 definitions,
  bundle reachable schemas into type inputs, and write/check six deterministic artifacts.
- `carin-api/src/contracts/`: generated app/AI types, versioned schema bundle,
  Ajv validation and transport handling, negative unit tests and module README.
- `carin-app/lib/api/`: generated app/AI types and app-only operation metadata,
  typed resource request serializer and unit tests. No mobile AI client was added.
- `carin-api/tests/contracts/` and contract integration tests: 38 operation wire
  schema probes, 34 serialized app requests, and actual health provider checks.
- Both package manifests/locks: exact runtime `ajv` 8.20.0 / `ajv-formats` 2.1.1
  and generator `openapi-typescript` 7.13.0; app generation/check scripts. These
  shared-file changes were coordinated with the parent during parallel T3 work.
- `.github/workflows/checks.yml`: contract job installs the frozen generator package,
  checks generated drift, and runs generator reproducibility/drift and resolver tests.

Verification: Linux, Node 24.18.0, pnpm 10.33.0; no physical device/emulator.
Commands ran from the isolated worktree unless a package directory is stated.
The existing root interpreter was selected through `CONTRACTS_PYTHON` because this
worktree has no `.venv`; clean CI uses the Python 3.14 environment in the workflow.

| Working directory | Command                                                                                          | Result                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `carin-api/`      | `pnpm install --frozen-lockfile`                                                                 | Pass                                                                                                         |
| `carin-api/`      | `pnpm run typecheck`, `pnpm run lint`, `pnpm run build`                                          | Pass                                                                                                         |
| `carin-api/`      | `pnpm run test:unit`                                                                             | 27 tests pass, including 10 new contract units                                                               |
| `carin-api/`      | `pnpm run test:integration`                                                                      | 84 tests pass, including 38 schema, 34 consumer and 3 health provider cases                                  |
| `carin-app/`      | `pnpm install --frozen-lockfile`                                                                 | Pass; existing unrs-resolver build script remains ignored                                                    |
| `carin-app/`      | `pnpm run typecheck`, `pnpm run lint`, `pnpm run test:unit`                                      | Pass; 3 serializer units                                                                                     |
| `carin-app/`      | `pnpm run test:integration`                                                                      | Pass with no app-local integration files; cross-package consumer harness runs in API integration             |
| `carin-app/`      | `pnpm run contracts:generate`, `pnpm run contracts:check`                                        | Fresh generation matches all checked-in artifacts                                                            |
| Root              | `node --test scripts/tests/generate-contracts.test.mjs`                                          | Pass; reproducibility and modified/missing artifact drift detection                                          |
| Root              | `python -B -m unittest discover -s scripts/tests`                                                | 4 resolver/bundle tests pass                                                                                 |
| Root              | `python specs/validate-contracts.py`                                                             | Pass: 2 documents, 38 operations, 408 local refs, 5 fixtures, math/coverage/provenance and 3 negative probes |
| Root              | Import compiled `carin-api/dist/contracts/validation.js` using Node ESM; validate health payload | Pass; all 38 operation schemas compile in built runtime                                                      |
| Root              | `git diff --check`                                                                               | Pass                                                                                                         |

Tests were added before validator/serializer implementation and observed failing;
query and format/type/version rejection, header error redaction and no-content body
rejection were also exercised. Prettier ran on changed TypeScript, JavaScript,
workflow and documentation files; generated TypeScript is formatted by the generator.

Unverified work / blockers:

- Only health HTTP providers exist at this base. The other operations are schema
  probes and serialization checks, not claims of endpoint, database transaction,
  authorization, ownership, real AI, real fixtures adapter or worker implementation.
  Health tests inject readiness and do not exercise a live PostgreSQL connection.
- Raw `/api/auth/*` remains a **T8 gate**: use canonical T3 config with the pinned
  Better Auth SDK/plugin generated upstream schema to exercise vendor routes and
  custom signup hooks. Resource OpenAPI is not a substitute; no handmade auth schema
  or raw-auth passing claim is included.
- T17 must implement/verify JPEG/PNG admission, 10 MiB limits, decode/normalization,
  EXIF removal, byte streaming and native file transport. T5 checks multipart/binary
  wire boundaries only. Android/iOS compatibility and native Blob/FormData behavior
  are unverified on devices.
- `openapi-typescript` 7.13.0 advertises TypeScript `^5.x`, whereas the scaffold pins
  6.0.3. Actual generation and both typechecks pass with 6.0.3; the peer mismatch is
  recorded without changing the existing compiler pin. CI workflow has been locally
  exercised via its commands, not run on GitHub Actions in this task.

Next step: Parent spec review and quality review; integrate the focused commit.
Subsequent resource/AI/auth/media tasks must add real provider tests and use these
shared validators at their boundaries. See `carin-api/src/contracts/README.md` for
API usage and coverage gates.

Worktree state: T5 changes are committed together on `chore/t5-contract-codegen`;
no pre-existing user changes existed in this isolated worktree. Dependencies and
build output are ignored. Root `.superpowers/` and the parallel T3 worktree were
preserved. No task board, push, merge or deployment was performed. Use `git log -1`
for the focused commit revision.
