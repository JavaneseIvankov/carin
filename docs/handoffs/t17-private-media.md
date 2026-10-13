# T17 private media handoff

Task / scope: private normalized photo uploads, owner-issued read grants,
internal AI signed URLs, live ownership checks, and restart-safe cleanup of
unattached uploads.

Changes and affected files:

- Added `carin-api/src/modules/media/` for multipart/image processing, HMAC
  grants, private MinIO storage, repository/service/routes, and durable photo
  cleanup. Pinned `sharp` and `minio` dependencies.
- Added API wiring through the injected `AppDependencies.media` dependency.
  Upload and owner-view routes require the existing injected `SessionResolver`;
  no new authentication system was introduced.
- Added disposable-PostgreSQL media ownership and cleanup integration tests,
  media unit tests, module README, and design/plan docs.
- Reused existing `photo` and `deletion_task` tables. No migration or schema
  registry changes were necessary, so there is no `0004_*` collision.

Verification from `carin-api/`:

- `pnpm run typecheck` — passed.
- `pnpm run lint` — passed.
- `pnpm run test:unit` — 11 files, 93 tests passed.
- `pnpm exec vitest run tests/integration --exclude tests/integration/app-consumer.integration.test.ts` — 7 files, 74 tests passed, including both media suites.
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
schedule. See `carin-api/src/modules/media/README.md` for the handoff contract.

Worktree state: local branch `feat/t17-private-media`; conventional commits
only; no push. Task remains started for orchestrator spec/code-quality review.
