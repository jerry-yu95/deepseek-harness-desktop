# Changelog

## 0.1.44 - 2026-09-01

- Made native Finder file-reference parsing independent of the CI host path rules.
- Restored Windows release verification for the native attachment pipeline.

## 0.1.43 - 2026-09-01

- Introduced the independent “积微 JIWEI” product identity, original brand assets and current-build screenshots; renamed desktop windows and release artifacts while retaining the existing application ID for upgrade compatibility.
- Added a local-first knowledge inbox and review loop to “My Brain”, including editable pending and deposited knowledge, custom categories and tags, source provenance, conversation-derived candidates, pasted-content import, and public-link import without silently invoking a model.
- Added layered article extraction with Mozilla Readability and a dedicated WeChat Official Account adapter. Exact `mp.weixin.qq.com/s` links first use bounded static extraction and fall back to an isolated, persistent WeChat browser session when platform verification or login is required; error and challenge pages are never saved as knowledge.
- Kept generic URL imports fail-closed against SSRF, redirects to private networks, oversized responses, unsupported content, and mixed DNS results. The macOS proxy fake-IP exception applies only to the exact WeChat article host and still requires the isolated host allowlist.
- Added desktop IPC and deterministic coverage for WeChat URL validation, resource-policy isolation, bounded article projection, Readability extraction, platform error detection, and knowledge-import delegation.
- Improved Connector Center configuration and import behavior, including editable provider-associated connector configuration, targeted official-provider refresh, safer conflict handling, and clearer authorization and health states.

## 0.1.42 - 2026-08-31

- Made repeated imports of the same official provider idempotent: a recognized TAPD configuration refreshes the existing TAPD connector even when the general collision policy remains “reject”. Unrelated same-name connectors are still protected from overwrite.
- Added targeted MCP import handoff. When a user requests a named server such as TAPD, `connector_import_prepare` carries that target into Connector Center and selects `tapd_mcp_http` without also selecting unrelated iWiki or stdio entries.
- Added validation and regression coverage for bounded target-name handoff, keyword selection, same-provider refresh, and retained conflict protection.

## 0.1.41 - 2026-08-30

- Removed the visible attachment transport protocol from submitted messages. Conversation history now shows only the human-readable file label, while `attachment_read` and `connector_import_prepare` resolve the newest matching attachment privately by name.
- Associated recognized TAPD servers inside mixed `mcp.json` documents with the official TAPD catalog entry. Unknown servers remain separately named custom connectors, and existing generic TAPD imports are migrated to the catalog view without exposing credentials.
- Tightened MCP health checks so redirects, HTML pages, initialize-only responses, and unverified SSE endpoints cannot appear as connected. A connector passes only after a valid `initialize` followed by `tools/list` returns at least one registerable tool.
- Added Agent guidance that connector credentials must stay in encrypted desktop storage: the Agent must use registered MCP tools and must not request tokens or cookies in chat or probe provider APIs with Bash, Search, or browser requests.
- Moved provider-associated connectors into their official catalog cards with live health, enable/disable, retest, and remove actions; they no longer appear as duplicate generic rows.

## 0.1.40 - 2026-08-29

