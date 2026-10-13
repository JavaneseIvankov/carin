# Repository Guidelines

## Project Structure & Module Organization

This is a greenfield Expo/React Native application:

- `app/` contains Expo Router screens and route configuration (`_layout.tsx`, `index.tsx`).
- `components/ui/` contains reusable React Native Reusables components.
- `lib/` contains shared helpers and theme configuration.
- `assets/images/` contains bundled image assets.
- The repository-level `ai-service/` directory is reserved for AI/service integration.

Keep route-specific UI close to its route; move reusable behavior into `components/` or `lib/`.

## Build, Test, and Development Commands

Run commands from `carin-app/` with pnpm:

```bash
pnpm install --frozen-lockfile # install pinned dependencies
pnpm run typecheck        # check TypeScript types
pnpm run lint             # lint source and configuration
pnpm run test             # run Vitest tests
pnpm run dev             # start Expo with a cleared cache
pnpm run android         # start the Android target
pnpm run ios             # start the iOS target (macOS required)
pnpm run web             # start the web target
```

Vitest currently has no product tests; add tests with each feature. Verify affected
platforms manually through Expo before opening a pull request. These tooling checks
do not establish Android/iOS compatibility.

## Coding Style & Naming Conventions

Use TypeScript with strict mode enabled, two-space indentation, single quotes, and a 100-character print width. Prettier is configured in `.prettierrc` with Tailwind class sorting; run it on changed files before committing. Use PascalCase for components, camelCase for functions and variables, and kebab-case only where required by filenames or routes. Prefer the `@/*` import alias over deep relative imports. Use NativeWind classes for styling and keep shared class variants in `cva` definitions.

## Testing Guidelines

Vitest is configured without a coverage threshold. When adding tests, colocate them
with the feature or use a dedicated `__tests__/` directory, name files `*.test.ts`
or `*.test.tsx`, and cover both interaction logic and platform-sensitive behavior.

## Commit & Pull Request Guidelines

Existing commits use short, imperative-style prefixes such as `chore:` (for example, `chore: created root README.md`). Follow that pattern with focused messages such as `feat: add onboarding screen` or `fix: preserve theme on web`.

Pull requests should explain the user-visible change, identify affected platforms, include validation steps, link any issue, and attach screenshots or recordings for UI changes. Keep unrelated scaffold or formatting changes out of feature PRs.

## Security & Configuration Tips

Do not commit API keys or credentials. Keep local secrets in untracked environment/config files and document required variables without publishing their values. Review Expo configuration changes carefully because they affect native and web targets.
