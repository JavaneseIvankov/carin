# Carin orchestration handoff

Date: 13 October 2026  
Audience: Antigravity continuing orchestration and implementation  
Plan: `docs/superpowers/plans/2026-10-13-carin-orchestration.md`

## Current checkpoint

The integration checkout is `dev`. Code through T2 is at `1d97d3a` (`feat: integrate HTTP API foundation`); this handoff document is committed immediately after that checkpoint. The local branch has not been pushed. Preserve the pre-existing untracked `.superpowers/` directory in the root checkout.

All repository task work is in conventional branches and isolated worktrees:

| Task | Board state | Branch / worktree | Integrated result |
| --- | --- | --- | --- |
| T1 / C01 tooling | `review` | `chore/t1-tooling` / `.worktrees/t1-tooling`, clean at `6c6a02d` | `b963333` |
| T2 / C02 API foundation | `review` | `feat/t2-api-foundation` / `.worktrees/t2-api-foundation`, clean at `17bee15` | `1d97d3a` |
| T31 / C31 AI data | `blocked` | `feat/t31-ai-data-artifacts` / `.worktrees/t31-ai-data-artifacts`, clean at `3209443` | `e8af788` plus CI check `b1caf25` |

The board has 36 tasks: T1 and T2 are handed back as `review`, T31 is `blocked`, and the other 33 remain `open`. Do not mark work `done` without the user's approval. Treat a reviewed, integrated dependency as available even while its board state is `review`.

## Completed and verified

T1 added pinned tooling, unit/integration commands, CI, and reproducible Python contract-validator dependencies. It adds no product behavior; the mobile package currently has no tests.

T2 added the Hono server, startup configuration checks, liveness and readiness, request IDs, safe error responses, and fail-closed session/ownership extension points. PostgreSQL idle-client errors log only a fixed code. The readiness checkout and `SELECT 1` share a three-second deadline; a timed-out client is discarded from the pool, and a late checkout is released without running the query. T2 received a spec review PASS and a separate quality-review APPROVE. Readiness intentionally continues to return 503 until T3 adds the expected schema check; database reachability by itself is not readiness.

T31 is only the preparatory subset the user authorized. Empty unpublished catalog/nutrition/rules/manifest templates, schemas, provenance and approval hash validation, 19 validator tests, and CI checks are integrated. The user confirmed that no real source has been approved. Do not add inferred food values or clinical rules. T31 stays blocked until the data owners supply approved sources, permitted use, foods/servings/nutrient values, reviewed rule scope, and review metadata. T32 must not treat template completion as real data approval.

After merging T2 on `dev`, these checks passed:

```text
carin-api: pnpm install --frozen-lockfile --offline
carin-api: pnpm run typecheck, lint, test:unit (17), test:integration (9), build
carin-app: pnpm run typecheck, lint, test (no app tests exist yet)
root: .venv/bin/python specs/validate-contracts.py
root: .venv/bin/python -B -m unittest discover -s ai-service/tests (19)
root: .venv/bin/python -B ai-service/validate_data_artifacts.py
```

The contract validator reported 2 OpenAPI documents, 38 operations, 408 local references, 5 fixtures, 32 mapped acceptance criteria, and 3 negative probes. The unpublished AI artifact validator passed. The review workers also reran all T2 checks on the final branch.

## Next work

T3 (Drizzle schema/migrations) and T5 (generated contracts/runtime validation) are the next independent foundation tasks; both depend on integrated T1 and T2. Use `feat/t3-database-schema` and `chore/t5-contract-codegen`, based on the latest verified `dev`, after re-reading `tsk list T3 --json`, `tsk list T5 --json`, the spec index, and the relevant module guides.

Coordinate package manifests and lockfiles centrally before workers edit them. T3 needs PostgreSQL/Drizzle and the canonical pinned Better Auth schema; T5 needs a reproducible OpenAPI type generator plus a JSON Schema 2020-12 runtime validator. Ask each worker for exact package/version requests first, then let one integrator update each manifest and lockfile. Keep generated contract types derived from both OpenAPI files; do not hand-copy interfaces or feed an entire OpenAPI root document to a JSON Schema validator. Handle query/path/header, JSON and multipart transport separately; binary upload/download behavior needs transport checks. AI contract types do not permit the mobile app to call the AI service directly.

For T3, generate Better Auth tables from the pinned configuration with UUID IDs (`advanced.database.generateId: "uuid"`); do not hand-author password/session tables. Follow `specs/02-domain-model-and-business-rules.md` for ownership, immutable snapshots, revisions, consent, catalog versions, jobs/results, consumption, exams, idempotency and outbox constraints. Test empty and repeat migrations, ownership/uniqueness failures, scan deletion preserving consumption snapshots, and snapshot immutability. Wire T2 `checkSchema` to the actual expected migration/version; verify readiness returns 200 only after valid migrations.

T4 depends on T3. T6 and T7 become available after their listed dependencies from the orchestration plan are integrated. Re-read the board before dispatch; task status alone does not prove a dependency has an artifact in `dev`.

## Known limits and worktree state

Remote GitHub Actions, a real PostgreSQL migration/readiness 200, Android/iOS native behavior, provider credentials, and real AI accuracy have not been verified. The repository contract and template validators do not establish clinical approval or model accuracy. No deployment or push was done.

The three task worktrees listed above are clean and retained for review. The root checkout is tracked-clean apart from the existing untracked `.superpowers/` directory. Keep conventional branch names (`feat/*`, `fix/*`, `chore/*`, `docs/*`) and integrate one reviewed branch at a time into `dev`.
