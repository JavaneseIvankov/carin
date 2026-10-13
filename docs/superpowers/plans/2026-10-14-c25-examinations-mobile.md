# C25 Examinations Mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver authenticated mobile examination CRUD and comparable-series visualization without implying clinical interpretation.

**Architecture:** Keep API state in existing TanStack Query repository hooks. Put parsing, labels, and chart projection in pure tested helpers; keep forms and SVG presentation in small reusable components, with Expo Router screens orchestrating reads and writes.

**Tech Stack:** Expo Router, React Native, NativeWind, TanStack Query, generated OpenAPI types, `react-native-svg`, Vitest.

---

## File map

- Create `carin-app/lib/exams/model.ts` and colocated unit test for local numeric parsing, date/time labels, record labels, and series chart projections.
- Create `carin-app/components/exams/ExaminationForm.tsx` and `ExaminationSeriesChart.tsx` with colocated unit or integration tests.
- Replace `carin-app/app/(tabs)/exams.tsx` placeholder with query-backed list, type filters, and series summaries.
- Create `carin-app/app/exams/new.tsx`, `carin-app/app/exams/[id].tsx`, and `carin-app/app/exams/[id]/edit.tsx` for create, detail, and revision-aware edit/delete.
- Add Expo-compatible `@react-native-community/datetimepicker` through `pnpm exec expo install` and regenerate the app lockfile.
- Create `docs/handoffs/t25-examinations-mobile.md` with results, platform limits, and branch state.

## Task 1: Pure examination presentation helpers

**Files:** `carin-app/lib/exams/model.unit.test.ts`, `carin-app/lib/exams/model.ts`

- [ ] Write failing tests for comma/dot decimal parsing; reject empty, mixed separators, zero, negative, and non-finite values without rounding valid precision.
- [ ] Write failing tests for type/context/subtype labels, optional time, localized date, backdated sorting based on `record.measuredOn` and then measured time, chart projection with one item, and distinct API series remaining separate.
- [ ] Run `pnpm exec vitest run lib/exams/model.unit.test.ts` from `carin-app/` and confirm expected missing-module failures.
- [ ] Implement only pure helpers used by screen/component code: `parseMeasurement`, `formatMeasurement`, `formatMeasuredAt`, `recordTitle`, and `projectSeries`.
- [ ] Rerun focused tests and commit `feat(mobile): add examination presentation model`.

## Task 2: Type-specific form and preview

**Files:** `carin-app/components/exams/ExaminationForm.tsx`, `carin-app/components/exams/ExaminationForm.integration.test.tsx` or unit test, helper tests if needed.

- [ ] Add tests for required measurement date, optional time staying null, decimal comma normalization, glucose unknown context, subtype selection, and preview showing exact unit/date/context before write.
- [ ] Run the focused test to verify it fails for the absent form.
- [ ] Install the Expo-compatible date/time picker, then implement accessible controls using it natively and date/time inputs on web; format selected calendar values locally, never through UTC conversion.
- [ ] Load the account timezone with `getProfile`; keep create/update disabled while timezone is unavailable. Do not invent a time default or abnormal-value thresholds.
- [ ] Verify create/edit values serialize to the generated discriminated union, preview requires explicit confirmation, and one idempotency key is retained across retries of the same action.
- [ ] Run form tests, typecheck, and lint for changed files; commit `feat(mobile): add examination entry form`.

## Task 3: Read list and series chart

**Files:** `carin-app/components/exams/ExaminationSeriesChart.tsx`, chart test, `carin-app/app/(tabs)/exams.tsx`, list test.

- [ ] Add tests that a single point has no trend claim, two or more points remain one typed/contextual series, screen-reader output includes the recorded dates/values, and the filter does not combine series.
- [ ] Verify the focused tests fail before implementation.
- [ ] Implement accessible SVG chart lines/dots for API-provided series; include a visible list/summary and all units/dates. For pressure, show systolic and diastolic in distinct series.
- [ ] Implement cursor-based list pagination with `useAppRead('listExaminations', {query:{limit,cursor,type?}})` and `useAppRead('getExaminationSeries', {})`, with filters, loading/error/offline/stale states, empty state, add/load-more actions, and refresh after writes through shared invalidation.
- [ ] Run focused tests and inspect the rendered route with Expo web if the environment supports it; commit `feat(mobile): show examination history and series`.

## Task 4: Create, detail, edit, delete flows

**Files:** `carin-app/app/exams/new.tsx`, `carin-app/app/exams/[id].tsx`, `carin-app/app/exams/[id]/edit.tsx`, colocated route tests.

- [ ] Add tests for create body, edit `expectedRevision`, successful-save acknowledgment, delete confirmation, and invalidated data after deletion.
- [ ] Confirm these tests fail for missing routes/flows.
- [ ] Use `useAppWrite('createExamination'|'updateExamination'|'deleteExamination')` and `useAppRead('getExamination', {path:{id}})`; display API errors and prevent duplicate submit while pending.
- [ ] Preserve values during preview; edit sends fetched revision. Deletion requires confirmation and returns to list after API success.
- [ ] Verify routes in Expo Router type generation, run route tests and all mobile checks; commit `feat(mobile): complete examination record flows`.

## Task 5: Full verification and handoff

**Files:** `docs/handoffs/t25-examinations-mobile.md`.

- [ ] Run from `carin-app/`: `pnpm install --frozen-lockfile`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run test:unit`, `pnpm run test:integration`, `pnpm run contracts:check`, and `pnpm exec expo export --platform web` when applicable.
- [ ] Record exact results and any unavailable device-level verification; do not claim native emulator QA unless run.
- [ ] Run `git diff --check`, inspect status/history, commit the handoff, ensure the feature worktree is clean, set T25 status `review`, and verify via `tsk list T25 --json`.

## Spec coverage review

The pure helpers cover decimal comma and date ordering; form covers required date, optional time/context and confirmation; series/list covers independent comparable series, single-point behavior, summary accessibility, filter and states; routes cover CRUD/delete refresh. Real API transport uses existing generated operations and idempotency handling. Device-specific Android/iOS interactions remain explicitly subject to device QA.