- Updated the embedded official DeepSeek Harness runtime from `0.1.0-rc.6` to `0.1.1-rc.2`, including the new official authorization peer required by the model adapter. The unpublished `0.1.2-alpha.1` line remains excluded from this release candidate.
- Replaced inline text expansion with durable native file references. JSON, JSONC, YAML, Markdown, TXT, CSV, XML, DOCX, XLSX, and PPTX now appear as a file-labelled `@name` reference in the official composer; the opaque `file_*` identifier and `attachment_read` protocol are serialized only when the draft is submitted. The Agent reads bounded pages on demand, text configuration files are redacted before storage, and the original local path never enters the conversation.
- Replaced the submitted transcript's raw attachment protocol with a file-card Markdown reference, so conversation history no longer exposes the opaque identifier or tool instruction as visible prose.
- Added the controlled `connector_import_prepare` Agent tool. Requests to configure MCP from an attached JSON now hand the original renderer-held document directly to Connector Center preview and conclude the turn instead of searching `settings.yaml`, `app.asar`, `node_modules`, or unrelated client files.
- Added bounded local Office Open XML extraction for DOCX, XLSX, and PPTX. Legacy Office formats, PDF, archives, sensitive files, malformed UTF-8, and unredactable configuration content fail closed. Images remain on the official multimodal attachment path.
- Added a real official-Host integration assertion for the upload RPC, preventing renderer-only tests from shipping an unloaded attachment plugin. This caught and fixed the rc.2 single-segment RPC-channel requirement.
- Corrected Finder file paste on macOS: native file references now take precedence over Finder's icon preview image. Supported text files retain their basename and bytes, then enter the existing size, UTF-8, sensitive-file, and credential-redaction pipeline; local directories never cross into the renderer.
- Deduplicated Finder's opaque `/.file/id=...` alias from the real file path and made the text capture listener page-singleton, preventing a valid `mcp.json` paste from being rejected or producing repeated status messages.
- Fixed the install-acceptance regressions found in the first RC: a safe text filename now overrides an incorrect official-image MIME report, the Extension Center hides the official sticky composer seat, and saved custom models expose an explicit reversible image-input capability switch.
- Added a capture-phase text-context plugin so supported files avoid the official image attachment path. PNG, JPEG, WebP, and GIF still use the official image path.
- Added a custom-model connection test that sends one minimal inference request without creating a session, switching the current model, or saving an unfinished provider draft.
- Added a connector preview, test, save, and restore flow: draft tests do not persist configuration or restart the Host; after save-and-connect the Extension Center reopens on the Connectors tab and locates the new connector.
- Kept secret handling fail-closed: blocked text files are not inserted, model-test IPC returns no API keys, and connector tests never send plaintext credentials to the renderer.
- Local deterministic tests cover classification, redaction, file-reference storage and paging, Office Open XML extraction, persisted model modality declarations, model-probe categories, MCP initialize/SSE handshakes, and desktop IPC. Enabling image input declares adapter capability but does not claim that a provider model passed a live multimodal request. This RC does not claim live-account connector verification, legacy Office support, PDF support, or live GLM multimodal verification.

## 0.1.39 - 2026-08-27

- Added explicit, opt-in 32K and 128K long-context quality probes to the Agent Harness health dashboard. Each run uses three seeded samples and the current session's official model route.
- Added model-capacity checks that fail closed when the active adapter does not publish a sufficient context window; the product never silently substitutes another model or smaller scale.
- Added critical-fact, exact-literal, latest-state, stale-state leakage, constraint, pending-work, tool-pairing, and section-completeness metrics with per-scale scores and history trends.
- Added bounded, atomic, sanitized history under the desktop profile. Raw prompts, model output, credentials, home paths, and workspace content are never persisted.
- Kept live probes manual and confirmed: opening the dashboard or refreshing it never consumes model API tokens.
- Added storage, privacy, adapter-capacity, seeded-probe, and dashboard interaction tests while preserving the deterministic context benchmark as the CI authority.

## 0.1.38 - 2026-08-26

- Added safe import for complete MCP configuration files, `mcpServers` objects, bare server maps, and copied single-server JSON fragments, including Cursor-compatible `transportType` normalization and native local `mcp.json` selection.
- Kept raw configuration paths, documents, and credentials in short-lived Electron main-process staging; the renderer receives a redacted preview and one-use import handle only.
- Added provider-supplied JSON onboarding for TAPD and Tencent Gongfeng without guessing undocumented endpoints, plus validated no-script installation for official Tencent Meeting and WeCom Skill packages.
- Added provider-neutral connector states for expiry, refresh, revocation, missing permission, provider outages, disable, disconnect, and reauthorization, with bounded refresh retries and concurrent-request deduplication.
- Added safe non-secret lifecycle metadata, encrypted credential rotation, explicit reconnect/revoke/disable IPC actions, and post-restart recovery back to the Connector Center instead of the desktop home page.
- Added an evidence-gated connector manifest with verified, community, and experimental tiers. Every bundled entry remains experimental until dated, redacted, real-account evidence exists.
- Added lifecycle, metadata, session-manager, MCP compatibility, connector-store, renderer recovery, resource-leak, and cross-platform CI regression coverage.

