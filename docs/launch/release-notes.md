# Harness Design Desktop 0.1.36

This is an authorization-integration preview built on the official DeepSeek Harness runtime. It adds a guided authorization boundary around the official MCP client's existing transport configuration; it does not replace the official Agent Loop, Cordis, or MCP execution path.

## Highlights

- GitHub supports browser authorization where the provider exposes compatible OAuth metadata, with a least-privilege fine-grained PAT fallback when OAuth is unavailable.
- Feishu/Lark uses the official Lark MCP login/logout path; DingTalk uses official application credentials and an explicit read-only profile selection.
- GitLab supports discovered OAuth configuration and self-managed instance normalization without inventing a second MCP endpoint.
- Authorization codes, access/refresh tokens, PATs, app secrets, and provider responses remain in the Electron main process and encrypted secret storage. The renderer receives only safe status, scopes, expiry, and diagnostic keys.
- The Connector Center now exposes authorize, reauthorize, verify, disconnect, and cancel actions, with clear states for missing permission, expired authorization, and retryable errors.
- OAuth callbacks use an ephemeral `127.0.0.1` loopback listener with state and PKCE validation. The bundled Harness runtime is explicitly pinned to loopback and rejects wildcard binds.
- Added a redacted live-account acceptance matrix. It is intentionally separate from deterministic CI: real account testing requires the user's disposable or least-privilege accounts and must never be committed.

## Verification boundary

The following are checked locally and in CI:

- provider-neutral status sanitization and secret-shaped field rejection;
- OAuth discovery, PKCE, callback cancellation, refresh/reauthorization mapping, and provider simulator behavior;
- desktop IPC/preload authorization lifecycle and Connector Center rendering;
- cross-platform loopback URL validation, including rejection of `0.0.0.0` and IPv6 wildcard binds;
- full workspace tests, type checks, production builds, aggregate consistency, script tests, and whitespace checks.

Real-account acceptance is not claimed by this preview. After testing with disposable or least-privilege accounts, record only the redacted fields described in [`docs/testing/connector-live-auth-matrix.md`](../testing/connector-live-auth-matrix.md), then run:

```bash
node scripts/verify-connector-auth-evidence.mjs .local-evidence/connectors/0.1.36
```

## Installation

Use the installer matching the host architecture from the project Releases page and verify its SHA-256 checksum. The public community build is unsigned, so Windows SmartScreen or macOS Gatekeeper may show an unknown publisher. This project is not an official DeepSeek distribution.

The next planned release remains 0.1.37: provider-supplied TAPD/Gongfeng JSON onboarding and official Tencent Meeting/WeCom Skill installation. It is intentionally not bundled into this authorization preview.
