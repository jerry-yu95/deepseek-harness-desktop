# Adaptive Orchestration 2.0 Design

## Scope

The first release adds a deterministic, inspectable routing layer above the official DeepSeek Harness Agent and Workflow services. It does not replace the Agent Loop, Session, Workflow Engine, subagent providers, permissions, or compaction.

The new `adaptive` mode classifies a bounded task description along six axes: depth, horizon, breadth, parallelism, verification, and risk. It then chooses the smallest sufficient strategy: direct single-agent execution, planner/executor, planner plus independent review, or a bounded parallel DAG. Every decision includes reasons, confidence, an agent/token/time budget, and a typed DAG. Low-confidence or invalid plans fall back to standard execution.

## Data flow

1. User explicitly selects Adaptive orchestration.
2. The model-facing orchestration tool receives a bounded objective and optional constraints.
3. A deterministic local assessor computes task dimensions without another model call.
4. The router emits a typed decision and persists it in `.dsh-harness/runs/`.
5. For tasks requiring planning, the existing official Workflow Engine runs the Planner with the selected budget.
6. Invalid workflow output or unavailable infrastructure returns a standard-mode fallback instead of blocking the conversation.

This first release does not automatically dispatch implementation workers. That requires a second safety review because workers may mutate the workspace. It prepares and exposes the validated DAG so execution can be added without changing the public decision contract.

## Compatibility and safety

- Existing `standard` and `enhanced` state migrates without changes.
- Adaptive mode remains explicit and reversible.
- No hidden reasoning is stored; only bounded task features, routing reasons, budgets, node contracts, and summaries are persisted.
- DAGs are validated for unique IDs, known dependencies, cycles, and fixed budget ceilings.
- Simple tasks remain single-agent to avoid unnecessary latency and token use.

## Acceptance

- Deterministic identical routing for identical normalized input.
- Simple conversational tasks route to direct execution.
- Parallel, risky, multi-artifact tasks produce a bounded DAG and independent verification node.
- Cyclic or over-budget plans fail closed to standard execution.
- Existing enhanced mode tests and the full desktop profile remain green.