## 0.1.36 - 2026-08-25

- Added a provider-neutral desktop-main-process authorization layer for GitHub, Feishu/Lark, GitLab, and DingTalk without replacing the official DSH MCP client.
- Added OAuth discovery, PKCE, loopback callbacks, cancellation, encrypted secret bindings, refresh/reauthorization states, and renderer-safe authorization status projection.
- Added Connector Center authorization actions for authorize, reauthorize, verify, disconnect, and cancellation, with localized scopes and actionable failure states.
- Added deterministic authorization lifecycle, OAuth cancellation, provider adapter, IPC, preload, UI, and cross-platform loopback-binding regression coverage.
- Added a redacted live-account evidence schema and verifier. Local account evidence is ignored by Git and must be supplied manually; CI never receives production credentials.
- Hardened the bundled DSH runtime to bind only to explicit loopback addresses instead of accepting wildcard binds.
- This is an authorization-integration preview. The catalog and code paths do not claim that any provider has passed a real personal-account end-to-end test until the redacted matrix is completed.

## 0.1.35 - 2026-08-24

- Added a verified connector catalog covering one-click official MCP templates for GitHub, Feishu/Lark, GitLab, and DingTalk.
- Added provider-JSON onboarding for TAPD and Tencent Gongfeng without inventing undocumented endpoints, plus official Skill guidance for Tencent Meeting and WeCom.
- Added connector enable, disable, reconfigure, health, and provenance states while preserving encrypted credentials when a connector is disabled.
- Added an explicit local-command trust confirmation for imported stdio and npx MCP servers, enforced in both the renderer and desktop main process.
- Accepted official mixed-case environment-variable names while retaining strict internal credential-reference validation.
- Added catalog, parser, lifecycle, IPC, local-command trust, and real Host integration regression coverage.
- Labeled every catalog link by its actual source type (official MCP, provider setup, official Skill, or official API/OAuth) and exposed that real-account authorization has not been claimed as end-to-end tested.
- Fixed New Session and history navigation while the Extension Center is open by releasing the center column before the official sidebar route handles the click.
- Added a numeric context-window readout below the composer using the active adapter's `contextPressure` projection, including visible 65% and 80% compaction-range hints without guessing missing capacities.
- Added deterministic long-context and compaction-quality benchmarks with fixture-hash baselines, redacted reports, cross-platform CI gates, and a separately protected live-model contract.

## 0.1.34 - 2026-08-24

- Replaced unexplained external-client file selection with bounded one-click discovery for WorkBuddy, CodeBuddy, TRAE, and Qoder across documented user locations, project-local configuration, and supported platform application-data folders; manual selection remains a fallback.
- Added safe precedence and fallback behavior: project configuration wins when available, while empty, invalid, or credential-only files are skipped without exposing source paths or raw documents to the renderer.
- Promoted GitHub, Feishu/Lark, and GitLab into the recommended connector catalog; TAPD now opens the official JSON importer instead of asking users to reproduce account, organization, server, and project fields.
- Expanded connector health checks into visible configuration, credential, runtime, and Harness-registration stages, with authentication challenges separated from network or server failures.
- Kept connector import errors visible in the dialog footer so validation feedback cannot disappear below a long JSON preview.
- Added a first-class Learning sidebar entry to the Extension Center, including a plain-language official/community boundary and direct access to the refreshed DeepSeek Harness product-design platform.
- Refreshed the learning platform with a problem-to-product-choice explanation of Connector Center, Skill Studio, orchestration, caching, model health, Token analytics, mobile control, safe updates, and cross-platform delivery.
- Added regression coverage for automatic source discovery, invalid-source fallback, staged diagnostics, Learning navigation, and extension-center rendering.

## 0.1.33 - 2026-08-23

