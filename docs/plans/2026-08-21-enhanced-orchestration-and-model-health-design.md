# Enhanced Orchestration and Model Health Design

## Goal

Turn the existing project-local Harness acceptance ledger into an explicit, opt-in orchestration mode that uses DeepSeek Harness' official workflow, subagent, session, and compaction seams. Add project-local cache reuse and a model-health dashboard that warns about sustained quality regression without automatically switching models.

## Product contract

- Standard conversations retain the official DSH behavior and incur no orchestration overhead.
- Enhanced orchestration is enabled per conversation by an explicit user action.
- The flow is Planner -> main-agent execution -> Grounding Reviewer -> Completion Evaluator.
- Planner, Reviewer, and Evaluator are analysis-only. The main agent remains the only role that edits the workspace.
- Review failure preserves work but cannot mark the run complete.
- Infrastructure failure degrades to standard mode with a visible reason.
- Model-health detection warns only. It never silently changes provider, model, permissions, or workspace state.

## Architecture

### Official runtime boundary

The adapter calls `ctx.workflowEngine.start()` and its official `agent()` workflow hook. It does not replace the official agent loop or compaction engine. Structured child outputs are validated with object-rooted JSON schemas, cancellation is propagated through the parent signal, and every run is disposed after settlement.

### Project state

`.dsh-harness/run.json`, `feature-list.json`, and `progress.md` remain the durable source of truth. Version 2 run state adds orchestration mode, current stage, latest run identity, cache counters, and the last non-secret failure. Older version 1 state migrates on read.

Each orchestration attempt writes a bounded record under `.dsh-harness/runs/`. Records contain role outcomes, timestamps, cache metadata, acceptance decisions, and redacted evidence; they never contain hidden reasoning or credentials.

### Cache

The cache is project-local under `.dsh-harness/cache/` and ignored by Git by default.

- Planner key: normalized objective + workspace fingerprint + planner contract version.
- Reviewer/Evaluator key: acceptance digest + relevant Git/worktree fingerprint + evidence digest + role contract version.
- Model-health key: provider/model/route identity + probe-suite version, with a TTL.
- In-flight requests with the same key are deduplicated.
- Branch/HEAD, relevant files, role prompts, model route, adapter version, or official runtime version changes invalidate affected entries.
- Corrupt or incompatible entries are removed and recomputed.
- Secrets, complete tool outputs, hidden reasoning, and final user-facing answers are never cached.

### Model health

Health is a relative regression signal, not an IQ score. It combines:

- passive signals: instruction compliance, structured-output failures, tool-plan failures, repeated loops, truncation, reviewer rejection, and user correction;
- opt-in active probes: small isolated, read-only checks for logic, context retention, structured output, tool planning, and response completeness.

Scores are compared only with the same provider/model/route baseline. A warning requires enough samples and sustained degradation. Status is one of `healthy`, `volatile`, `degraded`, or `insufficient-data`.

### UI

- Add `Enhanced orchestration` as an explicit per-session mode beside Standard mode, with `/harness on|off|status` as a fallback.
- Render orchestration stages and cache hits in the trajectory.
- Add a clickable model-health summary near model selection and a full settings dashboard.
- The dashboard shows status, dimension scores, baseline delta, trends, redacted anomalies, sample count, cache/cost information, manual probe action, and false-positive feedback.

## Failure and privacy rules

- Planner failure falls back to standard execution and records a redacted diagnostic.
- Reviewer/Evaluator failure prevents automatic completion but never rolls back user work.
- Cancellation stops future children and settles the current run.
- Active probes use an ephemeral read-only child, do not read project files, and do not enter the normal conversation context.
- All persisted text passes through the existing secret redactor and bounded-output policy.

## Verification

- Unit tests cover migration, transitions, cache keys, invalidation, corruption recovery, in-flight deduplication, health scoring, baselines, warning thresholds, and redaction.
- Integration tests cover official workflow start/result/dispose, cancellation, cache hit/miss, and standard-mode fallback.
- UI tests cover mode selection, stage cards, dashboard states, manual probe, trends, and accessibility.
- Final verification runs package tests, type checks, production builds, and repository regression scripts.
