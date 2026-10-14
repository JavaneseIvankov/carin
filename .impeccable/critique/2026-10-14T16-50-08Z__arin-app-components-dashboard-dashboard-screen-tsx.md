---
target: carin-app/components/dashboard/dashboard-screen.tsx
total_score: 25
p0_count: 0
p1_count: 1
timestamp: 2026-10-14T16-50-08Z
slug: arin-app-components-dashboard-dashboard-screen-tsx
---

## Scope and confidence

Reviewed the dashboard pilot at `carin-app/components/dashboard/dashboard-screen.tsx` using its source and supplied live screenshots at 390 px and 320 px. The visible account state is empty, so findings about empty-state content are directly grounded; populated-state hierarchy has not been inspected in the browser. The user-approved direction is warm, playful, Yazio-like character, with React Native Reusables (RNR) as the UI component foundation. This is a critique and system-direction artifact, not an implementation request.

The Impeccable deterministic scan (`npx impeccable detect --json carin-app/components/dashboard/dashboard-screen.tsx`) returned `[]`. This means it found no configured static patterns; it does not invalidate visual or accessibility findings below. The live overlay check could not inspect the dashboard because its isolated browser session landed on login. No source files were changed for this audit.

## Overall assessment

This is a clear improvement over the earlier bare screen. The warm cream, olive, peach, butter palette and original mascot give Carin a more recognizable and welcoming character. The two primary food actions make an important domain distinction legible: analyze a photo before eating versus record food already consumed. The empty state also explains that analyzed food does not count until the user confirms consumption.

The pilot is promising as a visual direction, but still reads as a polished prototype rather than a composed product system. Most content is wrapped in similarly rounded card shells; some cards contain another card; many icons sit in tinted square containers; and sections remain similarly prominent even when empty. The first impression has a strong character, while the rest of the page needs more variation in information hierarchy and more restraint in surfaces.

## Heuristic assessment

| Nielsen heuristic               |   Score / 4 | Finding                                                                                        |
| ------------------------------- | ----------: | ---------------------------------------------------------------------------------------------- |
| Visibility of system status     |           3 | Loading, stale-data, and service-error states are represented.                                 |
| Match with the real world       |           3 | The food actions are understandable; “Cakupan” may be less familiar than “data tersedia.”      |
| User control and freedom        |           2 | Multiple paths to log food are available, but their relationship is unclear.                   |
| Consistency and standards       |           2 | The dashboard uses custom styling rather than a shared RNR token and variant system.           |
| Error prevention                |           3 | “Sebelum makan” and “Sudah dikonsumsi” help prevent confusing intent with confirmed intake.    |
| Recognition rather than recall  |           3 | Controls are labeled; secondary detail and destinations require scrolling.                     |
| Flexibility and efficiency      |           2 | Quick logging is possible, but repeated entry points add a choice instead of a clear shortcut. |
| Aesthetic and minimalist design |           2 | Repeated card framing and low-information empty sections add visual weight.                    |
| Error recovery                  |           3 | The service error state exposes a retry action.                                                |
| Help and documentation          |           2 | Inline explanation is useful, though there is no contextual help route.                        |
| **Total**                       | **25 / 40** | **Solid direction; hierarchy, component consistency, and accessibility need refinement.**      |

Cognitive load is moderate: 3 of 8 checklist items fail. The user sees two large logging actions plus a center add control, five bottom options in total (four tabs and add), and a long scroll where many sections have similar visual weight. Nutrient information is chunked, but several figures still compete at once. Keep the two distinct logging intents, clarify the add button's role, and use progressive disclosure for secondary content.

## Prioritized findings

1. **[P1] Improve contrast for secondary text on tinted surfaces.** Measured muted text contrast is approximately 3.42:1 on peach, 3.73:1 on butter, and 3.87:1 on soft olive. These values are below 4.5:1 for normal-size text. Define a darker secondary-text token and validate all text, including macro captions and tab labels, against each surface.
2. **[P2] Compose the dashboard from a hierarchy, not a stack of cards.** Keep a distinct surface for the primary nutrition summary, then use section headings, compact rows, and dividers for supporting material. Remove unnecessary nested card backgrounds. The goal is to preserve warmth while giving the eye more and less prominent areas.
3. **[P2] Compress low-information empty sections.** “Perhatian 7 hari” and “Pemeriksaan terakhir” consume visible space when they have no records. Show a concise row or small empty hint that links to the destination; expand a larger panel only when there is useful content or a meaningful next action.
4. **[P2] Clarify repeated food-entry routes.** Keep the two top actions because they represent separate user intents and the project specification allows multiple logging routes. However, make the center add button a consistent shortcut or menu, and avoid repeating the same “catat konsumsi” action again in a lower next-actions section.
5. **[P2] Add accessible heading semantics.** Dashboard section titles should be exposed as headings so screen-reader users can navigate sections. Keep the greeting as the page heading and preserve descriptive labels for all icon controls.
6. **[P3] Use plainer coverage language.** Consider “Data tersedia untuk 6 dari 8 komponen” instead of “Cakupan 6 dari 8 komponen,” if it remains accurate to the API meaning.

## Reference synthesis

- [Yazio diary summary](https://mobbin.com/screens/0cc2792f-7c05-4667-9c0f-ba47d6e0c3fe) is useful for grouping nutrition facts and showing meal actions in a clear, scannable order. Do not copy its calorie target, remaining/burned calories, goal framing, or ring since Carin's domain rules do not support those claims.
- [Yazio meal diary](https://mobbin.com/screens/6a957410-be5e-40cd-8250-5b2bee39297b) provides a good example of organizing a diary into distinct sections. Its hydration tracker and any goal-oriented treatment do not map to Carin's available data.
- [Yazio contextual mascot hint](https://mobbin.com/screens/a0465f2e-d4e5-422d-8aa2-5b9569456124) shows character used as a contextual coach cue. For Carin, use the mascot at useful moments such as first-use guidance or an empty state, rather than making it repeated decoration.
- [Alma homepage](https://mobbin.com/screens/fa71c558-018e-49cb-8301-8ff281c848b9) is a reference for making daily navigation and a primary banner easy to scan. Its scores, streaks, and goals should not be adopted unless Carin's product rules explicitly support them.
- [Alma food timeline](https://mobbin.com/screens/b599837d-75f6-4374-b5d7-1990a189bfc0) can inform temporal grouping if Carin's API exposes meal records. The current dashboard data does not justify inventing meal rows or thumbnails.

## Direction for the design system

Before delegating implementation, define a small RNR-first system that covers:

- semantic color tokens for page, primary surface, muted surface, primary text, secondary text, border, accent, success, warning, and error, with verified contrast pairs;
- typography roles for page title, section heading, metric, body, label, and caption;
- spacing and radius scales that distinguish summary surfaces from inline sections;
- RNR component mappings and variants for buttons, cards/surfaces, badges, list rows, tabs, and empty states;
- icon sizing and when an icon gets a colored container;
- mascot rules: where it adds guidance or emotional value and where it should stay out of the way;
- accessibility behavior for heading order, touch targets, focus/pressed/disabled states, and reduced motion.

Recommended next sequence: establish those tokens and RNR variants, then revise the dashboard hierarchy and empty states against the system. Treat the current pilot as the accepted tone and mascot reference, not as a component template to replicate screen-by-screen.
