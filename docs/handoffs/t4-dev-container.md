# T4 / C04 development container handoff

Task / scope: Local development image and Compose stack for API, PostgreSQL,
private MinIO-compatible object storage, and a one-shot Drizzle migration.
Worker configuration is opt-in and reserved for C16.

Changes and affected files:

- `carin-api/Dockerfile`, `carin-api/.dockerignore`: multi-stage Node 24.18.0 /
  pnpm 10.33.0 image; runtime contains production dependencies, compiled
  `dist/`, and `drizzle/` SQL/meta files. The migration job runs the actual T3
  `node dist/db/migrate.js` script before API startup.
- `infra/compose.yaml`: pinned PostgreSQL 18.3, persistent PostgreSQL and object
  store volumes, private service network, API host port only, migration gating,
  and a worker profile that is not in the default service set.
- `infra/.env.example`, `.gitignore`, `infra/README.md`: local-only placeholders,
  LAN/emulator API URL guidance, trusted-network notes, and setup/teardown steps.
  Since upstream MinIO's repository is archived and its image could not be
  pulled, the `minio` Compose service uses the maintained Silo fork at pinned
  digest `sha256:635197cb9f36d01bee221d34d1c7d7960f6a95c48b0b6c01d99cd13bdae51a46`
  (`RELEASE.2026-09-16T00-00-00Z`). Compatibility sources are linked from the
  README. PostgreSQL and object-store ports, including the console, have no host
  port bindings.

Verification (commands and working directories):

- `carin-api/`: `pnpm install --frozen-lockfile`, `pnpm run typecheck`,
  `pnpm run lint`, `pnpm run test:unit` (28 tests),
  `pnpm run test:integration` (95 tests), and `pnpm run build` all passed.
  The integration run needed the documented frozen install in `carin-app/`
  because one existing consumer test imports Expo's TypeScript config.
- Repository root: `docker build -f carin-api/Dockerfile carin-api` passed;
  default and `--profile worker` Compose configuration checks passed;
  `git diff --check` passed.
- Fresh `t4-smoke` Compose start passed. PostgreSQL and Silo became healthy,
  the migration service exited 0 after applying four migrations, and API
  `/health/live` and `/health/ready` returned `status: ok`.
- Silo `mcli` created a bucket, wrote/read a probe object, and verified its
  content. After stopping and restarting the stack, the object remained
  readable and PostgreSQL still reported four migration rows. `docker inspect`
  showed `{}` host port bindings for PostgreSQL and Silo and only
  `0.0.0.0:3000` for the API. The test project and its volumes were removed.

Unverified work / blockers: No physical device or emulator was available, so
LAN access is documented but not device-tested. The current API has no MinIO
repository/provider implementation; S3 read/write was verified directly with
the object-store client, not through API behavior. The worker profile was
configuration-checked but deliberately not started before C16. The Silo image
was exercised on linux/amd64; no arm64 runtime test was performed.

Next step: Review the T4 branch, then integrate it into `dev` when approved.
Enable the worker profile only after C16 provides and verifies its entrypoint
and a least-privilege Silo account has been created.

Worktree state: committed on `feat/t4-dev-container` in
`.worktrees/t4-dev-container`; no merge into `dev`. The root checkout's existing
untracked `.superpowers/` directory was preserved.
