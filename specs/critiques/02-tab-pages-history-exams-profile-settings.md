# UI/UX Adversarial Critique: Suite 2 (Tab Pages: History, Exams, Profile, Settings & Account Deletion)

**Assigned Files Evaluated:**
- [`carin-app/app/(tabs)/history.tsx`](file:///home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin/carin-app/app/(tabs)/history.tsx)
- [`carin-app/app/(tabs)/exams.tsx`](file:///home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin/carin-app/app/(tabs)/exams.tsx)
- [`carin-app/app/(tabs)/profile.tsx`](file:///home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin/carin-app/app/(tabs)/profile.tsx)
- [`carin-app/app/settings.tsx`](file:///home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin/carin-app/app/settings.tsx)
- [`carin-app/app/account/delete.tsx`](file:///home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin/carin-app/app/account/delete.tsx)
- Associated components: [`carin-app/components/exams/ExaminationSeriesChart.tsx`](file:///home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin/carin-app/components/exams/ExaminationSeriesChart.tsx), [`carin-app/components/food/scan-deletion-control.tsx`](file:///home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin/carin-app/components/food/scan-deletion-control.tsx), [`carin-app/components/profile/missing-field-actions.tsx`](file:///home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin/carin-app/components/profile/missing-field-actions.tsx)

---

## 1. Overall Impression & Anti-Patterns Verdict

### Verdict: **Severe Developer-Reflex AI Slop & Hostile Mobile Ergonomics**
While Carin's foundational health philosophy (anti-diet, no punitive streaks, no guilt-tripping disease risk scores, explicit handling of missing nutrients) remains praiseworthy, **Suite 2 exhibits the most acute developer-centric anti-patterns in the entire codebase**. 

Key screens abandon consumer mobile UX paradigms in favor of raw database administration controls:
1. **The Backend Developer Deletion Gauntlet**: In [`delete.tsx`](file:///home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin/carin-app/app/account/delete.tsx#L104-L112), a user in an Indonesian mobile application who wishes to delete their account is forced to enter their password *and* manually type the 17-character English code constant `DELETE_MY_ACCOUNT` in uppercase with two underscores on a virtual touchscreen keyboard. This is a CLI database administrator pattern mindlessly copied into a patient mobile app.
2. **The Free-Text IANA Timezone Trap**: In [`settings.tsx`](file:///home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin/carin-app/app/settings.tsx#L195-L204), setting a timezone is not a regional selector (WIB, WITA, WIT) or a location picker; it is a blank `TextInput` where typing anything other than a precise IANA string like `"Asia/Jakarta"` (e.g. typing `"WIB"`, `"Jakarta"`, or making a typo) throws an error.
3. **The Unanchored Ghost Chart**: In [`exams.tsx`](file:///home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin/carin-app/app/(tabs)/exams.tsx#L186) and [`ExaminationSeriesChart.tsx`](file:///home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin/carin-app/components/exams/ExaminationSeriesChart.tsx#L50-L93), health vitals (systolic/diastolic blood pressure, glucose) are plotted on an SVG canvas that has **zero Y-axis numbers, zero horizontal gridlines, and zero reference baseline bands**. Data points float in mid-air without scale.
4. **Button Wall & Destructive Spam in Feeds**: In [`history.tsx`](file:///home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin/carin-app/app/(tabs)/history.tsx#L347-L382), every single photo scan in the list contains three stacked full-width buttons, including a bright red destructive deletion button right in the scrolling feed.
5. **The Duplicated Settings Ghost Town**: [`profile.tsx`](file:///home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin/carin-app/app/(tabs)/profile.tsx#L187-L235) displays Timezone and AI Consent with a button "Buka pengaturan". Clicking it takes the user to [`settings.tsx`](file:///home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin/carin-app/app/settings.tsx), which contains *only* those identical two fields, padding out the screen by dumping raw legal terms into a text container.

### Anti-Patterns Checklist
- **Side-stripe accent borders**: **PASS** (Clean uniform borders used).
- **Decorative glassmorphism**: **PASS** (Solid token surfaces).
- **Gradient text**: **PASS** (Solid typography).
- **Hero-metric clichés**: **PASS** (No 2000 kcal rings or punitive scores).
- **Identical repetitive card grids**: **FAIL** (In `history.tsx` and `exams.tsx`, endless identical cards with identical padding and structure; in `history.tsx` Analysis tab, every card repeats the exact title "Analisis foto" with zero thumbnail differentiation).
- **Nested cards**: **FAIL** (In `profile.tsx` lines 142 & 189, outer `bg-card` cards wrap inner `bg-muted/20` sub-cards; in `settings.tsx` line 274, outer card wraps inner card containing full legal text).
- **Modal as first thought**: **FAIL** (In `ScanDeletionControl.tsx` line 85, a raw React Native `Modal` with sliding animation is rendered instead of a contextual sheet).
- **Hardcoded hex colors**: **FAIL** ([`ExaminationSeriesChart.tsx` L18-L22, L57](file:///home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin/carin-app/components/exams/ExaminationSeriesChart.tsx#L18-L22)): `#506B35`, `#4f78a8`, and `#d1cebd` are hardcoded hex colors, directly violating Carin's NativeWind design token rule.
- **Pill filter stacking**: **FAIL** ([`history.tsx` L126-L186](file:///home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin/carin-app/app/(tabs)/history.tsx#L126-L186)): Two tiers of pill segmented controls are stacked immediately on top of each other with identical green active states.

---

## 2. Nielsen's 10 Usability Heuristics Scorecard

| # | Usability Heuristic | Score (0–4) | Key Observations & Violations |
|---|---------------------|:-----------:|-------------------------------|
| 1 | **Visibility of System Status** | 2/4 | Query freshness (`ReadState`) and polling for active analysis jobs work well. However, the vital trends chart has no Y-axis values or ticks—a patient cannot tell what numerical value a line segment represents without cross-referencing text rows below. |
| 2 | **Match Between System and Real World** | 1/4 | **Severe Failure**: Requiring users to type `Asia/Jakarta` into a raw text box ignores Indonesian mental models (WIB, WITA, WIT). Requiring users to type `DELETE_MY_ACCOUNT` in uppercase English with underscores in an Indonesian health app is developer syntax leakage. Exams filters use backend jargon (*"Seri sebanding"*). |
| 3 | **User Control and Freedom** | 2/4 | Deletion controls in `history.tsx` expose full destructive buttons on every feed item, inviting mis-taps. Account deletion imposes artificial keyboard friction rather than respectful confirmation. |
| 4 | **Consistency and Standards** | 2/4 | In `exams.tsx`, tapping "Filter jenis" deselects "Seri sebanding", and tapping "Seri sebanding" deselects "Filter jenis"—two vertically stacked filter carousels that cancel each other out. `ExaminationSeriesChart` uses hardcoded hexes while the rest of the app uses tokens. Nested cards violate the design system. |
| 5 | **Error Prevention** | 1/4 | **Severe Failure**: Free-form text input for timezones invites typos and formatting failures. Asking mobile users to type a 17-character uppercase string with underscores on a touchscreen triggers high error rates and keyboard autocorrect interference. |
| 6 | **Recognition Rather than Recall** | 1/4 | In `history.tsx` (Analisis), every scan is generically titled *"Analisis foto"*. There is no photo thumbnail, no detected food preview, and no distinguishing visual cue. The user must guess which scan was breakfast and which was lunch. Charts in `exams.tsx` lack Y-axis reference points. |
| 7 | **Flexibility and Efficiency of Use** | 2/4 | History lacks date grouping (e.g. "Hari ini", "Kemarin") and displays zero glanceable macronutrient indicators. A power user reviewing 7 days of meals must tap into all 21 items individually. Exams lacks standard time range selectors (Week, Month, Year). |
| 8 | **Aesthetic and Minimalist Design** | 2/4 | Visual button spam: scan cards house 3 massive buttons each. Raw legal text is dumped into a settings form sub-card. Redundant repeated date strings `14 Oktober 2026 (Asia/Jakarta)` on every single history card. |
| 9 | **Help Users Recognize, Diagnose, and Recover from Errors** | 3/4 | `ServiceError` and conflict handling (HTTP 409) are robust and translated. However, timezone errors only fire on submit rather than offering auto-complete guidance. |
| 10 | **Help and Documentation** | 2/4 | Clinical examinations lack non-judgmental normal baseline reference information, leaving patients wondering whether their systolic reading is concerning. Legal version notices are overly technical (*"Versi pemberitahuan tersimpan mungkin belum terbaru"*). |

### **Total Score: 18 / 40**
### **Rating Band: Flawed / Needs Urgent Attention (16–25)**

---

## 3. Cognitive Load & Emotional Journey Assessment

### 8-Item Cognitive Load Checklist
1. **Visual Anchors**: History cards lack visual anchors—no food photos, no macro chips, only text lines.
2. **Decision Point Options Count**:
   - `history.tsx`: Top manual log button (1) + 2 main tabs (2) + 3 date filters (3) = 6 primary controls before seeing the first item (**Warning: > 4**).
   - `history.tsx` Analysis cards: 3 action buttons per card (**Warning: 3 choices × N cards**).
   - `exams.tsx`: 4 type filters + N series filters = excessive horizontal scrolling friction (**Warning: > 4**).
3. **Progressive Disclosure**: Fails in `history.tsx` Analysis tab where destructive delete buttons are surfaced immediately on every card rather than disclosed within the detail view or behind a context menu.
4. **Information Density & Grouping**: History is an un-grouped, flat infinite list where each item repeats full date and timezone strings.
5. **Legibility & Scanability**: Examination chart points are tiny (`r="4"`) with zero axis labels, making visual trend interpretation impossible.
6. **Error Recovery**: Account deletion errors are clear, but the confirmation obstacle itself causes the error.
7. **Jargon Friction**: *"Seri sebanding"*, *"Idempotency"*, *"Revision"*, *"Asia/Jakarta"* are technical terms leaking into patient views.
8. **Affordance Consistency**: Pill buttons in History use two different border/background schemes for tabs vs filters, creating visual discordance.

### Physical Scene & Emotional Journey
- **The Clinic Waiting Room (10:15 AM)**: A patient (Jordan or Budi) just got their blood pressure measured at a clinic (138/88 mmHg). They open `exams.tsx` to log it and see their past chart. The chart shows two floating dots in an empty box without numbers on the left axis. They cannot tell if their reading is higher or lower than last month without clicking into every record.
- **The Busy Lunch Review (01:15 PM)**: A power user (Alex) wants to see what they ate yesterday to check their fiber intake. They scroll through `history.tsx`. Every card repeats `14 Oktober 2026 (Asia/Jakarta)`. None of the cards display fiber or carbs. They have to open 4 cards just to find yesterday's lunch.
- **The Sensitive Offboarding Moment (Evening)**: A user decides to delete their account. They navigate to `delete.tsx`. They are met with an intimidating red warning card and are instructed to type `DELETE_MY_ACCOUNT` in uppercase with underscores on their Indonesian keyboard. Autocorrect capitalizes and replaces letters, underscores require switching keyboard layouts twice, and the experience feels punitive and hostile.

---

## 4. What's Working Well

1. **Robust Optimistic Data Synchronization & Conflict Handling**:
   In [`settings.tsx`](file:///home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin/carin-app/app/settings.tsx#L88-L94) and [`lib/profile/profile.ts`](file:///home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin/carin-app/lib/profile/profile.ts), concurrency conflicts (HTTP 409) on revisions and AI consent versioning are gracefully captured, allowing the user to refresh without losing local draft state.
2. **Strict Adherence to Non-Punitive Philosophy**:
   The history and exam logs never display guilt-inducing calorie deficits, red penalty badges, or alarmist disease scores. Empty states maintain Carin's warm, supportive tone.
3. **Active Job Polling in Scan History**:
   [`history.tsx`](file:///home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin/carin-app/app/(tabs)/history.tsx#L88-L94) intelligently polls pending image analysis jobs every 4 seconds, ensuring users don't have to pull-to-refresh manually when an AI analysis completes.

---

## 5. Priority Issues (P0 to P3)

### [P0] Hostile Deletion Confirmation Barrier: English Code Syntax on Indonesian Mobile UI
- **What**: In [`delete.tsx` L104-L112](file:///home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin/carin-app/app/account/delete.tsx#L104-L112), account deletion requires the user to type `DELETE_MY_ACCOUNT` exactly in uppercase with underscores, in addition to entering their account password.
- **Why**: Extreme cognitive friction and platform ergonomics failure. Typing 17 characters in all-caps with underscores on a mobile keyboard requires multiple mode switches and triggers autocorrect errors. Demanding an English programming identifier in an Indonesian healthcare app alienates Indonesian users (especially elderly chronic patients like Pak Budi).
- **Fix**: Replace the confirmation code with a simple localized phrase like `HAPUS AKUN` or eliminate the phrase input entirely in favor of standard password re-authentication with a 2-step confirmation sheet, accompanied by an option to download their health data first (*"Unduh Salinan Data"*).
- **Impeccable Command**: `humanize-danger-zone --empathic-offboarding`

### [P0] Free-Text IANA Timezone Input in Settings
- **What**: In [`settings.tsx` L195-L204](file:///home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin/carin-app/app/settings.tsx#L195-L204), timezone is configured via a blank text input where users must manually type an IANA timezone identifier like `Asia/Jakarta`.
- **Why**: Violates Nielsen Heuristics 5 (Error prevention) and 7 (Flexibility & efficiency). Over 99% of Indonesian users think in terms of WIB, WITA, or WIT. Any typo or colloquial entry (*"Jakarta"*, *"WIB"*) causes an immediate validation failure.
- **Fix**: Replace the text input with a 3-pill regional selector (`WIB (UTC+7)`, `WITA (UTC+8)`, `WIT (UTC+9)`) with automatic device detection (`Intl.DateTimeFormat().resolvedOptions().timeZone`) and a searchable modal for international timezones.
- **Impeccable Command**: `replace-input-with-picker --regional-presets`

### [P1] Chart Scale Deprivation & Hardcoded Hex Values in Clinical Trends
- **What**: In [`ExaminationSeriesChart.tsx` L50-L93](file:///home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin/carin-app/components/exams/ExaminationSeriesChart.tsx#L50-L93), the SVG chart renders data lines without Y-axis value labels, horizontal gridlines, or reference intervals. Furthermore, lines 18-22 and line 57 hardcode `#506B35`, `#4f78a8`, and `#d1cebd`.
- **Why**: Violates Heuristics 1 & 6 and Carin's NativeWind token rule. Patients cannot interpret whether a plotted blood pressure reading is 115 or 150 mmHg without reading the text below. Hardcoded colors fail dark mode and token consistency.
- **Fix**: Add horizontal Y-axis reference lines with legible tick labels (e.g. 80, 100, 120, 140 mmHg for blood pressure), provide press-to-view value tooltips, and map colors to design tokens (`text-primary`, `text-info`, `border-border`).
- **Impeccable Command**: `elevate-chart-scales --token-enforcement`

### [P1] Competing Action Button Spam & Missing Thumbnails in Analysis Scans Feed
- **What**: In [`history.tsx` L347-L382](file:///home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin/carin-app/app/(tabs)/history.tsx#L347-L382), every scan item in the Analysis feed displays up to three large stacked buttons, including an active destructive deletion button (`ScanDeletionControl`). Additionally, every card is titled identically (*"Analisis foto"*) without food thumbnails or detected meal names.
- **Why**: Clutter, lack of progressive disclosure, and severe accidental deletion risk. In a list of 10 scans, the screen presents 10 bright red destructive buttons. Users cannot visually distinguish past meals.
- **Fix**: Remove the destructive button from the feed card; move deletion to the scan detail screen or behind an overflow menu icon (`...`). Include the thumbnail preview of the captured food and the primary detected food name in the card header.
- **Impeccable Command**: `progressive-disclosure --enrich-history-cards`

### [P2] Mutually Destructive Filter Carousels & Pill Stacking Overload
- **What**: In [`exams.tsx` L102-L174](file:///home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin/carin-app/app/(tabs)/exams.tsx#L102-L174), "Filter jenis" and "Seri sebanding" are stacked horizontal scrollviews that cancel each other out when clicked. In [`history.tsx` L126-L186](file:///home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin/carin-app/app/(tabs)/history.tsx#L126-L186), two rows of identical green pill buttons sit directly atop each other.
- **Why**: Broken mental models and visual monotony. Users expect stacked filters to combine or drill down, not mutually clear each other. Dual pill rows cause visual vibration.
- **Fix**: In Exams, unify into a single coherent filter system (filter by vital type, then filter by measurement condition if applicable). In History, style the main tab toggle as a cohesive segmented container and the date filter as secondary chips.
- **Impeccable Command**: `harmonize-segmented-controls --unified-filtering`

### [P2] Nested Cards & Architectural Duplication in Profile Screen
- **What**: In [`profile.tsx` L128-L235](file:///home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin/carin-app/app/(tabs)/profile.tsx#L128-L235), `bg-card` cards wrap `bg-muted/20` sub-cards. Furthermore, Profile renders Timezone and AI Consent summary with a button to `/settings`, while `/settings` contains *only* those exact two items.
- **Why**: Violates Card Discipline (nested cards are forbidden) and creates redundant screen hops where a separate settings route contains no additional utility.
- **Fix**: Flatten the card hierarchy in Profile using hairline dividers rather than nested boxes. Consolidate quick settings directly into Profile or expand Settings into a genuine preferences center (units, export data, reminders).
- **Impeccable Command**: `flatten-card-hierarchy --rearchitect-settings`

### [P3] Lack of Date Grouping & Nutrient Blindness in Consumption History
- **What**: In [`history.tsx` L187-L239](file:///home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin/carin-app/app/(tabs)/history.tsx#L187-L239), meals are listed as an un-grouped flat feed, with each card repeating the full date and timezone string (`14 Oktober 2026 (Asia/Jakarta)`). The card displays at most two food names and zero nutrient or macro values.
- **Why**: Severe cognitive friction for users reviewing their weekly eating patterns. Repetitive date/timezone strings waste vertical real estate while providing zero nutritional glanceability.
- **Fix**: Introduce date section headers (*"Hari ini"*, *"Kemarin"*, *"Selasa, 13 Okt"*), strip redundant timezone text, and display compact nutrient tags (e.g. Karbo, Protein, Natrium) directly on the meal card.
- **Impeccable Command**: `group-by-date --compact-macro-chips`

### [P3] Embedded Legal Document Dump in Settings
- **What**: In [`settings.tsx` L278](file:///home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin/carin-app/app/settings.tsx#L278), `<LegalContent document={registry.aiProcessing} />` renders an entire legal agreement inside a small card on the settings page.
- **Why**: Vertical scroll bloat and cognitive overload. Users should not be forced to scroll through pages of terms inside a form.
- **Fix**: Provide a 2-sentence plain-language summary of what AI consent does, followed by a tap-to-read sheet or link to `/legal/ai-processing`.
- **Impeccable Command**: `decouple-legal-dump --modal-disclosure`

---

## 6. Battle-Tested References from Mobbin

### 1. Clinical Trends & Lab History: Apple Health
- **Reference**: [Apple Health Blood Pressure Trends](https://mobbin.com/screens/f6471b67-8921-4d71-826b-476849a1ec61)
- **Key Layout Takeaways**:
  - **Explicit Value & Time Axes**: Apple Health renders clear horizontal gridlines with reference values (60, 80, 100, 120, 140, 160 mmHg), allowing users to immediately interpret data points.
  - **Dual Systolic / Diastolic Split**: Distinct color markers for systolic and diastolic readings with large, high-contrast metric callouts.
  - **Contextual Health Status**: Shows non-judgmental status cards (e.g. *"Non-elevated blood pressure"*) with progressive disclosure explaining what the range represents.
  - **Segmented Range Control**: Clean top-level time segmentation (D / W / M / 6M / Y) rather than arbitrary un-grouped infinite lists.

### 2. Meal Diary & Grouped Logging: Lifesum
- **Reference**: [Lifesum Food Diary Log](https://mobbin.com/screens/18fd7604-fd5f-456c-85c1-818261b66e7f)
- **Key Layout Takeaways**:
  - **Time & Meal Slot Grouping**: Entries are grouped by date headers and meal categories (Breakfast, Lunch, Dinner, Snack), completely eliminating repetitive full-date strings on individual cards.
  - **Glanceable Macro Badges**: Each logged entry displays key nutrient numbers directly on the card so users don't have to open a separate screen for every item.
  - **Visual Dish Anchors**: High-quality visual icons or captured food thumbnails give users instant recognition without reading text.

### 3. Empathic & Respectful Offboarding: Lifesum
- **Reference**: [Lifesum Account Deletion Confirmation](https://mobbin.com/screens/0e15bc6e-6d68-4066-90ca-23ae08421df9)
- **Key Layout Takeaways**:
  - **Calm, Transparent Communication**: Rather than an alarming red wall with developer syntax codes, Lifesum uses clean, respectful typography explaining exact consequences (subscription cancellation, data erasure).
  - **Ergonomic Confirmation**: Avoids requiring 17-character uppercase code phrases with underscores. Relies on standard password re-authentication or a straightforward two-step confirmation button.
  - **Data Dignity**: Prioritizes user autonomy and clear exit paths without punitive friction.

### 4. Account Settings & Preference Hierarchy: Duolingo
- **Reference**: [Duolingo Profile & Settings Hierarchy](https://mobbin.com/screens/fd3e8e2e-0b82-4e2f-8223-b410a3e325f9)
- **Key Layout Takeaways**:
  - **Grouped Setting Rows with Chevrons**: Preferences are organized into clean native list rows with chevrons and pickers. Zero raw string inputs for configuration.
  - **Clean Separation of Concerns**: Public profile displays identity and journey; Settings handles functional preferences, privacy, and account security.

---

## 7. Persona Red Flags

### Alex (The Busy Power User)
- **Goal**: Review the past 7 days to see if high-sodium dinners correlate with morning sluggishness.
- **Where the UI Fails Alex**:
  1. In `history.tsx`, Alex has to scroll through 21 meals in an un-grouped, continuous feed with no daily separation.
  2. Because meal cards only show the first two ingredients and **zero nutrient values**, Alex must tap into card 1, read the sodium number, tap back, scroll down, tap card 2, tap back... performing over 40 taps just to inspect one week of dinners.
  3. In the Analysis tab, all scans say *"Analisis foto"*. Alex cannot identify which scan was his Saturday steak dinner without opening every job.

### Jordan (The First-Timer / Health Novice)
- **Goal**: Check his recent blood pressure log and update his timezone after returning from a business trip.
- **Where the UI Fails Jordan**:
  1. In `exams.tsx`, Jordan tries to filter by blood pressure taken while seated. He taps *"Tekanan darah"*, then taps *"Duduk"*. Instantly, *"Tekanan darah"* gets deselected because the two filter bars are mutually exclusive. Jordan is baffled.
  2. He looks at the blood pressure chart: it shows two floating lines in an empty white box with no Y-axis numbers. He has no idea whether the dots are good or bad.
  3. In `settings.tsx`, Jordan tries to set his timezone. He types *"WIB"*. The app throws an error: *"Zona waktu tidak dikenali. Gunakan nama seperti Asia/Jakarta."* Jordan feels stupid and frustrated.

### Pak Budi (Chronic Care / Hypertension Patient, 56 y.o.)
- **Goal**: Monitor his morning blood pressure surges and ensure his medical data privacy.
- **Where the UI Fails Pak Budi**:
  1. In `exams.tsx`, the chart points are tiny 4px dots in an SVG with hardcoded green and blue hex colors. Pak Budi has presbyopia and cannot read or tap the points. The chart does not differentiate morning vs evening readings, which is clinically crucial for hypertension management.
  2. In `account/delete.tsx`, Pak Budi explores what happens if he deletes his data. He is confronted with an alarming red screen demanding that he type `DELETE_MY_ACCOUNT`. Pak Budi does not speak English, does not know what an underscore is, and cannot find `_` on his Indonesian Android virtual keyboard. He panics, thinking his data has already been locked.

---

## 8. Provocative Questions for Elevation

1. **Why does a consumer mobile health app demand that Indonesian patients type an English software constant (`DELETE_MY_ACCOUNT`) with two underscores on a touchscreen keyboard just to exercise their legal right to data erasure?**
2. **Why are clinical vital trends in `exams.tsx` plotted on an empty SVG box with zero Y-axis numbers, turning medical tracking into abstract line art?**
3. **Why does `settings.tsx` require users to manually type IANA timezone strings into a blank text field when 99% of Indonesians operate in WIB, WITA, and WIT?**
4. **Why are users forced to look at 10 bright red destructive deletion buttons right in their photo scan feed instead of keeping destructive actions inside the detail screen?**
5. **Why does `profile.tsx` navigate to a separate `settings.tsx` screen that contains literally nothing except the exact two rows already displayed on the profile page?**
