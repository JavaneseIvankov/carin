# T10 / C10 mobile shell and data client handoff

Task / scope: Four Expo Router tabs (Beranda, Riwayat, Pemeriksaan, Profil), a center food action sheet, shared design tokens and field/error/read/online UI, typed resource API repository, TanStack Query hooks, environment configuration, and user plus environment scoped drafts/read cache. Auth and feature screens belong to later tasks.

Changes and affected files: `carin-app/app/` holds thin shell routes and the two action destinations; `components/app/` holds reusable UI; `lib/api/repository.ts` and `query.ts` use T5 generated contracts; `lib/data/` owns connectivity, draft/cache scope, and session clearing; `global.css` and `lib/theme.ts` hold matching light/dark tokens. `.env.example`, `README.md`, and `vitest.config.mjs` document/configure the client. Dependencies are TanStack Query, NetInfo, and Expo SDK 56 compatible AsyncStorage.

Verification: From `carin-app/`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run test`, `pnpm run contracts:check`, `pnpm exec expo install --check`, and `pnpm exec expo export --platform web` passed. The tests cover sheet open/back/close/tab selection logic, shared field labels/error copy, offline mutation refusal with zero fetch calls, stale offline read labels, 401 clearing, and cache/draft isolation across users/environments. Web static export generated the shell and action routes.

Unverified work / blockers: No Android or iOS emulator/device was available in this worktree, so native layout, touch, safe-area, keyboard, and hardware back behavior need device QA. Tests exercise shared logic and repository boundaries; they do not render components or exercise a live API. C11 must wire Better Auth session validation/logout and login navigation into `setSessionUser`/`clearSession`; the shell deliberately has no demo user or fake API data. T10 action destinations are placeholders for later food feature tasks. The web export does not establish native compatibility.

Next step: Review T10 branch, then integrate to `dev` after the parent check. C11 should call `setSessionUser` only after `/me` confirms the session, and use `clearSession` on logout/reset; feature tasks should use `useAppRead`, `useAppWrite`, and `createDraftStore` with the current scope. Run Android/iOS manual navigation and back/sheet QA when a device is available.

Worktree state: Focused T10 changes committed on `feat/t10-mobile-shell` in `.worktrees/t10-mobile-shell`; no merge, push, or deployment. Root `dev` changes and other worktrees remain untouched.
