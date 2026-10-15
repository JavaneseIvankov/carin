# Carin UI Design System Implementation Design

## Goal

Define an implementable visual system for `carin-app/` that turns the approved warm, playful dashboard direction into shared rules for every screen. The system customizes and extends React Native Reusables (RNR), uses one theme-token source, and keeps product patterns separate from data/API behavior. This document defines the implementation contract; it does not claim the target tokens or components have already shipped.

## Existing contracts and decisions

- `carin-app/AGENTS.md` makes `components/ui/` the reusable RNR component layer, `lib/` the home for shared helpers/theme configuration, and route-specific UI local to its route.
- The app uses Expo Router, React Native, NativeWind v4, RNR-style components, `class-variance-authority`, and dark-mode class support.
- Current shared UI primitives are `Button`, `Text`, and `Icon` in `carin-app/components/ui/`. `Button` and `Text` use CVA. There is no shared Card or Input component in that directory yet.
- `carin-app/global.css` currently has a generic teal/neutral theme; `tailwind.config.js` maps standard RNR color roles to CSS variables.
- The dashboard pilot defines a separate light/dark `DASHBOARD_COLORS` palette in `carin-app/lib/dashboard/theme.ts` and uses inline React Native styles. The app tab bar also consumes this palette. The desired end state is one semantic CSS-variable theme, not two coexisting systems.
- The pilot's light muted text (`#747667`) measures 3.42:1 on peach, 3.73:1 on butter, and 3.87:1 on olive-soft. The proposed secondary-text token in this design is darker and has been checked against those pilot tint values.
- MVP product rules remain authoritative: no calorie targets or adequacy claims, disease-risk scores, streaks, unsupported clinical interpretations, invented meal history, or claims that missing data is normal/zero. The two food-entry intents remain distinct: analyze before eating and record food already consumed.
- Accepted visual choices: warm and playful, characterful like Yazio; use the original Carin mascot contextually; RNR is the base to customize; the dashboard is a tone reference, not a component template.

## Design

### System architecture

Dependencies flow in one direction:

```text
Routes and screen composition
  -> Carin product patterns
    -> Carin RNR primitives and variants
      -> Semantic theme tokens
```

`global.css` owns token values for light and dark themes. `tailwind.config.js` maps those variables to semantic NativeWind utilities. RNR primitives consume the utilities and expose supported variants. Product patterns compose those primitives. Screens arrange patterns and connect to feature/data flows.

Do not add API calls, nutrition calculations, or domain decisions to `components/ui/` or visual patterns. Do not put route-specific structure in the shared primitive layer.

### Token contract

The canonical light and dark color values, descriptive names, type scale, spacing, radius, and supported component tokens live in the YAML frontmatter of [`DESIGN.md`](../DESIGN.md). The token set starts from the approved dashboard palette. Secondary text is deliberately darkened in light mode and lightened in dark mode to correct the contrast failures found in the pilot. Treat `DESIGN.md` frontmatter as the sole visual-token source of truth; do not copy color literals into this implementation spec.

Token mapping requirements:

- Keep RNR-compatible roles: `background`, `foreground`, `card`, `card-foreground`, `primary`, `primary-foreground`, `secondary`, `secondary-foreground`, `muted`, `muted-foreground`, `accent`, `accent-foreground`, `destructive`, `border`, `input`, and `ring`.
- Add only reusable Carin surface roles needed by the pilot: `carin-olive-soft`, `carin-butter`, and `carin-peach`. Map each Tailwind color to its CSS variable; do not put literal hex values in `tailwind.config.js` or feature components.
- Use `foreground` for ordinary content and `muted-foreground` for supporting content. Tinted surfaces must use an explicitly contrast-checked text role; opacity alone is not an acceptable way to create readable secondary text.
- Validate normal text at 4.5:1 or better, large text at 3:1 or better, and meaningful control/icon boundaries at 3:1 or better. Test every foreground/background pairing in both themes.
- Keep system error/success/warning semantics distinct from brand accents. Never communicate a state by color alone.

### Type and spacing contract

Use the platform system sans family. Do not add a font dependency for the dashboard refinement. Maintain a compact mobile scale with these roles:

