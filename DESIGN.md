---
name: Carin
description: A cozy nutrition companion for clear, nonjudgmental food and health records.
colors:
  warm-background: "#F8F5E9"
  paper-surface: "#FFFDF6"
  deep-olive: "#506B35"
  action-ivory: "#FFFDF8"
  forest-ink: "#292D20"
  readable-olive-gray: "#55584B"
  olive-mist: "#E7EDDA"
  soft-butter: "#F5E7A8"
  warm-peach: "#F4D8C5"
  oat-border: "#E6E1D2"
  olive-pressed: "#455D2F"
  muted-surface: "#F0ECDD"
  error-text: "#B42318"
  error-surface: "#FEE4E2"
  error-surface-text: "#912018"
  night-background: "#211F19"
  night-surface: "#2D2A22"
  night-ink: "#F5F0DF"
  night-muted: "#D2CCB8"
  night-olive: "#C0D38E"
  night-olive-soft: "#3A4130"
  night-butter: "#5A5031"
  night-peach: "#533C32"
  night-border: "#494537"
  night-action-ink: "#28261F"
  night-muted-surface: "#3A362D"
  night-error-text: "#FCA5A5"
  night-error-surface: "#482B2B"
typography:
  display:
    fontFamily: "System"
    fontSize: "28px"
    fontWeight: 800
    lineHeight: 1.2
  headline:
    fontFamily: "System"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.25
  title:
    fontFamily: "System"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.33
  metric:
    fontFamily: "System"
    fontSize: "26px"
    fontWeight: 800
    lineHeight: 1.23
  body:
    fontFamily: "System"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "System"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.33
rounded:
  control: "12px"
  compact-surface: "16px"
  summary-surface: "20px"
  pill: "999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "20px"
  6: "24px"
  8: "32px"
components:
  button-primary:
    backgroundColor: "{colors.deep-olive}"
    textColor: "{colors.action-ivory}"
    rounded: "{rounded.control}"
    height: "48px"
    padding: "16px"
  button-secondary:
    backgroundColor: "{colors.warm-peach}"
    textColor: "{colors.forest-ink}"
    rounded: "{rounded.control}"
    height: "48px"
    padding: "16px"
  button-outline:
    backgroundColor: "{colors.warm-background}"
    textColor: "{colors.forest-ink}"
    rounded: "{rounded.control}"
    height: "48px"
    padding: "16px"
  button-destructive:
    backgroundColor: "{colors.error-text}"
    textColor: "{colors.action-ivory}"
    rounded: "{rounded.control}"
    height: "48px"
    padding: "16px"
  input-default:
    backgroundColor: "{colors.paper-surface}"
    textColor: "{colors.forest-ink}"
    rounded: "{rounded.control}"
    height: "48px"
    padding: "12px"
  surface-summary:
    backgroundColor: "{colors.paper-surface}"
    textColor: "{colors.forest-ink}"
    rounded: "{rounded.summary-surface}"
    padding: "16px"
  nutrient-row:
    backgroundColor: "{colors.paper-surface}"
    textColor: "{colors.forest-ink}"
    height: "46px"
    padding: "8px"
  tab-selected:
    backgroundColor: "{colors.olive-mist}"
    textColor: "{colors.deep-olive}"
    rounded: "{rounded.compact-surface}"
    height: "44px"
    padding: "8px"
---

# Design System: Carin

## 1. Overview

**Creative North Star: "The Cozy Nutrition Companion"**

Carin feels like a friendly food journal with the steady clarity of a trusted companion. The approved warm cream, earthy olive, butter, and peach palette carries a playful personality, while clear data labels and restrained hierarchy keep nutrition information credible. The scene is a person logging a meal at home or between daily activities, often on a phone in ordinary daylight, looking for a quick, reassuring next step rather than a clinical verdict.

This is a product interface, so familiar controls and predictable navigation take priority over novelty. Personality belongs in a thoughtful greeting, purposeful illustration, warm surfaces, and clear micro-feedback. The system rejects unsupported goal dashboards, judgmental copy, generic nested-card stacks, and decorative mascot repetition.

**Key Characteristics:**
- Warm, tactile interactions with legible, predictable controls.
- Playful cues used at useful moments, not on every component.
- Data-first summaries that state coverage and missing information.
- Tonal, mostly flat surfaces with minimal shadow.

**The One Useful Accent Rule.** Strong olive is reserved for primary actions, current navigation, and meaningful emphasis. Butter and peach signal warmth or grouping, never clinical status.

## 2. Colors

The palette grows from oat-like cream and paper, anchored by a deep garden olive. Butter, peach, and olive mist add character in small, purposeful groups. Dark mode keeps the same warm temperature instead of inverting to pure black or white. The frontmatter is the normative token table; these prose names describe how to use those values.

**Color Strategy: Full Palette.** Olive carries interaction and selection. Butter, peach, and olive mist are limited to grouped or contextual surfaces, with ink chosen for contrast.

### Primary
- **Deep garden olive:** Main actions, selected navigation, and important links. Use ivory action text on the olive action surface.

### Secondary
- **Soft peach:** Secondary food-entry action and warm informational grouping. Use primary ink for labels and descriptions.
- **Quiet butter:** A small highlight surface for a helpful detail or recurring-attention item, never a success/healthy status.
- **Olive mist:** Low-emphasis selection or grouped supporting details. Do not use it as the only status signal.

### Neutral
- **Warm oat:** Main page background.
- **Paper:** Content surface for the primary summary and focused groups.
- **Forest ink:** Main text and high-emphasis icons.
- **Readable olive-gray:** Secondary text. It is dark enough to remain readable across the light tinted surfaces.
- **Oat border:** Quiet separators and actionable outlines.
- **Night neutral family:** Dark background, surface, text, muted text, accent tints, and borders. Use the corresponding night tokens together; do not mix light and dark roles on the same screen.

