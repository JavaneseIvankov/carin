# C23 Photo Consumption Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user save a successful current scan result as an explicit photo-confirmation consumption with reviewed actual portions and meal time.

**Architecture:** Keep the app API contract unchanged. Add pure result-to-draft and payload helpers, fetch the scan's latest result/job before enabling or submitting the form, reuse the C22 consumption form and durable create action, and navigate to the server-returned consumption detail.

**Tech Stack:** Expo Router, React Native, TypeScript, TanStack Query, generated OpenAPI types, AsyncStorage scoped drafts, Vitest.

---

## Repository context

This branch is based on `feat/c22-manual-consumption-mobile` so the C19 capture/analysis flow, C21 API client integration, and C22 manual consumption form/editor/detail are present. `AnalysisJob` exposes `scanId`, `targetRevision`, and status. `Scan` exposes `revision`, `latestJobId`, `latestResultId`, and `defaultConsumptionId`. The analysis result is fetched by `latestResultId`, because a failed correction can leave a valid earlier result on the scan even though the latest job has no result.

Read `docs/superpowers/specs/2026-10-14-c23-photo-consumption-confirmation-design.md`, `specs/01-ux-flows-and-screen-states.md`, `specs/02-domain-model-and-business-rules.md`, and `carin-app/AGENTS.md` before implementation. Do not modify generated contracts or nutrition/attention math.

## Files and responsibilities

- Create `carin-app/lib/consumptions/photo-confirmation.ts`: map an `ai__AnalysisResult` to the editable C22 draft shape, construct the photo-specific create payload, and determine confirmation availability from the scan/latest job/current result and explicit failed-correction choice.
- Create `carin-app/lib/consumptions/photo-confirmation.unit.test.ts`: cover mapping, payload, and availability boundaries without React Native.
- Create `carin-app/app/consumptions/from-scan/[scanId].tsx`: own scoped draft persistence, fresh resource reads, submit/retry state, conflict handling, and reuse `ConsumptionForm`.
- Create `carin-app/app/consumptions/from-scan/[scanId].integration.test.tsx`: cover the route's submit and recovery behavior using the repository's existing Vitest integration conventions.
- Modify `carin-app/app/food/analysis/[id].tsx`: fetch the scan's current state and show default/open, new occurrence, active correction, and explicit last-successful-result actions.
- Modify the narrowest existing analysis presentation test or add `carin-app/lib/food/photo-confirmation-actions.unit.test.ts` for CTA selection if JSX integration is impractical.

## Task 1: Pure mapping, payload, and state helpers

**Files:** create `carin-app/lib/consumptions/photo-confirmation.ts` and its `.unit.test.ts`.

- [ ] Write tests first for a completed multi-component result where a known `g` portion maps to a known editable gram quantity, a valid serving maps to its `servingId`, and null/unsupported values remain `{ kind: 'unknown' }`. Assert the draft carries the result's `catalogVersion` and formats the supplied instant in the account timezone.
- [ ] Write payload tests asserting `source: 'photo_confirmation'`, the route scan ID, the selected latest result ID, the selected occurrence, ISO `consumedAt`, timezone, result catalog version, and mapped component IDs/names/catalog matches/actual portions. Test both default and explicit new occurrence.
- [ ] Write validation tests for invalid date/time, zero or malformed portion, empty component list, and over 30 components. Errors must return a validation message rather than silently coercing an invalid portion to unknown.
- [ ] Write gate tests for current successful result (enabled), queued/processing latest correction (blocked), failed correction with a retained latest result (blocked until explicit last-result choice), no current result (blocked), and an existing default consumption (open-existing action available).
- [ ] Run `cd carin-app && pnpm exec vitest run lib/consumptions/photo-confirmation.unit.test.ts`; confirm the new tests fail because the helper module is missing.
- [ ] Implement exports with these stable signatures:

```ts
export type PhotoConfirmationOccurrence = 'default_confirmation' | 'new_occurrence';

export function createPhotoConfirmationDraft(
  result: components['schemas']['ai__AnalysisResult'],
  instant: Date,
  timeZone: string
): ManualConsumptionDraft;

export function buildPhotoConsumptionInput(
  draft: ManualConsumptionDraft,
  input: {
    scanId: string;
    resultId: string;
    occurrence: PhotoConfirmationOccurrence;
    timeZone: string;
  }
): { value: components['schemas']['ConsumptionCreate'] } | { error: string };

export function getPhotoConfirmationAvailability(input: {
  scan: components['schemas']['Scan'];
  latestJob: components['schemas']['AnalysisJob'] | undefined;
  resultId: string | undefined;
  result: components['schemas']['ai__AnalysisResult'] | undefined;
  explicitlyUseLastSuccessfulResult: boolean;
}): 'loading' | 'unavailable' | 'correction_pending' | 'confirm' | 'open_existing';
```

Implement the draft mapper by preserving result component UUID/name/catalog match/preparation; map `portion.quantity` with its supported unit and serving ID, and use unknown when the result has no editable quantity. Build request components with existing `mapManualComponent`, but set photo source fields, scan/result IDs, occurrence, result catalog version, and localized timestamp explicitly. `AnalysisResult.operationId` identifies the job, not the result row; availability compares the ID used to fetch the result with `scan.latestResultId`. A queued/processing scan-target job blocks confirmation. A failed scan-target job blocks until the explicit flag is true. If `defaultConsumptionId` exists, return `open_existing` for the default action while leaving the explicit new-occurrence path available.
- [ ] Run the focused test and require all tests to pass.
- [ ] Commit only the helper and unit test as `feat: map scan results to consumption drafts`.

