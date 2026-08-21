# Enhanced Orchestration and Model Health Implementation Plan

> Execute in order and keep each task independently testable. Do not modify the official DSH agent loop or compaction implementation.

## Task 1: Versioned Harness state and cache foundation

**Files:**
- Modify: `packages/dsh-orchestrator/src/core.ts`
- Modify: `packages/dsh-orchestrator/tests/core.spec.ts`
- Modify: `packages/dsh-orchestrator/README.md`

Add v1-to-v2 migration, orchestration metadata, run records, project cache entries, deterministic digests, TTL/version validation, corrupt-entry recovery, in-flight deduplication, and Git-ignore helper. Test every persistence and invalidation rule.

## Task 2: Official workflow-backed role runner

**Files:**
- Add: `packages/dsh-orchestrator/src/orchestration.ts`
- Add: `packages/dsh-orchestrator/tests/orchestration.spec.ts`
- Modify: `packages/dsh-orchestrator/src/index.ts`
- Modify: `packages/dsh-orchestrator/package.json`

Implement Planner, Reviewer, and Evaluator schemas and workflow scripts through `ctx.workflowEngine.start()`. Ensure structured outputs, read-only role prompts, cancellation, disposal, cache reuse, redacted records, and standard-mode fallback. Extend tools/commands for explicit `on`, `off`, `status`, `run`, and cache bypass.

## Task 3: Model-health engine

**Files:**
- Add: `packages/dsh-orchestrator/src/model-health.ts`
- Add: `packages/dsh-orchestrator/tests/model-health.spec.ts`
- Modify: `packages/dsh-orchestrator/src/index.ts`

Implement passive-signal ingestion, per-route baselines, dimension scoring, sustained-degradation thresholds, trend snapshots, anomaly redaction, false-positive feedback, and cached manual-probe orchestration. Expose a host-safe summary and explicit probe action; never auto-switch models.

## Task 4: Browser surfaces

**Files:**
- Add/modify client files under `packages/dsh-orchestrator/src/client/`
- Modify: `packages/dsh-orchestrator/package.json`
- Modify: `packages/dsh-orchestrator/cordis.patch.yml`
- Add UI tests under `packages/dsh-orchestrator/tests/client/`

Register the per-session Enhanced orchestration selector using official UI slots, trajectory status cards, compact health indicator, and full health dashboard. Include loading, empty, healthy, volatile, degraded, failure, cache-hit, and reduced-motion states. Add Chinese and English copy and keyboard-accessible controls.

## Task 5: Build, regression, and release readiness

Run focused tests first, then package typecheck/build, workspace tests, desktop production build, and release verification. Confirm no secrets are written, no standard conversation behavior changes, cache directories are ignored, Windows/macOS path handling remains portable, and all generated distributions are current.
