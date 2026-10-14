# Dashboard Visual Refinement

Status: approved and implemented on 15 October 2026; verification and platform limitations are recorded in the implementation plan.

## Goal

Restore the composition and personality of the approved `playful-empty-check`
dashboard mockup while keeping the semantic color tokens, React Native Reusables
(RNR) primitives, accessible behavior, and product rules in
[`06-ui-design-system.md`](06-ui-design-system.md). The dashboard should feel
warm and characterful at first glance, then make today's recorded intake and the
next useful action easy to understand.

This is a screen-composition refinement. It does not change API contracts,
nutrition calculations, routes, dashboard response data, or the global token
palette. `DESIGN.md` and `06-ui-design-system.md` remain the source of truth for
tokens and shared component behavior.

## Reference and diagnosis

Use the `playful-empty-check` mockup selected by the user as the composition
reference: a compact brand header, a greeting paired with a contextual mascot,
two side-by-side food-entry actions, an illustrated empty intake summary, and
quieter supporting sections below. Do not use the separate live screenshot with
stacked actions as the target.

The post-migration dashboard has readable tokens and fewer nested surfaces, but
its emphasis is too even. The largest visual issues are that photo analysis is
the strongest action despite not recording intake, the food-entry actions are
stacked, the empty summary is mostly copy, and empty supporting sections take
too much visual weight. The refinement restores purposeful grouping and playful
illustration without reintroducing nested card shells.

## Screen composition

1. **Brand header.** Place the Carin wordmark on the left and the existing
   profile/navigation affordance on the right when the current app shell
   provides one. Keep this row quiet and compact. Do not add a new destination
   or duplicate the tab bar's profile navigation.
2. **Greeting hero.** Show the localized dashboard date as a short eyebrow,
   one friendly greeting, and one concise supporting sentence. Pair the copy
   with the existing mascot at a smaller scale than the current 104 dp tile.
   Use the mascot as a contextual guide to the two food-entry paths, not as a
   large decorative card. When records exist, keep the greeting but reduce the
   illustration's visual emphasis.
3. **Food-entry actions.** Show two equal-width action cards side by side at
   standard widths: `Catat makanan` (already consumed) and `Analisis foto`
   (before eating). The consumed-food action is visually primary on the empty
   dashboard because it creates the record represented by the intake summary;
   photo analysis remains immediately available as a distinct secondary path.
   Preserve the approved olive and peach action surfaces, but reduce the label
   typography to body-sized medium weight so the actions feel less shouty.
   Each action uses the existing RNR `Button` variant, visible subtitle,
   minimum 44 dp hit target, and existing route.
   Do not repeat either route as another prominent call to action lower down.
4. **Today's intake summary.** Use one `summary` surface with stronger tonal
   distinction than supporting sections. In the empty state, add a compact,
   friendly food/plate illustration or existing visual asset, a short message,
   and an explicit note that photo analysis enters intake only after
   consumption is confirmed. Do not show `0 kcal`, a daily target, a progress
   ring, or completion language. In the populated state, preserve the current
   recorded values, units, coverage, and no-target explanation; do not change
   nutrition semantics in this visual pass.
5. **Supporting sections.** Keep recurring attention, latest examinations,
   and next steps available in their existing order and routes. Put the
   attention-window and examination sections in the same summary surface used
   by today's intake, including their headings and date detail. Keep content
   inside these surfaces simple, without nested cards. Format each empty state
   like the intake empty state: a centered 64 dp butter icon circle, a centered
   14 px semibold label, and concise centered support copy. Make the
   optional profile step an expressive, clearly labeled action card that
   explains its benefit without implying a diagnosis or prerequisite. Retain
   populated records and actions without turning all supporting sections into
   a generic card grid.
6. **Read timestamp.** Keep the dashboard's freshness/stale state visible but
   visually secondary to the greeting, entry actions, and intake summary.

## Responsive and accessibility behavior

- Use a 16 dp page gutter below 360 dp and 20 dp at standard widths, following
  the existing design-system rule.
- Keep the two action cards side by side when each can retain its label and a
  comfortable tap target. At widths below 360 dp, or when enlarged text no
  longer fits, stack them in the same priority order instead of clipping or
  shrinking essential text.
- Allow the greeting and action labels to wrap. The mascot yields space before
  text, action labels, values, or coverage context are truncated.
- Preserve a single level-one heading and level-two section headings, expose
  action purpose in accessible labels, and retain at least 44 dp touch targets.
- Check the empty and populated states at 320 dp and 390 dp, with default and
  enlarged text. Confirm there is no horizontal overflow or collision with the
  safe area, connectivity indicator, or bottom tab bar.

## Visual contract

- Read color values only through the approved semantic tokens in `DESIGN.md`
  and NativeWind aliases. No dashboard-specific hex values.
- Use olive for the consumed-food primary action, peach/tonal styling for photo
  analysis, paper for the main summary, and restrained butter/olive-mist accents
  for illustration or contextual grouping. Tints never communicate health or
  success status.
