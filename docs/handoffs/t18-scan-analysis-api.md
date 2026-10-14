# T18 Scan and analysis API handoff

Task / scope: C18 automatic photo scans, durable initial and correction jobs,
owner-scoped scan/result reads, and safe result publication, including the
review follow-up for imported capability authority and frozen-profile eligibility.

Changes and affected files: C18 is implemented in `carin-api/src/modules/analyses/`
and `carin-api/src/modules/scans/`, with authenticated routes registered in
`carin-api/src/app.ts` and private photo/job runtime wired in `carin-api/src/index.ts`
and the worker. The worker validates provider output against the immutable scan
profile, catalog, operation, generation and job fence before publication. This
follow-up adds the optional `supportedRules` AI capability contract and generated
consumers, persists the exact imported capability manifest in append-only migration
`carin-api/drizzle/0007_rare_ben_parker.sql`, and rejects photo-food matches outside
the imported allowlist. Rule claims require an exact imported rule/condition/source,
the condition must be present in the frozen profile, and its declared profile
fields, nutrient coverage, and age range must be satisfied. `overallAttention` is
rejected when it conflicts with critical limitations, unrecognized support, profile
gaps, or an empty snapshot; when no insufficiency reason exists, valid attention
claims require `needs_attention` (a complete supported fixture cannot claim
`insufficient_information`). Scan creation checks current manifest availability
before persisting snapshot, scan, or job state and returns
`CATALOG_VERSION_UNAVAILABLE` without side effects if authority is absent. Missing
or version-mismatched capability authority also fails closed during worker
validation. Synthetic fixtures declare explicit supported food IDs, rules,
conditions, and sources; no real source/rule data was invented. Tests cover
unsupported photo foods, unbacked or mismatched citations, missing profile
requirements and conditions, attention-status conflicts, manifest-less catalog
creation, and existing correction/fencing paths. The updated implementation plan is
`docs/superpowers/plans/2026-10-14-c18-scan-analysis-api.md`.

Verification (run from `carin-api/` unless stated otherwise):

- `pnpm run typecheck` passed.
- `pnpm run lint` passed.
- `pnpm run test:unit` passed: 22 files, 181 tests.
- `pnpm run test:integration` passed: 14 files, 179 tests, using disposable
  PostgreSQL containers through Docker.
- `pnpm run build` passed.
- `pnpm run db:generate` reported no schema changes after migration `0007`.
- From `carin-app/`, `pnpm run contracts:check` passed.
- From the worktree root, `/home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin/.venv/bin/python
  specs/validate-contracts.py` passed: 2 OpenAPI documents, 38 operations,
  410 local refs, and 5 fixtures.
- After the final status-consistency regression, `pnpm run test:unit` passed: 22
  files, 181 tests. The focused C18 command
  `pnpm exec vitest run src/modules/analyses/result-validation.unit.test.ts tests/integration/analysis-scan.integration.test.ts`
  passed: 2 files, 43 tests. `pnpm run typecheck` and `pnpm run lint` also passed
  after this follow-up.
- `git diff --check` passed.

Unverified work / blockers: Live AI validation and real citation authority remain
externally gated by C31; only synthetic fixtures were exercised. No live Silo bucket
or internal AI deployment was used. `lockScanForConfirmation` remains an explicit
transaction seam with a pending-analysis guard and integration coverage. C21 must
call it in the same transaction that persists consumption confirmation; C18 has no
consumption route caller.

Next step: Parent review. Keep TSK 18 `started` until review; do not push this branch.

Worktree state: Branch `feat/c18-analysis-api` in the isolated C18 integration
worktree. Follow-up is committed locally with conventional message
`fix: validate imported analysis capability authority`; preserve the earlier C18
implementation commit already on this branch.
