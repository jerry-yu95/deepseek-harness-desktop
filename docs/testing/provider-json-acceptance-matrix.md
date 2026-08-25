# Provider JSON connector acceptance matrix

This matrix separates deterministic product validation from live provider validation. A connector is not marked as live-verified until the user supplies the provider's current official JSON and a disposable test account or token.

## Deterministic checks completed in the desktop repository

| Provider | Catalog source kind | What is verified locally | What is deliberately not claimed |
| --- | --- | --- | --- |
| TAPD | `provider-json` / `tapd` | Official JSON paste is parsed, supported transports and credential placeholders are normalized, secrets are not persisted in the public connector record, and a redacted configuration fingerprint is recorded. | TAPD account access, project permissions, and the current provider endpoint are not live-verified. |
| 腾讯工蜂 | `provider-json` / `tencent-gongfeng` | Same parser, placeholder, provenance, and conflict behavior as TAPD; the catalog labels the source as provider-supplied JSON rather than an invented endpoint. | Gongfeng account access, repository permissions, and the current provider endpoint are not live-verified. |

## Live acceptance procedure

For each provider, use a disposable test account or a least-privilege token:

1. Open the provider's official MCP page and copy its current `mcpServers` JSON.
2. Paste it through the corresponding catalog entry. Replace only the documented token placeholder.
3. Confirm the preview lists the expected server and transport, and that the token is never shown in the preview, logs, session export, or connector inventory.
4. Save and connect. Run one read-only operation first; do not begin with create, edit, delete, or deployment operations.
5. Confirm a second session reuses the connector without asking for the token again.
6. Revoke or rotate the disposable credential at the provider, refresh the connector, and verify the UI reports reauthorization rather than retrying forever.
7. Remove the connector and verify the public inventory and provenance record no longer contain credential-shaped values.

Record the provider JSON capture time, provider documentation URL, account scope, read-only operation used, result, and failure diagnosis. Never commit the JSON or token to the repository.

## Source and trust policy

- “官方模板” means the provider-owned documentation or repository URL is shown in the catalog; it does not mean this repository has completed live authorization.
- Provider-supplied JSON is configuration data. It is parsed and validated before being persisted; it is not executed as a shell command.
- stdio configurations require explicit local-process consent. Remote HTTP configurations must pass the existing transport and endpoint validation.
- The provenance fingerprint intentionally excludes credential values and credential placeholder names, so rotating a token does not create a false source change.