- Keep content surfaces flat and avoid nested cards. The intake summary is the
  only prominent surface; action cards may use distinct semantic button
  variants, not additional card wrappers.
- Keep display hierarchy deliberate: one greeting, one summary anchor, then
  compact section headings and supporting rows. Avoid adding slogans, streaks,
  score indicators, or unapproved nutrition claims.

## Data and state invariants

- Preserve loading, stale/read state, retry/error state, empty state, and
  populated state behavior.
- Missing nutrition remains missing; it is not converted to zero.
- A photo-analysis result does not contribute to intake until the user confirms
  consumption.
- Keep all current API data, attention links, examinations, profile-field
  actions, and route targets. This spec changes their visual hierarchy only.
- Health profile completion is optional and must not appear as a blocker for
  general analysis, food logging, or examination recording.

## Acceptance criteria

1. The first viewport follows the approved mockup's sequence: brand/greeting
   hero, side-by-side food actions where space permits, and a clearly grouped
   intake summary.
2. On an empty dashboard, `Catat makanan` is the primary food-entry action and
   `Analisis foto` remains clearly available with its before-eating intent.
   Their approved olive and peach surfaces remain; body-sized medium labels
   reduce typographic intensity.
3. The empty intake summary feels visually intentional and explains the
   confirmation boundary without implying zero intake, targets, or adequacy.
4. The attention-window and examination sections share the intake summary's
   surface, with no nested cards. The optional profile action is expressive
   without repeating a generic card-grid pattern. Populated records and
   actions retain their behavior.
5. The dashboard timestamp is readable but subordinate.
6. Profile completion is explicitly optional.
7. At 320 dp and 390 dp, and with enlarged text, content wraps or reflows without
   clipping, horizontal scrolling, lost actions, or targets below 44 dp.
8. All color and component styling uses approved tokens and RNR primitives;
   no new global palette or duplicate entry route is introduced.
9. Existing loading, retry, stale-data, populated intake, attention,
   examination, and profile-action states remain intact.

## Scope boundary

Implementation may change dashboard layout, copy, responsive rules, and local
illustrative treatment. It must not add dependencies, alter shared token values,
change route/data contracts, add new business rules, or modify unrelated screens.
Any proposal to change nutrition coverage display or data semantics requires a
separate product decision.

## Review and verification

This document records the approved composition contract. Verify the changed
dashboard with existing app checks and a visual review at the specified widths
and states; report any platform/device coverage that is not available.

## Phase 2 Audit & Refinement: Tactile Depth, Organic Playfulness, and Populated Macro Grid

### Audit Diagnosis of Current Dev Implementation (Commit `4bd681f2f3`)

1. **What has succeeded:**
   - Softened button typography: action buttons use readable medium-weight body copy (`text-sm font-medium` with `text-xs font-normal` subtitles) rather than shouty heavy fonts.
   - Surface unification: "Perhatian 7 hari" and "Pemeriksaan terakhir" share the single summary surface (`rounded-summary bg-card p-4`) alongside "Asupan hari ini", eliminating nested card shells.
   - Empty state consistency: supporting sections follow the intake empty-state format (64 dp butter icon circle, 14 px semibold title, centered muted copy).
   - Domain rules intact: consumed food remains primary on empty dashboard, photo analysis indicates pre-meal intent, health profile completion is visibly optional, and no zero-calorie or target goals are introduced.

2. **Remaining Gaps against the Playful Mockup (`carin-dashboard-playful.html`):**
   - **Mascot & Organic Silhouettes:** The mascot tile in the greeting hero is a standard circular avatar (`rounded-full` 88 dp). In the mockup, it sits in an organic, asymmetrical pebble patch (`border-radius: 55% 45% 44% 56% / 44% 59% 41% 56%` ~112 dp) with the mascot slightly overflowing and tilted at `-6deg`, creating warm character rather than a plain badge. Similarly, the empty-state food mark is a rigid circle rather than a playful pebble (`25px 31px 23px 29px`).
   - **Tactile 3D Bevel & Icon Badges on Food Actions:** In the mockup, the two action cards (`Catat makanan` & `Analisis foto`) have physical tactile depth via a 3D bottom bevel (`box-shadow: 0 4px 0 [dark-tint]`), rounded squircle corners (~20-23 dp), and structured icon badge boxes (31x31 dp, radius 10 dp, translucent tint). Currently, they use standard flat 12 dp controls without tactile depth or icon badges.
   - **Populated Intake Macro Grid:** When consumption records exist, the mockup renders a prominent energy figure (46 dp bold) paired with a 3-column horizontal grid of soft sage cards (`bg-carin-olive-soft`, radius 14 dp) for Carbohydrate, Protein, and Fat, followed by an accordion for micro-nutrients (Fiber, Sugar, Sodium). The current app renders all nutrients as a generic vertical list of rows with top borders, which feels rigid like a spreadsheet.
   - **Tab Bar & Shell Polish:** The bottom tab bar currently renders with `bg-background` instead of `bg-card` (`--carin-paper`), creating an unintentional seam against the screen background.

### Refinement Blueprint & Visual Architecture

