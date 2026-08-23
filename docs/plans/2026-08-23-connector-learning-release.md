# Connector, Learning, and Cross-platform Release Implementation Plan

> **For implementers:** execute tasks in order and stop release work if any verification step fails.

**Goal:** Deliver automatic external-client MCP discovery, guided connector onboarding and diagnostics, an in-product learning destination, refreshed public learning content, and verified three-platform installers.

**Architecture:** Extend the existing main-process source-session boundary and connector registry rather than adding another credential path. Reuse the Extension Center for all user-facing flows. Keep the learning site standalone while adding a native summary/link inside the desktop plugin.

**Tech stack:** Electron/Node ESM, React/TypeScript extension plugin, DeepSeek Harness profile patches, Node test runner/Vitest, vinext React site, electron-builder, GitHub Actions.

---

## Task 1: External client auto-discovery

**Files:**
- Modify: `apps/dsh-desktop/src/extensions/mcp-client-sources.mjs`
- Modify: `apps/dsh-desktop/test/mcp-client-sources.test.mjs`
- Modify: `apps/dsh-desktop/src/extension-ipc.mjs`
- Modify: `apps/dsh-desktop/test/extension-ipc.test.mjs`
- Modify: `packages/dsh-extension-center/src/client/panel/ConnectorsTab.tsx`
- Modify: `packages/dsh-extension-center/tests/bridge.test.ts`

**Steps:**
1. Add tests for WorkBuddy `.mcp.json`, empty-file fallthrough, workspace candidates, TRAE platform candidates, and Qoder project precedence.
2. Introduce scoped candidate descriptors and select the first valid non-empty document.
3. Pass the active workspace into discovery where available without exposing it to the renderer.
4. Change client cards to “自动查找并预览”; retain “手动选择文件” only after not-found/invalid status.
5. Run focused desktop and extension-center tests.

## Task 2: Presets and diagnostics

**Files:**
- Modify: `packages/dsh-extension-center/src/client/catalog.ts`
- Modify: `packages/dsh-extension-center/src/client/panel/ConnectorsTab.tsx`
- Modify: `packages/dsh-extension-center/src/client/locales.ts`
- Modify: `apps/dsh-desktop/src/connector-store.mjs`
- Modify: corresponding connector and UI tests

**Steps:**
1. Keep GitHub, Feishu, and GitLab as reviewable official presets.
2. Convert TAPD into a guided official-JSON import action without inventing an endpoint.
3. Return structured diagnostic stages for configuration, credentials, runtime/endpoint, and profile registration.
4. Render persistent diagnostic cards with recovery guidance and a sticky/visible action area.
5. Test missing-secret, missing-command, reachable/auth-required HTTP, and registered-profile cases.

## Task 3: Learning destination and platform refresh

**Files:**
- Modify: `packages/dsh-extension-center/src/client/panel/controller.ts`
- Modify: `packages/dsh-extension-center/src/client/sidebar-entry.ts`
- Add: `packages/dsh-extension-center/src/client/panel/LearningTab.tsx`
- Modify: `packages/dsh-extension-center/src/client/panel/ExtensionPanel.tsx`
- Modify: `packages/dsh-extension-center/src/client/locales.ts`
- Modify: sibling project `deepseek-harness-product-design-platform/app/page.tsx`
- Modify: sibling site styles/tests as required

**Steps:**
1. Add the `learning` tab and sidebar entry with the same lifecycle and active-state rules as existing entries.
2. Add a plain-language native learning overview and a safe external link to the full platform.
3. Refresh the full platform: official core vs community additions, user problem-to-design mapping, connectors, skills, orchestration, observability, remote control, updates, and custom themes.
4. Remove stale nine-skin and old upstream references.
5. Run extension-center tests and site lint/build/render tests; publish the site through its configured hosting project if deployment tooling is available.

## Task 4: Documentation and versioning

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md` if present
- Modify: `CHANGELOG.md`
- Modify: `docs/launch/release-notes.md`
- Modify: workspace/app/package versions and lockfile

**Steps:**
1. Write a concise open-source product introduction, feature map, official/community boundary, screenshots/install links, privacy model, and roadmap.
2. Document automatic import locations, manual fallback, diagnostics, and unsigned macOS installation.
3. Advance the patch version consistently and verify the release tag script.

## Task 5: Full verification and release

**Steps:**
1. Run all workspace tests, typechecks, builds, aggregate/gallery checks, and emoji/compliance checks.
2. Build and verify the Apple Silicon DMG locally.
3. Commit and push the implementation branch/main as appropriate.
4. Create and push `desktop-v<version>`.
5. Wait for GitHub Actions release jobs; verify Windows EXE, arm64 DMG, x64 DMG, metadata, and checksums.
6. Report exact artifact links and any unsigned-install caveat.
