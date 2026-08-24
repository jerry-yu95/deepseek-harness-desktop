# Verified Connector Catalog Design

## Goal

Turn the extension center from a low-level MCP form into a trustworthy connector catalog. A user should be able to choose a verified provider template, paste provider-issued JSON when the provider does not publish a stable template, or follow an official Skill installation path without being misled into using an invented endpoint.

## Product boundaries

- DeepSeek Harness remains the Agent runtime and plugin host.
- MCP connectors are registered through the existing `@deepseek-ai/dsh-mcp-client` profile patch.
- Skills remain instruction/workflow packages and are not presented as MCP servers.
- Credentials remain encrypted in the desktop main process and never return to the renderer.
- Local stdio MCP commands require an explicit trust confirmation before import because they execute code on the user's computer.
- A provider is marked `ready` only when a stable official configuration can be verified.
- TAPD and Tencent Gongfeng are not given guessed endpoints. Their cards open the official-JSON import flow until their providers publish stable machine-readable templates.

## Connector types

1. **Verified MCP template** — preview a maintained JSON template, fill only missing secrets, then import.
2. **Provider JSON** — open the same importer with provider-specific guidance; the user pastes the exact JSON supplied by the service.
3. **Official Skill** — link to the provider's official Skill/package when it is the supported integration path rather than pretending it is MCP.

## Initial catalog

- GitHub MCP — verified remote MCP template.
- Feishu / Lark MCP — verified official stdio package.
- GitLab MCP — verified official remote endpoint.
- DingTalk MCP — verified official stdio package.
- TAPD — provider JSON / official documentation path.
- Tencent Gongfeng — provider JSON / official OAuth and API documentation path.
- Tencent Meeting — official Skill guidance.
- WeCom — official Skill guidance.

## Lifecycle and safety

- Installed catalog items are detected from connector `source.presetId`.
- Installed connectors can be disabled and re-enabled without deleting encrypted credentials.
- Disabled connectors remain in the registry but are omitted from the generated Harness profile.
- Reconfiguring an installed preset defaults to replacement rather than creating ambiguous duplicates.
- The import dialog explains transport, command/URL, requested credentials, and local execution risk before saving.
- Mixed-case provider environment names are accepted, while internally generated secure-store references remain strict uppercase identifiers.

## Acceptance criteria

- Catalog metadata is internally consistent and IDs are unique.
- The four verified MCP templates parse through the production parser.
- Selecting a stdio server cannot import until local execution is explicitly trusted.
- A connector can be disabled and enabled without losing source metadata or secret bindings.
- Disabled MCP connectors do not appear in the rendered profile patch.
- TAPD and Gongfeng cards never claim a fabricated official MCP endpoint.
- Desktop, extension-center, typecheck, build, and security-focused tests pass.
