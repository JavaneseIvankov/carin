# T15 / C15 AI adapter handoff

Task / scope: Implement the Carin API AI integration interface, a schema-validated
internal HTTP client, and an explicitly configured development fixture adapter.
No AI service endpoints, worker/job behavior, or database changes are included.

Changes and affected files:

- `carin-api/src/integrations/ai/index.ts`: typed `AiClient`, HTTP adapter using
  generated contract operation paths and shared T5 validation, service-key auth,
  bounded requests, schema/version/provenance checks, and deterministic fixture
  scenarios. Internal-host validation rejects public and link-local addresses;
  URL credentials/query/fragment are rejected and redirects fail closed.
- Fixture selection uses validated `APP_ENV` and `AI_MODE` configuration and is
  permitted only for development. Fixture analysis/correction rejects versions
  absent from the packaged dataset and retains canonical synthetic provenance.
  Recalculation preserves all selected component fields. Unknown portions must
  remain unknown (`quantity`, `unit`, `servingId`, and `grams` are null).
- The five canonical fixtures are copied byte-for-byte into
  `carin-api/fixtures/ai/`; the Docker image packages them for runtime use.
  `test:ai-fixture-runtime` exercises the compiled adapter.
- Independent review found and drove fixes for public-host credential exposure,
  redirects, fixture provenance/version relabeling, recalculation field drift,
  runtime fixture gating, and unknown-portion handling.

Verification on integrated `dev` (14 October 2026):

| Working directory | Command | Result |
| --- | --- | --- |
| `carin-api/` | `pnpm test` | 77 unit and 103 integration tests passed |
| `carin-api/` | `pnpm run typecheck` | Passed |
| `carin-api/` | `pnpm run lint` | Passed |
| `carin-api/` | `pnpm run test:ai-fixture-runtime` | Build and fixture smoke passed |
| `carin-api/` | `docker build -t carin-api-t15-final-smoke .` | Passed; compiled adapter loaded packaged fixtures in the image |
| Repository root | `.venv/bin/python specs/validate-contracts.py` | Passed: 2 OpenAPI documents, 38 operations, 5 fixtures, math/coverage/provenance and negative probes |
| Repository root | `docker compose -f infra/compose.yaml config --quiet` | Passed with temporary non-secret local placeholders; `infra/.env` is absent |
| Repository root | `git diff --check` | Passed |

Unverified work / blockers: No live AI provider or approved real nutrition/rule
dataset was available. The HTTP adapter was tested with injected fake responses;
this does not establish model quality or real-photo accuracy. T8 auth/session
wiring, C16 durable worker/publication behavior, T32 service endpoints, and legal
approval remain outside this task. The contract validator and Compose check do
not prove a live deployment or real AI integration.

Next step: C16 should call T7's consent guard in the same publication transaction
as lease/status/generation/ownership/deletion checks, using a consistent lock
order. T8 must wire the authenticated consent route and signup transaction.

Worktree state: Feature commit `3167ba6` on `feat/t15-ai-adapter` was integrated
into `dev` by merge commit `a0757a8`. Task T15 is handed back as `review`.
