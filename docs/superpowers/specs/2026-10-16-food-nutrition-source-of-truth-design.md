# Food nutrition source of truth

Status: approved and implemented in this branch. The user selected proportional scaling of visual estimates. The local API and app were updated, and one affected local consumption was repaired by appending a new snapshot revision through the API repository path.

## Observed failure

Read-only inspection of local data found one active photo-confirmed consumption whose seven saved nutrient totals are null, while its referenced analysis result has 454 kcal and other known nutrient values. The consumption repository rebuilds nutrition only from catalog facts. Unmatched VLM estimates are therefore discarded at confirmation. Both dashboard and consumption detail correctly read the resulting incomplete consumption snapshot.

Replacing missing consumption values with current analysis totals in the client would conceal the failure and produce wrong intake when portions, components, analysis versions or eating occurrences differ.

## Authority by question

| Question                                           | Authoritative record                                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| What was estimated in this photo?                  | Validated immutable analysis result, identified by result ID/revision                                |
| Which nutrition evidence supports each component?  | Versioned catalog facts or the original photo's per-component model estimate, with source references |
| What and how much was actually consumed, and when? | User-confirmed consumption input and its revision, stored by Carin API                               |
| What nutrition was recorded for this eating event? | Immutable consumption snapshot resolved server-side from that input and frozen evidence              |
| What counts toward today's intake?                 | Aggregation of active consumption snapshots by consumedAt in the account timezone                    |

The API/database owns persisted state. A VLM estimate is evidence with uncertainty, not a verified nutrition fact. Client caches display server state and never invent missing values or resolve nutrition independently.

## Confirmed scaling decision

Catalog-matched components continue to use catalog nutrient math. Unmatched photo components may retain their original model estimates, explicitly labeled as estimates. Manual unmatched input does not gain visual nutrition.

For photo-based nutrition, store the original result/component reference and the consumed fraction of that photographed portion. A factor of 1 means the full pictured component; 0.5 means half. When both original and actual portions have valid gram quantities, the backend may derive this factor from actual grams / pictured grams. When source grams are unknown, an explicit photo-portion fraction is required; do not synthesize per100g facts.

Scale each known nutrient at component level before summing. Null remains null. Removed components contribute nothing. Renaming/replacing a food or changing its preparation invalidates reuse of its visual estimate; a matching catalog source or new analysis is required. Reject negative, nonfinite or otherwise invalid portions; enforce agreed input bounds. State proportional scaling as an assumption, rather than new VLM inference.

Catalog and visual provenance remain distinguishable through consumption and dashboard. Known visual values contribute to intake coverage, but never to health-rule eligibility, personal assessment or verified-catalog status. A catalog-unrecognized component remains catalog-unrecognized even when its visual nutrients are known.

## Persistence and consistency

One backend resolver produces the consumption components, nutrient values, totals, coverage and provenance atomically. It takes frozen evidence and user-confirmed actual portions. Personal evaluation is a separate process and cannot erase recorded nutrition.

Photo analysis and consumption are independent domain records with independent lifecycles. Running an analysis never creates a consumption. An analysis remains in photo history whether or not the user eats the food. A consumption exists only after the user explicitly confirms an eating event, and may reference the exact analysis result used as evidence.

Default confirmation is idempotent for a scan. A new eating occurrence creates a separate consumption record, even when it references the same analysis. Subsequent analysis corrections do not change existing consumptions. Editing actual intake creates a new consumption revision and immutable snapshot. Deleting a scan preserves saved consumption nutrition; deleting a consumption removes that event from dashboard totals without deleting its source analysis.

Existing affected records need a deliberate, dry-run-first repair using their original source result and saved actual input. Append corrected snapshot revisions and preserve old snapshots; do not rewrite history silently, reset the database, rerun VLM on old photos, or fill records from the latest unrelated result. Flag records that cannot be safely reconstructed.

## Product presentation

Keep two histories: **Hasil foto** contains every photo assessment, including assessments the user never ate; **Catatan makan** contains only explicit eating events and drives intake. An analysis may have no consumption link, one link, or multiple links for separate eating occurrences. Show the relationship using scan/result/consumption IDs, but never present an analysis as an eating event or count it toward intake by itself.

Keep the analysis detail about what the photo model estimated. From it, the user can explicitly open or create a linked consumption record. Consumption detail is about the confirmed food, portion and time. A link between details may help users compare the original estimate with **Yang dicatat dimakan**, but the two records retain separate titles, states, actions and nutrition snapshots. A consumed status on an analysis is only a link indicator and must not imply that the latest analysis portion equals the saved consumption. A bare timestamp attached to current analysis is insufficient when those differ.

For the consumption list item and detail, use the existing analysis list item and analysis detail as the UI references. Carry over their visual hierarchy, spacing, card treatment, typography, and nutrient presentation so the two parts of the product feel related. Adapt the content to the consumption record: the list emphasizes food names and consumed time; detail emphasizes confirmed components/portions, the saved nutrition summary, source labels and edit/delete actions. Keep explicit consumption language and its own state. When a consumption links to a photo analysis, provide a clear link to that analysis and distinguish its original estimate from the consumed snapshot. Do not simply copy analysis values or imply both screens describe the same portion.

Keep management of eating events accessible, including manual records, multiple occurrences and records whose photo was deleted. Do not merge the histories or domain records. A cross-linked journal can be considered later only if it preserves the separate record types and never turns an unconsumed analysis into intake.

## Implementation and verification record

- Updated the API snapshot resolver, app confirmation flow, OpenAPI contract and generated clients to preserve original photo estimates with proportional portion scaling. Catalog and visual sources remain distinguishable, and visual estimates remain ineligible for personal health evaluation.
- Updated the consumption list and detail to follow the analysis UI reference while keeping photo analysis and eating events as separate records. Dashboard intake continues to aggregate active consumption snapshots only.
- Updated the domain and AI data policy specs to match the implemented source-of-truth rules.
- Repaired the affected local consumption by appending revision 2 through the API repository path. Its saved snapshot now has energy and three nutrient components, three photo portion scales and `unrecognized` catalog support status; the previous snapshot remains in history.
- API typecheck, lint, build, focused unit tests and consumption/dashboard integration tests passed. App typecheck, lint and focused unit tests passed. Contract generation/check passed, and `git diff --check` was clean.
- Rebuilt and restarted the local API container, which reported healthy. On the connected Samsung SM-A505F, the dashboard showed one record with 411.5 kcal and 3/3 components; consumption detail showed revision 2 and the visual estimate provenance. Device verification was performed with agent-device.

## Current worktree

This source-of-truth implementation and its design record are part of the current uncommitted changes. Earlier UI work is committed separately in cde38db.
