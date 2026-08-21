# Harness Design Desktop 0.1.23

This release turns the community desktop shell into a three-platform distribution while keeping DeepSeek Harness itself independently recoverable.

## Highlights

- Windows x64, macOS Intel, and macOS Apple Silicon packages are built on native GitHub-hosted runners.
- The application checks this repository's GitHub Releases. Windows asks before downloading and again before restarting to install; unsigned macOS builds open the verified Release page for manual installation.
- Application updates and official DeepSeek Harness runtime updates are presented as two separate tracks. The existing runtime backup, health check, and rollback flow remains intact.
- macOS updater metadata combines both architectures so each machine selects the correct ZIP automatically.
- Every release publishes SHA-256 checksums, updater metadata, installers, ZIP payloads, and block maps only after target-specific package verification passes.
- Custom image themes replace the fragile preset-skin experience, with automatic readable palettes, overlay control, local persistence, and one-click restore.

## Verification

- 65 desktop tests passed, including a real official DSH host startup and unsigned-release workflow coverage.
- The local Apple Silicon package audit verified 211 runtime packages plus Sharp, Koffi, Cloudflare Tunnel, pnpm, and the official DSH CLI.
- The packaged Cloudflare Tunnel executable was confirmed as native arm64 rather than a cross-architecture payload.

## Installation notes

Download the artifact matching your system and verify it against `SHA256SUMS.txt`:

- `Harness-Design-Desktop-Setup-0.1.23-x64.exe`
- `Harness-Design-Desktop-0.1.23-x64.dmg`
- `Harness-Design-Desktop-0.1.23-arm64.dmg`

The current community builds are unsigned. Windows SmartScreen or macOS Gatekeeper may report an unknown publisher. Follow the linked installation guide and verify `SHA256SUMS.txt`. Unsigned macOS builds intentionally use a Release-page handoff instead of attempting automatic installation.

This is a community release and is not an official DeepSeek distribution.
