# Carin UI Design System — Design

**Status:** Draft for user review  
**Date:** 2026-10-14  
**Scope:** Mobile UI foundation for `carin-app/`, based on Expo, React Native, NativeWind v4, and React Native Reusables (RNR).

## Problem and goal

The dashboard pilot establishes a warmer, more playful visual direction for Carin, but its custom palette and screen-level styling currently sit beside the existing RNR theme. If the same approach spreads screen by screen, color values, contrast, card treatments, and interaction states will drift. The goal is to establish one adaptable design system that preserves the approved Carin character while making future screen work consistent, accessible, and straightforward to delegate.

The design system is a product layer over RNR. RNR components are intended to be modified and extended for Carin; their current styles are a starting point, not a visual constraint. The system will keep a single source of truth for tokens and avoid building abstractions without repeated product need.

## Accepted product direction

- Warm, approachable colors and patterns, with a playful and recognizable character inspired by the energy of Yazio.
- The Carin mascot is used with intent, such as contextual guidance or a useful empty state, rather than as decoration on every screen.
- React Native Reusables is the component foundation.
- Carin must communicate only information supported by the product contracts and approved domain rules. Do not introduce unsupported calorie targets, calorie adequacy claims, scores, streaks, clinical interpretations, or invented meal data to imitate references.
- Dashboard pilot is the tone and personality reference, not a screen template to copy wholesale.

## Architecture

The system has four layers with one-way dependencies:

```text
Screen composition
       ↓
Carin product patterns
       ↓
Carin RNR components and variants
       ↓
Semantic theme tokens
```

### 1. Semantic theme tokens

`carin-app/global.css` is the canonical source of CSS variable values for light and dark themes. Tokens describe roles rather than particular screens or raw palette names. Core roles include page background, surface, raised surface, primary text, secondary text, border, primary/secondary action, accent, and status colors. Add domain accent tokens only when they communicate a stable meaning across multiple product surfaces.

`carin-app/tailwind.config.js` maps those variables to NativeWind utility classes. It should not duplicate literal color values. Existing standard semantic aliases remain the default vocabulary; any additions must map to variables in `global.css`.

Dashboard-specific hex colors in `carin-app/lib/dashboard/theme.ts` are not a second theme. During implementation, migrate reusable palette roles into global tokens, replace direct values with semantic classes where practical, and remove the dashboard palette after its remaining consumers are migrated. Preserve separate light and dark values through the canonical theme.

All token pairs used for normal text must meet WCAG AA contrast (4.5:1); large text and non-text controls follow applicable contrast requirements. Palette changes must be checked in both themes and on tinted surfaces, not only against the page background.

### 2. Carin RNR components and variants

`carin-app/components/ui/` remains the home for reusable primitives based on RNR. Existing components such as `Button` and `Text` may be restyled and extended to expose Carin's semantic variants. Add or adapt a primitive only when a shared need exists. Keep component APIs explicit and small, preserve RNR's accessibility and interaction behavior, and follow the installed RNR conventions (`className`, NativeWind, CVA variants, and `TextClassContext`).

Likely variants include action hierarchy for buttons and text roles for page titles, section headings, body, labels, and captions. The exact component and variant inventory is part of implementation planning and should be driven by repeated usage. Avoid wrapping every RNR primitive in a Carin component without a concrete benefit.

### 3. Carin product patterns

Product patterns compose primitives into repeated Carin-specific structures. Initial candidates are a nutrition summary, nutrient data rows, contextual action group, compact empty state, and an informative mascot hint. These patterns contain presentation and accessibility composition only; they do not own API requests, domain calculations, or unsupported health claims. Put them in a product-level component area (for example, `components/patterns/`) only when at least two screens or flows need them. Screen-specific structures stay near their route.

### 4. Screen composition and recipes

Screens own layout, content ordering, navigation, and connection to data. They select established tokens, components, and patterns; they should not define parallel palette constants or bespoke variants that are likely to recur. The design guide will include a dashboard recipe as the first reference for hierarchy, surfaces, section spacing, empty states, mascot placement, and accessibility semantics.

## Visual principles

- **Warm but legible:** use cream and earthy neutrals for the base; reserve stronger olive and warm accents for clear actions or meaningful emphasis. Accent surfaces require text colors chosen for contrast, not merely palette harmony.
- **Playful with purpose:** personality comes from typography, illustration, small moments of feedback, and contextual mascot use. It should not compete with nutritional information or turn every section into a decorative card.
- **Hierarchy over containers:** use spacing, type, and dividers to group supporting information. Reserve prominent surfaces for content that needs emphasis; avoid repeated nested card shells.
- **Clear action hierarchy:** distinguish primary, secondary, and utility actions. Keep the two food-entry intents clear, while making the central add affordance's relationship to those routes predictable.
- **Data honesty:** show coverage, uncertainty, source, and absence according to the existing product contracts. Empty or unavailable data must not imply zero, normal, or completion.

## Accessibility and behavior

- Use semantic headings with a sensible page/section order and descriptive accessible names for icon-only controls.
- Maintain platform-appropriate touch targets, visible focus/pressed/disabled states, and readable content when text scales or wraps on narrow screens.
- Pair status colors with text, iconography, or labels; never rely on color alone.
- Respect reduced-motion preferences and use motion only when it clarifies feedback or state changes.
- Verify token contrast in both themes and with every supported surface treatment.

## Ownership and boundaries

- Theme tokens are shared by all `carin-app` routes and components.
- `components/ui/` contains generic RNR-derived primitives and visual variants, not product data behavior.
- Product patterns compose primitives and remain independent of API/domain logic.
- Routes/screens arrange content and connect to existing feature/data flows.
- References such as Yazio, Lifesum, Alma, Noom, and MacroFactor are inspiration for hierarchy and interaction patterns only; no visual identity or unsupported product behavior is copied.

## Non-goals

- Rewriting application navigation, API contracts, domain rules, or feature behavior as part of defining the design system.
- Redesigning every screen before the dashboard recipe is validated.
- Replacing RNR with another component library.
- Creating a large generic design-system package or component catalog before actual reuse demonstrates a need.
- Introducing new health metrics, user goals, scores, streaks, meal records, or hydration features without product and data approval.

## Delivery and validation criteria

The design system is established when:

1. A reviewed guide documents the visual principles, semantic tokens, component boundaries, accessibility rules, and dashboard recipe.
2. One token source in `global.css` defines light and dark theme values, and Tailwind classes map to it without duplicated literal values.
3. RNR component customization guidance explains how to modify/extend existing primitives while preserving their behavior and keeping APIs small.
4. The dashboard can be expressed using those shared tokens and selected RNR variants without its own independent palette.
5. Text contrast passes WCAG AA for normal text on every approved surface, including tinted accents, in light and dark themes.
6. A later implementation pass verifies narrow layouts, text scaling, semantic heading navigation, action states, and the Expo app on supported target platforms.

This design document does not claim criteria 2–6 are already implemented or validated. They are design/implementation acceptance criteria.

## Implementation handoff boundary

After this document is reviewed and approved, create a separate implementation plan. The first implementation slice should establish canonical theme tokens and RNR variants, then migrate the dashboard pilot to those shared foundations. Only after that foundation and dashboard recipe are validated should independent screen refinements be delegated to subagents.
