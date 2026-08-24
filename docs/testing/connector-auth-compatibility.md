# MCP Authorization Compatibility Baseline

Recorded for desktop `0.1.35` before implementing live connector authorization.

## Installed official bridge

- Package: `@deepseek-ai/dsh-mcp-client`
- Installed version: `0.1.0-rc.6`
- Repository metadata: `deepseek-ai/deepseek-harness`, directory `packages/mcp/mcp-client`
- Resolved package path: `node_modules/.pnpm/@deepseek-ai+dsh-mcp-client@0.1.0-rc.6_*/node_modules/@deepseek-ai/dsh-mcp-client`

The desktop runtime already renders enabled MCP connectors as Cordis entries named `@deepseek-ai/dsh-mcp-client`. The bridge remains the only MCP execution path for this project.

## Capability evidence

The installed package's public type declarations and compiled runtime were inspected directly:

| Capability | Result | Evidence |
| --- | --- | --- |
| Streamable HTTP | Supported | `StreamableHttpConfig` accepts `url` and `headers`; runtime creates `StreamableHTTPClientTransport` with `requestInit.headers`. |
| Static authorization headers | Supported | `headers: Record<string, string>` is part of the official config and is passed to the MCP SDK transport. |
| Stdio environment injection | Supported | `StdioConfig.env` is passed through the bridge's scrubbed child environment. |
| OAuth discovery | Not owned by bridge | No OAuth discovery, protected-resource metadata, authorization-server metadata, browser callback, or token exchange API is exported. |
| PKCE / DCR | Not owned by bridge | No PKCE verifier, state, dynamic client registration, or authorization-code API is exported. |
| Refresh tokens | Not owned by bridge | No refresh lifecycle API is exported; headers are resolved when the Cordis profile is rendered. |
| Authentication error propagation | Supported as failure propagation | Transport/client errors reach the connection supervisor and `ready` outcome; the bridge does not classify provider-specific `401`, `invalid_grant`, or `insufficient_scope` responses. |
| Reconnect without replacing runtime | Supported at connection level | `startConnection()` exposes a disposable handle and bounded reconnect policy. Reconnect recreates the configured transport, but it does not refresh credentials. |

## Compatible implementation strategy

The smallest compatible design is a desktop-main-process authorization layer that owns provider OAuth or application login, stores tokens through the existing encrypted `ConnectorSecretStore`, and renders a fresh static header binding into the existing MCP profile before the official bridge connects.

The layer must:

1. perform discovery, PKCE, callback validation, exchange, and refresh outside the renderer;
2. write only encrypted credential references to the secret store;
3. resolve the current access token only while generating the official `dsh-mcp-client` profile;
4. classify provider errors before deciding whether to refresh, reconnect, or request reauthorization;
5. dispose and recreate the existing official bridge entry after a credential replacement.

This does not introduce a second MCP runtime. It adds authorization orchestration around the official bridge's existing `headers`/`env` configuration seam.

## Baseline verification

`CI=true pnpm --filter @harness-design/desktop test` passed with **101/101** tests after allowing the local integration test to bind its temporary loopback Host server. The initial sandboxed run failed only because the environment denied `listen(127.0.0.1)`; it was not a project assertion failure.

The first unprivileged `pnpm why @deepseek-ai/dsh-mcp-client` lookup also hit the local pnpm store-index permission error. The package was nevertheless resolved and inspected from the existing workspace `node_modules/.pnpm` tree; no dependency was installed or changed during this baseline check.

## Next gate

Task 2 may proceed with provider-neutral authorization contracts. The implementation must not claim that the official bridge itself supports OAuth, refresh, or DCR; those responsibilities belong to the new main-process authorization layer.
