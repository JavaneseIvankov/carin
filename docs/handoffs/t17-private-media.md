# T17 private media handoff

Task / scope: private normalized photo uploads, owner-issued read grants,
internal AI signed URLs, live ownership checks, and restart-safe cleanup of
unattached uploads.

Changes and affected files:

- Added `carin-api/src/modules/media/` for multipart/image processing,
  AES-256-GCM opaque grants, private MinIO storage, repository/service/routes,
  and durable photo cleanup. Pinned `sharp` and `minio` dependencies.
- Added API wiring through the injected `AppDependencies.media` dependency.
  Upload and owner-view routes require the existing injected `SessionResolver`;
  no new authentication system was introduced.
- Added disposable-PostgreSQL media ownership and cleanup integration tests,
  media unit tests, module README, and design/plan docs.
- Reused existing `photo`, `deletion_task`, and `idempotency_record` tables.
  The five-minute reservation lease and fencing token live in the existing
  idempotency JSONB, so no migration or schema registry changes were needed and
  there is no `0004_*` collision.
- Same-key concurrent PUTs are fenced by a durable lease. Expired retries get a
  distinct photo row and random object key. Completion locks user → photo →
  idempotency, rechecks active/uploaded state, and queues late objects if
  account deletion or cleanup wins the race.

Verification from `carin-api/`:

- `pnpm run typecheck` — passed.
- `pnpm run lint` — passed.
- `pnpm run test:unit` — 11 files, 94 tests passed.
- `pnpm exec vitest run tests/integration --exclude tests/integration/app-consumer.integration.test.ts` — 7 files, 77 tests passed, including the barrier race, expired lease takeover, and delayed PUT/deletion/cleanup retry tests.
- `pnpm run build` — passed.
- `pnpm run test:integration` — the API integration suites pass, but the
  unfiltered command fails while transforming
  `tests/integration/app-consumer.integration.test.ts`: the worktree does not
  have `carin-app`'s `expo/tsconfig.base` dependency installed. The API-only
  integration run above excludes that unrelated cross-package suite.

The PostgreSQL tests use the repository's disposable Docker convention. They
use an injected object store; the MinIO adapter is compiled and its endpoint,
origin, path, credential, and redirect policy is unit-tested, but no live
MinIO server was available in this verification run.

Unverified work / blockers: production `src/index.ts` cannot supply media
dependencies until the existing session resolver and media environment
configuration are available from their owning integration tasks. The routes
are mounted by `createApp` when those dependencies are injected. A live
production MinIO/S3-compatible service was not exercised.

Next step: C29 should inject the same private MinIO object store and database
into `runPhotoCleanupBatch` on worker startup and on its recurring durable
schedule. C29 account deletion must lock the user row before touching photo or
idempotency rows, retain the account in `deleting` while in-flight PUTs settle,
and defer hard-delete/cascade until late object cleanup has drained. See
`carin-api/src/modules/media/README.md` for the handoff contract.

Worktree state: local branch `feat/t17-private-media`; conventional commits
only; no push. Task remains started for orchestrator spec/code-quality review.
