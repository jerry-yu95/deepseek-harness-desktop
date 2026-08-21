# Native Harness Orchestrator

This package adds a project-local orchestration contract to DeepSeek Harness without replacing its agent loop, compaction, goals, workflows, permissions, or subagents.

The `harness_state` tool creates and updates `.dsh-harness/`. When that directory exists, a bounded status snapshot is injected through the official dynamic-context service. Project state is portable Markdown/JSON and remains usable from other clients.

The desktop client contributes two additive official UI surfaces:

- A compact composer control for Standard/Adaptive/Enhanced orchestration and model-health warnings.
- An Agent Harness settings card with health dimensions, trend, anomalies, cache hit rate, manual probes, and user feedback.
- A durable `/harness adaptive|on|off|status|route` fallback, plus `/harness run planner|reviewer|evaluator` for explicit role execution.

Enhanced orchestration remains explicit and uses the official DSH Workflow engine for planner, grounding-reviewer, and completion-evaluator roles. Cache keys include the project fingerprint and role contract; generated runtime data is ignored by the project-local `.dsh-harness/.gitignore`.

Adaptive orchestration is additive. It scores a bounded task objective, selects the smallest sufficient strategy, validates a typed DAG against Agent/Token/time budgets, and invokes the same official Agent-scoped Workflow Engine only when planning is warranted. It does not replace DSH permissions, compaction, sessions, tools, or subagents.
