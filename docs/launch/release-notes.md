# Harness Design Desktop 0.1.29

This release adds opt-in adaptive task routing to the Agent Harness layer while preserving the official DeepSeek Harness runtime, Agent Loop, Workflow Engine, permissions, and standard conversation path.

## Highlights

- Standard mode retains the official DSH conversation behavior. Adaptive mode selects the smallest sufficient strategy. Enhanced mode remains the explicit Planner/Reviewer/Evaluator path.
- Adaptive routing chooses direct, plan-execute, plan-review, or bounded parallel-DAG strategies using deterministic complexity signals, visible reasons, confidence, and hard Agent/Token/time budgets.
- Simple explanations do not start the Workflow Engine. Complex and risky tasks use the official Agent-scoped Workflow Engine and fail back to standard execution if planning is unavailable.
- The composer orchestration control is now a descriptive dropdown rather than a hidden three-state cycle.
- Composer orchestration and model-health controls now match the official lightweight toolbar language: borderless line icons, text, and dropdown arrows.
- Manual health checks work in presets without Workflow Engine by using a bounded one-shot call through the current official DSH LLM route.
- Probe output is normalized before per-dimension scoring; harmless JSON formatting drift is tolerated, unreadable responses are retried once, and protocol failures never count as degradation.
- Project-local cache keys include role contracts and workspace fingerprints, with TTL invalidation, corruption recovery, in-flight de-duplication, and visible hit-rate statistics.
- A clickable model-health indicator and settings dashboard track six quality dimensions against the same provider/model/route baseline and warn only after sustained regression.
- Manual probes are isolated and cached. Health warnings never switch the model, provider, permissions, or workspace automatically.
- `/harness adaptive|on|off|status|route` provides a durable fallback when the visual control is unavailable; advanced users can explicitly run an orchestration role.
- Duplicate IM plugin registration is removed, and generated CSS module identifiers are stable across macOS, Windows, and CI paths.
- Windows x64, macOS Intel, and macOS Apple Silicon packages continue to be built on native GitHub-hosted runners.
- The application checks this repository's GitHub Releases. Windows asks before downloading and again before restarting to install; unsigned macOS builds open the verified Release page for manual installation.
- Application updates and official DeepSeek Harness runtime updates are presented as two separate tracks. The existing runtime backup, health check, and rollback flow remains intact.
- macOS updater metadata combines both architectures so each machine selects the correct ZIP automatically.
- Every release publishes SHA-256 checksums, updater metadata, installers, ZIP payloads, and block maps only after target-specific package verification passes.
- Custom image themes replace the fragile preset-skin experience, with automatic readable palettes, overlay control, local persistence, and one-click restore.
- The Agent Harness dashboard now includes Overview, Model Health, Agent Trace, and Token Usage views.
- Token usage is aggregated by model and period, using deduplicated deltas from the official live session projection.
- The local observability ledger excludes API keys, full prompts, full responses, and hidden reasoning, and is ignored by Git automatically.
- The Extension Dock now separates Cordis runtime plugins, MCP/API connectors, and Skills, and includes first-stage custom connector and Skill creation workflows.

## Verification

- 66 desktop tests passed, including a real official DSH Host startup and unsigned-release workflow coverage.
- 32 Agent Harness tests passed across adaptive routing and DAG validation, tolerant direct and Workflow model-health probes, state migration, cache behavior, official Workflow execution, observability aggregation, slash commands, and UI interactions.
- Workspace type checks, production builds, plugin aggregation, skin-center generation, Gallery generation, and release-format checks passed.
- The local Apple Silicon package audit verified 211 runtime packages plus Sharp, Koffi, Cloudflare Tunnel, pnpm, and the official DSH CLI.
- The packaged Cloudflare Tunnel executable was confirmed as native arm64 rather than a cross-architecture payload.

## Installation notes

Download the artifact matching your system and verify it against `SHA256SUMS.txt`:

- `Harness-Design-Desktop-Setup-0.1.29-x64.exe`
- `Harness-Design-Desktop-0.1.29-x64.dmg`
- `Harness-Design-Desktop-0.1.29-arm64.dmg`

The current community builds are unsigned. Windows SmartScreen or macOS Gatekeeper may report an unknown publisher. Follow the linked installation guide and verify `SHA256SUMS.txt`. Unsigned macOS builds intentionally use a Release-page handoff instead of attempting automatic installation.

This is a community release and is not an official DeepSeek distribution.
