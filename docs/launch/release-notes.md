# Harness Design Desktop 0.1.32

This release adds a low-friction official MCP connector onboarding flow on top of the 0.1.31 sidebar fix. Users can choose a verified provider template or paste the provider's official JSON, fill only missing credentials, and connect it without manually rebuilding the low-level MCP configuration.

## Highlights

- A new extension-center web UI plugin adds Skills and Connectors entries to the official sidebar, one click away from the conversation instead of the menu-bar Extension Dock.
- The Connector Center includes verified official MCP JSON templates for GitHub, Feishu/Lark, and GitLab, while TAPD is shown as awaiting a stable official JSON template rather than using an invented endpoint.
- Official `mcpServers` JSON can be previewed, selectively imported, and connected with only missing token/App ID/App Secret values entered by the user; stdio, streamable HTTP, and the common `http` alias are normalized automatically.
- Connector credentials are encrypted in the desktop main process, including credentials supplied as environment variables, HTTP headers, or stdio arguments; plaintext values are not written to connector records, generated profiles, logs, or exported JSON.
- The advanced custom connector form remains available for unverified providers and future WorkBuddy, CodeBuddy, Trae, and Qoder adapters.
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

- 16 extension-center vitest cases passed, including the React external-store callback regression plus connector catalog and bridge coverage.
- 87 desktop tests passed, including a real official DSH Host startup, main-process MCP import IPC coverage, encrypted credential cleanup, and unsigned-release workflow coverage.
- 32 Agent Harness tests passed across adaptive routing and DAG validation, tolerant model-health probes, state migration, cache behavior, official Workflow execution, observability aggregation, slash commands, and UI interactions.
- Workspace type checks, production builds, plugin aggregation (13 aggregate rows), skin-center generation, and Gallery generation passed.
- Emoji-free scan across all new content per repository policy.

## Installation notes

Download the artifact matching your system and verify it against `SHA256SUMS.txt`:

- `Harness-Design-Desktop-Setup-0.1.32-x64.exe`
- `Harness-Design-Desktop-0.1.32-x64.dmg`
- `Harness-Design-Desktop-0.1.32-arm64.dmg`

The current community builds are unsigned. Windows SmartScreen or macOS Gatekeeper may report an unknown publisher. Follow the linked installation guide and verify `SHA256SUMS.txt`. Unsigned macOS builds intentionally use a Release-page handoff instead of attempting automatic installation.

This is a community release and is not an official DeepSeek distribution.