| Role | Size / line height | Weight | Use |
| --- | --- | --- | --- |
| Page heading | 24 / 30 dp | 700–800 | One greeting or screen title |
| Metric | 26 / 32 dp | 700–800 | A single key recorded value, never a goal score |
| Section heading | 18 / 24 dp | 700 | Section starts |
| Body | 14 / 20 dp | 400 | Supporting information and explanations |
| Body emphasis | 16 / 22 dp | 600–700 | Action title or important row value |
| Label | 12 / 16 dp | 600 | Short labels and status |
| Caption | 12 / 16 dp | 400–500 | Coverage, date, and secondary metadata |

Avoid text below 12 dp for essential content. Support system font scaling and wrapping; do not clip labels to preserve a fixed layout.

Use a 4 dp base spacing scale: `1=4`, `2=8`, `3=12`, `4=16`, `5=20`, `6=24`, `8=32`. Mobile screen gutters are 16 dp on narrow widths and 20 dp on standard widths. Use 20 dp between major sections, 12–16 dp inside surfaces, and 8 dp between tightly related rows. Layout must remain readable at 320 dp width.

### Shape and elevation contract

- Control radius: 12 dp. Compact tonal surface: 16 dp. Primary summary surface: 20 dp. Pills are reserved for compact status/filter treatments.
- Default surfaces are flat, distinguished by warm tonal contrast and spacing. No decorative card shadows and no nested cards.
- Use a thin border only when it clarifies an actionable or separated boundary. Do not outline every content group.
- The centered add action may use one soft shadow for affordance. Other content remains tonal and mostly flat.
- Slightly rotated illustration is allowed; rotate buttons or data containers only if their function remains visually stable and easy to tap.

### RNR component contract

| Primitive | Required Carin treatment | States and constraints |
| --- | --- | --- |
| `Button` (existing) | Keep CVA variants: primary/default, secondary, outline, ghost, destructive, link. Tune default touch height to 48 dp; compact/icon actions remain at least 44 dp. Use 12 dp control radius. | Default, pressed, focused (web), disabled, loading. Primary is reserved for the main action; use one primary action per local decision area. Loading retains the label or accessible name. |
| `Text` (existing) | Replace generic RNR display defaults with the Page heading, Section heading, Body, Body emphasis, Label, Caption, and Metric roles above. Add matching heading semantics and heading levels. | Avoid embedding screen-specific margins in text variants. Color is supplied by semantic tokens or explicit semantic classes. |
| `Icon` (existing) | Standard sizes 16, 20, and 24 dp. Use Lucide React Native through the existing wrapper. | Icon-only actions require a 44 dp minimum hit area and a descriptive accessible label. Pair state icons with text. |
| `Card` / Surface (not currently shared) | Add or scaffold an RNR Card primitive only if implementation confirms repeated use across at least three screens. Support `plain`, `tonal`, and `summary` treatments; keep ownership generic. | `summary` is the only prominent surface. `tonal` is for a compact related group. Do not nest or create identical card grids. |
| `Input` (not currently in `components/ui/`) | Adopt the RNR Input component when shared field styling is part of the implementation slice; do not invent a parallel native control. Minimum 48 dp height, 12 dp radius, semantic border/background/text tokens. | Default, focused, invalid, disabled, and accessibility error description. Preserve native keyboard and autofill behavior. |
| App tab bar (existing custom shell) | Keep its navigation behavior and four tabs plus central food-action sheet. Migrate colors/type to tokens; selected state uses both icon treatment and label. | Selected, unselected, focused, sheet expanded. Each tab stays a minimum 44 dp target; the center action stays clearly separate from tabs. |

When adding an RNR component, prefer the installed RNR CLI so primitive dependencies and aliases stay correct. Customize copied RNR source under `components/ui/`; do not fork the library wholesale.

### Carin patterns and screen recipe

Create a product pattern only after the same intent appears in at least three places or a shared behavior needs one testable owner. Initial candidates:

