# T21 Consumption API handoff

Task / scope: Implement owner-scoped manual and photo-confirmed consumption
create/read/list/update/delete, deterministic nutrition snapshots, durable
idempotency, default photo-confirmation uniqueness, and revision-fenced personal
evaluation jobs. Keep TSK 21 `started` for review; do not push or mark it done.

Changes and affected files: `carin-api/src/modules/consumptions/` contains the
transactional repository, authenticated contract routes, deterministic actual-
portion nutrient calculation, and evaluation eligibility/reuse rules. Routes are
registered in the verified API app. Every photo confirmation calls C18's
`lockScanForConfirmation` in the same transaction that writes the consumption,
including the pending-analysis guard. Manual records keep null scan/result refs.
Nutrition snapshots freeze catalog, source, portion, profile, and exact totals per
revision; unavailable/manual catalog provenance is represented as `unavailable`
in the app-only `ConsumptionSnapshot` schema while AI `AnalysisResult` remains
strict. Unknown, unmatched, and missing-nutrient components remain saveable with
null nutrition and explicit limitations. Evaluation consent, profile fields,
condition/rule support, catalog authority, and nutrient coverage determine whether
an immutable job is requested. Reused photo attentions, limitations, and source
references are copied into the consumption snapshot, so deleting the source
scan/result cannot remove completed evaluation output. Stale food/serving selections
return 422 without saving a record; unavailable catalog provenance remains a
distinct catalog error. Evaluation failure never removes nutrition.

Create/replay and update/delete state is committed with the idempotency response.
The existing active-default unique index arbitrates concurrent photo confirmations;
equal default inputs return the existing record, changed inputs conflict, explicit
`new_occurrence` bypasses that default, and deletion permits reconfirmation. Edits
create a new immutable snapshot and generation/revision; C16 publication continues
to enforce lease, generation, current-target, consent, and deletion fences. The
worker validates manual evaluation output through the shared catalog/provenance
validator and retains `inputKind: manual` in stored results. C18 `95b842f` is merged
at `a1056ba`; its scan/photo behavior and migration `0007` are preserved. No C21
migration was needed. The implementation plan is
`docs/superpowers/plans/2026-10-14-c21-consumptions-api.md`.

Verification (API commands run from `carin-api/`):

- `pnpm run typecheck` passed.
- `pnpm run lint` passed with no warnings.
- `pnpm run test:unit` passed: 24 files, 193 tests. Final focused eligibility
  regressions passed: 1 file, 4 tests.
- `pnpm run test:integration` passed: 15 files, 190 tests, with Docker PostgreSQL.
  The focused consumption suite passed: 11 tests covering committed replay,
  concurrent/default confirmation, source ownership/currentness, pending scans,
  invalid selections without side effects, nutrition snapshots, source-result purge
  after create and metadata-only edit, revoked-consent suppression of reuse,
  edits/deletes, and stale worker publication.
- `pnpm run build` passed.
- `pnpm run db:generate` reported no schema changes.
- From `carin-app/`, `pnpm run contracts:check` passed: generated contracts match
  OpenAPI.
- From the worktree root, `.venv/bin/python specs/validate-contracts.py` passed:
  2 OpenAPI documents, 38 operations, 417 local refs, 5 fixtures, and 3 negative
  probes.
- `git diff --check` passed.

Unverified work / blockers: Validation used the deterministic fixture AI provider
and PostgreSQL integration containers, not a live AI deployment or production
catalog authority. No blocker remains for C21 review.

Next step: Parent review from the merged C18 base. Leave TSK 21 `started` until
review; do not push.

Worktree state: Branch `feat/c21-consumptions-api` in the isolated
`.worktrees/t21-consumptions-api` worktree. C21 implementation, C18 merge, and
review follow-ups are committed locally with conventional messages. No push was
performed.
