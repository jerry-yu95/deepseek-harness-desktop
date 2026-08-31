# 积微 JIWEI 0.1.44

This release introduces the independent JIWEI product identity while keeping the embedded official DeepSeek Harness runtime at `0.1.1-rc.2`. It adds a local-first knowledge loop, safer link ingestion, native file references, and a diagnosable Connector Center on top of the official Agent Loop, model adapter, and MCP client. Version 0.1.44 also makes Finder reference verification portable across Windows release runners.

## Highlights

- “My Brain” now supports an editable knowledge inbox and deposited library, custom categories and tags, conversation-derived candidates, pasted content, and public-link imports with retained provenance. Import itself stays deterministic and local-first; model refinement remains a separate user-confirmed action.
- Public articles use bounded Readability extraction. WeChat Official Account articles use a dedicated adapter and, when static access is blocked, an isolated persistent browser session restricted to exact WeChat content hosts. This lets the user complete platform verification once without weakening the generic URL importer.
- Generic URL ingestion still rejects private or unsupported destinations, unsafe redirects, mixed DNS answers, oversized payloads, and platform error pages. A WeChat verification or parameter-error page cannot be deposited as article content.
- Connector Center adds configuration access and safer provider-aware refresh/import behavior while retaining encrypted main-process credential storage and strict MCP `initialize` plus `tools/list` health requirements.
- Drop or paste JSON, JSONC, YAML, Markdown, TXT, CSV, XML, DOCX, XLSX, or PPTX files to create a native file-style reference. After submit, the conversation shows only the human-readable file name; opaque IDs and tool instructions never appear in user-visible prose. The Agent resolves the newest matching attachment privately and reads it only on demand. PNG, JPEG, WebP, and GIF stay on the official image path.
- When the user asks to configure MCP from an attached JSON, a dedicated Agent tool opens Connector Center with that document already staged for preview. It ends the Agent turn immediately and explicitly avoids filesystem, packaged-application, and dependency searches.
- Text configuration files are redacted before they cross the renderer-to-Host RPC boundary. `.env`, keys, legacy Office, binaries, PDF, and archives are blocked. Unreliable redaction fails closed and does not create a reference. Stored metadata does not contain the original local path.
- Safe text filenames are recovered when the desktop clipboard bridge incorrectly reports an official image MIME. Opening Skills, Connectors, or Learning now also hides the official sticky composer seat instead of leaving the chat box over the panel.
- Finder-copied files are resolved from their native local-file reference before macOS can substitute the file's icon preview. The renderer receives only the basename and bounded file bytes; unsupported, missing, oversized, or symbolic-link targets fail closed, and source directories are never exposed.
- Finder's opaque `/.file/id=...` alias is ignored when the same selection also includes the real local path. Text capture is registered once per page, so one paste produces one draft update and one status message.
- Test an unsaved custom model provider with one minimal inference request. Success shows connected status, the tested model ID, and latency. Failure copy distinguishes 401/403, 404 path/protocol mismatch, timeouts, missing models, and incompatible responses. The test does not create a session, switch the current model, or save an unfinished provider.
- Saved custom models expose an explicit `允许图片输入` switch. It persists `input: [text, image]` through an atomic settings update and can be reversed. The switch declares capability to Harness; the provider can still reject images if that exact model or gateway is text-only.
- Preview connector configuration and test the draft separately from Save and connect. Draft tests do not persist configuration or restart the Host. After a successful save, the Extension Center restores the Connectors tab and locates the new connector. OAuth services may need save-then-authorize; the UI states that testing is not a mandatory save gate.
- Mixed MCP documents now associate recognized TAPD entries with the official TAPD catalog card while leaving unknown servers as named custom connectors. A remote MCP is shown as connected only after `initialize` and `tools/list` return at least one tool; HTTP 302 login redirects are authorization failures, not successful handshakes.
- Agent-requested imports now preserve the requested server target. Asking to configure TAPD selects `tapd_mcp_http` without also selecting unrelated entries, and re-importing the same official TAPD provider safely refreshes that connector instead of failing under the general same-name rejection policy.

## Verification

The release is covered by:

- text-context classification, UTF-8/BOM, limit, sensitive-file, MCP redaction, fail-closed, session-switch, opaque storage, integrity, paging, and Office Open XML extraction tests;
- custom-model probe endpoint, category, secret-redaction, and IPC projection tests;
- custom-model image-input status, atomic persistence, reversibility, and unrelated-settings preservation tests;
- connector draft initialize/SSE handshake, Windows command probing, and no-persist IPC tests;
- Extension Center locale and catalog tests;
- orchestrator model-connection classification tests;
- knowledge URL, Readability, WeChat adapter, isolated-browser policy, and desktop IPC tests;
- the full workspace test and typecheck suites;
- aggregate, production-build, whitespace gates, and a real official-Host upload-RPC integration check.

This RC reports local deterministic tests passing and the presence of connection-test and explicit model-modality controls. It does not claim that every connector passed a real-account check, that GLM multimodal live requests were verified, or that PDF and legacy Office files are supported.

## Installation and release boundary

Release artifacts are named `JIWEI-*` and include SHA-256 checksums. The public community build is unsigned, so macOS Gatekeeper or Windows SmartScreen may show an unknown publisher. This project is not an official DeepSeek distribution.
