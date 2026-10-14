# Carin

Carin is an AI-powered personal health and nutrition tracking ecosystem developed for the hackathon. It combines:
- **Two-track food logging**: Pre-meal photo scan analysis and post-meal manual consumption logging.
- **Deterministic domain logic**: Nutrition aggregation, portion scaling, and calendar-age calculations.
- **Health monitoring**: Personal health profile management and self-recorded medical exam tracking (blood pressure, blood glucose, cholesterol).
- **Privacy-first architecture**: Strict user data ownership, durable data deletion, signed private media access, and AI consent enforcement.

## Repository Structure

- `carin-app/`: Mobile application built with Expo (React Native, NativeWind, TypeScript).
- `carin-api/`: Backend HTTP API server and durable background workers built with Node.js, Hono, Drizzle ORM, Better Auth, and PostgreSQL.
- `ai-service/`: Internal stateless AI microservice for multimodal food identification and nutrition estimation.
- `infra/`: Docker Compose configuration for local services (PostgreSQL, MinIO/Silo object storage, API, and workers).
- `specs/`: Product specifications, domain invariants, OpenAPI wire contracts, and contract validation tooling.

## Prerequisites

- **Node.js**: >= 22.12.0 (recommended: Node.js 24)
- **pnpm**: 10.33.0
- **Docker & Docker Compose**: v2+
- **Python**: 3.14 (for specs contract validation)

---

## Running the Application Locally

### 1. Configure Environment Variables

#### A. Backend & Infrastructure (`infra/.env`)
Copy the infrastructure environment template:
```sh
cp infra/.env.example infra/.env
```

Review and adjust `infra/.env` (generate random 32+ character secrets for auth and media signing):

```env
POSTGRES_DB=carin_dev
POSTGRES_USER=carin_dev
POSTGRES_PASSWORD=carin_dev_password123

MINIO_ROOT_USER=carin_minio
MINIO_ROOT_PASSWORD=carin_minio_password123
MINIO_BUCKET=carin-dev
MINIO_ACCESS_KEY=carin_minio
MINIO_SECRET_KEY=carin_minio_password123
MEDIA_SIGNING_SECRET=replace-with-a-random-secret-at-least-32-characters
MEDIA_SIGNED_URL_BASE=http://localhost:3000

API_BIND_ADDRESS=0.0.0.0
API_PORT=3000

BETTER_AUTH_SECRET=replace-with-a-random-secret-at-least-32-characters
BETTER_AUTH_URL=http://localhost:3000
AUTH_TRUSTED_ORIGINS=carin-dev://
APP_LINK_SCHEME=carin-dev

# Resend email configuration
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
EMAIL_FROM="Carin <auth@runsworkspace.my.id>"

EXPO_PUBLIC_API_URL=http://localhost:3000

AI_SERVICE_URL=http://ai-service:8000
AI_SERVICE_KEY=local-ai-key-placeholder
AI_MODE=fixture
```

> **Note for testing on physical devices:** Replace `http://localhost:3000` with your development machine's LAN IP (e.g., `http://192.168.1.50:3000`) in `BETTER_AUTH_URL`, `MEDIA_SIGNED_URL_BASE`, and `EXPO_PUBLIC_API_URL`.

#### B. Mobile Application (`carin-app/.env`)
Copy the mobile environment template:
```sh
cp carin-app/.env.example carin-app/.env
```

Ensure it points to the API:
```env
EXPO_PUBLIC_ENV=development
EXPO_PUBLIC_API_URL=http://localhost:3000
```

---

### 2. Start the Backend Infrastructure

Start PostgreSQL, MinIO, database migrations, the Carin API server, and background workers via Docker Compose:

```sh
docker compose --profile worker --profile email --env-file infra/.env -f infra/compose.yaml up --build
```

This starts:
- **`postgres`**: Database on the private network.
- **`minio`**: Object storage for private meal photos.
- **`migrate`**: Automatic one-shot Drizzle database schema migration.
- **`api`**: Hono HTTP server accessible on port `3000`.
- **`worker`**: Background worker processing food scan analyses.
- **`email-worker`**: Outbox worker delivering verification and reset emails via Resend.

---

### 3. Start the Mobile Application

In a separate terminal, install dependencies and start the Expo development server:

```sh
cd carin-app
pnpm install
pnpm run dev
```

From the interactive Expo terminal:
- Press **`w`** to open the app in your Web browser (`http://localhost:8081`).
- Scan the displayed QR code with the **Expo Go** app on Android or iOS (on the same Wi-Fi network).
- Press **`a`** to launch on an Android emulator or **`i`** for an iOS simulator.

---

## Running Verification & Tests

Run test suites and typechecks across the workspace:

```sh
# Carin API checks
cd carin-api
pnpm install
pnpm run typecheck
pnpm run lint
pnpm run test:unit
pnpm run test:integration
pnpm run build

# Carin Mobile checks
cd ../carin-app
pnpm install
pnpm run typecheck
pnpm run lint
pnpm run test:unit
pnpm run test:integration

# OpenAPI contract and synthetic fixture validation
cd ..
python -m venv .venv
.venv/bin/python -m pip install -r specs/requirements-contracts.txt
.venv/bin/python specs/validate-contracts.py
```
