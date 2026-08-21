# Adaptive Orchestration 2.0 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an explicit adaptive orchestration mode that selects the smallest sufficient strategy and produces a validated, budgeted task DAG above the official DSH Workflow Engine.

**Architecture:** A pure deterministic assessor and DAG validator live in a new module. Core state accepts an additive `adaptive` mode, the host tool and slash command expose routing, and the existing planner remains the only model-driven orchestration step in this release.

**Tech Stack:** TypeScript, Cordis, DeepSeek Harness Workflow Engine, Vitest, React.

---

### Task 1: Routing domain

**Files:** Create `packages/dsh-orchestrator/src/adaptive.ts`; create `packages/dsh-orchestrator/tests/adaptive.spec.ts`.

1. Write failing tests for simple, reviewed, parallel and bounded routing.
2. Run the focused tests and confirm failure.
3. Implement normalized scoring, strategy selection, budgets, DAG creation and validation.
4. Run focused tests and typecheck.

### Task 2: Persistent mode and API

**Files:** Modify `packages/dsh-orchestrator/src/core.ts`, `src/index.ts`, `src/wire.ts`, and orchestration tests.

1. Write migration and command/tool contract tests.
2. Extend mode validation with `adaptive` without changing standard/enhanced semantics.
3. Add `route` to the orchestration tool and `/harness adaptive|route` fallback.
4. Persist bounded routing summaries in run records.

### Task 3: UI and verification

**Files:** Modify `packages/dsh-orchestrator/src/client/HarnessHealthPanel.tsx`, `useHarnessStatus.ts`, CSS and client tests.

1. Add explicit Standard, Enhanced and Adaptive controls.
2. Show the latest adaptive strategy, reason and budget in the dashboard.
3. Run package tests, build, desktop tests and packaged-profile startup.
4. Build the next unsigned macOS installer for user verification.
