# Mobile History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Provide separate consumption and scan history with date filters, pagination, resume links, current job state, and clear deleted-photo behavior.

**Architecture:** Keep the history route as the UI entry point and React Query owner. Add pure history helpers for filter bounds, scan pagination, and card presentation; retain consumption snapshots returned by the API. Fetch each visible scan's latest job by ID and navigate to its existing analysis screen. Refetch both lists on focus and foreground resume so mutations elsewhere appear.

**Tech Stack:** Expo Router, React Native, TanStack Query, TypeScript, Vitest.

---

### Task 1: Pure history behavior

**Files:**
- Modify: `carin-app/lib/consumptions/history.ts`
- Modify: `carin-app/lib/consumptions/history.unit.test.ts`
- Create: `carin-app/lib/food/history.ts`
- Create: `carin-app/lib/food/history.unit.test.ts`

- [x] **Step 1: Write failing tests** for seven and thirty day local date filters with inclusive start/exclusive end, cursor reset when filter changes, scan cursor/flattening, and job status/presentation including failed and unavailable jobs.
- [x] **Step 2: Run** `pnpm exec vitest run lib/consumptions/history.unit.test.ts lib/food/history.unit.test.ts` from `carin-app/`; expect new assertions/imports to fail.
- [x] **Step 3: Implement** `createConsumptionHistoryPageInput(cursor, filter, now)`, `getHistoryDateRange`, `createScanHistoryPageInput`, `getScanHistoryItems`, `getNextScanCursor`, and `getScanHistoryPresentation`. Use contract-native fields and never derive a consumption from a scan.
- [x] **Step 4: Run** the same focused test command; expect pass.

### Task 2: History route

**Files:**
- Modify: `carin-app/app/(tabs)/history.tsx`

- [x] **Step 1: Add an integration test** in `carin-app/app/(tabs)/history.integration.test.tsx` if the existing UI test environment supports Expo Router; otherwise rely on pure behavior tests and record that UI interaction remains device unverified. Cover tab default, filter query keys, page fetch, and analysis resume if feasible.
- [x] **Step 2: Run the focused integration test**, confirm failure for missing behavior when feasible.
- [x] **Step 3: Implement** the Konsumsi/Analisis segmented UI. Make Konsumsi default, filter by all/last 7/last 30 days with stable query keys and cursor pagination. Show only consumption snapshots from `listConsumptions`, including source and deleted-photo placeholder. Fetch `listScans` with cursor pagination for Analisis; fetch each visible scan's `getAnalysisJob(latestJobId)` and show queued/processing/completed/failed/cancelled or unavailable state. Link scan cards to `/food/analysis/[id]` via latest job ID, and consumption cards to `/consumptions/[id]`. Keep both tabs' empty, loading, stale, pagination, and retry states distinct. Refetch on focus/foreground and poll visible active jobs while Analisis is focused.
- [x] **Step 4: Run focused tests**, typecheck, and lint; fix any failures without touching C23 routes.

### Task 3: Verify and commit

**Files:**
- Modify: `docs/superpowers/plans/2026-10-14-c28-history-mobile.md` to mark completed steps.

- [ ] **Step 1: Run** `pnpm run test:unit`, `pnpm run test:integration`, `pnpm run typecheck`, `pnpm run lint`, and `pnpm run contracts:check` from `carin-app/`.
- [ ] **Step 2: Run** `pnpm exec prettier --check` for touched TS/TSX files, format then rerun checks if needed.
- [ ] **Step 3: Review** `git diff --check`, `git status`, and diff against the acceptance criteria; record platform/device limitations.
- [ ] **Step 4: Commit** the plan and feature with a focused conventional message and leave the worktree clean.

**UI verification note:** The Vitest setup has no React Native renderer or Expo Router harness; automated coverage is in pure history helpers. Route interactions remain device unverified.

**Coverage check:** Tabs, default, pagination, date filtering, active/failed jobs, resume, source/detail links, deleted photo, snapshot preservation, mutation/reopen refresh, and graceful errors are mapped above. The API offers date filters for consumptions only; Analisis uses cursor pagination without a server date filter.