## Task 2: Photo-confirmation route and durable save

**Files:** create `carin-app/app/consumptions/from-scan/[scanId].tsx` and its integration test.

- [ ] Add route tests for loading the scan, following `latestJobId`/`latestResultId`, showing the shared form only when availability is `confirm`, and rendering pending/unavailable messages otherwise.
- [ ] Add tests that a submit refetches scan/job/result and refuses a stale result, and that an offline route does not attempt a write.
- [ ] Add tests that identical retries use the same draft ID/idempotency key and return to `/consumptions/[id]` using the server response; `200` existing-default responses also open that record.
- [ ] Add conflict tests: `ANALYSIS_PENDING` refreshes and displays a wait message; `CONSUMPTION_ALREADY_CONFIRMED` reloads the scan and offers the existing record or explicit new occurrence; ambiguous network failure keeps the draft and reuses its pending key.
- [ ] Implement route params `scanId`, `occurrence` (defaulting to `default_confirmation`), and `useLastSuccessfulResult` (default false). Load/save a `SavedPhotoDraft` in `createDraftStore` using a key containing the scan ID and occurrence, with `DataScope` so drafts remain user/environment scoped. Preserve the pending payload key through `createManualConsumptionActions`; do not use `buildManualConsumptionInput`, because it intentionally emits a manual/new-occurrence payload.
- [ ] Read `getMe` for timezone (fallback `Asia/Jakarta` only while no account value exists), `getScan`, the scan's `latestJobId`, and `getAnalysisResult` for its `latestResultId`. Before submit, await fresh `getScan` and latest job/result reads, require online connectivity, ensure the selected result ID is still current, and rebuild the payload from the saved draft.
- [ ] Render the existing `ConsumptionForm` with a photo-specific title/description and submit label. On success clear the draft and pending create key, then replace the route with `/consumptions/[id]` from the returned body. On errors retain the draft and display the existing service error presentation.
- [ ] Run focused unit/integration tests and typecheck for the route.
- [ ] Commit the route and integration test as `feat: add photo consumption confirmation form`.

## Task 3: Analysis-screen entry points and existing record

**Files:** modify `carin-app/app/food/analysis/[id].tsx`; add/modify the CTA presentation test.

- [ ] Add tests for default action labels and destinations: no prior record → `Sudah dikonsumsi`; existing default ID → `Buka catatan konsumsi`; explicit secondary action → `Catat sebagai konsumsi baru`.
- [ ] Add tests for correction state: queued/processing hides or disables confirmation; failed correction requires an explicit last-successful-result choice; successful correction uses only the new scan result ID.
- [ ] In the analysis route, use `job.scanId` to read the scan, then follow the scan's `latestJobId` and `latestResultId`. Refresh these reads on focus and app foreground. Never treat the route's original job result as current if its ID differs from `scan.latestResultId`.
- [ ] Route default confirmation to `/consumptions/from-scan/[scanId]`; when `defaultConsumptionId` exists, route the primary action to `/consumptions/[id]` and make `new_occurrence` a separate explicit route action. After failed correction, route the explicit fallback action with `useLastSuccessfulResult=true`.
- [ ] Keep the analysis screen's note that scan-only results do not count as eaten. Do not alter correction UI, backend contracts, or the C22 manual flow.
- [ ] Run focused CTA/analysis tests and the complete app verification below.
- [ ] Commit the screen and focused tests as `feat: link scan results to consumption confirmation`.

## Task 4: Verification and handoff

- [ ] From `carin-app/`, run `pnpm run contracts:check`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run test:unit`, and `pnpm run test:integration`.
- [ ] From the C23 worktree root, run `git diff --check` and inspect the final diff for accidental generated-contract, API, or nutrition/attention changes.
- [ ] Run the success, repeat-tap, existing-default, new-occurrence, active-correction, failed-correction, stale-result, and retry-preservation flows in the available simulator/device. Record unavailable platform/device checks rather than claiming them passed.
- [ ] Update the C23 handoff with changed files, commands/results, device limitations, branch/commit state, and remaining follow-up. Move TSK C23 to `review` only after code review and checks pass; do not mark it done.

## Plan self-review

- Spec coverage: current result/revision and correction states are handled in Tasks 1–3; actual editable portions, local time, existing default record, explicit new occurrence, idempotency/retry/conflict behavior, and optional evaluation preservation are covered by Tasks 1–2; scan-only separation and no API changes are protected in Task 3 and Task 4.
- Scope: one mobile feature using existing C22 components and APIs; no backend, contract, catalog, or health-rule subsystem is added.
- Type consistency: helper signatures use generated app/AI schema types; the route passes those types and the C22 `ManualConsumptionDraft`; the payload helper is the only place assembling `ConsumptionCreate` for `photo_confirmation`.
- Placeholder scan: no TODO/TBD steps. Tests and verification name exact paths and commands.
