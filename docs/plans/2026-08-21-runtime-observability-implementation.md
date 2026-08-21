# Runtime Observability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Build a local-first runtime ledger and a four-tab health dashboard with period-filtered token statistics.

**Architecture:** Reuse the official `liveTokenUsage` projection, persist cumulative-session deltas and orchestration events in a versioned project ledger, and expose one RPC aggregate to the existing client plugin. No background model calls are introduced.

**Tech Stack:** TypeScript, Cordis/DSH session projections, React 18, Vitest, CSS Modules.

---

### Task 1: Versioned observability ledger

**Files:**
- Create: `packages/dsh-orchestrator/src/observability.ts`
- Create: `packages/dsh-orchestrator/tests/observability.spec.ts`

1. Write failing tests for cumulative snapshot de-duplication, positive deltas, period filtering, per-model totals, missing buckets, and bounded retention.
2. Run `pnpm --filter @harness-design/dsh-orchestrator test` and verify failure.
3. Implement atomic versioned storage and pure aggregation.
4. Re-run tests and verify success.

### Task 2: Runtime integration and RPC

**Files:**
- Modify: `packages/dsh-orchestrator/src/index.ts`
- Modify: `packages/dsh-orchestrator/src/orchestration.ts`
- Modify: `packages/dsh-orchestrator/src/wire.ts`
- Modify: `packages/dsh-orchestrator/src/client/api.ts`

1. Add tests for validated period requests and trace/cache events.
2. Sample `sessionProjections.snapshot(agent.session).values.liveTokenUsage` during dashboard refresh.
3. Record stage/cache events around explicit orchestration roles.
4. Return observability aggregates with dashboard status.

### Task 3: Four-tab dashboard

**Files:**
- Modify: `packages/dsh-orchestrator/src/client/HarnessHealthPanel.tsx`
- Modify: `packages/dsh-orchestrator/src/client/harness.module.css`
- Modify: `packages/dsh-orchestrator/src/client/useHarnessStatus.ts`
- Modify: `packages/dsh-orchestrator/tests/client/health-ui.spec.tsx`

1. Write failing UI tests for four tabs, period selection, total tokens, model ranking, trace rows, and cache benefit.
2. Implement Overview, Model Health, Agent Trace, and Token Usage tabs.
3. Keep the composer popover compact and the settings card detailed.
4. Run UI tests and inspect a real rendered page.

### Task 4: Build and release verification

1. Run orchestrator tests and type checks.
2. Run desktop tests with loopback access.
3. Run workspace production build and generated bundle checks.
4. Review `git diff --check`, secrets, generated output, and UI screenshots before delivery.
