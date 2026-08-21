# DeepSeek Harness Desktop 0.1.2

DeepSeek Harness Desktop packages the original DSH Web surface as a native Windows application while retaining the official runtime and complete dsh-web-ui plugin, skin, and skill collection.

## Fixed in 0.1.2

- Replaced the Windows native folder-dialog worker with the official DSH in-app directory browser. This resolves `win32 folder dialog worker exited before reporting a result` while preserving directory navigation, path editing, hidden folders, and folder creation.
- Added deterministic profile migration so existing desktop profiles receive the reliable picker automatically without changing official DSH source.
- Replaced the desktop, shortcut, and installer artwork with a cute anthropomorphic DeepSeek whale-girl icon in multi-resolution PNG and ICO formats.

## Installation performance

- Packaged file count: 17,489 to 13,173, down 24.7%.
- Installer size: 190.84 MiB to 183.78 MiB.
- Pruned payload: 4,316 non-runtime files and 30.71 MiB of declarations, published source, development material, duplicate pnpm artifacts, and non-x64 native files.
- Reference full-extraction run on the same Windows 11 machine: 93.00 seconds for the published 0.1.1 installer and 59.25 seconds for 0.1.2. Antivirus and disk-cache state can affect individual runs.

The complete DSH host, Web UI, 21 UI plugins, 9 skins, plugin installer, skill discovery/import, SSH, terminal, cloudflared, ripgrep, and x64 native modules remain included.

## Verification

- 32 desktop tests passed.
- 43 required packaged runtime packages passed the release audit.
- The packaged pnpm 11.21.0 plugin-management runtime executed successfully.
- Clean-profile startup, native window chrome, and the official in-app directory browser passed real packaged-EXE tests.

## Download

Download `Harness-Design-Desktop-Setup-0.1.2-x64.exe` and verify it using the adjacent `SHA256SUMS.txt`.

Installer SHA-256: `27045baffa89cf58cf3e103063faa61551c6b7aac860c07b543c3c5168392d71`

This community build is not signed with a commercial code-signing certificate. Windows SmartScreen may display an unknown publisher. Download only from this repository's Release page and use the default installation location when possible.

This is a community release and is not an official DeepSeek distribution.
