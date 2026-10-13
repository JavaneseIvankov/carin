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
then run these commands from the repository root. If a password contains URL
reserved characters, percent-encode it because Compose places it in
`DATABASE_URL`:

```sh
docker compose --env-file infra/.env -f infra/compose.yaml up --build
```

Compose waits for PostgreSQL health, runs `node dist/db/migrate.js` once, and
starts the API only after that migration service exits successfully. PostgreSQL
and MinIO data live in named volumes and survive `down`/`up`. `docker compose
down -v` deletes both volumes and all local development data.

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

The `worker` service is a disabled Compose profile prepared for C16 and points
at the planned `dist/worker.js` entrypoint. Do not enable `--profile worker`
before C16 implements and verifies that entrypoint. Before enabling it, create
a least-privilege Silo account for the bucket and replace `MINIO_ACCESS_KEY` and
`MINIO_SECRET_KEY`; the example values are placeholders. It has no AI service
in this stack; the AI URL and key are placeholders for later internal integration.
