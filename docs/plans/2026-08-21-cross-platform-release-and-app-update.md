# Cross-platform Release and Application Update Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Publish verified Windows x64, macOS Intel, and macOS Apple Silicon installers and let installed desktop clients discover and install releases from this repository.

**Architecture:** Add an application-level updater around `electron-updater` while retaining the existing official-runtime updater. Build all supported architectures from tagged GitHub Actions runs, verify native payloads per target, then publish artifacts, updater metadata, and checksums in one release.

**Tech Stack:** Electron 43, electron-builder, electron-updater, Node test runner, GitHub Actions, GitHub Releases.

---

### Task 1: Application updater state machine

**Files:**
- Create: `apps/dsh-desktop/src/app-update-manager.mjs`
- Create: `apps/dsh-desktop/test/app-update-manager.test.mjs`

1. Write tests for development mode, available/current/error states, progress, explicit download, and explicit install.
2. Run the focused tests and confirm they fail before implementation.
3. Implement an injected updater adapter with a serializable public status.
4. Run the focused tests and confirm they pass.

### Task 2: Desktop integration and user prompts

**Files:**
- Create: `apps/dsh-desktop/src/app-update-ipc.mjs`
- Create: `apps/dsh-desktop/test/app-update-ipc.test.mjs`
- Modify: `apps/dsh-desktop/src/electron-app.mjs`
- Modify: `apps/dsh-desktop/src/preload.cjs`
- Modify: `apps/dsh-desktop/src/menu.mjs`
- Modify: `apps/dsh-desktop/src/ui/extensions.html`
- Modify: `apps/dsh-desktop/src/ui/extensions.mjs`

1. Test the fixed IPC surface and prompt decisions.
2. Add a normal “检查应用更新” menu action and application-update card.
3. Trigger a quiet startup check after the first ready state and notify only when a newer release exists.
4. Keep all official-runtime controls under a clearly separate heading.

### Task 3: Architecture-aware packaging

**Files:**
- Modify: `apps/dsh-desktop/package.json`
- Modify: `apps/dsh-desktop/electron-builder.yml`
- Modify: `apps/dsh-desktop/scripts/verify-package.mjs`
- Modify: `pnpm-lock.yaml`

1. Add `electron-updater` and both Darwin native payload architectures.
2. Add explicit Windows x64, macOS x64, and macOS arm64 scripts.
3. Select native package assertions from target platform and architecture.
4. Verify local macOS arm64 packaging and generated update metadata.

### Task 4: Release automation

**Files:**
- Modify: `.github/workflows/desktop-release.yml`
- Modify: `.github/workflows/desktop-ci.yml`

1. Build and verify Windows x64 on Windows.
2. Build both macOS architectures on an Intel macOS runner so one job generates coherent macOS update metadata.
3. Upload intermediate artifacts, combine checksums on Linux, and publish one GitHub Release.
4. Keep signing optional now and document the required Apple secrets.

### Task 5: Documentation and verification

**Files:**
- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `docs/desktop.md`
- Modify: `docs/launch/release-notes.md`

1. Document supported systems and unsigned-build limitations.
2. Run desktop tests and packaging verification.
3. Commit and push the implementation.
4. Confirm GitHub CI passes; create a release tag only after the user approves the public release version.
