# Dashboard Visual Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the approved playful-empty-check dashboard composition while keeping dashboard data, routes, semantic tokens, accessibility, and RNR behavior intact.

**Architecture:** Keep the work in the existing dashboard screen and its profile-missing-actions presentation component. Use `useWindowDimensions()` to reflow the food actions for narrow widths or enlarged system text; reuse existing RNR buttons, semantic classes, icons, data selectors, and routes. No API, domain, token, or navigation changes.

**Tech Stack:** Expo Router, React Native 0.85, NativeWind 4, React Native Reusables, TypeScript, pnpm, Vitest.

---

## File map

- Modify `carin-app/components/dashboard/dashboard-screen.tsx`: dashboard brand/greeting composition, responsive food-entry actions, empty summary illustration, compact empty supporting states, and optional-profile wording.
- Modify `carin-app/components/profile/missing-field-actions.tsx`: add optional heading/description overrides while retaining current defaults for the Profile tab.
- Create `carin-app/lib/dashboard/layout.ts` and `carin-app/lib/dashboard/layout.unit.test.ts`: verify responsive breakpoints and suppression of repeated consumption actions.
- Keep `carin-app/lib/dashboard/presentation.ts`, generated API types, routes, theme tokens, and data providers unchanged.
- Do not add dependencies or create new global UI primitives for this single screen.

## Task 1: Restore the dashboard header, hero, and responsive actions

**Files:**

- Modify: `carin-app/components/dashboard/dashboard-screen.tsx`

- [x] **Step 1: Write a failing breakpoint test.**

Create `lib/dashboard/layout.unit.test.ts` with a test proving 320 dp stacks, 390 dp at default text scale remains in a row, and text scale above 1.2 stacks:

```tsx
import { describe, expect, it } from "vitest";
import {
  shouldShowDashboardNextAction,
  shouldStackDashboardActions,
} from "./layout";

describe("shouldStackDashboardActions", () => {
  it("stacks on narrow screens and enlarged text", () => {
    expect(shouldStackDashboardActions(320, 1)).toBe(true);
    expect(shouldStackDashboardActions(390, 1)).toBe(false);
    expect(shouldStackDashboardActions(390, 1.3)).toBe(true);
  });
});

describe("shouldShowDashboardNextAction", () => {
  it("hides actions already represented by the dashboard action group", () => {
    expect(shouldShowDashboardNextAction("record_consumption")).toBe(false);
    expect(shouldShowDashboardNextAction("complete_profile")).toBe(false);
    expect(shouldShowDashboardNextAction("record_examination")).toBe(true);
  });
});
```

- [x] **Step 2: Verify the breakpoint test fails before the helper exists.**

Run from `carin-app/`:

```bash
pnpm exec vitest run lib/dashboard/layout.unit.test.ts
```

Expected: fail because `shouldStackDashboardActions` and `shouldShowDashboardNextAction` are not exported yet.

- [x] **Step 3: Implement the helper and verify green.**

Create `lib/dashboard/layout.ts`:

```ts
export function shouldStackDashboardActions(width: number, fontScale: number) {
  return width < 360 || fontScale > 1.2;
}

export function shouldShowDashboardNextAction(code: string) {
  return code !== "record_consumption" && code !== "complete_profile";
}
```

Run `pnpm exec vitest run lib/dashboard/layout.unit.test.ts` from `carin-app/`; expected: all three assertions pass.

- [x] **Step 4: Add a compact Carin wordmark row and reduce the mascot tile.**

Use the existing `Icon` wrapper with the Lucide `Sprout` icon and a `Text` wordmark. Keep the dashboard date immediately below the wordmark, then one `h1` greeting and one short supporting sentence. Reduce the mascot from its current 104 dp framed tile to a smaller contextual illustration; use `carin-butter`, do not add literal colors, and let greeting text wrap before shrinking its text size.

- [x] **Step 5: Recompose the two food actions in mockup order.**

Read `width` and `fontScale` from `useWindowDimensions()` and set `stackFoodActions = shouldStackDashboardActions(width, fontScale)`. Use a row at normal width and a column for `stackFoodActions`; keep `Catat makanan` first and primary, and `Analisis foto` second and peach/secondary. Keep existing routes and accessible labels. Use the current `Button` component, icons, visible subtitles, and at least 44 dp hit targets. Each side-by-side action must wrap and have equal width.

