# Food analysis result recomposition

Approved direction: summary first, expandable supporting detail. The user approved
the proposed composition in the current session. Scope is the completed analysis
screen in the current branch, including its existing action states.

## Composition

- Use one short page heading, a photo thumbnail, and a persistent source label:
  photo estimates, catalog values, mixed sources, or synthetic demonstration data.
- Show food names and one portion per row. Photo-derived portions say "Sekitar";
  unknown portions remain explicit. Keep correction beside these rows.
- Show personal-attention status once, with critical limitations always visible.
  Known technical limitation codes get concise user-facing wording. Unknown
  critical messages retain their original wording. Allergens are never hidden.
- Follow with energy and three macronutrients. Null remains "Belum tersedia".
  Partial component coverage remains beside each affected value. Full coverage
  and additional nutrients are available in an expandable nutrition section.
- Put original limitation messages, portion basis/source, attention evidence,
  references, and timestamps under "Tentang hasil ini". Preserve all provenance.
- Keep the existing consumption primary action outside the scroll view, respecting
  bottom safe area. Its helper text reflects whether consumption already exists.
  Keep alternate occurrences and deletion under an expandable action section.
- Show refresh for stale/error/nonterminal states and retain a low-emphasis
  refresh action in supporting details for failed action-state recovery.

## Boundaries

Keep API contracts, nutrient calculations, polling, correction concurrency,
latest-result selection, deletion confirmation, and consumption routes unchanged.
Retain loading/failed/cancelled states and old-result warnings. Do not imply that
an estimate is verified or that a missing personal assessment means food is safe.

## Implementation and verification

Extract completed-result presentation into a focused component. Extend the pure
presentation mapper with compact portions, accurate catalog labels, coverage
state, and concise critical notes. Use existing Button/Text/Icon primitives and
inline disclosure controls with expanded accessibility state and 44 dp targets.

Test critical-note preservation, unknown critical codes, synthetic labels, null
nutrients, partial coverage, and portion formatting. Run app typecheck, lint, unit
tests and relevant correction/consumption integration tests. Inspect the result,
disclosures, and sticky action on the connected Android phone. Record platform
limitations and commit/push source changes when requested by the user.
