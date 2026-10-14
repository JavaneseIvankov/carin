# T12 Profile API Handoff

**Task / scope:** C12 — implement profile and account timezone APIs in
`carin-api/`.

**Changes and affected files:** On `feat/t12-profile-api`, based on
`feat/t8-auth`, added authenticated `GET/PATCH /api/v1/profile`, timezone-only
`PATCH /api/v1/me`, session-scoped 24-hour idempotency, optimistic revisions,
knowledge-state validation, a C14 capability-provider seam, and regression
coverage for virtual v0, full replacement, unsupported/free-text conditions,
snapshot immutability, owner isolation, concurrent first writes, idempotency,
timezone validation and conflicts. Added an additive migration that removes
the six-decimal numeric cap from profile height/weight while keeping prior
migrations unchanged. Design and implementation plan are in
`docs/superpowers/specs/2026-10-14-c12-profile-api-design.md` and
`docs/superpowers/plans/2026-10-14-c12-profile-api.md`.

**Verification:** From `carin-api/`, `pnpm run typecheck`, `pnpm run lint`,
`pnpm run build`, `pnpm run test:unit` (93 tests), and focused profile
integration tests (11 tests) pass. The backend integration run passes 89 tests
across 7 files. `pnpm run db:generate` reports no schema changes after migration
generation. `git diff --check` passes.

**Unverified work / blockers:** The complete integration command has one
pre-existing cross-app transform failure in
`tests/integration/app-consumer.integration.test.ts`: `expo/tsconfig.base` is
not installed in this API worktree. `specs/validate-contracts.py` could not run
because Python package `openapi_spec_validator` is unavailable; no tooling was
installed. Native/mobile E2E and imported C14 capability behavior remain for
their respective tasks.

**Next step:** Review the branch, then continue with C24 on a separate
`feat/t24-examinations-api` worktree based on `feat/t8-auth`. C17 media work
needs separate coordination for storage configuration, C08 integration, and
the distinction between the 10 MiB source-image limit and normalized stored
size.

**Worktree state:** Branch has not been pushed. T12 should be handed back as
`review`, not `done`. Preserve the root checkout's unrelated untracked
`.superpowers/` directory.
