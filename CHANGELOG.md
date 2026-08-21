# Changelog

## 0.1.23 - 2026-08-21

- Fixed Windows package verification by using command arguments that preserve paths correctly across PowerShell and POSIX shells.
- Added a regression test that rejects shell-specific single-quoted package paths.
- Supersedes the failed, unpublished `desktop-v0.1.22` release attempt; no 0.1.22 installation artifacts were published.

## 0.1.22 - 2026-08-21

- Fixed GitHub Actions macOS releases without Apple certificates by keeping unsigned and certificate-backed build steps mutually exclusive.
- Added a regression test that prevents empty signing secrets from being forwarded to electron-builder.
- Supersedes the failed, unpublished `desktop-v0.1.21` release attempt; no 0.1.21 installation artifacts were published.

## 0.1.21 - 2026-08-21

- Changed unsigned macOS application updates to a clear GitHub Release handoff instead of attempting an unreliable automatic installation.
- Added Chinese and English installation guides for artifact selection, checksum verification, Gatekeeper, and SmartScreen.
- Normalized the repository identity and source-build links around `jerry-yu95/deepseek-harness-desktop` while preserving third-party attribution.
- Prepared a version newer than 0.1.20 so the first public update path can be tested end to end.

## 0.1.20 - 2026-08-20

- Fixed custom wallpaper images being hidden by stacked theme and surface overlays.
- Added a live 35%-100% wallpaper visibility control with local persistence and backward-compatible defaults for existing themes.
- Added runtime and real Electron regression coverage for upload preview, vivid wallpaper rendering, and the saved visibility setting.
- Added separate desktop-application updates backed by this repository's GitHub Releases while preserving official DSH runtime backup and rollback.
- Added native Windows x64, macOS Intel, and macOS Apple Silicon release jobs, merged macOS updater metadata, target-specific native audits, and release checksums.

## 0.1.19 - 2026-08-20

- Fixed the adaptive-theme settings entry rendering as an empty row by passing its React card through the DSH slot API's component argument.
- Added a client registration regression test that verifies the visible card and localization namespace are both supplied to the host renderer.

## 0.1.18 - 2026-08-20

- Replaced the nine fragile preset skins with one user-image adaptive theme that derives a readable light/dark palette and enforces safe text contrast.
- Added local-only theme persistence, live preview, one-click official-style restore, image validation, and migration from desktop-managed legacy skins.
- Added the first native Harness orchestration layer: project-local objective/phase state, acceptance evidence, bounded context injection, sanitized trajectory utilities, and persistent planner/reviewer/evaluator role definitions.
- Kept orchestration on the official DSH system-prompt, tool, workflow, subagent, and compaction stack instead of introducing a competing agent runtime.

## 0.1.10 - 2026-08-19

- Added hard timeouts around cloudflared preparation and public endpoint verification.
- Added a visible stalled-connection diagnosis and manual retry action to mobile remote control.
- Avoided repeated LAN QR requests while the personal public tunnel is still starting.

## 0.1.9 - 2026-08-19

- Integrated the community `@xmanrui/dsh-im@0.7.1` plugin for Feishu, Weixin iLink, WeCom, QQ, DingTalk, Telegram, Discord, Slack, and WhatsApp.
- Added QR/manual bot provisioning, DSH credential-provider storage, per-bot workspaces, and channel-specific status/settings through the upstream plugin.
- Removed the temporary environment-variable channel gateway from `dsh-remote-web-ui` to prevent duplicate bot logins and replies.

## 0.1.2 - 2026-08-14

- Replaced the failing Windows native folder-dialog worker with the official DSH in-app directory browser.
- Reduced the Windows release payload by pruning published source, declarations, development material, and non-x64 native artifacts after packaging.
- Replaced the desktop and installer artwork with a cute anthropomorphic DeepSeek whale-girl icon.

## 0.1.1 - 2026-08-14

Natural Windows chrome refinement.

- Replaced the disconnected bright title and menu rows with a 46-pixel deep-sea title surface.
- Preserved native Windows caption buttons, resizing, keyboard menu access, and Snap layouts.
- Added context-aware labels for startup, the original Web surface, and the Extension Dock.
- Added page safe-area handling plus unit and real-runtime Electron verification.

## 0.1.0 - 2026-08-14

Initial Windows desktop release.

- Lossless Electron host for the official DSH Web application.
- Isolated, idempotent `desktop` profile with the complete dsh-web-ui aggregate.
- Managed runtime lifecycle, readiness probes, graceful shutdown, bounded restart, and recovery UI.
- Hardened preload, IPC, navigation, permissions, downloads, logs, and window-state persistence.
- Extension Dock for protected built-ins, transactional registry plugins, and safe skill discovery/import.
- 21 bundled UI plugins with 9 selectable skins, including Miku and Trading, plus the upstream compatibility layer.
- Hermetic DSH rc.6 runtime peer closure, verified from a clean short-path Windows installation.
- Windows x64 NSIS installer, reproducible verification script, and CI/release workflows.
