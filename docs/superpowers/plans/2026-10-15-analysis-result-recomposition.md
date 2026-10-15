# Analysis result recomposition implementation plan

> Execute inline in the current authorized branch. User approved the design and
> requested implementation; no extra design approval is needed.

**Goal:** Make food analysis results quickly readable while preserving uncertainty
and all existing correction/consumption safeguards.

**Architecture:** Keep data orchestration in the route. Derive compact display
fields in the existing pure presentation mapper. Extract completed result content
into a component with local disclosure state; keep the primary consumption action
in a bottom safe-area footer controlled by the existing action resolver.

**Tech stack:** Expo, React Native, NativeWind, existing RNR primitives, Vitest.

## 1. Presentation semantics

- [x] Add failing cases to `carin-app/lib/food/analysis-presentation.unit.test.ts`:
  catalog mismatch labels describe catalog matching, photo portions have one
  compact estimated amount, partial coverage remains explicit, critical allergen
  and unknown limitation messages remain visible, synthetic data stays labeled.
- [x] Run `pnpm exec vitest run lib/food/analysis-presentation.unit.test.ts` from
  `carin-app/` and confirm failures describe missing compact presentation fields.
- [x] Extend `carin-app/lib/food/analysis-presentation.ts`; retain raw provenance
  fields for expanded detail. Rerun the targeted tests.

## 2. Result composition

- [x] Create `carin-app/components/food/analysis-result-content.tsx` with identity,
  compact components/correction, important notes, nutrition, and inline details.
  Keep source/estimate labels visible while details are collapsed.
- [x] Update `carin-app/app/food/analysis/[id].tsx` to use the new component.
  Preserve loading/failure branches and all existing action resolvers. Place the
  primary consumption action below the scroll view; move secondary/deletion
  controls behind an explicit additional-actions disclosure.
- [x] Use the current latest-result/consumption state for footer messaging.
  Keep recovery refresh accessible even when the primary result is completed.

## 3. Verification and handoff

- [x] Format changed app files with `pnpm exec prettier --write <files>`.
- [x] Run `pnpm run typecheck`, `pnpm run lint`, and `pnpm run test:unit`.
- [x] Run `pnpm exec vitest run lib/food/correction.integration.test.ts
  lib/consumptions/photo-confirmation-flow.integration.test.ts`.
- [x] Inspect current result on Android with agent-device. Verify main result,
  expandable detail, and footer; do not submit a consumption or delete data.
- [x] Record checks, device limitations, and uncommitted work in the app handoff
  document. Keep credentials confined to existing ignored environment files.
