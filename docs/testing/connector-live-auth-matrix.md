# Connector live-auth acceptance matrix

This document is the redacted acceptance checklist for desktop `0.1.36`. It does not contain account names, tenant IDs, organization names, URLs with query strings, tokens, raw provider responses, or screenshots containing secrets.

## Evidence location

Manual evidence belongs only in the ignored local directory:

```text
.local-evidence/connectors/0.1.36/*.json
```

Each JSON file must contain only the following shape:

```json
{
  "provider": "github",
  "platform": "darwin-arm64",
  "authMode": "oauth",
  "operations": ["list_tools", "read_disposable_resource"],
  "result": "pass",
  "disconnectResult": "pass",
  "testedAt": "2026-08-25T08:00:00.000Z"
}
```

Validate local evidence with:

```bash
node scripts/verify-connector-auth-evidence.mjs .local-evidence/connectors/0.1.36
```

The command requires one redacted file for each of `github`, `feishu`, `gitlab`, and `dingtalk`. It rejects unknown fields, credential-shaped strings, email addresses, and URL query strings.

## Manual matrix

| Provider | Minimum authorization check | Minimum read-only operation | Disconnect check |
| --- | --- | --- | --- |
| GitHub | OAuth, or least-privilege fine-grained PAT fallback | List tools and read a disposable repository | Remove authorization, then confirm the next call fails closed |
| Feishu/Lark | Official Lark MCP login | List tools and read a dedicated test document | Official logout, then confirm the next call fails closed |
| GitLab | OAuth on GitLab.com or an approved self-managed instance | List tools and read a disposable project | Disconnect, then confirm the next call fails closed |
| DingTalk | Dedicated app credentials with read-only profile | One read-only contacts or calendar operation | Remove credentials, then confirm the next call fails closed |

These are protected manual tests. CI validates the authorization contracts, provider simulators, redaction rules, and cross-platform deterministic behavior; it must never receive production credentials. A provider must not be labeled “live verified” in the catalog until its redacted evidence file passes this matrix.
