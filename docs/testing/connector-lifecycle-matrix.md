# Connector lifecycle and store verification matrix

This is the 0.1.38 verification record for connector expiry, revocation,
reconnect, metadata safety, and store trust labels. The deterministic suite
does not claim that a provider account was authorized successfully.

## Automated gates

| Area | Coverage | Result source |
| --- | --- | --- |
| Lifecycle reducer | authorize, refresh, expiry, revoke, missing permission, outage, disable, disconnect | `apps/dsh-desktop/test/connector-lifecycle.test.mjs` |
| Refresh coordination | one in-flight refresh per connector, bounded retries, rotation commit, post-refresh 401 | `apps/dsh-desktop/test/connector-session-manager.test.mjs` |
| Metadata | migration, atomic write, allowlisted fields, no credential-shaped fields | `apps/dsh-desktop/test/connector-auth-metadata.test.mjs` |
| IPC recovery | disable, revoke, reconnect remain distinct actions | `apps/dsh-desktop/test/extension-ipc.test.mjs` |
| Integration | end-to-end deterministic refresh/revoke/disable/resource scan | `apps/dsh-desktop/test/connector-lifecycle-integration.test.mjs` |
| Store trust | verified/community/experimental validation and filters | `packages/dsh-extension-center/tests/connector-store.test.ts` |

## Live acceptance still required

The following rows require a disposable account or official test tenant and
must be recorded as redacted JSON under `.local-evidence/connectors/<version>/`:

| Provider or capability | Required manual checks |
| --- | --- |
| GitHub, Feishu, GitLab, DingTalk | authorize, list/read one disposable resource, disconnect, reconnect; revoke or expire where provider supports it |
| TAPD, Tencent Gongfeng | paste the current official `mcpServers` JSON, replace only token placeholders, preview, connect, disconnect |
| Tencent Meeting, WeCom Skill | install the provider Skill through its official instructions, run one read-only operation, uninstall/reinstall |

Evidence must contain only provider, platform, auth mode, operation labels,
pass/fail/blocked results, timestamps, and disconnect results. Do not include
account names, tenant/project identifiers, query-string callback URLs, raw
responses, tokens, secrets, or screenshots containing credentials. Validate it
with:

```bash
node scripts/verify-connector-auth-evidence.mjs .local-evidence/connectors/0.1.38
```

Until those rows exist, the built-in store keeps entries at `实验性` even when
the provider links are official. A deterministic parser test is not live
provider evidence.

## Recovery semantics

- **Disconnect** removes the local authorization binding and returns to
  `not-configured`.
- **Revoke** records `revoked` and requires an explicit authorization action.
- **Expired** and `reauthorization-required` never silently become `ready`.
- **Disable** prevents use without claiming that the authorization was healthy;
  re-enabling returns to `not-configured` until the user authorizes again.
- Refresh requests are deduplicated per connector. A provider outage uses a
  bounded retry budget; a second 401 becomes a reauthorization diagnostic
  instead of an unbounded refresh loop.
