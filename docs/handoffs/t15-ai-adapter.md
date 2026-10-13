# T15 / C15 AI adapter handoff

Task / scope: Implement the Carin API AI integration interface, a schema-validated
internal HTTP client, and an explicitly selected development/test fixture adapter.
No AI service endpoints, worker/job behavior, database changes, or task-board
updates are included.

Changes and affected files:

- `carin-api/src/integrations/ai/index.ts`: typed `AiClient`, internal HTTP adapter
  using contract operation paths, service-key authentication, bounded requests,
  shared T5 request/response validation, and response provenance checks. The
  fixture adapter permits only `dev`/`test`, exposes explicit complete/partial/
  unrecognized/correction/service-failure scenarios, and projects catalog data
  from the existing synthetic analysis fixture. Fixture values and synthetic
  provenance remain unchanged; requested operation/profile/catalog/rule-set
  versions are echoed. Correction scenarios require the fixture food and portion
  input so its deterministic example math cannot silently apply elsewhere. The
  five canonical AI fixtures are copied byte-for-byte into `carin-api/fixtures/ai/`
  so adapters can load them when the package is built as the Docker context.
- `carin-api/Dockerfile` copies `fixtures/` into the runtime image;
  `carin-api/scripts/smoke-ai-fixtures.mjs` and the
  `test:ai-fixture-runtime` package script exercise the compiled adapter.
- `carin-api/src/integrations/ai/adapters.unit.test.ts`: consumer tests for fixture
  scenarios, environment restrictions, synthetic capability/catalog responses,
  HTTP schema handling, invalid JSON/schema/version/provenance, timeout, and
  network failure with an injected fake internal provider.

Verification: Node 24 / pnpm 10.33.0. Commands ran in the T15 worktree.

| Working directory | Command | Result |
| --- | --- | --- |
| `carin-api/` | `pnpm install --frozen-lockfile` | Pass |
| `carin-app/` | `pnpm install --frozen-lockfile` | Pass; needed by the existing API app-consumer integration test |
| `carin-api/` | `pnpm run typecheck` | Pass |
| `carin-api/` | `pnpm run lint` | Pass |
| `carin-api/` | `pnpm run build` | Pass |
| `carin-api/` | `pnpm run test:unit` | 62 tests pass, including canonical fixture copy checks |
| `carin-api/` | `pnpm run test:integration` | 95 tests pass |
| `carin-api/` | `pnpm run test:ai-fixture-runtime` | Build plus compiled-adapter fixture smoke passes |
| `carin-api/` | `docker build -t carin-api-t15-fixture-smoke .` | Pass using the package directory as build context |
| Container | Run compiled adapter against all three photo scenarios, correction, and service failure; inspect all five files | Pass; successful results remain synthetic |
| Worktree root | `git diff --check` | Pass |

Unverified work / blockers: No real AI service was available; the HTTP client was
exercised against an injected fake provider. This work does not establish model
quality, approved real catalog/rule coverage, nutrition values, or clinical
thresholds. T32 service endpoints and C16 worker/job handling remain separate.
The fixture capability manifest intentionally reports no supported foods or
conditions; its synthetic catalog entry exists only to exercise the shared wire
contract. Android/iOS are unrelated to this backend adapter.

Next step: Parent review and integration of the focused commit on `feat/t15-ai-adapter`.

Worktree state: Focused commit on `feat/t15-ai-adapter`; no merge or task-board
status/notes changes. The original checkout's pre-existing untracked `.superpowers/`
directory was preserved.
