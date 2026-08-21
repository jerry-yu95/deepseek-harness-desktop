# Unsigned First Release Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use the Code workflow to implement this plan task-by-task.

**Goal:** Publish a trustworthy first cross-platform release without paid signing certificates and make the update experience honest about platform limitations.

**Architecture:** Keep GitHub Releases as the single desktop distribution source. Windows may use the in-app updater, while unsigned macOS builds detect a new version and open the verified Release page instead of attempting an update flow that requires Developer ID signing. Keep official DSH runtime updates isolated from desktop application updates.

**Tech Stack:** Electron, electron-updater, electron-builder, Node.js tests, GitHub Actions.

---

### Task 1: Make unsigned macOS updates manual

**Files:**
- Modify: `apps/dsh-desktop/src/app-update-manager.mjs`
- Modify: `apps/dsh-desktop/src/app-update-ipc.mjs`
- Test: `apps/dsh-desktop/test/app-update-manager.test.mjs`
- Test: `apps/dsh-desktop/test/app-update-ipc.test.mjs`

1. Add an explicit automatic/manual installation capability to public updater status.
2. Route available macOS updates to GitHub Releases with a clear unsigned-build explanation.
3. Keep Windows confirmation, download, and install behavior unchanged.
4. Run the focused updater tests.

### Task 2: Publish safe installation guidance

**Files:**
- Create: `docs/install.md`
- Create: `docs/install.en.md`
- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `docs/desktop.md`

1. Document artifact selection, SHA-256 verification, Gatekeeper, and SmartScreen steps.
2. Avoid recommending security bypass commands as the primary installation path.
3. Explain that unsigned macOS updates use a release-page handoff.

### Task 3: Normalize repository product identity

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `README.en.md`

1. Rename root workspace metadata to this desktop product.
2. Point source-build clone instructions to `jerry-yu95/deepseek-harness-desktop`.
3. Preserve third-party package attribution and licenses.

### Task 4: Prepare and validate release 0.1.21

**Files:**
- Modify: `apps/dsh-desktop/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `CHANGELOG.md`
- Modify: `docs/launch/release-notes.md`

1. Bump the desktop version so an installed 0.1.20 build can exercise update detection.
2. Run focused tests, the full desktop suite, lockfile verification, and package audit.
3. Commit and push only after all checks pass.
4. Create `desktop-v0.1.21` only after the pushed CI succeeds.
