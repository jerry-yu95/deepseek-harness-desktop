# DeepSeek Harness Desktop 0.1.2: reliable folder selection and a faster installer

DeepSeek Harness Desktop 0.1.2 is available for Windows x64.

This release fixes the reported `win32 folder dialog worker exited before reporting a result` failure by selecting the official DSH in-app directory browser through the supported profile patch mechanism. It keeps folder navigation, editable paths, hidden folders, and folder creation without relying on the failing native worker.

The release payload now contains 24.7% fewer files and the installer is 183.78 MiB, down from 190.84 MiB. A same-machine reference extraction improved from 93.00 seconds to 59.25 seconds, with normal antivirus and disk-cache variance. All original Web UI functionality, plugins, skins, skills, SSH, terminal, and native x64 modules remain included.

The application also has a new multi-resolution chibi DeepSeek whale-girl icon for the executable, installer, and Windows shortcuts.

- [Download DeepSeek Harness Desktop 0.1.2](https://github.com/jerry-yu95/deepseek-harness-desktop/releases/tag/desktop-v0.1.2)
- [Read the source and architecture notes](https://github.com/jerry-yu95/deepseek-harness-desktop)
- Installer SHA-256: `27045baffa89cf58cf3e103063faa61551c6b7aac860c07b543c3c5168392d71`

The packaged application passed 32 desktop tests, a 43-package runtime audit, packaged pnpm execution, and real-EXE window and directory-picker tests.

The community build is currently unsigned. Windows SmartScreen may show an unknown publisher, so download only from the Release page above and verify the checksum.
