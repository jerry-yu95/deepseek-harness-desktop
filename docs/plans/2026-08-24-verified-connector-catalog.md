# Verified Connector Catalog Implementation Plan

> Design source: `docs/plans/2026-08-24-verified-connector-catalog-design.md`

## 1. Freeze provider metadata with tests

- Add catalog invariants for unique IDs, safe documentation URLs, and status/template consistency.
- Add parse tests for every ready MCP template, including DingTalk's mixed-case environment keys.
- Keep TAPD and Tencent Gongfeng explicitly provider-managed until official stable JSON is available.

## 2. Add local-command trust enforcement

- Add a pure helper that detects whether selected preview entries contain stdio commands.
- Require an explicit checkbox before importing any selected stdio server.
- Reset trust whenever JSON, selection, source, or preview changes.
- Explain that `npx`, local binaries, and packages run with the user's account permissions.

## 3. Add connector lifecycle controls

- Add `ConnectorStore.setEnabled` with validation and atomic persistence.
- Expose the operation through IPC and preload without exposing secrets.
- Add an enable/disable control to installed connector cards.
- Preserve credentials, bindings, source metadata, and health diagnostics.

## 4. Expand and clarify the catalog

- Add verified DingTalk MCP.
- Add provider-JSON cards for TAPD and Tencent Gongfeng.
- Add official-Skill cards for Tencent Meeting and WeCom.
- Show provider, integration type, capabilities, installed state, and the correct action per integration type.
- Reconfigure installed presets with replacement semantics.

## 5. Verify and harden

- Run focused extension-center and desktop connector/import/IPC tests.
- Run package typecheck and build.
- Run the desktop test suite and workspace-level relevant checks.
- Inspect generated bundles for credential leakage and unsafe template regressions.
- Record any service that cannot be end-to-end authenticated without the user's provider token as a manual acceptance item.