The layout should follow this shape:

```tsx
<View className={stackFoodActions ? "gap-3" : "flex-row gap-3"}>
  <Button
    className={stackFoodActions ? "min-h-16" : "min-h-28 flex-1"}
    accessibilityLabel="Catat makanan yang sudah dikonsumsi"
  >
    <Icon as={ClipboardPlus} size={20} />
    <View className="flex-1 gap-0.5">
      <Text variant="emphasis">Catat makanan</Text>
      <Text variant="caption">Sudah dikonsumsi</Text>
    </View>
    <Icon as={ChevronRight} size={20} />
  </Button>
  <Button
    variant="secondary"
    className={stackFoodActions ? "min-h-16" : "min-h-28 flex-1"}
    accessibilityLabel="Analisis foto makanan sebelum makan"
  >
    <Icon as={Camera} size={20} />
    <View className="flex-1 gap-0.5">
      <Text variant="emphasis">Analisis foto</Text>
      <Text variant="caption">Sebelum makan</Text>
    </View>
    <Icon as={ChevronRight} size={20} />
  </Button>
</View>
```

- [x] **Step 4: Run focused static checks.**

Run from `carin-app/`:

```bash
pnpm exec eslint components/dashboard/dashboard-screen.tsx --max-warnings 0
```

Expected: exit status 0.

## Task 2: Make empty intake and supporting sections intentional

**Files:**

- Modify: `carin-app/components/dashboard/dashboard-screen.tsx`
- Modify: `carin-app/components/profile/missing-field-actions.tsx`

- [x] **Step 1: Add a compact empty-summary illustration.**

In the existing `intake.kind === 'empty'` branch, show a centered `Utensils` icon inside a compact circular or softly rounded `bg-carin-butter` surface. Keep the existing intake summary card as the single prominent content surface. Follow the illustration with the existing first-record message and a concise confirmation-boundary sentence. Do not render `0 kcal`, a progress ring, target, streak, or adequacy claim.

- [x] **Step 2: Preserve populated intake content and coverage.**

Do not change the `intake.kind !== 'empty'` branch: retain recorded energy and nutrient values, units, coverage labels, component counts, and the no-target explanation. Missing values must continue to render exactly as the current presentation helper provides them.

- [x] **Step 3: Compact empty supporting states.**

Keep attention, examinations, and next steps in their current order. Replace long empty explanatory blocks with one concise sentence per section; keep existing populated links, records, examination actions, route targets, and accessibility labels. Filter `record_consumption` from lower `nextActions` because the primary action card already opens that route; keep `complete_profile` represented only by `MissingFieldActions`. Do not repeat either food-entry action in lower sections.

- [x] **Step 4: Make dashboard profile copy explicitly optional.**

Add optional `heading` and `description` string props to `MissingFieldActions`, falling back to the existing heading when omitted. For the dashboard call only, pass a heading and description that explicitly state profile completion is optional and helps tailor profile-specific considerations. Leave the Profile tab call site unchanged so its current copy remains the default.

The component prop contract should be:

```tsx
export function MissingFieldActions({
  fields,
  onOpen,
  tone = "plain",
  heading = "Informasi yang dibutuhkan untuk personalisasi",
  description,
}: {
  fields: readonly string[];
  onOpen: (focus: string) => void;
  tone?: "plain" | "tonal";
  heading?: string;
  description?: string;
});
```

- [x] **Step 5: Run the focused feature checks.**

Run from `carin-app/`:

```bash
pnpm exec eslint components/dashboard/dashboard-screen.tsx components/profile/missing-field-actions.tsx --max-warnings 0
pnpm exec vitest run lib/dashboard/presentation.unit.test.ts
```

Expected: both commands exit 0. These tests guard the unchanged dashboard data semantics and route selection; visual state behavior is verified separately in Task 3.

## Task 3: Verify dashboard states and responsive rendering

**Files:**

- Verify: `carin-app/components/dashboard/dashboard-screen.tsx`
- Verify: `carin-app/components/profile/missing-field-actions.tsx`

- [x] **Step 1: Run app typecheck and lint.**

Run from `carin-app/`:

```bash
pnpm run typecheck
pnpm run lint
```