- Added read-only MCP configuration importers for WorkBuddy, CodeBuddy, TRAE, and Qoder, with verified user-level discovery where stable paths are documented and a native file picker for project-level or version-dependent locations.
- Added safe JSONC parsing for comments and trailing commas without evaluating configuration code.
- Added a two-step client-source experience in the Connector Center: discover or select a source, then review servers, fill only missing credentials, resolve name conflicts, and confirm import.
- Kept source paths, raw configuration text, and plaintext credentials inside short-lived desktop main-process sessions; renderer-facing previews remain redacted and imported credentials use the existing encrypted store.
- Added external-client provenance labels to imported connectors without modifying the source applications or their configuration files.
- Added adapter, IPC, parser, provenance, credential-isolation, token-expiry, and extension-center regression coverage.

## 0.1.32 - 2026-08-22

- Added a Recommended Connectors catalog with verified official MCP JSON templates for GitHub, Feishu/Lark, and GitLab; TAPD remains documented as awaiting a stable official JSON template.
- Added one-click preview and import for official `mcpServers` JSON, including multi-server selection, conflict handling, stdio/HTTP transport normalization, and credential placeholder detection.
- Added encrypted desktop-only credential bindings for environment variables, HTTP headers, and stdio arguments; connector records and generated profiles never persist plaintext tokens.
- Kept the advanced custom connector form available for providers without a verified preset, establishing the generic adapter boundary for future WorkBuddy, CodeBuddy, Trae, and Qoder integrations.
- Added main-process IPC, parser, import, encryption, profile, and extension-center regression coverage.

## 0.1.31 - 2026-08-22

- Fixed the Skills and Connectors sidebar entries opening an empty extension-center view because React received unbound external-store callbacks.
- Added a regression test that invokes the panel controller subscription and snapshot functions exactly as React does, preventing the first-render crash from returning.

## 0.1.30 - 2026-08-22

- Added the extension-center web UI plugin: Skills and Connectors entries in the official DSH sidebar, a shared center-column panel riding the official design tokens, and desktop-bridge detection with a desktop-only notice in plain browser sessions.
- Brought Skill Studio (SKILL.md creation), skill bundle import, and the user skill root shortcut into the GUI alongside custom MCP (stdio / Streamable HTTP) and HTTP API connector registration, health checks, and removal.
- Registered extension-center as a desktop built-in runtime package and as a dsh-web-ui-all aggregate member; the Extension Dock keeps its tabs during the transition and both surfaces share one desktop IPC backend.
- Added bridge-layer regression coverage for availability probing and form-to-payload mapping.
- Fixed stdio connector health checks on Windows by resolving bare commands through executable extensions (.exe/.cmd/.bat), and made the command-probe tests platform-neutral.
- Fixed sidebar entry highlights across center panels: closing a panel now removes its data-active attribute (a dataset assignment of undefined kept every entry looking selected), and opening one center panel (task board, SSH, extension center) now releases the conversation column from the sibling panels instead of fighting over it.

## 0.1.29 - 2026-08-21

- Added an extensible Connector Center for custom MCP stdio and Streamable HTTP registrations, health checks, environment-based credentials, and safe profile reloads through the official DSH MCP client.
- Added a standalone Skill Studio that creates validated `SKILL.md` bundles in the user DSH skill root for automatic discovery without mixing Skills into the Cordis runtime plugin list.
- Added atomic connector persistence, guarded command checks, profile rendering, IPC boundaries, and regression coverage for connector and Skill creation workflows.

## 0.1.28 - 2026-08-21

- Replaced filled composer pills with borderless line-icon controls for orchestration and model health, while retaining accessible descriptive dropdowns and keyboard focus states.
- Made direct model-health probes tolerant of explanatory text, Markdown fences, scalar type drift, and comma-separated lists before scoring individual dimensions.
- Added one bounded retry for completely unreadable probe output and ensured protocol failures are never counted as model degradation.
- Replaced internal probe error codes with a user-facing retry message and forced manual checks to bypass cached probe results.
- Added regression coverage for tolerant parsing, retry behavior, line-icon controls, and dropdown interaction.

## 0.1.27 - 2026-08-21

