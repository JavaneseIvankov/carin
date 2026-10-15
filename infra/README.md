# Local development stack

This Compose stack runs the Carin API, PostgreSQL, private MinIO-compatible
object storage, and a one-shot Drizzle migration step. The upstream MinIO
repository is archived and its container image could not be pulled during this
task, so the local `minio` Compose service uses the maintained `pgsty/silo`
fork, pinned by image digest to `RELEASE.2026-09-16T00-00-00Z`. Silo preserves
the MinIO S3 API, `MINIO_*` settings, and on-disk format. This keeps the app's
S3-compatible development endpoint stable while upstream distribution is
unavailable. See the [archived upstream repository](https://github.com/minio/minio),
[Silo compatibility notes](https://silo.pgsty.com/compatibility/), and
[pinned release](https://github.com/pgsty/silo/releases/tag/RELEASE.2026-09-16T00-00-00Z).

PostgreSQL and both object-store ports stay on the private Compose network. The
object-store console is not published. Only the API is bound to the host, so a
phone on the same trusted LAN can call it.

## Start and persist data

Copy `infra/.env.example` to `infra/.env`, replace the local-only passwords,
set a unique `BETTER_AUTH_SECRET`, and use the same reachable API base in
`BETTER_AUTH_URL` and `EXPO_PUBLIC_API_URL`. Keep the API's `APP_LINK_SCHEME` and
`AUTH_TRUSTED_ORIGINS` aligned with the mobile environment in
`carin-app/app.config.ts`. The API sets Better Auth's cookie prefix to
`carin-${APP_ENV}`, which must match the mobile client's cookie and storage prefixes.
Use these values for each deployment:

| API `APP_ENV` / mobile `EXPO_PUBLIC_ENV` | `APP_LINK_SCHEME` / `AUTH_TRUSTED_ORIGINS` | Cookie and storage prefix |
| --- | --- | --- |
| `dev` / `development` | `carin-dev` / `carin-dev://` | `carin-dev` |
| `staging` | `carin-staging` / `carin-staging://` | `carin-staging` |
| `prod` / `production` | `carin` / `carin://` | `carin-prod` |

List only approved exact origins in `AUTH_TRUSTED_ORIGINS`.
To deliver auth email locally, set `RESEND_API_KEY` and `EMAIL_FROM` to a sender
on a domain verified for this Resend environment.
Then run these commands from the repository root. If a password contains URL
reserved characters, percent-encode it because Compose places it in
`DATABASE_URL`:

```sh
docker compose --env-file infra/.env -f infra/compose.yaml up --build
```

Start the dedicated email delivery worker when Resend is configured:

```sh
docker compose --profile email --env-file infra/.env -f infra/compose.yaml up --build
```

The email worker shares PostgreSQL and the API image but receives the Resend
credential only in its own container. Its profile is separate from the analysis
`worker` profile. The example sender is a placeholder; a real
inbox check requires a verified sender domain, active API key, recipient mailbox,
and a reachable `BETTER_AUTH_URL`.

For development verification and password-reset email, use a reachable HTTPS
API URL in both `BETTER_AUTH_URL` and `EXPO_PUBLIC_API_URL`; an HTTP LAN URL can
run ordinary app requests but the app blocks email callbacks on HTTP. A
development HTTPS tunnel can provide this URL. Add its exact origin and the web
app origin to `AUTH_TRUSTED_ORIGINS`, restart the API and Expo after changing
their environment, and run the email worker. For web, serving the app and API
through the same HTTPS origin avoids cross-site cookie restrictions. Keep real
Resend credentials in ignored `infra/.env`, rather than `.env.example`.

An accepted registration or resend request queues email; it does not prove the
email worker delivered it. The worker must be running with a verified sender
and a working Resend key. Check delivery and the recipient inbox separately.

Compose waits for PostgreSQL health, runs `node dist/db/migrate.js` once, and
starts the API only after that migration and the MinIO bucket bootstrap succeed.
The bootstrap uses MinIO root credentials only to ensure the configured private
bucket exists; the API and worker receive only their configured service
credentials. The MinIO data lives in a named volume and survives `down`/`up`.
`docker compose down -v` deletes both volumes and all local development data.

## Reach the API from a device

Set `EXPO_PUBLIC_API_URL` in the mobile app's local environment to the host
machine's LAN address, such as `http://192.168.1.50:3000`. Android emulators
usually reach the host at `http://10.0.2.2:3000`; iOS simulators can use the
host's LAN address. A physical phone needs to share the machine's LAN and the
machine firewall must allow the chosen API port. `localhost` on the phone points
to the phone itself. Keep this development network trusted; staging/production
publish only the API behind HTTPS.

Check the API with `curl http://127.0.0.1:3000/health/live`. To inspect storage
from the host, use `docker compose --env-file infra/.env -f infra/compose.yaml
exec postgres psql -U carin_dev -d carin_dev`. An S3 client pointed at
`http://localhost:9000` is intentionally unavailable:
MinIO is only reachable by services on the private network. No database,
MinIO, AI, or worker port is published.

The optional `worker` profile runs the durable analysis worker and the private
`ai-service` container on the same Compose network. Before enabling it, create a
least-privilege Silo account for the bucket and replace `MINIO_ACCESS_KEY` and
`MINIO_SECRET_KEY`; the example values are placeholders. The worker creates
private, short-lived photo URLs for AI service requests. The AI container gets
`DASHSCOPE_API_KEY`; the worker gets only `AI_SERVICE_KEY` and calls
`AI_SERVICE_URL` on the private network. `AI_MODE=fixture` remains the local
development default. Set `AI_MODE=real`, `DASHSCOPE_API_KEY`, and `VLM_BASE_URL`
in ignored `infra/.env` to exercise provider-backed analysis. By default the
service advertises the empty `unconfigured` catalog and returns safe null
nutrients. For an isolated local live-test stack, set
`AI_CATALOG_MODE=synthetic-demo`: the real VLM still processes the photo, then
the service exact-matches the proposal to a small synthetic catalog and computes
from explicitly synthetic nutrient values. The result and sources are marked
`synthetic`, with no health rules or personal attention output. These values are
plumbing fixtures, not nutritional facts, and cannot be enabled outside `dev`
or `test`. The service uses one worker process for its shared in-memory request
quota.

Before submitting real analyses, synchronize the API's active catalog snapshot
with the AI service capabilities. Start `ai-service` and wait for it to become
healthy, then run:

```sh
docker compose --env-file infra/.env -f infra/compose.yaml --profile worker run --rm --no-deps worker node dist/catalog/import-cli.js
```

Catalog sync activates an immutable version while retaining prior snapshots and
makes it current for that database. For a synthetic live test, start the stack
with `AI_CATALOG_MODE=synthetic-demo` and `AI_MODE=real`, then run the command
above against an isolated development database. The catalog version is
`synthetic-live-catalog-1`; sources and the analysis result remain explicitly
synthetic. Do not sync it into a shared database. The default `unconfigured`
mode remains empty until the approved T31 artifacts are delivered.
