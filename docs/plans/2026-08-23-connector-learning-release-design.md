# Connector, Learning, and Cross-platform Release Design

**Date:** 2026-08-23

## Goal

Turn the current connector prototype into a low-friction, diagnosable workflow; make the community additions understandable from inside Harness; and publish verified Apple Silicon, Intel macOS, and Windows installers.

## Product decisions

### 1. External client import is discovery-first

The primary action for WorkBuddy, CodeBuddy, TRAE, and Qoder is **automatic local discovery**. The renderer receives only client name, scope, status, and server count. File paths, JSON documents, and credentials remain in the Electron main process. Manual file selection remains a fallback when no verified configuration is found.

Discovery is bounded to documented or application-specific locations plus the active workspace. It never scans the whole home directory. Empty or invalid higher-priority files do not hide a later valid source.

### 2. Official MCP JSON stays the universal connector format

Providers commonly publish a ready-to-paste `mcpServers` JSON document. The product should not force users to re-enter account, server, organization, or project fields that the provider already encoded. Presets open the same preview pipeline as pasted or imported JSON. Credential placeholders are collected separately and stored only by the desktop secret service.

### 3. Diagnostics explain stages, not just “failed”

Connector checks report four independent stages:

1. Configuration shape
2. Required credential availability
3. Local runtime or remote endpoint reachability
4. Registration in the active desktop profile

Each stage has a status and an actionable message. A failed credential check must remain visible in the panel and must not be clipped below the viewport.

### 4. Learning is a first-class extension-center destination

The sidebar gains a **学习** entry beside 技能 and 连接器. It opens a native summary that explains the official Harness layers and community additions in plain language, then links to the full learning platform. The full platform is refreshed to cover connector import, Skill Studio, orchestration, observability, mobile remote control, updates, and custom themes. It must clearly distinguish official Harness mechanisms from community desktop additions.

### 5. Release remains reproducible and unsigned

The repository version is advanced once all tests pass. Apple Silicon is built and verified locally. A signed Git tag triggers GitHub Actions to build and verify Windows x64, macOS arm64, and macOS x64 artifacts and publish checksums. Because no Apple Developer membership is used, macOS artifacts remain unsigned and the README explains Gatekeeper installation steps.

## Safety boundaries

- Never expose connector JSON, local paths, or secret values to the renderer after the preview session expires.
- Never recursively scan arbitrary user directories.
- Never invent provider endpoints or token formats; unsupported providers route users to official JSON import.
- Keep official DeepSeek Harness packages protected and community additions isolated in the desktop profile.

## Acceptance criteria

- One click detects valid WorkBuddy, CodeBuddy, TRAE, and Qoder MCP configurations when present in supported user or workspace locations.
- Empty/invalid candidate files do not block a later valid candidate.
- Manual selection is available only as a clearly labelled fallback.
- Connector presets, JSON preview, credential entry, save, and diagnostics remain usable at normal laptop viewport sizes.
- Diagnostics identify missing credentials, missing commands, unreachable endpoints, and profile registration independently.
- Sidebar contains a working 学习 entry and the learning site passes build/lint/render tests.
- Full workspace tests/typechecks/builds pass.
- GitHub Release contains Windows EXE, Apple Silicon DMG, Intel DMG, update metadata, and SHA256 checksums.