- Replaced the composer orchestration cycle button with an accessible dropdown matching the official preset selector, including concise Standard, Adaptive, and Enhanced descriptions and a visible selected state.
- Made manual model-health probes independent of the selected orchestration mode: sessions without Workflow Engine now use the same official DSH LLM route for a bounded isolated diagnostic.
- Kept Workflow Engine probes as the preferred path when that Agent-scoped capability is present, with no automatic mode or model switching.
- Corrected the misleading Workflow Engine error copy and added direct-probe and dropdown-selection regressions.

## 0.1.26 - 2026-08-21

- Added opt-in Adaptive orchestration that deterministically scores task complexity and selects direct, plan-execute, plan-review, or bounded parallel-DAG strategies.
- Added inspectable routing reasons, confidence, typed DAGs, Agent/Token/time budgets, cycle validation, and fail-closed fallback without replacing the official DSH Agent Loop or Workflow Engine.
- Simple explanations stay on the direct path; complex or risky work is planned through the Agent-scoped official Workflow Engine.
- Fixed Workflow Engine lookup to use the active Agent service scope, removing the false `workflow-engine-unavailable-for-agent` diagnostic.
- Added visible Standard, Adaptive, and Enhanced controls plus the latest adaptive decision and budget in the Agent Harness dashboard.
- Retained local-first model-health, cache, trace, and Token analytics with no automatic model switching.
- Verified 27 Agent Harness tests, 66 desktop tests including a real official Host startup, all workspace type checks, production builds, and aggregate consistency.

## 0.1.25 - 2026-08-21

- Added a project-local observability ledger that records deduplicated Token deltas without storing API keys, full prompts, full responses, or hidden reasoning.
- Added an Agent Harness dashboard with Overview, Model Health, Agent Trace, and Token Usage views.
- Added Token totals and per-model rankings for today, the last 7 days, the last 30 days, the current month, and all recorded time.
- Connected official live token projections, orchestration-stage traces, and cache events while keeping normal conversations free from background model calls.
- Added atomic ledger writes, bounded retention, secret redaction, and project-local Git ignore protection for observability data.
- Verified all 24 workspace packages, 66 desktop tests, 20 orchestrator tests, type checks, production builds, bundle consistency, and the real desktop dashboard.

## 0.1.24 - 2026-08-21

- Added explicit Standard/Enhanced Agent Harness orchestration backed by the official DSH Workflow engine, with planner, grounding-reviewer, and completion-evaluator roles.
- Added project-local, versioned cache entries with workspace fingerprints, TTL invalidation, corruption recovery, in-flight de-duplication, and visible cache-hit statistics.
- Added route-specific model-health monitoring with relative baselines, six quality dimensions, sustained-regression warnings, isolated manual probes, trend history, and false-positive feedback.
- Added a clickable composer health indicator, a detailed Agent Harness settings dashboard, and `/harness on|off|status|run` command fallbacks.
- Fixed duplicate IM plugin registration and made generated CSS module identifiers portable across macOS, Windows, and CI workspaces.
- Verified the real official DSH Host startup, 66 desktop tests, 16 orchestrator tests, cross-platform type checks, production builds, and generated bundle consistency.

## 0.1.23 - 2026-08-21

- Fixed Windows package verification by using command arguments that preserve paths correctly across PowerShell and POSIX shells.
- Added a regression test that rejects shell-specific single-quoted package paths.
- Supersedes the failed, unpublished `desktop-v0.1.22` release attempt; no 0.1.22 installation artifacts were published.

## 0.1.22 - 2026-08-21

- Fixed GitHub Actions macOS releases without Apple certificates by keeping unsigned and certificate-backed build steps mutually exclusive.
- Added a regression test that prevents empty signing secrets from being forwarded to electron-builder.
- Supersedes the failed, unpublished `desktop-v0.1.21` release attempt; no 0.1.21 installation artifacts were published.

## 0.1.21 - 2026-08-21

