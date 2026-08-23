# Harness Design Desktop 0.1.34

This release turns MCP onboarding into a guided, one-click flow and adds a first-class learning surface inside DeepSeek Harness Desktop.

## Highlights

- WorkBuddy, CodeBuddy, TRAE, and Qoder can now be discovered automatically from bounded user, project, and supported application-data locations. The native file picker remains available only as a fallback.
- Project-local configurations take precedence when present. Empty, invalid, or credential-only files are skipped safely so a usable lower-priority source can still be found.
- The source clients remain read-only: Harness Desktop never edits their configuration and never sends raw source paths, documents, or plaintext credentials to the web renderer.
- GitHub, Feishu/Lark, and GitLab remain verified recommended MCP presets. TAPD now leads directly to the official JSON importer so users can paste the provider's `mcpServers` configuration instead of duplicating account, organization, server, and project fields.
- Long JSON imports keep validation errors in a fixed dialog footer, preventing actionable feedback from disappearing below the viewport.
- Connector health is now explained in four stages: configuration, credentials, runtime reachability, and Harness registration. Authentication challenges are not misreported as server outages.
- A new Learn entry sits beside Skills and Connectors in the official sidebar. It explains the official/community boundary and links to the refreshed interactive product-design platform.
- The learning platform now explains Connector Center, Skill Studio, orchestration, caching, model health, Token analytics, mobile remote control, safe updates, and cross-platform packaging through plain problem-to-product-choice examples.
- Connector credentials continue to be encrypted and retained in the desktop main process; plaintext values are not written to generated profiles, connector records, logs, or exports.
- Windows x64, macOS Intel, and macOS Apple Silicon release artifacts are built and verified on native GitHub-hosted runners.

## Verification

- Automatic discovery, invalid-source fallback, project precedence, source-session isolation, staged diagnostics, and external-client provenance have dedicated desktop regression tests.
- Extension Center navigation, Learning rendering, bridge behavior, form mapping, MCP review helpers, and external-source actions have dedicated component and controller tests.
- Full workspace tests, type checks, production builds, aggregate consistency, package verification, and an emoji-free repository scan run before release.
- Every published artifact is accompanied by SHA-256 checksums and target-specific updater metadata.

## Installation notes

Download the artifact matching your system and verify it against `SHA256SUMS.txt`:

- `Harness-Design-Desktop-Setup-0.1.34-x64.exe`
- `Harness-Design-Desktop-0.1.34-x64.dmg`
- `Harness-Design-Desktop-0.1.34-arm64.dmg`

The community builds are unsigned. Windows SmartScreen or macOS Gatekeeper may report an unknown publisher. Follow the installation guide and verify `SHA256SUMS.txt`. Unsigned macOS builds intentionally open the verified Release page instead of attempting an automatic installation.

This is a community release and is not an official DeepSeek distribution.
