# C23 Photo Consumption Confirmation Design

## Goal

Let a user turn a successful food scan into an explicit consumption record by confirming the food components, actual portions, and meal time. Keep scan analysis separate from food history until the user saves. Reuse the C22 consumption form, food editor, detail route, and durable create-action behavior.

## Existing contracts and decisions

The app API already supports `source: "photo_confirmation"`, `scanId`, `sourceAnalysisResultId`, `occurrence`, `consumedAt`, `timezone`, `components`, and `catalogVersion`. `GET /scans/{id}` already returns `latestResultId` and `defaultConsumptionId`. No OpenAPI change is planned.

The server remains authoritative for current revision, ownership, nutrition snapshots, personal evaluation, duplicate protection, and idempotency. A saved consumption keeps the selected result and input snapshot; later scan corrections do not mutate it.

## User flow

On a scan analysis screen, show `Sudah dikonsumsi` only when the scan has a current successful result and no active correction. Opening it navigates to a photo-confirmation form seeded from that result. The form reuses the C22 `ConsumptionForm` and `FoodEditor`, with meal date/time defaulted to the user's current local time and editable.

Each result component is prefilled as an editable food component. Preserve its recognized name, catalog match, and portion estimate only when those values map to the existing editable model; unavailable or unmatched values remain unknown/unmatched. The user reviews the estimated portions and sets the actual amount or chooses `Tidak tahu porsi`; components can be added, edited, or removed using the existing form behavior. The request uses the source result's `catalogVersion`. The default action saves with `occurrence: "default_confirmation"`; it does not mark the meal consumed until save succeeds.

When the scan already has `defaultConsumptionId`, show `Buka catatan konsumsi` and route to that record. Offer a separate, clearly labeled `Catat sebagai konsumsi baru` action. Only that explicit path saves with `occurrence: "new_occurrence"` and a fresh idempotency key. It must not silently create a second occurrence from a repeat tap.

## Result and correction state

The form takes its source from the scan's current `latestResultId` and result revision, not from an old job route parameter or a previously cached result. Before creating the draft and again before submitting, resolve the scan and verify that its latest successful result still matches the selected source result.

While `latestJobId` is queued or processing, block photo confirmation and show that correction is in progress. Refresh the scan/job state when the screen regains focus or the app returns to foreground. Do not offer the prior result as current while a correction is active.

If a correction fails, preserve access to the last valid result, but require an explicit action labeled to use that last successful result before enabling confirmation. If a correction succeeds, use only the new `latestResultId`. A stale draft submitted after another correction succeeds must be rejected by the API; refresh and offer to reopen the form from the new result without discarding the user's unsaved draft silently.

## Save, retry, and conflicts

Persist the photo-confirmation draft and its pending idempotency key in user-scoped local storage using the same durability and retry behavior as C22. Disable submit while a request is in flight, but rely on `Idempotency-Key` for duplicate protection across app restarts and ambiguous network failures. Retry the identical payload with the same key. Keep the draft on any unconfirmed failure.

On `201`, open the returned consumption detail. On `200` for an identical existing default confirmation, open the returned record. On `409 CONSUMPTION_ALREADY_CONFIRMED`, refresh `defaultConsumptionId` and offer to open/edit the existing record or deliberately start a new occurrence. On `409 ANALYSIS_PENDING` or a stale revision/result conflict, refresh scan state and explain whether the user must wait or rebuild from the latest result. Do not retry with a new key or convert the action to a new occurrence automatically.

The consumption save succeeds independently of optional personal evaluation. The detail screen shows the server's `pending`, `failed`, or `not_requested` state while retaining the saved nutrition snapshot.

## Scope and implementation seams

- Extend the scan analysis action area in `carin-app/app/food/analysis/[id].tsx` with state-aware confirmation and existing-record actions.
- Add a photo-confirmation route/container under `carin-app/app/consumptions/` that loads the scan and current result, creates a scoped draft, maps result components into the C22 editable form model, and builds the photo-specific `ConsumptionCreate` payload. Do not call C22's manual payload builder, which intentionally emits `source: "manual"` and `new_occurrence`.
- Reuse `carin-app/components/consumptions/consumption-form.tsx`, `food-editor.tsx`, and the C22 consumption detail route; factor only small pure mapping/state helpers into `carin-app/lib/consumptions/` or `carin-app/lib/food/` where tests need them.
- Use generated API types and existing repository/query/action patterns. Do not add a parallel nutrition calculation or send client-derived nutrient/attention values.
- Do not change OpenAPI, backend behavior, catalog rules, manual-entry flow, scan creation, or the existing C22 edit/delete routes.

## Verification

Add focused unit tests for mapping result components into an editable actual-consumption draft, carrying the result/catalog versions, current-result gating, active/failed/successful correction transitions, default-vs-new occurrence, and API conflict presentation.

Add app integration coverage for a successful half-portion save with editable meal time, repeat tap and same-key retry, existing default confirmation reopening, explicit new occurrence, active correction rejection, failed correction's explicit last-result choice, stale result conflict, and draft preservation after an ambiguous failure. Verify that scan-only never enters consumption history and that pending/failed personal evaluation does not undo a saved consumption.

Follow the C22 app guide checks for contracts, typecheck, lint, unit/integration suites, and diff validation. Record device/simulator coverage separately; automated checks do not establish camera or native-platform behavior.
