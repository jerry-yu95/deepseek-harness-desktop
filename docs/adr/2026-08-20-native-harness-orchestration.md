# ADR: Build orchestration as a native DSH layer

Date: 2026-08-20

## Status

Accepted for the first MVP.

## Context

Harness Design Desktop already ships DeepSeek Harness compaction, goals, workflows, subagents, session projection, and tool execution. Adding a second agent runtime would duplicate lifecycle, cancellation, permissions, persistence, and model selection. The useful ideas from Pi Shadow Mind are persistent responsibility definitions, short-lived independent reviewers, a sanitized trajectory, bounded concurrency, and concise reports. The useful long-running Harness pattern is a planner-generator-evaluator loop backed by a single source of truth.

## Decision

Build a thin orchestration layer on the official DSH services:

- Project state lives in `.dsh-harness/` and is readable without the desktop app.
- `run.json` is the authoritative state machine: `planning -> executing -> evaluating -> repairing -> complete|blocked`.
- `feature-list.json` is the acceptance source of truth; generated prose cannot mark work complete by itself.
- Cognitive roles are persistent Markdown definitions but each execution is an ephemeral DSH subagent.
- Reviewer inputs contain user-visible messages and compact tool summaries only. Hidden reasoning and credentials are never copied.
- At most two read-only reviewers run concurrently. Reports are injected only when actionable.
- Context governance coordinates official `ctx.compaction`; it does not replace compaction or rewrite the raw session log.

## Consequences

The design remains compatible with official updates and preserves DSH permission/cancellation semantics. The MVP can be useful before a full orchestration UI exists. Random heartbeat activation, writable reviewers, cross-project memory, and autonomous background execution are deferred until deterministic lifecycle behavior is proven.

## Non-functional requirements

- No hidden-thought replication.
- No credential values in project memory or reviewer snapshots.
- Atomic state writes and recoverable malformed-state handling.
- Reviewer concurrency capped at two and disabled by default for expensive models.
- Official UI and runtime remain usable if this layer fails to initialize.
