# External MCP Client Importers Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Import MCP configurations from WorkBuddy, CodeBuddy, TRAE, and Qoder through a read-only, preview-first desktop workflow without exposing plaintext credentials to the renderer.

**Architecture:** Add a main-process adapter registry that knows only verified user-level paths and accepts a native file-picker fallback for project or undocumented locations. Every source is normalized to the existing canonical `mcpServers` parser, cached behind an opaque token, previewed without secret values, and imported through the existing encrypted connector store and official `dsh-mcp-client` profile bridge.

**Tech Stack:** Electron IPC, Node.js ESM, React, TypeScript, CSS Modules, Node test runner, Vitest.

---

## Product and security boundaries

1. Import is read-only. Harness never edits WorkBuddy, CodeBuddy, TRAE, or Qoder files.
2. Verified automatic discovery covers:
   - WorkBuddy: `~/.workbuddy/mcp.json`.
   - CodeBuddy: the first existing user file from `~/.codebuddy/.mcp.json`, `~/.codebuddy/mcp.json`, and `~/.codebuddy.json`.
   - Qoder: `~/.qoder/settings.json`.
3. TRAE and project-level files use a native JSON/JSONC file picker because no stable public cross-platform default path is available.
4. CodeBuddy and Qoder JSONC comments and trailing commas are accepted without evaluating code.
5. Literal credentials remain in the main process. The renderer receives only credential names and `detected: true` flags.
6. Preview and import use the same cached bytes through an opaque, expiring token to avoid a file-changing-between-preview-and-import race.
7. Unknown transports or malformed documents fail closed with an actionable client-facing error.

## Task 1: Canonical external-client source adapters

**Files:**
- Create: `apps/dsh-desktop/src/extensions/mcp-client-sources.mjs`
- Create: `apps/dsh-desktop/test/mcp-client-sources.test.mjs`
- Modify: `apps/dsh-desktop/src/extensions/mcp-config.mjs`
- Modify: `apps/dsh-desktop/test/mcp-config.test.mjs`

**Steps:**

1. Write failing tests for verified path priority, missing/empty/available states, JSONC comments, trailing commas, direct `mcpServers`, and safe normalization.
2. Run `node --test apps/dsh-desktop/test/mcp-client-sources.test.mjs apps/dsh-desktop/test/mcp-config.test.mjs` and confirm the new cases fail.
3. Implement a bounded JSONC decoder, adapter metadata, candidate resolution, and source normalization.
4. Re-run the focused tests and confirm all pass.

## Task 2: Safe source sessions and desktop IPC

**Files:**
- Modify: `apps/dsh-desktop/src/extension-ipc.mjs`
- Modify: `apps/dsh-desktop/src/preload.cjs`
- Modify: `apps/dsh-desktop/test/extension-ipc.test.mjs`

**Steps:**

1. Add failing IPC tests for client discovery, native file selection, renderer-safe preview, opaque source tokens, encrypted import, token expiry/removal, and no plaintext secret in returned values.
2. Register `extensions:mcp-source-list`, `extensions:mcp-source-preview`, `extensions:mcp-source-pick`, and `extensions:mcp-source-import`.
3. Keep source documents in a bounded in-memory session registry. Never return document text or source file paths to the renderer.
4. Reuse one internal import function for pasted JSON and client-source imports.
5. Run the focused desktop IPC tests.

## Task 3: External-client import experience

**Files:**
- Modify: `packages/dsh-extension-center/src/client/bridge.ts`
- Modify: `packages/dsh-extension-center/src/client/locales.ts`
- Modify: `packages/dsh-extension-center/src/client/panel/ConnectorsTab.tsx`
- Modify: `packages/dsh-extension-center/src/client/panel/panel.module.css`
- Modify: `packages/dsh-extension-center/tests/bridge.test.ts`

**Steps:**

1. Add bridge types and pure helper tests for source status labels and import readiness.
2. Add a first-class `从其他客户端导入` action.
3. Show four client cards with available, empty, not found, or manual-selection states.
4. Let available sources open the existing safe review step. Let manual sources open the native file picker and then the same review step.
5. Keep the bottom action area fixed, announce errors with `role="alert"`, preserve keyboard focus, and provide light/dark/custom-theme compatible styles.
6. Build the extension bundle and run Vitest plus TypeScript checks.

## Task 4: Connector provenance and health behavior

**Files:**
- Modify: `apps/dsh-desktop/src/extensions/connectors.mjs`
- Modify: `apps/dsh-desktop/test/connectors.test.mjs`
- Modify: `packages/dsh-extension-center/src/client/bridge.ts`

**Steps:**

1. Extend validated connector provenance with `external-client`, `clientId`, and a non-sensitive scope label.
2. Show imported client provenance on connector cards without exposing a local path.
3. Run health checks after successful import as best effort; a failed check must not roll back or misreport a completed import.

## Task 5: Release and regression verification

**Files:**
- Modify: `package.json`
- Modify: `apps/dsh-desktop/package.json`
- Modify: `CHANGELOG.md`
- Modify: `docs/launch/release-notes.md`
- Modify generated `packages/dsh-extension-center/lib` output

**Steps:**

1. Run extension-center typecheck, tests, and production build.
2. Run the complete desktop suite, including the real loopback DSH Host integration test.
3. Run repository diff, forbidden emoji, secret-literal, and package integrity checks.
4. Bump the desktop release to `0.1.33` only after tests pass.
5. Build the unsigned arm64 DMG and verify its packaged runtime.
6. Commit the phase in reviewable changes. Do not push or publish without an explicit request.

## Definition of done

- WorkBuddy, CodeBuddy, and Qoder user MCP files can be discovered and safely previewed when present.
- TRAE and any project MCP file can be selected manually and imported through the same flow.
- The renderer never receives a raw source document, local source path, or plaintext credential.
- JSON and JSONC sources share the canonical parser and connector validation.
- Imported connectors survive restart and register through official Harness profile composition.
- Existing pasted JSON, presets, custom connectors, skills, remote control, and updater behavior remain green.
- A verified `0.1.33` arm64 DMG is produced for acceptance testing.
