# DeepSeek Harness Desktop Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build and publish a Windows desktop edition of DeepSeek Harness that embeds the official runtime, preserves all Web UI plugins and skills, and adds secure native lifecycle and extension management.

**Architecture:** Add an Electron workspace that launches the official `@deepseek-ai/dsh` CLI on an isolated desktop profile and loads its loopback Web UI. Package the existing aggregate plugin bundle beside the official runtime, expose only a narrow preload API, and manage plugins and skills through validated main-process services.

**Tech Stack:** Electron 43, Node.js ESM, `@deepseek-ai/dsh` 0.1.0-rc.6, pnpm 11, electron-builder 26, Node test runner, Playwright/Electron smoke tests, GitHub Actions.

---

### Task 1: Create the desktop workspace and test harness

**Files:**
- Create: `apps/dsh-desktop/package.json`
- Create: `apps/dsh-desktop/src/main.mjs`
- Create: `apps/dsh-desktop/test/smoke.test.mjs`
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json`

**Steps:**

1. Add a failing Node smoke test that imports the main module's exported bootstrap seam and asserts the desktop package metadata.
2. Run `pnpm --filter @deepseek-ai/dsh-desktop test` and verify that it fails because the workspace does not exist.
3. Add the workspace manifest, root scripts, and the smallest side-effect-free main module export.
4. Install the locked dependencies and run the test again.
5. Commit the workspace scaffold.

### Task 2: Implement profile bootstrap and runtime package linking

**Files:**
- Create: `apps/dsh-desktop/src/profile.mjs`
- Create: `apps/dsh-desktop/test/profile.test.mjs`

**Steps:**

1. Write tests for deterministic profile JSON, atomic creation, idempotent repair, and safe package-name/path validation.
2. Run the focused test and verify failure.
3. Implement `ensureDesktopProfile`, `resolveRuntimePackages`, and junction-or-copy fallback behavior.
4. Verify the profile can resolve `dsh-base`, `dsh-web-app`, `dsh-web-ui-all`, and every aggregate child package from an isolated temporary DSH home.
5. Commit the profile bootstrap.

### Task 3: Implement DSH host lifecycle

**Files:**
- Create: `apps/dsh-desktop/src/runtime-controller.mjs`
- Create: `apps/dsh-desktop/src/log-store.mjs`
- Create: `apps/dsh-desktop/test/runtime-controller.test.mjs`
- Create: `apps/dsh-desktop/test/log-store.test.mjs`

**Steps:**

1. Write tests for readiness-line parsing, loopback URL rejection, state transitions, bounded restart, graceful shutdown, and log rotation.
2. Run focused tests and verify failure.
3. Implement a dependency-injected controller around fixed executable and argument arrays.
4. Launch a real isolated DSH profile with `--port 0`, assert the readiness URL responds, then shut it down.
5. Commit runtime lifecycle support.

### Task 4: Build the secure Electron shell

**Files:**
- Modify: `apps/dsh-desktop/src/main.mjs`
- Create: `apps/dsh-desktop/src/preload.mjs`
- Create: `apps/dsh-desktop/src/navigation-policy.mjs`
- Create: `apps/dsh-desktop/src/window-state.mjs`
- Create: `apps/dsh-desktop/test/navigation-policy.test.mjs`
- Create: `apps/dsh-desktop/test/window-state.test.mjs`

**Steps:**

1. Write failing tests for loopback-only navigation and display-bounded window state.
2. Implement single-instance handling, isolated BrowserWindow preferences, URL policy, external-link routing, permission denial, download handling, and persisted geometry.
3. Expose a versioned, narrow preload API with no generic command execution.
4. Run unit tests and an Electron launch smoke test.
5. Commit the secure shell.

### Task 5: Add the startup and recovery experience

**Files:**
- Create: `apps/dsh-desktop/src/ui/startup.html`
- Create: `apps/dsh-desktop/src/ui/startup.css`
- Create: `apps/dsh-desktop/src/ui/startup.mjs`
- Create: `apps/dsh-desktop/src/ipc.mjs`
- Create: `apps/dsh-desktop/test/ipc.test.mjs`

**Steps:**

1. Write tests for structured status payloads and allowed recovery actions.
2. Implement a fast static startup screen with boot stages, sanitized logs, retry, repair, open-log-folder, and exit controls.
3. Wire runtime status events through typed IPC and switch to the DSH origin only after readiness validation.
4. Exercise success and simulated failure paths visually.
5. Commit startup and recovery UI.

### Task 6: Add plugin management

**Files:**
- Create: `apps/dsh-desktop/src/extensions/plugins.mjs`
- Create: `apps/dsh-desktop/test/plugins.test.mjs`
- Modify: `apps/dsh-desktop/src/ipc.mjs`

**Steps:**

1. Write tests for package-spec validation, built-in protection, manifest backup, install serialization, and rollback.
2. Implement plugin inventory from the desktop profile and fixed-entry-point pnpm invocation without a shell.
3. Add install, remove, repair, and restart-required results to IPC.
4. Test against an isolated profile with a harmless fixture bundle.
5. Commit plugin management.

### Task 7: Add skill management

**Files:**
- Create: `apps/dsh-desktop/src/extensions/skills.mjs`
- Create: `apps/dsh-desktop/test/skills.test.mjs`
- Modify: `apps/dsh-desktop/src/ipc.mjs`

**Steps:**

1. Write tests for official root precedence, one-level discovery, frontmatter validation, shadow reporting, symlink escape rejection, and no-overwrite import.
2. Implement catalog scanning and validated skill import into the user DSH skill root.
3. Add open-root, import, refresh, and diagnostic IPC actions.
4. Verify a newly imported fixture skill appears in a running DSH catalog without restart.
5. Commit skill management.

### Task 8: Build the extension center and native menus

**Files:**
- Create: `apps/dsh-desktop/src/ui/extensions.html`
- Create: `apps/dsh-desktop/src/ui/extensions.css`
- Create: `apps/dsh-desktop/src/ui/extensions.mjs`
- Create: `apps/dsh-desktop/src/menu.mjs`
- Modify: `apps/dsh-desktop/src/main.mjs`

**Steps:**

1. Add DOM-level tests for inventory rendering, empty states, validation errors, busy states, and restart prompts.
2. Build a keyboard-accessible bilingual extension window that is created only on demand.
3. Add native application, view, runtime, extension, and help menus with accelerators.
4. Visually verify light/dark mode, narrow windows, keyboard navigation, and error states.
5. Commit the extension center.

### Task 9: Package and optimize Windows artifacts

**Files:**
- Create: `apps/dsh-desktop/electron-builder.yml`
- Create: `apps/dsh-desktop/resources/desktop-profile.json`
- Create: `apps/dsh-desktop/resources/icon.png`
- Create: `apps/dsh-desktop/scripts/verify-package.mjs`
- Modify: `apps/dsh-desktop/package.json`
- Modify: `.gitignore`

**Steps:**

1. Configure NSIS and portable x64 targets, ASAR packaging, native-module unpacking, deterministic artifact names, and GitHub release metadata.
2. Build local artifacts and inspect the unpacked application for required runtime and plugin packages.
3. Run the packaged EXE with an isolated home and execute the smoke matrix.
4. Measure cold-start readiness, installer size, idle working set, and first-window time; record results and remove avoidable payload.
5. Commit packaging and optimization.

### Task 10: Complete regression and security verification

**Files:**
- Create: `docs/desktop/feature-matrix.md`
- Create: `docs/desktop/performance.md`
- Create: `docs/desktop/security.md`
- Create: `apps/dsh-desktop/test/electron.e2e.mjs`

**Steps:**

1. Run repository build, typecheck, unit tests, script checks, and aggregate checks.
2. Launch the packaged app and verify chat/session/workspace, settings, task board, Git graph, right panel, pet, stats, mobile remote, SSH, skins, plugins, and skills.
3. Verify renderer isolation, navigation denial, external-link handling, IPC validation, malicious package-spec rejection, and skill path containment.
4. Record exact performance measurements and known unsigned-build limitation.
5. Commit verification evidence.

### Task 11: Prepare the open-source project

**Files:**
- Create: `LICENSE`
- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`
- Create: `CHANGELOG.md`
- Create: `.github/workflows/desktop-release.yml`
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature_request.yml`
- Modify: `README.md`
- Modify: `README.en.md`

**Steps:**

1. Add bilingual installation, architecture, development, extension, troubleshooting, privacy, and release documentation.
2. Add contributor, security, license, changelog, and issue templates.
3. Add a Windows CI workflow that tests and builds artifacts, and a tag workflow that publishes GitHub Releases.
4. Validate links, commands, licenses, and secret-free repository history.
5. Commit open-source materials.

### Task 12: Publish and promote

**Files:**
- Create: `docs/launch/launch-article.zh-CN.md`
- Create: `docs/launch/launch-article.en.md`
- Create: `docs/launch/social-copy.md`
- Create: `docs/launch/release-notes-v0.1.0.md`

**Steps:**

1. Create a new public GitHub repository under the authenticated account and push the desktop branch without the unrelated dirty worktree changes.
2. Configure description, website, topics, issue tracker, Discussions when available, and repository social preview.
3. Tag `desktop-v0.1.0`, publish the Windows artifacts and checksums in a GitHub Release, and verify public downloads.
4. Publish a launch Discussion and prepare concise Chinese and English posts for developer communities and social platforms.
5. Verify every public link from a logged-out request and commit any final corrections.