**The Contrast Pair Rule.** Every text/surface pairing must meet WCAG AA. Normal text uses 4.5:1 or better, large text uses 3:1 or better. Test the peach, butter, and olive-mist combinations directly, not just the page background.

The proposed readable olive-gray measures 6.67:1 on warm oat, 6.08:1 on olive mist, 5.85:1 on butter, and 5.37:1 on peach. The night muted text measures at least 4.98:1 across the night tinted surfaces. Ivory text on the primary olive action measures 5.91:1. These checks apply to the seed palette and must be repeated after implementation.

## 3. Typography

**Display Font:** Platform system sans (`System`, with the native system fallback)

**Body Font:** The same platform system sans

**Label/Mono Font:** No separate label or mono family

**Character:** Friendly and clear, with a compact mobile hierarchy. Weight and size distinguish section structure; decorative type does not compete with food or measurement values.

### Hierarchy
- **Display:** Extra-bold page greeting or a rare first-run moment. Do not use for repeated metrics.
- **Headline:** Bold screen title and the page's only level-one heading.
- **Title:** Bold section heading, exposed as a level-two heading.
- **Metric:** Extra-bold recorded value, paired with its label and unit.
- **Body:** Regular explanatory copy and user-provided details.
- **Label:** Semibold short labels, status text, and action subtitles.
- **Caption:** Compact dates, coverage, and supporting metadata. Essential content never falls below 12 px.

**The One Page Heading Rule.** Each screen has one level-one heading. Sections follow a navigable heading order, even when the native layout uses custom text components.

## 4. Elevation

Carin uses tonal layering rather than a shadow stack. Page background, paper surface, and tinted groups establish depth. Most surfaces are flat. A single soft shadow may mark the central add action because it floats above the tab bar; it is not a decorative treatment for content cards.

**The Flat Content Rule.** Do not add shadows to summary, attention, or examination content. Do not nest a surface inside another surface unless a distinct interaction boundary requires it.

## 5. Components

Interactive elements feel warm and tactile through shape, clear pressed feedback, and adequate touch areas. They retain standard platform behavior and semantic names.

### Buttons
- **Primary:** Deep olive with ivory text. Use for the main action in a decision area.
- **Secondary:** Warm peach with forest-ink text. Use for a distinct secondary intent, not as a competing primary.
- **Outline / Ghost / Link:** Use for lower-priority actions and navigation; retain clear focus and pressed feedback.
- **Destructive:** Use only for destructive actions and pair the color with explicit wording.
- **Shape and target:** Gently curved controls with the control radius from the token table. All touch actions have a minimum 44 dp target; standard buttons use the larger height in the token table.
- **States:** Default, pressed, focus-visible on web, disabled, and loading. Loading must keep an accessible name.

### Text and icons
- Use the text hierarchy above through the shared RNR `Text` variants. Variants must not add screen-specific margins.
- Use the existing Lucide-based RNR `Icon` wrapper at consistent 16, 20, or 24 dp sizes. Icon-only actions need a 44 dp hit area and an accessible label.
- Pair icons with labels when meaning or status would otherwise be ambiguous.

### Cards and surfaces
- Keep three treatments: plain section, compact tonal group, and primary summary surface. Use the summary treatment once per screen at most.
- Use section headings and dividers before adding another outer container. Nested cards and identical card grids are prohibited.
- Empty sections use concise copy and a next action only where one exists. Use the mascot only when it explains a next step or provides relevant reassurance.

### Inputs and fields
- Use the RNR Input foundation when adopted in implementation. Keep a warm neutral field surface, a visible semantic border, and the shared control radius.
- Provide default, focused, invalid, and disabled treatments. Associate errors with text and preserve native keyboard, autofill, and accessibility behavior.

### Navigation
- Keep four labeled tabs: Beranda, Riwayat, Pemeriksaan, and Profil. The central add control opens the two supported food-entry actions and is not itself a fifth tab.
- Selected tabs use both an icon treatment and a readable label. Each tab and the center add control meet the minimum target size.

### Nutrition summary
- Show recorded values and coverage, with units and missing values explicit. Do not add target rings, remaining/burned calories, adequacy claims, or scores.
- Supporting nutrients use compact rows with dividers. Accent color groups information; it does not imply a health judgment.

## 6. Do's and Don'ts

### Do:
- **Do** use the warm page, paper surface, and olive action tokens consistently in light and dark themes.
- **Do** use secondary-text tokens for supporting information and verify their contrast on every tinted surface.
- **Do** keep the two food-entry intents explicit: photo analysis before eating and manual entry after eating.
- **Do** use spacing, type, and dividers to organize supporting sections before adding a card.
- **Do** show source, units, coverage, and missing values whenever the contract provides them.
- **Do** use the mascot for guidance or reassurance that is relevant to the current state.
- **Do** preserve system text scaling, semantic headings, focus states, and at least 44 dp touch targets.

### Don't:
- **Don't** add unsupported calorie targets, adequacy rings, scores, streaks, disease-risk interpretations, or invented meal rows.
- **Don't** let missing data appear as zero, normal, or completed.
- **Don't** stack repeated rounded cards or nest cards inside cards.
- **Don't** put a tinted icon tile beside every heading or repeat the mascot as decoration.
- **Don't** use color alone to communicate a nutrient state or clinical meaning.
- **Don't** use text below 12 px for essential copy or reduce hit targets below 44 dp.
- **Don't** add decorative motion, layout animation, or pure page-load choreography.
