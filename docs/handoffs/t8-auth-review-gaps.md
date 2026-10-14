Task / scope: C08 review corrections for Better Auth 1.7.7; no C09 delivery implementation.

Changes and affected files: `carin-api/src/auth/runtime.ts` applies an atomic, database-backed 60-second verification-email cooldown keyed by a hash of the normalized email. `carin-api/tests/integration/auth.integration.test.ts` covers the cooldown across IPs, expiry, disabled vendor deletion, and reset session revocation. `carin-api/tests/integration/auth-vendor-schema.integration.test.ts` generates the installed vendor OpenAPI schema and checks pinned version, route methods, and request bodies.

Verification: From `carin-api/`, `pnpm run test:unit` passed (86), `pnpm run test:integration` passed (117), and `pnpm run typecheck`, `pnpm run lint`, and `pnpm run build` passed. From the worktree root, `/home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin/.venv/bin/python specs/validate-contracts.py` passed (2 OpenAPI documents, 38 operations, 408 local refs, 5 fixtures). `git diff --check` passed. Integration tests ran against disposable PostgreSQL 18.3 Docker containers; no mobile/device or real Resend check was run.

Unverified work / blockers: `carin-api/src/index.ts` mounts the auth runtime with a sender that throws `AUTH_EMAIL_DELIVERY_UNCONFIGURED`. The injectable seam works in PostgreSQL integration tests, but the mounted server cannot deliver signup verification or password reset mail until C09 supplies the durable Resend/outbox sender. This prevents a complete real-email auth flow and remains an external C09 dependency.

Next step: C09 wires the delivery seam and validates real verification/reset links and mobile deep links with a verified Resend domain. Keep C08 in review until the cross-task integration is confirmed.

Worktree state: This review correction is committed on `feat/t8-auth` after the origin-policy commit; preserve both when integrating.
