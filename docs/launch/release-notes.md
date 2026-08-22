# Harness Design Desktop 0.1.31

This patch release fixes the Skills and Connectors sidebar entries so their extension-center panel renders on the first click. It retains all extension-center, connector, Skill Studio, Agent Harness, update, and cross-platform packaging capabilities introduced in 0.1.30.

## Highlights

- A new extension-center web UI plugin adds Skills and Connectors entries to the official sidebar, one click away from the conversation instead of the menu-bar Extension Dock.
- The extension-center panel lives in the center column and rides the official design tokens, so themes, light/dark modes, and custom skins apply automatically.
- Skill Studio (create SKILL.md), skill bundle import, and the user skill root shortcut are available in the GUI; the Harness watcher discovers created skills automatically.
- The Connector Center supports custom MCP (stdio and Streamable HTTP) and HTTP API registrations, health checks, and removal, backed by the official dsh-mcp-client and safe profile reloads.
- In plain browser sessions (dsh web without the desktop), the panel degrades to an explicit desktop-only notice instead of failing silently.
- The Extension Dock keeps its Skills and Connectors tabs during the transition; both surfaces share one desktop IPC backend.
- Standard mode retains the official DSH conversation behavior. Adaptive mode selects the smallest sufficient strategy. Enhanced mode remains the explicit Planner/Reviewer/Evaluator path.
- The Agent Harness dashboard retains Overview, Model Health, Agent Trace, and Token Usage views, backed by the project-local observability ledger.
- The composer keeps the descriptive orchestration dropdown and borderless model-health controls.
- Windows x64, macOS Intel, and macOS Apple Silicon packages continue to be built on native GitHub-hosted runners.
- The application checks this repository's GitHub Releases. Windows asks before downloading and again before restarting to install; unsigned macOS builds open the verified Release page for manual installation.
- Application updates and official DeepSeek Harness runtime updates remain two separate tracks with backup, health check, and rollback intact.
- Every release publishes SHA-256 checksums, updater metadata, installers, ZIP payloads, and block maps only after target-specific package verification passes.

## Verification

- 16 extension-center vitest cases passed, including the React external-store callback regression plus bridge availability and form-to-payload mapping.
- 73 desktop tests passed, including a real official DSH Host startup and unsigned-release workflow coverage.
- 32 Agent Harness tests passed across adaptive routing and DAG validation, tolerant model-health probes, state migration, cache behavior, official Workflow execution, observability aggregation, slash commands, and UI interactions.
- Workspace type checks, production builds, plugin aggregation (13 aggregate rows), skin-center generation, and Gallery generation passed.
- Emoji-free scan across all new content per repository policy.

## Installation notes

Download the artifact matching your system and verify it against `SHA256SUMS.txt`:

- `Harness-Design-Desktop-Setup-0.1.31-x64.exe`
- `Harness-Design-Desktop-0.1.31-x64.dmg`
- `Harness-Design-Desktop-0.1.31-arm64.dmg`

The current community builds are unsigned. Windows SmartScreen or macOS Gatekeeper may report an unknown publisher. Follow the linked installation guide and verify `SHA256SUMS.txt`. Unsigned macOS builds intentionally use a Release-page handoff instead of attempting automatic installation.

This is a community release and is not an official DeepSeek distribution.