```text
Dashboard Screen
  ├── Brand Header (Carin wordmark + subtle Sprout icon)
  ├── Localized Date & Greeting Hero
  │     ├── Greeting Text (H1 + warm supporting copy)
  │     └── Mascot Patch (Asymmetrical butter pebble + tilted mascot at -6°)
  ├── ReadState / Connectivity Freshness
  ├── Side-by-Side Food Entry Actions (Tactile 3D cards)
  │     ├── "Catat makanan" (Primary olive surface, bottom tactile bevel, icon badge)
  │     └── "Analisis foto" (Secondary peach surface, bottom tactile bevel, icon badge)
  ├── Today's Intake Summary Surface (`rounded-summary bg-card p-4`)
  │     ├── Empty State: Asymmetrical butter pebble + Utensils icon + clear confirmation note
  │     └── Populated State:
  │           ├── Big Energy Metric (46 dp) + Component coverage note
  │           ├── 3-Column Macro Cards (`bg-carin-olive-soft`, 14 dp radius): Karbohidrat, Protein, Lemak
  │           └── Collapsible/Accordion Micro-Nutrients: Serat, Gula, Natrium table
  ├── Supporting Sections (Unified card surface, flat list or playful empty state)
  │     ├── "Perhatian 7 hari" (Window detail, linked records or empty state)
  │     └── "Pemeriksaan terakhir" (Exam rows or empty state CTA)
  ├── Next Action Banner (Tonal soft-olive surface, optional profile step)
  └── Timestamp Footer
```

### Component & Token Mapping Requirements

1. **Action Buttons Tactility:**
   - Primary `Catat makanan`: Olive background (`bg-primary`), bottom bevel border (`border-b-4 border-[#33451f]` in light mode / `#151d0c` in dark mode), rounded 20 dp, icon badge container (32x32 dp, radius 10 dp, `bg-white/15`).
   - Secondary `Analisis foto`: Peach background (`bg-secondary`), bottom bevel border (`border-b-4 border-[#e2b899]` in light mode / `#241b14` in dark mode), rounded 20 dp, icon badge container (32x32 dp, radius 10 dp, `bg-foreground/10`).
   - Active press state: translates downward by 2 dp to simulate physical click.
   - Responsive behavior: remains side-by-side at >=360 dp; reflows to stacked with full width when width <360 dp or `fontScale > 1.15`.

2. **Mascot & Organic Pebble Shapes:**
   - Greeting mascot patch: butter background (`bg-carin-butter`), organic rounded corners (`borderTopLeftRadius: 50, borderTopRightRadius: 40, borderBottomRightRadius: 42, borderBottomLeftRadius: 52`), size ~104x104 dp. Mascot image positioned with slight overflow and `transform: [{ rotate: '-6deg' }]`.
   - Empty state icon mark: butter background (`bg-carin-butter`), size 68x68 dp, organic rounded corners (`borderTopLeftRadius: 25, borderTopRightRadius: 31, borderBottomRightRadius: 23, borderBottomLeftRadius: 29`), Lucide `Utensils` icon in primary olive.

3. **Populated Intake Macro Grid:**
   - 3-column grid (`flex-row gap-2`) for Karbohidrat, Protein, and Lemak.
   - Each macro item sits in a `bg-carin-olive-soft` tile with 14 dp radius and 10 dp padding:
     - Label: 11 px muted (`text-muted-foreground`)
     - Value: 18 px bold (`font-bold text-foreground`)
     - Coverage: 11 px muted ("X dari Y komponen")
   - Secondary nutrients (Serat, Gula, Natrium) collapsed in a clean expandable disclosure (`Pressable` toggle) with 44 dp touch target, revealing tabular rows with explicit coverage and missing-data notes.
   - Energy metric: prominent 46 px bold text with "kkal" unit and coverage context; no targets or progress bars.

4. **Tab Bar Surface:**
   - Tab bar container uses `bg-card` (or `--carin-paper`) to create a cohesive floating feel above `bg-background`.

### Acceptance Criteria for Phase 2

1. **Tactile Buttons:** Both food-entry buttons feature a distinct 3D bottom bevel, rounded 20 dp corners, and icon badge boxes while preserving the approved olive and peach color tokens and accessible >=44 dp touch heights.
2. **Organic Mascot & Empty Marks:** The mascot in the greeting hero and the empty-state food mark use asymmetrical organic pebble radiuses, and the mascot has a playful -6° tilt.
3. **Populated Macro Presentation:** On dashboards with recorded intake, the three macronutrients (Carbs, Protein, Fat) render in a 3-column soft-sage grid, and micro-nutrients are organized cleanly without cluttering the first viewport.
4. **Domain & Data Invariants:** No zero calories, daily targets, completion scores, or streaks are introduced. Missing nutrition remains explicitly stated. Photo analysis boundary copy remains clear.
5. **Responsiveness & Accessibility:** Layout reflows cleanly without horizontal overflow at 320 dp and 390 dp, and with Dynamic Type scaling.
6. **Codebase Health:** Clean typecheck and unit tests passing in `carin-app/`.

