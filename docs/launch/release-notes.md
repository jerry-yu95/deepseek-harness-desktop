# Harness Design Desktop 0.1.38

This release closes the provider-import and connector-lifecycle stages above the official DeepSeek Harness runtime. It keeps the official Agent Loop, Cordis, MCP client, Skill discovery, and execution path intact.

## Highlights

- Import a complete MCP configuration file, an `mcpServers` object, a bare server map, or one copied server fragment. Cursor-style `transportType`, legacy `type`, stdio, SSE, and Streamable HTTP forms are normalized before preview.
- Choose a local `mcp.json` through the native file picker. Raw paths, JSON, headers, and tokens stay in short-lived main-process staging; the page receives a redacted preview and one-use handle.
- Paste provider-supplied TAPD or Tencent Gongfeng JSON without reproducing account, organization, server, or project fields. The app never invents an undocumented endpoint.
- Validate and install official Tencent Meeting and WeCom Skill packages without running package scripts.
- Recover from expiry, refresh failure, revocation, missing permission, provider outage, disable, disconnect, and reauthorization states. Refreshes are bounded and concurrent requests share one operation.
- Return to the Connector Center after the Harness runtime reloads and run the requested health check instead of dropping the user on the home page.
- Classify connector manifests as verified, community, or experimental using evidence requirements. All bundled entries remain experimental until dated, redacted live-account evidence exists.

## Verification boundary

The following are checked locally and in CI:

- provider-neutral lifecycle transitions and secret-shaped metadata rejection;
- refresh deduplication, bounded retry, encrypted credential rotation, revoke/disconnect/disable separation, and post-refresh 401 handling;
- MCP JSON compatibility, local file staging, credential redaction, and one-use import sessions;
- Connector Center rendering, restart recovery, store-manifest evidence rules, and English/Chinese UI copy;
- full workspace tests, type checks, production builds, aggregate consistency, script tests, and whitespace checks.

Real-account acceptance is not claimed by this preview. After testing with disposable or least-privilege accounts, record only the redacted fields described in [`docs/testing/connector-live-auth-matrix.md`](../testing/connector-live-auth-matrix.md), then run:

```bash
node scripts/verify-connector-auth-evidence.mjs .local-evidence/connectors/0.1.38
```

## Installation

Use the installer matching the host architecture from the project Releases page and verify its SHA-256 checksum. The public community build is unsigned, so Windows SmartScreen or macOS Gatekeeper may show an unknown publisher. This project is not an official DeepSeek distribution.

The next planned stage is the opt-in long-context quality layer: live 32K/128K adapter benchmarks, sanitized history, and a context-compaction quality dashboard. It will observe the official DeepSeek Harness compaction engine rather than replace it.
