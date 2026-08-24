# Harness Design Desktop 0.1.35

This release turns the Connector Center into a verified, lifecycle-aware catalog while preserving the official DeepSeek Harness runtime boundary.

## Highlights

- GitHub, Feishu/Lark, GitLab, and DingTalk are available as verified official MCP templates with guided credential entry.
- TAPD and Tencent Gongfeng accept the provider's official `mcpServers` JSON instead of relying on guessed endpoints or duplicated organization fields.
- Tencent Meeting and WeCom link to their official Skill-based integration paths.
- Imported local stdio and npx servers require an explicit execution-trust confirmation before the desktop main process accepts them.
- Connectors can be enabled, disabled, checked, and reconfigured without deleting encrypted credentials or provenance.
- WorkBuddy, CodeBuddy, TRAE, and Qoder discovery remains read-only and uses bounded project, user, and application-data locations with manual selection only as a fallback.
- Connector credentials continue to be encrypted and retained in the desktop main process; plaintext values are not written to generated profiles, connector records, logs, or exports.
- Catalog links now identify official MCP documentation, provider configuration pages, official Skill guides, and API/OAuth references separately; the UI also states that source and import-flow verification is not the same as real-account authorization testing.
- New Session and history items leave the Extension Center and reveal the official conversation route instead of rendering the composer underneath the center panel.
- The composer now shows the active adapter's reported context occupancy as a compact token count and percentage, with visible warnings near the default automatic-compaction range; unknown capacities remain undisplayed rather than inferred.
- Windows x64, macOS Intel, and macOS Apple Silicon release artifacts are built and verified on native GitHub-hosted runners.

## Verification

- Connector catalog integrity, mixed-case official environment variables, enable/disable persistence, local-command trust, source-session isolation, and encrypted import have dedicated regression tests.
- Extension Center navigation, bridge behavior, MCP review helpers, external-source actions, connector lifecycle controls, and context-capacity rendering have dedicated component and controller tests.
- Full workspace tests, type checks, production builds, aggregate consistency, package verification, and an emoji-free repository scan run before release.
- Every published artifact is accompanied by SHA-256 checksums and target-specific updater metadata.

## Installation notes

Download the artifact matching your system and verify it against `SHA256SUMS.txt`:

- `Harness-Design-Desktop-Setup-0.1.35-x64.exe`
- `Harness-Design-Desktop-0.1.35-x64.dmg`
- `Harness-Design-Desktop-0.1.35-arm64.dmg`

The community builds are unsigned. Windows SmartScreen or macOS Gatekeeper may report an unknown publisher. Follow the installation guide and verify `SHA256SUMS.txt`. Unsigned macOS builds intentionally open the verified Release page instead of attempting an automatic installation.

This is a community release and is not an official DeepSeek distribution.
