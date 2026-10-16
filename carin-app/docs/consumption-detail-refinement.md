# Consumption detail UI refinement

Task / scope: Simplify Detail konsumsi using Hasil analisis as the UI reference, including a separate title row below navigation.

Changes and affected files:

- `components/consumptions/consumption-detail.tsx`: prioritize food, consumed portions, time and nutrition. Move coverage, portion explanations, limitations and sources into disclosures. Keep partial coverage visible beside affected values. Put back/refresh controls above the full-width title; retain manual editing and delete confirmation.
- `lib/consumptions/attention-presentation.ts`: use plain source labels, format portions locally, show a photo portion fraction when grams are unknown, and preserve the demonstration label when visual estimates are also present.
- `lib/consumptions/attention-presentation.unit.test.ts`: cover partial coverage, retained estimate provenance, unknown-gram photo portions and demonstration labeling.

Verification (from `carin-app/`): `pnpm run typecheck`, ESLint on the three changed source/test files, and `pnpm exec vitest run lib/consumptions/attention-presentation.unit.test.ts lib/consumptions/consumption.unit.test.ts lib/consumptions/photo-confirmation.unit.test.ts` passed (58 tests). Prettier and `git diff --check` passed. The final header and photo-backed detail were inspected on the connected Android phone in Expo Go using agent-device.

Unverified work / blockers: iOS, dark mode, enlarged system text, and manual/deleted-photo states were not visually checked in this pass.

Next step: Review the remaining platform and display states when available.

Worktree state: This handoff accompanies the consumption detail refinement on `feat/ios-ui-improvements`; the change does not alter backend records or wire contracts.
