# Phase 2 Remote and Official Source Update Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make mobile remote control diagnosable and safe to start from the desktop shell, and add an isolated GitHub-source snapshot path that cannot replace the working runtime until it passes validation.

**Architecture:** Keep the official DSH server on loopback. Mobile access uses the existing one-time pairing plugin and an explicit personal-device Cloudflare quick tunnel, with Electron validating the caller and surfacing lifecycle failures. GitHub source updates are staged under Electron user data, keyed by an immutable commit, verified in isolation, and only then made eligible for runtime installation; the packaged runtime and desktop profile remain untouched.

**Tech Stack:** Electron main/preload, official `@deepseek-ai/dsh`, Cordis remote-web-ui plugin, Node `fetch`/filesystem APIs, pnpm, Node test runner, Vitest.

---

### Task 1: Lock down the desktop remote IPC boundary

**Files:**
- Modify: `apps/dsh-desktop/src/ipc.mjs`
- Modify: `apps/dsh-desktop/src/electron-app.mjs`
- Test: `apps/dsh-desktop/test/ipc.test.mjs`

**Steps:**

1. Add a sender check for `desktop:remote-enable` so only the main DSH window can start a tunnel-backed mode.
2. Add a narrow `desktop:remote-status` request that probes the active loopback runtime's `/api/pair/status` and returns sanitized mode/URL/tunnel diagnostics.
3. Return actionable error categories for stopped runtime, unreachable pairing route, and tunnel failure.
4. Test trusted and untrusted senders plus status sanitization.

### Task 2: Make personal-device tunnel lifecycle observable

**Files:**
- Modify: `apps/dsh-desktop/src/preload.cjs`
- Modify: `packages/dsh-remote-web-ui/src/client/RemoteEntry.tsx`
- Test: `apps/dsh-desktop/test/runtime-controller.test.mjs`

**Steps:**

1. Expose the remote status call through the minimal preload bridge.
2. Use the status bridge after a restart or timeout to show whether the runtime, pairing route, or tunnel failed.
3. Keep automatic public exposure opt-in and leave the existing stop/retry controls in the remote panel.
4. Test mode transitions and restart cleanup without starting a public listener in test mode.

### Task 3: Stage GitHub source snapshots by commit

**Files:**
- Modify: `apps/dsh-desktop/src/update-manager.mjs`
- Modify: `apps/dsh-desktop/src/update-ipc.mjs`
- Modify: `apps/dsh-desktop/src/preload.cjs`
- Modify: `apps/dsh-desktop/src/ui/extensions.html`
- Modify: `apps/dsh-desktop/src/ui/extensions.mjs`
- Test: `apps/dsh-desktop/test/update-manager.test.mjs`

**Steps:**

1. Validate GitHub commit metadata and build a safe archive URL without accepting arbitrary hosts or paths.
2. Download a commit archive into a temporary file under user data, enforce a size limit, extract with an argument-array `tar` process, and atomically move it to a commit-keyed snapshot directory.
3. Validate the source manifest in the isolated directory; do not execute source build scripts or change the active runtime pointer in this task.
4. Expose snapshot status and a clear “源码快照已准备，等待构建/安装” state in the Extension Dock.
5. Test archive validation, atomic cleanup, retry behavior, and state persistence.

### Task 4: Verify and package

**Files:**
- Modify: `docs/update-and-extension-safety.md`
- Modify: `docs/desktop.md`
- Test: `apps/dsh-desktop/test/*.test.mjs`

**Steps:**

1. Run focused remote/update tests.
2. Run the complete desktop test suite and record environment-only failures separately.
3. Build the macOS arm64 app and DMG, verify the installed app contains the new preload/main code, and run `codesign --verify --deep --strict`.
4. Document the mobile pairing flow and the source snapshot limitations.
