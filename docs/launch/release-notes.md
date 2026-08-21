# Harness Design Desktop 0.1.20

This release turns the community desktop shell into a three-platform distribution while keeping DeepSeek Harness itself independently recoverable.

## Highlights

- Windows x64, macOS Intel, and macOS Apple Silicon packages are built on native GitHub-hosted runners.
- The application now checks this repository's GitHub Releases, asks before downloading, and asks again before restarting to install.
- Application updates and official DeepSeek Harness runtime updates are presented as two separate tracks. The existing runtime backup, health check, and rollback flow remains intact.
- macOS updater metadata combines both architectures so each machine selects the correct ZIP automatically.
- Every release publishes SHA-256 checksums, updater metadata, installers, ZIP payloads, and block maps only after target-specific package verification passes.
- Custom image themes replace the fragile preset-skin experience, with automatic readable palettes, overlay control, local persistence, and one-click restore.

## Verification

- 62 desktop tests passed, including a real official DSH host startup.
- The local Apple Silicon package audit verified 211 runtime packages plus Sharp, Koffi, Cloudflare Tunnel, pnpm, and the official DSH CLI.
- The packaged Cloudflare Tunnel executable was confirmed as native arm64 rather than a cross-architecture payload.

## Installation notes

Download the artifact matching your system and verify it against `SHA256SUMS.txt`:

- `Harness-Design-Desktop-Setup-0.1.20-x64.exe`
- `Harness-Design-Desktop-0.1.20-x64.dmg`
- `Harness-Design-Desktop-0.1.20-arm64.dmg`

The current community builds are unsigned. Windows SmartScreen or macOS Gatekeeper may report an unknown publisher. Seamless macOS installation will be enabled after Developer ID signing and notarization secrets are configured; until then, update detection can direct users to this Release page.

This is a community release and is not an official DeepSeek distribution.
