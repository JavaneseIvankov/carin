# Carin All-Pages Visual & UX Refinement Specification

Status: Draft for orchestration across all application screens.

## 1. Goal

Elevate every screen in `carin-app` from the early scaffolding/vibecode state to the approved brand design system: **The Cozy Nutrition Companion** (warm, playful, Yazio-inspired, characterful, non-judgmental, flat tonal surfaces, tactile controls, and accessible RNR primitives).

## 2. Core Visual Principles Across All Pages

1. **Surfaces & Elevation**:
   - Background canvas: oat cream (`bg-background` / `#F8F5E9`).
   - Content containers: warm paper surfaces (`bg-card` / `#FFFDF6`), rounded 16–20 dp (`rounded-compact` or `rounded-summary`), mostly flat with subtle tonal distinction. Avoid harsh dark borders around every element.
   - Tinted supporting sections: soft sage (`bg-carin-olive-soft` / `#E7EDDA`) and soft butter (`bg-carin-butter` / `#F5E7A8`).
2. **Tactile Controls**:
   - Primary action buttons: garden olive (`bg-primary`), 3D physical bottom-bevel (`border-b-4 border-[#33451f]`), squircle radius 20 dp (`rounded-[20px]`), and press translateY feedback.
   - Secondary action buttons: warm peach (`bg-secondary`), 3D physical bottom-bevel (`border-b-4 border-[#e2b899]`), squircle radius 20 dp.
   - Segment/tab pickers: soft pill wrappers (`rounded-full bg-carin-olive-soft`) rather than stark boxed borders.
3. **Playful Empty States**:
   - Centered 68 dp asymmetrical butter pebble mark (`bg-carin-butter`, radii `25px 31px 23px 29px`) enclosing a themed Lucide icon in primary olive.
   - Friendly 16–18 px bold title + concise supportive description + optional tactile action button.
4. **Forms & Input**:
   - `FormField`: inputs rendered on paper surface (`bg-card`), `rounded-control` (12 dp), clean thin border `border-border`, 48 dp height, clear unit labels.
5. **Nutrition & Health Data Invariants**:
   - Missing nutrition is explicitly stated as "Belum tersedia", never converted to zero.
   - No calorie goals, target rings, completion percentages, disease-risk scores, or streaks.
   - Health profile is explicitly optional.
   - Photo analysis remains distinct from consumption (pre-meal vs confirmed intake).

---

## 3. Work Streams & Scope Breakdown

### Stream 1: Tab Navigation Suite
- **Files**:
  - `carin-app/app/(tabs)/history.tsx`
  - `carin-app/app/(tabs)/exams.tsx`
  - `carin-app/app/(tabs)/profile.tsx`
  - `carin-app/app/settings.tsx`
  - `carin-app/app/account/delete.tsx`
- **Key Enhancements**:
  - Segmented control in History (Konsumsi vs Analisis): pill-style toggle container (`bg-card p-1 rounded-full border border-border`), active tab with soft sage or olive highlight.
  - History cards: flat tonal cards (`rounded-summary bg-card p-4`), clear provenance tags (Manual vs Foto), attention summary chips.
  - History & Exams empty states: asymmetrical butter pebble mark with `Utensils` / `CalendarDays` / `FlaskConical` icon.
  - Exam filter chips: horizontal scrolling pill chips with smooth selection states.
  - Profile screen: warm profile header with avatar initials/icon, optional badges (`bg-carin-olive-soft`), flat card sections without cluttered borders.

### Stream 2: Food Camera & AI Analysis Suite
- **Files**:
  - `carin-app/app/food/capture.tsx`
  - `carin-app/app/food/analysis/[id].tsx`
  - `carin-app/app/food/correction/[id].tsx`
  - `carin-app/components/food/component-portion-editor.tsx`
  - `carin-app/components/food/scan-deletion-control.tsx`
- **Key Enhancements**:
  - Capture screen: friendly hero instructions, preview image container with rounded 20 dp corners, tactile camera/gallery buttons with icon badges.
  - Analysis loading / polling screen: friendly stage progress cards with clear status explanations.
  - Analysis result screen: prominent food summary, macro nutrient cards (`bg-carin-olive-soft`), attention banner with clear rationale, non-judgmental wording, tactile `Sudah dikonsumsi` and `Koreksi komponen` actions.
  - Portion editor: clean catalog selection chips, intuitive quantity stepper/input with visible units.

### Stream 3: Manual Food Logging & Consumption Detail Suite
- **Files**:
  - `carin-app/app/consumptions/new.tsx`
  - `carin-app/components/consumptions/consumption-form.tsx`
  - `carin-app/components/consumptions/food-editor.tsx`
  - `carin-app/app/consumptions/[id].tsx`
  - `carin-app/components/consumptions/consumption-detail.tsx`
  - `carin-app/app/consumptions/[id]/edit.tsx`
  - `carin-app/app/consumptions/from-scan/[scanId].tsx`
- **Key Enhancements**:
  - Manual consumption form: warm step cards, clean food component item cards with remove/edit affordances, tactile "Simpan catatan" button.
  - Consumption detail view: hero card with energy metric, 3-column macro cards, list of consumed components, timestamp and timezone clarity, tactile edit/delete controls.
  - Confirm consumption from scan: seamless transition from photo result to confirmed portion and intake recording.

### Stream 4: Health Examination Forms & Auth Suite
- **Files**:
  - `carin-app/app/exams/new.tsx`
  - `carin-app/components/exams/ExaminationForm.tsx`
  - `carin-app/app/exams/[id].tsx`
  - `carin-app/app/exams/[id]/edit.tsx`
  - `carin-app/components/exams/ExaminationSeriesChart.tsx`
  - `carin-app/app/(onboarding)/health-profile.tsx`
  - `carin-app/components/profile/choice-field.tsx`
  - `carin-app/components/app/form-field.tsx`
  - `carin-app/app/(auth)/sign-in.tsx`
  - `carin-app/app/(auth)/sign-up.tsx`
  - `carin-app/app/(auth)/forgot-password.tsx`
  - `carin-app/app/(auth)/reset-password.tsx`
- **Key Enhancements**:
  - `FormField` primitive updated: `bg-card`, 12 dp control radius, clean border.
  - Exam form: structured inputs with unit badges and context selector pill buttons.
  - Exam detail & chart: clean tonal chart card, series comparison without misleading clinical thresholds.
  - Health profile onboarding: welcoming mascot card, clear "Profil bersifat opsional" reassurance, clean choice-field chips.
  - Auth screens: compact brand header with mascot, paper card form containers, tactile action buttons.

---

## 4. Verification Requirements

Every stream must satisfy:
1. `pnpm run typecheck` passes with exit code 0.
2. `pnpm run lint` passes with 0 warnings.
3. Relevant unit tests pass in `carin-app/`.
4. Mobile layout at 320 dp and 390 dp without overflow or clipped text.
5. All interactive targets maintain at least 44 dp touch area.
