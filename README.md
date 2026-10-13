# Carin

This repository contains the Expo mobile scaffold (`carin-app/`), the Carin API
tooling scaffold (`carin-api/`), and the product/API specifications (`specs/`).
The API routes and production feature tests are not implemented yet.

Use Node.js 24, pnpm 10.33.0, and Python 3.14. Run these checks from a clean
checkout:

```sh
cd carin-app
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
pnpm run test

cd ../carin-api
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
pnpm run test

cd ..
python -m venv .venv
.venv/bin/python -m pip install -r specs/requirements-contracts.txt
.venv/bin/python specs/validate-contracts.py
```

The two Vitest commands currently report zero tests. Feature work adds tests
alongside behavior. The contract validator checks specification documents and
synthetic fixtures; it does not verify a running API or AI service. See the
module guides and `specs/05-verification-and-deployment.md` for scope and
platform verification requirements.
