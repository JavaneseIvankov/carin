# C09 Resend handoff

Task / scope: Implement durable authentication email delivery and HTTPS verification/reset landing routes. C09 is `started` again while the review follow-up is checked.

Changes and affected files:

- The existing implementation on `feat/t9-resend` adds Better Auth email wiring through a PostgreSQL outbox, Resend worker/templates, callback-safe verification/reset landing routes, delivery retry, and cooldown handling.
- This review follow-up adds tests for the Feb. 29 admission boundary, generic and rate-limited verification resend, a queued resend after the 60-second cooldown, use of the resent verification link, and expired verification links remaining unverified.
- Tests changed: `carin-api/src/auth/admission.unit.test.ts` and `carin-api/tests/integration/auth.integration.test.ts`.

Verification from `carin-api/`:

- `pnpm run test`: 12 unit files / 99 tests and 8 integration files / 125 tests passed.
- `pnpm run typecheck`, `pnpm run lint`, and `pnpm run build` passed.
- Root `.venv/bin/python specs/validate-contracts.py` passed (2 OpenAPI docs, 38 operations, 408 refs, 5 fixtures, 3 negative probes).
- `git diff --check` passed.

Unverified work / blockers: No Resend API key, verified sender, or test inbox is available here, so real external delivery remains unverified. Final native callback verification remains with C11/C35. The review follow-up on this exact test commit is pending.

Next step: Obtain independent review of the test follow-up, then return C09 to `review`. C08 remains `started` until the combined C08+C09 stack is accepted.

Worktree state: `feat/t9-resend`; the test and this handoff update are uncommitted. Nothing was pushed.