- Changed unsigned macOS application updates to a clear GitHub Release handoff instead of attempting an unreliable automatic installation.
- Added Chinese and English installation guides for artifact selection, checksum verification, Gatekeeper, and SmartScreen.
- Normalized the repository identity and source-build links around `jerry-yu95/deepseek-harness-desktop` while preserving third-party attribution.
- Prepared a version newer than 0.1.20 so the first public update path can be tested end to end.

## 0.1.20 - 2026-08-20

- Fixed custom wallpaper images being hidden by stacked theme and surface overlays.
- Added a live 35%-100% wallpaper visibility control with local persistence and backward-compatible defaults for existing themes.
- Added runtime and real Electron regression coverage for upload preview, vivid wallpaper rendering, and the saved visibility setting.
- Added separate desktop-application updates backed by this repository's GitHub Releases while preserving official DSH runtime backup and rollback.
- Added native Windows x64, macOS Intel, and macOS Apple Silicon release jobs, merged macOS updater metadata, target-specific native audits, and release checksums.

## 0.1.19 - 2026-08-20

- Fixed the adaptive-theme settings entry rendering as an empty row by passing its React card through the DSH slot API's component argument.
- Added a client registration regression test that verifies the visible card and localization namespace are both supplied to the host renderer.

## 0.1.18 - 2026-08-20

- Replaced the nine fragile preset skins with one user-image adaptive theme that derives a readable light/dark palette and enforces safe text contrast.
- Added local-only theme persistence, live preview, one-click official-style restore, image validation, and migration from desktop-managed legacy skins.
- Added the first native Harness orchestration layer: project-local objective/phase state, acceptance evidence, bounded context injection, sanitized trajectory utilities, and persistent planner/reviewer/evaluator role definitions.
- Kept orchestration on the official DSH system-prompt, tool, workflow, subagent, and compaction stack instead of introducing a competing agent runtime.

## 0.1.10 - 2026-08-19

- Added hard timeouts around cloudflared preparation and public endpoint verification.
- Added a visible stalled-connection diagnosis and manual retry action to mobile remote control.
- Avoided repeated LAN QR requests while the personal public tunnel is still starting.

## 0.1.9 - 2026-08-19

- Integrated the community `@xmanrui/dsh-im@0.7.1` plugin for Feishu, Weixin iLink, WeCom, QQ, DingTalk, Telegram, Discord, Slack, and WhatsApp.
- Added QR/manual bot provisioning, DSH credential-provider storage, per-bot workspaces, and channel-specific status/settings through the upstream plugin.
- Removed the temporary environment-variable channel gateway from `dsh-remote-web-ui` to prevent duplicate bot logins and replies.

## 0.1.2 - 2026-08-14

- Replaced the failing Windows native folder-dialog worker with the official DSH in-app directory browser.
- Reduced the Windows release payload by pruning published source, declarations, development material, and non-x64 native artifacts after packaging.
- Replaced the desktop and installer artwork with a cute anthropomorphic DeepSeek whale-girl icon.

## 0.1.1 - 2026-08-14

Natural Windows chrome refinement.

- Replaced the disconnected bright title and menu rows with a 46-pixel deep-sea title surface.
- Preserved native Windows caption buttons, resizing, keyboard menu access, and Snap layouts.
- Added context-aware labels for startup, the original Web surface, and the Extension Dock.
- Added page safe-area handling plus unit and real-runtime Electron verification.

## 0.1.0 - 2026-08-14

Initial Windows desktop release.

- Lossless Electron host for the official DSH Web application.
- Isolated, idempotent `desktop` profile with the complete dsh-web-ui aggregate.
- Managed runtime lifecycle, readiness probes, graceful shutdown, bounded restart, and recovery UI.
- Hardened preload, IPC, navigation, permissions, downloads, logs, and window-state persistence.
- Extension Dock for protected built-ins, transactional registry plugins, and safe skill discovery/import.
- 21 bundled UI plugins with 9 selectable skins, including Miku and Trading, plus the upstream compatibility layer.
- Hermetic DSH rc.6 runtime peer closure, verified from a clean short-path Windows installation.
- Windows x64 NSIS installer, reproducible verification script, and CI/release workflows.
