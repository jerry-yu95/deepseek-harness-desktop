# Native Harness Orchestrator

This package adds a project-local orchestration contract to DeepSeek Harness without replacing its agent loop, compaction, goals, workflows, permissions, or subagents.

The `harness_state` tool creates and updates `.dsh-harness/`. When that directory exists, a bounded status snapshot is injected through the official dynamic-context service. Project state is portable Markdown/JSON and remains usable from other clients.
