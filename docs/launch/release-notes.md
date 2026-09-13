# 积微 JIWEI 更新说明

## 2026-09-14 开发版：官方 Harness 兼容升级

本轮已同步至 `codex/jiwei-0.1.45-readiness` 开发分支，目标版本为 0.1.45，尚未创建正式 GitHub Release。已验证的本地 Apple Silicon DMG 仍使用应用版本 0.1.44，文件名包含 `20260914-harness-rc2`；旧 Releases 中的安装包不包含本轮升级。

### 本轮变化

- **官方运行时升级**：从 `0.1.1-rc.2` 适配到官方 `next` 预发布 `0.1.5-rc.2`，更新插件接口、启动认证、富文本输入框、官方附件上传及工作区文件侧栏预览。
- **文章阅读与摘要**：完善文章配图提取、本地缓存和离线重开；视频区域使用不支持解析的占位提示。摘要支持更明确的失败信息与切换模型重试，编辑摘要采用分块结构，阅读、编辑和 AI 整理入口定位对应页签。
- **知识管理**：待确认和已沉淀知识支持删除与恢复；完善标签、分类移动及阅读器布局。历史对话删除不属于本轮已完成能力。
- **模型与连接器配置**：展示提供方默认地址，支持保存及草稿 API Key 的显隐；连接器配置可回填、编辑、保存并在重载后保留。
- **会话与任务兼容**：适配 Session V3，修复后台任务状态订阅、统计回放和手机端流式输出重连，避免依赖当前打开的会话或重复追加内容。
- **打包与工程检查**：补齐附件、Client Store 和 Settings 三个安装包运行依赖，CI 改为全量构建与检查，并修复文档审查脚本遍历大量本地产物时的溢出。

### 验证与安装包

兼容升级的全量构建、类型检查和 1,132 项包测试通过。后续打包修复重新通过 270 项桌面测试、21 项仓库脚本测试；从只读挂载的 DMG 内完成知识库 9、通用流程 5、官方附件 3 个合成场景。镜像完整性、签名和 263 个运行包及原生依赖检查通过。

本地文件：`JIWEI-0.1.44-20260914-harness-rc2-arm64.dmg`，约 198 MiB。

SHA-256：`e24ac900de99d8303e120802586c38bc0445509390974e34d4ab5ef8d7ab1289`。

该包适用于 Apple Silicon，采用本地 ad-hoc 签名，未进行 Apple Developer ID 签名或公证。完整证据见 [DMG 验收报告](../qa/2026-09-14-dmg-and-github-sync.md)；这些是本机验证结果，不代表 GitHub hosted CI 或真实账号验收通过。

### 数据兼容边界

读取旧会话时在内存中转换；继续写入时生成独立 V3 日志并保留旧日志。旧版安装包不能保证读取升级后新增的数据，升级前应备份用户资料。本轮仅使用合成数据，没有迁移真实会话。真实模型、IM 账号收发和 Windows/Intel 安装包尚未验收。

## 历史说明：JIWEI 0.1.44

以下保留原版本说明，仅描述当时的安装包；其中旧 SDK 版本不适用于上述开发版。

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