- **Nutrition summary:** one surface for recorded energy and the most relevant macro values, followed by compact supporting rows. It reports recorded intake and coverage only. It never implies daily goals, adequacy, or completion.
- **Nutrient row:** label, value/unit, and optional coverage/source note. Missing values remain explicit and must not render as zero.
- **Empty state:** one short explanation plus one clear next action when a valid action exists. Use the mascot only when it teaches the next step or reassures about an important rule.
- **Contextual action group:** distinct pre-meal photo analysis and already-consumed manual logging. The bottom-center add action opens the same two choices. Avoid adding a third repeated logging CTA lower on the page.
- **Section row:** a heading and optional detail paired with compact content. Use dividers or spacing for supporting sections instead of an outer card by default.

Dashboard composition order: greeting/date and contextual mascot; two food-entry actions; daily intake summary; recurring attention; latest examinations; relevant profile completion steps. Keep the page title as the only level-one heading, section starts as level-two headings, and item titles below those. Empty attention/examination sections collapse to a compact explanation/row rather than full-size shells. Do not remove product-required navigation destinations or either food-entry path.

### Interaction and accessibility contract

- Every interactive component defines default, pressed/active, focused on web, disabled, and loading/error states when relevant. State changes do not depend on animation alone.
- Minimum touch target is 44 by 44 dp. Focus treatment is visible on web and uses the semantic ring token.
- Normal text contrast is 4.5:1 or better; large text and meaningful non-text boundaries are 3:1 or better. Recheck light/dark and tinted surfaces whenever a token changes.
- Use `accessibilityRole="header"` or the appropriate heading role and explicit level for page/section headings. Icon-only controls need labels. Tab selection and expanded action-sheet state are exposed to assistive technology.
- Support Dynamic Type/text scaling and 320 dp layouts without truncating essential values, actions, or coverage context.
- Pair color-coded nutrient/status content with text or labels. Never imply that a warm/green tint means clinically normal or healthy.
- Motion is state feedback only, normally 150–220 ms, with easing out. Respect reduced-motion settings. Do not animate layout geometry or add page-load choreography.

## Implementation seams

1. **Theme foundation:** update `carin-app/global.css` with the approved light/dark CSS variables; extend `tailwind.config.js` with aliases for the three Carin tinted surfaces; add contrast verification for every semantic pair. No screen-specific literals should be added to those files.
2. **RNR foundation:** update `components/ui/button.tsx` and `text.tsx` variants without breaking existing props or call sites; keep `icon.tsx` API stable. Scaffold Card/Input only when actual reuse is confirmed. Run `pnpm exec react-native-reusables doctor` if the installed CLI supports it; otherwise document that the CLI check is unavailable.
3. **Pilot migration:** migrate `components/dashboard/dashboard-screen.tsx`, `components/profile/missing-field-actions.tsx`, and `app/(tabs)/_layout.tsx` from direct palette references to theme classes/shared variants. Remove `lib/dashboard/theme.ts` only after all consumers are migrated. Preserve existing routes, data behavior, and navigation.
4. **Guidance:** keep strategic product context in root `PRODUCT.md`, the visual token/component reference in root `DESIGN.md`, and implementation boundaries here in `specs/06-ui-design-system.md`. Root `.impeccable/design.json` holds panel-only extensions such as shadow/motion data and component previews, not a second source of token values.

## Verification

For the implementation pass, run from `carin-app/`:

```bash
pnpm run typecheck
pnpm run lint
pnpm run test:unit
pnpm run test:integration
```

Also:

- Validate CSS variable names and Tailwind aliases resolve in both light and dark themes.
- Add a deterministic contrast check for all approved text/surface pairs; include the warm tints and dark equivalents.
- Verify heading order, accessible labels, state exposure, and 44 dp targets in the dashboard and tab shell.
- Inspect at 320 dp and a standard 390 dp mobile width with text scaling; confirm no clipped copy or horizontal overflow.
- Manually inspect Expo rendering on the supported device/platform available. Typecheck or web preview alone does not prove native behavior.
- Record visual regressions and unsupported platform/device coverage in the handoff. This design document has not run these implementation checks.

## Approval boundary

The cozy companion direction, mostly-flat tonal surfaces, and warm/tactile controls are user-approved. The exact token table and detailed component rules above are proposed for visual review. Do not treat them as shipped behavior until implemented and verified. Any change to domain claims or nutrition data requires a separate product/data decision.
