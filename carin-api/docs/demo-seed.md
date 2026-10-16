# Real-AI showcase account seed

This command populates one existing account so the app can be opened by signing in
directly. Create the account through the normal registration flow first, verify
its email, and grant the current AI-processing consent in the app. The seeder
checks all three conditions and never grants consent itself. New users still use
the normal onboarding flow.

The profile, examination measurements, and manual meal entries are sample values
for the dedicated showcase account. They do not represent clinical measurements
or nutrition advice. The seeder records explicit unknown states, and manual meal
portions and nutrition remain unavailable when the catalog cannot support them.
Photo analyses use the six supplied JPEGs and the normal private upload and worker
path. Their result and source descriptions come from the real provider response;
the seeder rejects fixture or synthetic provenance and does not add a showcase
label to analysis results.

## Prerequisites

- Run the API, PostgreSQL, MinIO, the Carin worker, and AI service in the same
  environment. The worker must run with `AI_MODE=real`.
- Keep `AI_CATALOG_MODE=unconfigured` unless approved real catalog and rule
  artifacts are available. With the current empty catalog, real provider output
  may be `unrecognized` and contain visual estimates with null nutrients and
  explicit limitations. The command does not turn those estimates into verified
  catalog nutrition.
- Run the command in the target environment with its normal `DATABASE_URL`,
  `BETTER_AUTH_URL`, `APP_ENV`, and `AI_MODE=real` configuration. Supply only
  `DEMO_EMAIL` and `DEMO_PASSWORD` as one-off secrets. The seeder uses
  `BETTER_AUTH_URL` as its API URL and `DEMO_EMAIL` as the target account by
  default. Optional `DEMO_API_URL` and `DEMO_SEED_TARGET_EMAIL` overrides are
  available; when supplied, the target email must match the login email.
  `APP_ENV` must be `dev`, `staging`, or `prod`; `AI_MODE=fixture` is rejected.
- Use the dedicated showcase account and database. Product data is written only
  through authenticated, owner-scoped API routes. The database table added for
  repeatable seeding contains only resource keys, payload hashes, and resource
  IDs for the signed-in account.

## Apply and run

Apply the migration as part of the API release, then run the seeder once as an
on-demand job using the same API image and production environment. Keep the
account password in the deployment platform's secret store and expose it only
to this job. Do not add it to a committed file or run the seeder automatically
on API startup. The job needs the production database connection and must be
able to reach the configured API, AI service, media storage, and running worker.

The API image contains the compiled seeder and migration commands:

```sh
node dist/db/migrate.js
node dist/scripts/demo-seed.js
```

For the local Compose stack, the API container already has database access and
can call its own API at `http://127.0.0.1:3000`:

```sh
docker compose --profile worker --env-file infra/.env -f infra/compose.yaml up --build -d
docker compose --profile worker --env-file infra/.env -f infra/compose.yaml exec api node dist/db/migrate.js
docker compose --env-file infra/.env -f infra/compose.yaml exec \
  -e DEMO_EMAIL -e DEMO_PASSWORD \
  api node dist/scripts/demo-seed.js
```

Before the final command, provide `DEMO_EMAIL` and `DEMO_PASSWORD` to the shell.
The API container supplies `DATABASE_URL`, `BETTER_AUTH_URL`, `APP_ENV`, and
`AI_MODE`; Compose reads the worker and AI provider settings from `infra/.env`.
Keep credentials in ignored local environment files or the deployment secret
manager; do not add them to examples, fixtures, or source control.

The first successful run stores its Asia/Jakarta date as a seed anchor. Reruns
reuse that date and skip already completed records, so they do not shift dates or
duplicate the same history. If a photo file changes, its SHA-256 creates a new
photo and analysis record. Interrupted uploads and jobs resume through the same
API idempotency keys.

## Expected data

- One populated health profile and completed onboarding for this account only.
- Ten examination records: two pressure readings, two fasting glucose readings,
  and two points for each of total cholesterol, LDL, and HDL.
- Six recent manual meal records with unavailable catalog nutrients and unknown
  portions; these populate dashboard intake without converting photo scans into
  meals.
- Six real-provider photo analysis jobs stored as analysis-only scans. A scan
  contributes to intake only after the user confirms it in the app.
- A compact CLI summary with counts and status; it does not print account,
  profile, food-analysis, cookie, or credential values.