Expected: lint exits 0. Typecheck should be compared with the known baseline failure at `lib/config.unit.test.ts` importing the absent `resolveApiUrl`; report it if still present and do not broaden this dashboard task to fix it.

- [x] **Step 2: Run unit tests.**

Run from `carin-app/`:

```bash
pnpm run test:unit
```

Expected: dashboard presentation tests pass. Existing unrelated Expo `EventEmitter` initialization failures and the missing `resolveApiUrl` import are baseline issues; record exact results and do not modify unrelated tests or runtime setup.

- [x] **Step 3: Inspect narrow and standard layouts.**

Open the local Expo web app and inspect the dashboard at 320 dp and 390 dp. Confirm the food actions stack at 320 dp, remain side-by-side at 390 dp, the hero wraps without collision, and the summary/supporting sections do not overflow horizontally.

- [x] **Step 4: Inspect enlarged text and dashboard states.**

The browser preview does not expose system text scaling; verify `fontScale > 1.2` through the helper test and record native enlarged-text rendering as unavailable. Inspect the empty state; no populated fixture/account is available, so record that visual review as unavailable. Confirm loading, stale/read, and error/retry presentation still use their existing unchanged branches.

- [x] **Step 5: Compare against the approved visual contract.**

Confirm that the first viewport has a wordmark/date/greeting/mascot hierarchy, primary manual logging followed by secondary photo analysis, and a clearly grouped empty intake summary. Confirm attention and examination use the same summary surface, their empty-state labels remain subordinate to section headings, profile copy says optional, and all styling uses existing semantic tokens. Record screenshots or state any browser/device limitation in the handoff.

## Plan self-review

- **Spec coverage:** Tasks 1–3 cover the brand/greeting hierarchy, action priority, responsive layout, empty-summary visual, shared summary surfaces for attention/examination, secondary empty-state typography, optional profile copy, existing data/routing invariants, accessibility, and the 320/390 dp acceptance checks.
- **Scope:** Dashboard composition, a subtle `ReadState` variant, optional copy override in `MissingFieldActions`, pure UI helpers in `lib/dashboard/layout.ts`, and the agreed surface guidance in `DESIGN.md` are included; API, domain, routes, shared token values, and unrelated screens stay unchanged.
- **Known verification limits:** Typecheck and broader unit suites have pre-existing failures recorded in the implementation history; verify and report them without expanding scope.
- **Placeholder scan:** No TODO/TBD items. Every implementation file, command, responsive threshold, and acceptance behavior is named above.

## Execution record

- `pnpm run lint`: passed.
- `pnpm run typecheck`: blocked by the existing missing `resolveApiUrl` export in `lib/config.unit.test.ts`.
- `pnpm run test:unit`: 34 files passed; 3 unrelated files failed (four `resolveApiUrl` cases and Expo `EventEmitter` initialization); 263 tests passed, 4 failed.
- `pnpm exec vitest run lib/dashboard/layout.unit.test.ts lib/dashboard/presentation.unit.test.ts`: passed, 2 files / 9 tests.
- Browser preview: document width matched viewport at 320 dp and 390 dp; actions stacked at 320 dp and were side-by-side at 390 dp. Populated state and native enlarged-text rendering were unavailable.
- `npx impeccable detect --json carin-app/components/dashboard/dashboard-screen.tsx`: returned `[]`.

### Browser feedback refinement (15 October 2026)

- Preserved the olive and peach action fills per user clarification while reducing action labels to 14 px medium and subtitles to 12 px regular. Dashboard freshness text uses the 12 px caption variant.
- Grouped the attention-window and examination sections into the same summary surface as intake, with no nested cards. Matched their empty-state layout to intake: centered 64 dp butter icon circle, 14 px semibold label, and centered support copy. Made the optional profile action clearer with an icon, optional label, and directional affordance.
- Updated the dashboard spec and `DESIGN.md` surface rule to record this approved summary grouping.
- Browser review at 320 dp, 390 dp, and 575 dp confirmed no horizontal overflow and the intended action reflow. Populated and native enlarged-text states remain unavailable.
- `pnpm run lint`, focused dashboard/layout tests (2 files / 9 tests), Prettier, and `git diff --check` passed. Full typecheck remains blocked by the existing missing `resolveApiUrl` export in `lib/config.unit.test.ts`.
