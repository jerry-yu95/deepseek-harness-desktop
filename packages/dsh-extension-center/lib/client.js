window.__ModuleLoader__.load({
	id: "@linxin666/dsh-client-ui-extension-center",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_dom_client = require("react-dom/client");
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/bridge.ts
		/** Map a connector record to the provider authorization adapter, if supported. */
		function connectorAuthProvider(connector) {
			const provider = connector.source?.presetId ?? connector.id;
			return provider === "github" || provider === "feishu" || provider === "gitlab" || provider === "dingtalk" ? provider : void 0;
		}
		/** Renderer-only action semantics; pending auth must not be started twice. */
		function connectorAuthAction(state) {
			if (state === "authorizing") return "cancel";
			if (state === "ready" || state === "missing-permission") return "disconnect";
			if (state === "reauthorization-required" || state === "error") return "reauthorize";
			return "authorize";
		}
		/** Every bridge method the plugin calls; presence-checked as a set. */
		const REQUIRED_METHODS = [
			"listExtensions",
			"importSkill",
			"createSkill",
			"openSkill",
			"openSkillRoot",
			"listConnectors",
			"saveConnector",
			"removeConnector",
			"checkConnector"
		];
		/**
		* Resolve the desktop bridge, or undefined when absent (plain browser) or
		* incomplete (older desktop build). Never throws.
		*/
		function getDesktopBridge() {
			if (typeof window === "undefined") return void 0;
			const candidate = window.dshDesktop;
			if (candidate === null || typeof candidate !== "object") return void 0;
			const bridge = candidate;
			return REQUIRED_METHODS.every((method) => typeof bridge[method] === "function") ? candidate : void 0;
		}
		/** Split a textarea value into trimmed, non-empty lines. */
		function splitLines(value) {
			return String(value ?? "").split(/\r?\n/u).map((item) => item.trim()).filter(Boolean);
		}
		/** Split a comma-separated input into trimmed, non-empty items. */
		function splitComma(value) {
			return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
		}
		/** Map raw form values to the create-skill payload. */
		function buildSkillInput(values) {
			const examples = values.examples?.trim();
			return {
				name: values.name.trim(),
				description: values.description.trim(),
				instructions: values.instructions.trim(),
				...examples ? { examples } : {}
			};
		}
		/**
		* Map raw form values to the save-connector payload, mirroring the host-side
		* shape rules: HTTP connectors carry transport "http" plus a URL; MCP stdio
		* connectors carry a command and its argument list; MCP streamable-http
		* connectors carry a URL.
		*/
		function buildConnectorInput(values) {
			const description = values.description?.trim() ?? "";
			const capabilities = splitComma(values.capabilities);
			const secretEnvKeys = splitComma(values.secretEnvKeys);
			const base = {
				id: values.id.trim(),
				name: values.name.trim(),
				description,
				capabilities,
				secretEnvKeys,
				enabled: true
			};
			if (values.kind === "http") return {
				...base,
				kind: "http",
				transport: "http",
				url: (values.url ?? "").trim()
			};
			if (values.transport === "stdio") return {
				...base,
				kind: "mcp",
				transport: "stdio",
				command: (values.command ?? "").trim(),
				args: splitLines(values.args)
			};
			return {
				...base,
				kind: "mcp",
				transport: "streamable-http",
				url: (values.url ?? "").trim()
			};
		}
		/** Endpoint text for a connector card: stdio command line or the URL. */
		function connectorEndpoint(connector) {
			if (connector.kind === "mcp" && connector.transport === "stdio") return [connector.command ?? "", ...connector.args ?? []].filter(Boolean).join(" ");
			return connector.url ?? "";
		}
		/** Provider-facing credential name; never expose the internal DSH reference. */
		function mcpCredentialLabel(slot) {
			return slot.placeholder ?? slot.targetKey ?? slot.credentialRef;
		}
		/** Names of the currently selected MCP servers, preserving preview order. */
		function selectedMcpServerNames(preview, selected) {
			return preview.servers.filter((server) => selected[server.sourceName]).map((server) => server.sourceName);
		}
		/** Whether the selected import would execute a local stdio process. */
		function selectedMcpRequiresLocalExecution(preview, selected) {
			return preview.servers.some((server) => selected[server.sourceName] && server.transport === "stdio");
		}
		/** Missing credentials for selected servers, de-duplicated by secure-store reference. */
		function missingMcpCredentials(preview, selected, secretValues) {
			const seen = /* @__PURE__ */ new Set();
			return preview.servers.filter((server) => selected[server.sourceName]).flatMap((server) => server.secretSlots).filter((slot) => {
				if (slot.detected || (secretValues[slot.credentialRef] ?? "").trim() || seen.has(slot.credentialRef)) return false;
				seen.add(slot.credentialRef);
				return true;
			});
		}
		/** A verified user-level source can be previewed without opening a file picker. */
		function canPreviewMcpClientSource(source) {
			return source.status === "available";
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* Extension-center surface copy: zh is the key source, en mirrors every key.
		*/
		const zh = {
			"entry.skills.label": "技能",
			"entry.skills.tooltip": "技能目录与 Skill Studio",
			"entry.connectors.label": "连接器",
			"entry.connectors.tooltip": "连接器中心（MCP / HTTP）",
			"entry.learning.label": "学习",
			"entry.learning.tooltip": "了解 Harness 原理与社区增强",
			"panel.title": "扩展中心",
			"tab.skills": "技能",
			"tab.connectors": "连接器",
			"tab.learning": "学习",
			"common.loading": "加载中…",
			"common.refresh": "刷新",
			"common.close": "关闭",
			"common.error": "出错了：{error}",
			"desktopOnly.title": "需要桌面版",
			"desktopOnly.body": "技能与连接器管理运行在 Harness Design Desktop 中。当前浏览器环境未接入桌面桥，功能暂不可用。",
			"skills.empty": "尚未发现技能。创建或导入后，Harness 会自动发现。",
			"skills.create": "创建技能",
			"skills.import": "导入技能目录",
			"skills.openRoot": "打开用户技能目录",
			"skills.studio.summary": "Skill Studio · 创建可被 Harness 自动发现的 SKILL.md",
			"skills.form.name": "技能名称（kebab-case）",
			"skills.form.description": "触发描述",
			"skills.form.instructions": "执行说明",
			"skills.form.examples": "示例（可选）",
			"skills.form.submit": "创建并启用",
			"skills.form.hint": "保存到用户 DSH Skill 根目录；当前 Harness watcher 会自动发现。",
			"skills.form.name.placeholder": "tapd-workflow",
			"skills.form.description.placeholder": "查询或更新 TAPD 需求时使用此技能",
			"skills.form.instructions.placeholder": "写清步骤、边界、失败处理和应当调用的连接器……",
			"skills.form.examples.placeholder": "- 用户说「查一下本迭代缺陷」时……",
			"skills.created": "{name} 已创建并进入 Harness 技能目录",
			"skills.imported": "{name} 已导入",
			"skills.badge.shadowed": "已被同名技能覆盖",
			"skills.badge.managed": "应用托管",
			"skills.managedVersion": "应用托管版本：{version}",
			"learning.eyebrow": "DEEPSEEK HARNESS 学习平台",
			"learning.title": "先看懂这台机器，再决定给它装什么",
			"learning.intro": "Harness 不是一个只会聊天的页面。它把模型、工具、权限、插件和反复执行的 Agent 循环装在一起。桌面版在官方机制上增加了更容易使用、观察和交付的入口。",
			"learning.open": "打开完整学习平台",
			"learning.rule.title": "最重要的边界",
			"learning.rule.body": "官方 Harness 提供 Agent 与插件底座；连接器中心、Skill Studio、增强编排、移动远程、健康与 Token 看板、自定义背景和跨平台更新属于本社区桌面的产品增强。",
			"learning.start.title": "四步开始一次可靠任务",
			"learning.start.workspace": "选择工作区",
			"learning.start.workspace.body": "告诉 Agent 只在哪个项目里工作。",
			"learning.start.mode": "选择模式与编排",
			"learning.start.mode.body": "模式决定工具组合，编排决定执行策略，两者不是模型智商档位。",
			"learning.start.permission": "给最小够用权限",
			"learning.start.permission.body": "先只读，需要交付文件再切工作区写入。",
			"learning.start.request": "说清目标和验收",
			"learning.start.request.body": "描述结果、边界和怎么才算完成。",
			"learning.additions.title": "这个桌面版加入了什么",
			"learning.additions.hint": "每项增强都复用官方 Harness 的插件、Profile、Skill、工具或会话机制，不替换官方 Agent 内核。",
			"connectors.empty": "尚未配置连接器。可先添加 MCP 服务或 HTTP API。",
			"connectors.create": "自定义连接器",
			"connectors.catalog.title": "推荐连接器",
			"connectors.catalog.official": "官方模板",
			"connectors.catalog.providerJson": "服务方 JSON",
			"connectors.catalog.officialSkill": "官方 Skill",
			"connectors.catalog.installed": "已接入",
			"connectors.catalog.provider": "提供方：{provider}",
			"connectors.catalog.docs": "查看来源",
			"connectors.catalog.docsOfficialMcp": "官方 MCP 文档",
			"connectors.catalog.docsProviderConfig": "服务方配置入口",
			"connectors.catalog.docsOfficialSkill": "官方安装说明",
			"connectors.catalog.docsOfficialApi": "官方 API / OAuth 文档",
			"connectors.catalog.verifiedTemplate": "官方来源已核验；模板解析与本地接入流程已测试，尚未使用真实账号完成授权端到端测试。",
			"connectors.catalog.verifiedProvider": "服务方入口已核验；需粘贴你账号页面提供的 JSON，尚未使用真实账号完成端到端测试。",
			"connectors.catalog.verifiedSkill": "官方安装路径已核验；尚未使用你的账号完成授权端到端测试。",
			"connectors.catalog.use": "使用模板",
			"connectors.catalog.paste": "粘贴官方 JSON",
			"connectors.catalog.reconfigure": "重新配置",
			"connectors.catalog.openSkill": "查看安装说明",
			"connectors.catalog.installSkill": "选择官方包",
			"connectors.officialSkill.preview": "已校验 {files} 个文件，共 {bytes} 字节。来源：{source}",
			"connectors.officialSkill.confirm": "确认安装这个官方 Skill 包吗？安装不会执行包内脚本。",
			"connectors.officialSkill.installed": "{name} {version} 已安装并进入 Harness 技能目录",
			"connectors.catalog.waiting": "请粘贴服务方提供的官方 JSON",
			"connectors.sources.open": "自动查找其他客户端",
			"connectors.sources.title": "导入已有 MCP 连接",
			"connectors.sources.step": "选择配置来源",
			"connectors.sources.hint": "读取其他 AI 客户端的 MCP 配置，预览并确认后导入 Harness。",
			"connectors.sources.workbuddy": "自动查找项目配置以及 WorkBuddy 的 .mcp.json / mcp.json。",
			"connectors.sources.codebuddy": "自动按 CodeBuddy 官方优先级查找项目和用户配置，兼容 JSONC。",
			"connectors.sources.trae": "自动查找项目目录、TRAE 用户目录和应用数据目录中的 MCP 配置。",
			"connectors.sources.qoder": "自动查找项目 .qoder 配置、.mcp.json 和用户 settings.json。",
			"connectors.sources.status.available": "已发现 {count} 个服务",
			"connectors.sources.status.empty": "已发现，暂无服务",
			"connectors.sources.status.notFound": "未发现默认配置",
			"connectors.sources.status.invalid": "配置无法解析",
			"connectors.sources.status.manual": "需手动选择",
			"connectors.sources.preview": "预览并导入",
			"connectors.sources.pick": "未找到，手动选择",
			"connectors.sources.security": "只读取来源配置；不修改 WorkBuddy、CodeBuddy、TRAE 或 Qoder。路径和明文凭证不会进入页面。",
			"connectors.sources.reviewTitle": "从 {client} 导入 MCP",
			"connectors.sources.reviewHint": "请选择服务并补齐缺失凭证；导入后会标记原始来源。",
			"connectors.sources.reselect": "重新选择来源",
			"connectors.sources.desktopRequired": "当前桌面版不支持外部客户端导入，请先升级应用。",
			"connectors.import.open": "导入 MCP JSON",
			"connectors.import.title": "导入官方 MCP 配置",
			"connectors.import.hint": "支持包含 mcpServers 的 JSON；应用会自动识别传输方式和凭证占位符。",
			"connectors.import.providerSource": "来源：{provider} 官方页面提供的 JSON；接入后会保存脱敏来源指纹。",
			"connectors.import.step.json": "第 1 步，共 2 步 · 粘贴配置",
			"connectors.import.step.review": "第 2 步，共 2 步 · 补充凭证",
			"connectors.import.jsonLabel": "MCP JSON",
			"connectors.import.jsonPlaceholder": "{\n  \"mcpServers\": { ... }\n}",
			"connectors.import.noSecret": "令牌只在桌面主进程中加密保存，不会写入配置或日志。",
			"connectors.import.preview": "预览配置",
			"connectors.import.edit": "返回修改 JSON",
			"connectors.import.servers": "{count} 个服务",
			"connectors.import.selectAll": "全选",
			"connectors.import.selectOne": "至少选择一个 MCP 服务",
			"connectors.import.missingSecret": "请填写凭证：{name}",
			"connectors.import.missingCount": "还需填写 {count} 个凭证",
			"connectors.import.ready": "配置已就绪，可以安全接入",
			"connectors.import.localTrustTitle": "允许执行本地 MCP 命令",
			"connectors.import.localTrustBody": "所选服务会用当前账号权限启动 npx 或本地程序。请确认 JSON 和软件包来源可信。",
			"connectors.import.localTrustRequired": "请先确认信任来源并允许执行本地 MCP 命令",
			"connectors.import.credentialPlaceholder": "粘贴令牌或密钥",
			"connectors.import.detected": "已从 JSON 检测到凭证：{name}",
			"connectors.import.secret": "凭证（{name}）",
			"connectors.import.conflict": "同名处理",
			"connectors.import.conflict.reject": "冲突时拒绝",
			"connectors.import.conflict.replace": "覆盖已有",
			"connectors.import.conflict.rename": "自动重命名",
			"connectors.import.submit": "保存并接入",
			"connectors.import.desktopRequired": "当前桌面版本不支持 MCP JSON 导入，请先升级应用。",
			"connectors.imported": "已接入 {count} 个连接器",
			"connectors.import.conflictError": "连接器 {name} 已存在，请选择覆盖已有或自动重命名。",
			"connectors.advanced.title": "高级配置（开发者）",
			"connectors.form.id": "标识",
			"connectors.form.name": "名称",
			"connectors.form.kind": "类型",
			"connectors.form.kind.mcp": "MCP 服务",
			"connectors.form.kind.http": "HTTP API",
			"connectors.form.transport": "传输方式",
			"connectors.form.transport.stdio": "stdio（本地进程）",
			"connectors.form.transport.http": "Streamable HTTP",
			"connectors.form.command": "启动命令",
			"connectors.form.args": "参数（每行一个）",
			"connectors.form.url": "服务地址",
			"connectors.form.description": "说明",
			"connectors.form.capabilities": "能力标签（逗号分隔）",
			"connectors.form.secrets": "凭证环境变量（逗号分隔）",
			"connectors.form.submit": "保存并接入",
			"connectors.form.hint": "MCP 保存后会通过官方 dsh-mcp-client 注册为 Agent 原生工具，并安全重载 Harness。",
			"connectors.form.id.placeholder": "my-tapd",
			"connectors.form.name.placeholder": "我的 TAPD",
			"connectors.form.description.placeholder": "这个连接器能为 Agent 提供什么",
			"connectors.form.command.placeholder": "npx",
			"connectors.form.args.placeholder": "-y\n@example/mcp-server",
			"connectors.form.url.placeholder": "https://example.com/mcp",
			"connectors.form.capabilities.placeholder": "search, read, create",
			"connectors.form.secrets.placeholder": "TAPD_TOKEN",
			"connectors.saved": "{name} 已保存",
			"connectors.removed": "连接器已移除",
			"connectors.enabled": "{name} 已启用并重新注册到 Harness",
			"connectors.disabled": "{name} 已停用，凭证和配置仍安全保留",
			"connectors.enable": "启用",
			"connectors.disable": "停用",
			"connectors.state.enabled": "已启用",
			"connectors.state.disabled": "已停用",
			"connectors.check": "检测",
			"connectors.diagnostics.title": "连接诊断",
			"connectors.diagnostics.configuration": "配置",
			"connectors.diagnostics.credentials": "凭证",
			"connectors.diagnostics.runtime": "运行环境",
			"connectors.diagnostics.registration": "Harness 注册",
			"connectors.remove": "移除",
			"connectors.unchecked": "尚未检测 · {endpoint}",
			"connectors.type.mcp": "MCP · {transport}",
			"connectors.type.http": "HTTP API",
			"connectors.source.external": "来源：{client}",
			"connectors.source.unknown": "外部客户端",
			"connectors.auth.step": "安全授权 · 主进程处理凭证",
			"connectors.auth.title": "授权 {name}",
			"connectors.auth.hint": "凭证只会进入桌面主进程的加密存储，不会写入连接器配置、日志或页面。",
			"connectors.auth.mode": "授权方式",
			"connectors.auth.gitlabBaseUrl": "GitLab 实例地址",
			"connectors.auth.gitlabClientId": "预注册 Client ID（可选）",
			"connectors.auth.gitlabClientPlaceholder": "留空则尝试官方动态注册",
			"connectors.auth.feishuDomain": "区域",
			"connectors.auth.dingtalkProfiles": "能力 Profile（逗号分隔）",
			"connectors.auth.security": "授权完成后可在卡片上检测、断开或重新授权。",
			"connectors.auth.submit": "开始授权",
			"connectors.auth.authorize": "授权",
			"connectors.auth.reauthorize": "重新授权",
			"connectors.auth.disconnect": "断开授权",
			"connectors.auth.cancel": "取消授权",
			"connectors.auth.verify": "验证授权",
			"connectors.auth.ready": "授权已完成",
			"connectors.auth.verified": "授权验证通过",
			"connectors.auth.disconnected": "授权已断开",
			"connectors.auth.failed": "授权未完成：{detail}",
			"connectors.auth.missing": "缺少权限：{permissions}",
			"connectors.auth.desktopRequired": "当前桌面版本不支持连接器授权，请先升级应用。",
			"connectors.auth.state.not-configured": "未配置授权",
			"connectors.auth.state.authorizing": "授权进行中",
			"connectors.auth.state.ready": "已授权",
			"connectors.auth.state.missing-permission": "缺少权限",
			"connectors.auth.state.reauthorization-required": "需要重新授权",
			"connectors.auth.state.error": "授权异常"
		};
		const en = {
			"entry.skills.label": "Skills",
			"entry.skills.tooltip": "Skill catalog and Skill Studio",
			"entry.connectors.label": "Connectors",
			"entry.connectors.tooltip": "Connector Center (MCP / HTTP)",
			"entry.learning.label": "Learn",
			"entry.learning.tooltip": "Learn Harness concepts and community additions",
			"panel.title": "Extension Center",
			"tab.skills": "Skills",
			"tab.connectors": "Connectors",
			"tab.learning": "Learn",
			"common.loading": "Loading…",
			"common.refresh": "Refresh",
			"common.close": "Close",
			"common.error": "Error: {error}",
			"desktopOnly.title": "Desktop required",
			"desktopOnly.body": "Skills and connectors management runs inside Harness Design Desktop. The desktop bridge is not available in this browser session.",
			"skills.empty": "No skills discovered yet. Create or import one; the Harness watcher picks it up automatically.",
			"skills.create": "Create skill",
			"skills.import": "Import skill bundle",
			"skills.openRoot": "Open user skill root",
			"skills.studio.summary": "Skill Studio · create a SKILL.md the Harness discovers automatically",
			"skills.form.name": "Skill name (kebab-case)",
			"skills.form.description": "Trigger description",
			"skills.form.instructions": "Instructions",
			"skills.form.examples": "Examples (optional)",
			"skills.form.submit": "Create and enable",
			"skills.form.hint": "Saved into the user DSH skill root; the current Harness watcher discovers it.",
			"skills.form.name.placeholder": "tapd-workflow",
			"skills.form.description.placeholder": "Use this skill when querying or updating TAPD work items",
			"skills.form.instructions.placeholder": "Spell out steps, boundaries, failure handling, and which connectors to call...",
			"skills.form.examples.placeholder": "- When the user says \"check this iteration's bugs\"...",
			"skills.created": "{name} created and added to the Harness skill catalog",
			"skills.imported": "{name} imported",
			"skills.badge.shadowed": "shadowed by a same-name skill",
			"skills.badge.managed": "APP MANAGED",
			"skills.managedVersion": "App-managed version: {version}",
			"learning.eyebrow": "DEEPSEEK HARNESS LEARNING PLATFORM",
			"learning.title": "Understand the machine before extending it",
			"learning.intro": "Harness is more than a chat page. It combines models, tools, permissions, plugins, and an iterative Agent loop. The desktop app adds approachable surfaces for using, observing, and shipping that foundation.",
			"learning.open": "Open full learning platform",
			"learning.rule.title": "The most important boundary",
			"learning.rule.body": "Official Harness supplies the Agent and plugin foundation. Connector Center, Skill Studio, enhanced orchestration, mobile remote, health and token dashboards, custom backgrounds, and cross-platform updates are community desktop additions.",
			"learning.start.title": "Start a reliable task in four steps",
			"learning.start.workspace": "Choose a workspace",
			"learning.start.workspace.body": "Limit the Agent to the project it should work in.",
			"learning.start.mode": "Choose mode and orchestration",
			"learning.start.mode.body": "Mode selects the tool set; orchestration selects an execution strategy. Neither is an intelligence tier.",
			"learning.start.permission": "Grant the smallest useful permission",
			"learning.start.permission.body": "Start read-only and enable workspace write when delivery needs it.",
			"learning.start.request": "State the goal and acceptance test",
			"learning.start.request.body": "Describe the result, constraints, and what “done” means.",
			"learning.additions.title": "What this desktop app adds",
			"learning.additions.hint": "Every addition reuses official Harness plugins, profiles, skills, tools, or sessions; it does not replace the official Agent core.",
			"connectors.empty": "No connectors configured yet. Add an MCP server or an HTTP API first.",
			"connectors.create": "Custom connector",
			"connectors.catalog.title": "Recommended connectors",
			"connectors.catalog.official": "Official template",
			"connectors.catalog.providerJson": "Provider JSON",
			"connectors.catalog.officialSkill": "Official Skill",
			"connectors.catalog.installed": "Connected",
			"connectors.catalog.provider": "Provider: {provider}",
			"connectors.catalog.docs": "Open source",
			"connectors.catalog.docsOfficialMcp": "Official MCP docs",
			"connectors.catalog.docsProviderConfig": "Provider setup",
			"connectors.catalog.docsOfficialSkill": "Official install guide",
			"connectors.catalog.docsOfficialApi": "Official API / OAuth docs",
			"connectors.catalog.verifiedTemplate": "Official source verified; template parsing and local import are tested. Real-account authorization has not been tested end to end.",
			"connectors.catalog.verifiedProvider": "Provider entry point verified. Paste JSON from your account page; real-account end-to-end access has not been tested.",
			"connectors.catalog.verifiedSkill": "Official installation path verified; authorization with your account has not been tested end to end.",
			"connectors.catalog.use": "Use template",
			"connectors.catalog.paste": "Paste official JSON",
			"connectors.catalog.reconfigure": "Reconfigure",
			"connectors.catalog.openSkill": "Open install guide",
			"connectors.catalog.installSkill": "Choose official package",
			"connectors.officialSkill.preview": "Validated {files} files ({bytes} bytes). Source: {source}",
			"connectors.officialSkill.confirm": "Install this official Skill package? Package scripts will not be executed.",
			"connectors.officialSkill.installed": "{name} {version} was installed into the Harness skill directory",
			"connectors.catalog.waiting": "Paste the official JSON supplied by the provider",
			"connectors.sources.open": "Auto-find other clients",
			"connectors.sources.title": "Import existing MCP connections",
			"connectors.sources.step": "Choose a configuration source",
			"connectors.sources.hint": "Read MCP settings from another AI client, preview them, then confirm import into Harness.",
			"connectors.sources.workbuddy": "Auto-finds project settings and WorkBuddy .mcp.json / mcp.json files.",
			"connectors.sources.codebuddy": "Auto-finds CodeBuddy project and user settings in official priority order, including JSONC.",
			"connectors.sources.trae": "Auto-finds MCP settings in the project, TRAE user folder, and application-data folders.",
			"connectors.sources.qoder": "Auto-finds project .qoder settings, .mcp.json, and user settings.json.",
			"connectors.sources.status.available": "{count} server(s) found",
			"connectors.sources.status.empty": "Found, but contains no servers",
			"connectors.sources.status.notFound": "Default config not found",
			"connectors.sources.status.invalid": "Config could not be parsed",
			"connectors.sources.status.manual": "Manual selection required",
			"connectors.sources.preview": "Preview and import",
			"connectors.sources.pick": "Not found — choose manually",
			"connectors.sources.security": "Source configs are read-only; WorkBuddy, CodeBuddy, TRAE, and Qoder are never modified. Paths and plaintext credentials never enter the page.",
			"connectors.sources.reviewTitle": "Import MCP from {client}",
			"connectors.sources.reviewHint": "Select servers and supply missing credentials. Imported connectors retain their source label.",
			"connectors.sources.reselect": "Choose another source",
			"connectors.sources.desktopRequired": "This desktop build does not support external-client import. Upgrade the app first.",
			"connectors.import.open": "Import MCP JSON",
			"connectors.import.title": "Import official MCP config",
			"connectors.import.hint": "Supports JSON with mcpServers; transport and credential placeholders are detected automatically.",
			"connectors.import.providerSource": "Source: JSON supplied by the official {provider} page; a redacted provenance fingerprint is saved after import.",
			"connectors.import.step.json": "Step 1 of 2 · Paste config",
			"connectors.import.step.review": "Step 2 of 2 · Add credentials",
			"connectors.import.jsonLabel": "MCP JSON",
			"connectors.import.jsonPlaceholder": "{\n  \"mcpServers\": { ... }\n}",
			"connectors.import.noSecret": "Credentials are encrypted in the desktop main process and never written to config or logs.",
			"connectors.import.preview": "Preview config",
			"connectors.import.edit": "Edit JSON",
			"connectors.import.servers": "{count} servers",
			"connectors.import.selectAll": "Select all",
			"connectors.import.selectOne": "Select at least one MCP server",
			"connectors.import.missingSecret": "Enter credential: {name}",
			"connectors.import.missingCount": "{count} credential(s) still required",
			"connectors.import.ready": "Configuration is ready to connect securely",
			"connectors.import.localTrustTitle": "Allow local MCP command execution",
			"connectors.import.localTrustBody": "Selected servers launch npx or a local program with your account permissions. Confirm that the JSON and package source are trusted.",
			"connectors.import.localTrustRequired": "Confirm the trusted source before allowing local MCP commands",
			"connectors.import.credentialPlaceholder": "Paste token or secret",
			"connectors.import.detected": "Credential detected in JSON: {name}",
			"connectors.import.secret": "Credential ({name})",
			"connectors.import.conflict": "Name conflict",
			"connectors.import.conflict.reject": "Reject conflict",
			"connectors.import.conflict.replace": "Replace existing",
			"connectors.import.conflict.rename": "Auto-rename",
			"connectors.import.submit": "Save and connect",
			"connectors.import.desktopRequired": "This desktop build does not support MCP JSON import. Upgrade the app first.",
			"connectors.imported": "{count} connector(s) connected",
			"connectors.import.conflictError": "Connector {name} already exists. Choose Replace existing or Auto-rename.",
			"connectors.advanced.title": "Advanced configuration (developer)",
			"connectors.form.id": "ID",
			"connectors.form.name": "Name",
			"connectors.form.kind": "Kind",
			"connectors.form.kind.mcp": "MCP server",
			"connectors.form.kind.http": "HTTP API",
			"connectors.form.transport": "Transport",
			"connectors.form.transport.stdio": "stdio (local process)",
			"connectors.form.transport.http": "Streamable HTTP",
			"connectors.form.command": "Launch command",
			"connectors.form.args": "Arguments (one per line)",
			"connectors.form.url": "Server URL",
			"connectors.form.description": "Description",
			"connectors.form.capabilities": "Capabilities (comma-separated)",
			"connectors.form.secrets": "Secret environment keys (comma-separated)",
			"connectors.form.submit": "Save and connect",
			"connectors.form.hint": "MCP connectors register as native Agent tools through the official dsh-mcp-client and safely reload the Harness.",
			"connectors.form.id.placeholder": "my-tapd",
			"connectors.form.name.placeholder": "My TAPD",
			"connectors.form.description.placeholder": "What this connector offers the Agent",
			"connectors.form.command.placeholder": "npx",
			"connectors.form.args.placeholder": "-y\n@example/mcp-server",
			"connectors.form.url.placeholder": "https://example.com/mcp",
			"connectors.form.capabilities.placeholder": "search, read, create",
			"connectors.form.secrets.placeholder": "TAPD_TOKEN",
			"connectors.saved": "{name} saved",
			"connectors.removed": "Connector removed",
			"connectors.enabled": "{name} enabled and registered with Harness",
			"connectors.disabled": "{name} disabled; credentials and configuration are preserved",
			"connectors.enable": "Enable",
			"connectors.disable": "Disable",
			"connectors.state.enabled": "Enabled",
			"connectors.state.disabled": "Disabled",
			"connectors.check": "Check",
			"connectors.diagnostics.title": "Connection diagnostics",
			"connectors.diagnostics.configuration": "Configuration",
			"connectors.diagnostics.credentials": "Credentials",
			"connectors.diagnostics.runtime": "Runtime",
			"connectors.diagnostics.registration": "Harness registration",
			"connectors.remove": "Remove",
			"connectors.unchecked": "Not checked · {endpoint}",
			"connectors.type.mcp": "MCP · {transport}",
			"connectors.type.http": "HTTP API",
			"connectors.source.external": "Source: {client}",
			"connectors.source.unknown": "External client",
			"connectors.auth.step": "Secure authorization · handled by desktop main process",
			"connectors.auth.title": "Authorize {name}",
			"connectors.auth.hint": "Credentials go only to encrypted desktop storage; they are never written to connector config, logs, or the page.",
			"connectors.auth.mode": "Authorization mode",
			"connectors.auth.gitlabBaseUrl": "GitLab instance URL",
			"connectors.auth.gitlabClientId": "Pre-registered Client ID (optional)",
			"connectors.auth.gitlabClientPlaceholder": "Leave empty to try official dynamic registration",
			"connectors.auth.feishuDomain": "Region",
			"connectors.auth.dingtalkProfiles": "Capability profiles (comma-separated)",
			"connectors.auth.security": "After authorization you can verify, disconnect, or reauthorize from the card.",
			"connectors.auth.submit": "Start authorization",
			"connectors.auth.authorize": "Authorize",
			"connectors.auth.reauthorize": "Reauthorize",
			"connectors.auth.disconnect": "Disconnect authorization",
			"connectors.auth.cancel": "Cancel authorization",
			"connectors.auth.verify": "Verify authorization",
			"connectors.auth.ready": "Authorization completed",
			"connectors.auth.verified": "Authorization verified",
			"connectors.auth.disconnected": "Authorization disconnected",
			"connectors.auth.failed": "Authorization incomplete: {detail}",
			"connectors.auth.missing": "Missing permissions: {permissions}",
			"connectors.auth.desktopRequired": "Connector authorization requires a newer desktop build.",
			"connectors.auth.state.not-configured": "Not authorized",
			"connectors.auth.state.authorizing": "Authorizing",
			"connectors.auth.state.ready": "Authorized",
			"connectors.auth.state.missing-permission": "Missing permission",
			"connectors.auth.state.reauthorization-required": "Reauthorization required",
			"connectors.auth.state.error": "Authorization error"
		};
		/** Tiny interpolation: {name} -> value. */
		function t(dictionary, key, values) {
			let text = dictionary[key] ?? key;
			if (values !== void 0) for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{${name}}`, String(value));
			return text;
		}
		//#endregion
		//#region src/client/helpers.ts
		/**
		* Shared client helpers: the active-dictionary pick (document-language based,
		* dsh-ssh precedent) bound to the extension-center interpolator, plus a small
		* error-message extractor. All copy stays in the locale dictionaries.
		*/
		/** Active dictionary, picked by the document language at call time. */
		function dictionary() {
			return (typeof document !== "undefined" ? document.documentElement.lang : "zh").toLowerCase().startsWith("en") ? { ...en } : { ...zh };
		}
		/** Translate a key with optional {name} template params (current language). */
		function tt(key, values) {
			return t(dictionary(), key, values);
		}
		/** Human-readable error text from an unknown thrown value. */
		function errorMessage(error) {
			if (error instanceof Error) return error.message;
			return String(error);
		}
		//#endregion
		//#region \0dsh-css:<repository-root>/packages/dsh-extension-center/src/client/panel/panel.module.css.mjs
		const css = "[data-pane=conversation]{position:relative}[data-dsh-extension-view]{z-index:5;display:none;position:absolute;inset:0}html[data-dsh-extension-active] [data-dsh-extension-view]{display:block}html[data-dsh-extension-active] [data-pane=conversation]>:not([data-dsh-extension-view]){display:none}.bid-pG_entry{width:100%;height:32px;color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap;background:0 0;border:none;border-radius:8px;align-items:center;gap:8px;padding:0 12px;font-size:13px;display:flex}.bid-pG_entry:hover{background:var(--dsw-specific-sidebar-nav-item-hover);color:var(--dsw-alias-label-primary)}.bid-pG_entry[data-active]{background:var(--dsw-specific-sidebar-nav-item-active);color:var(--dsw-alias-label-primary);font-weight:600}.bid-pG_entryIcon{flex:none;justify-content:center;align-items:center;display:inline-flex}.bid-pG_entryLabel{text-overflow:ellipsis;overflow:hidden}[data-dsh-frame][data-sidebar-collapsed] .bid-pG_entry{justify-content:center;width:100%;padding:0}[data-dsh-frame][data-sidebar-collapsed] .bid-pG_entryLabel{display:none}.bid-pG_view{overflow:hidden}.bid-pG_panel{box-sizing:border-box;background:var(--dsw-alias-bg-base);min-width:0;height:100%;min-height:0;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);flex-direction:column;gap:10px;padding:14px 16px 16px;display:flex;position:relative}.bid-pG_panelHeader{flex:none;align-items:center;gap:10px;display:flex}.bid-pG_panelTitle{color:var(--dsw-alias-label-primary);white-space:nowrap;flex:1;margin:0;font-size:16px;font-weight:700}.bid-pG_headerActions{gap:8px;display:flex}.bid-pG_tabBar{border-bottom:1px solid var(--dsw-alias-border-l1);flex:none;gap:2px;display:flex}.bid-pG_tab{color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap;background:0 0;border:none;border-bottom:2px solid #0000;border-radius:6px 6px 0 0;padding:7px 14px;font-size:13px}.bid-pG_tab:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.bid-pG_tab[data-active]{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-state-business-primary);font-weight:600}.bid-pG_panelContent{flex-direction:column;flex:1;min-height:0;display:flex;position:relative;overflow:hidden}.bid-pG_tabBody{flex-direction:column;flex:1;gap:10px;min-height:0;display:flex;overflow-y:auto}.bid-pG_learningBody{gap:16px}.bid-pG_learningHero{border:1px solid var(--dsw-alias-border-l1);background:linear-gradient(135deg, color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent), var(--dsw-alias-bg-elevated,var(--dsw-alias-bg-base)) 55%);border-radius:12px;justify-content:space-between;align-items:flex-start;gap:20px;padding:18px;display:flex}.bid-pG_learningHero h3{color:var(--dsw-alias-label-primary);margin:5px 0 8px;font-size:20px}.bid-pG_learningHero p,.bid-pG_learningGrid p,.bid-pG_learningSteps p{color:var(--dsw-alias-label-secondary);margin:0;font-size:12px;line-height:1.65}.bid-pG_learningHero>div{max-width:720px}.bid-pG_learningHero>a{flex:none;text-decoration:none}.bid-pG_learningEyebrow{letter-spacing:.08em;font-weight:700;color:var(--dsw-alias-state-business-primary)!important;font-size:10px!important}.bid-pG_learningRule{border-left:3px solid var(--dsw-alias-state-business-primary);background:var(--dsw-alias-bg-elevated,var(--dsw-alias-bg-base));grid-template-columns:minmax(110px,auto) minmax(0,1fr);gap:12px;padding:12px 14px;font-size:12px;line-height:1.6;display:grid}.bid-pG_learningRule span{color:var(--dsw-alias-label-secondary)}.bid-pG_learningSteps,.bid-pG_learningGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:9px;display:grid}.bid-pG_learningSteps article,.bid-pG_learningGrid article{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-elevated,var(--dsw-alias-bg-base));border-radius:10px;gap:10px;padding:12px;display:flex}.bid-pG_learningSteps article>span{width:26px;height:26px;color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent);border-radius:50%;flex:none;place-items:center;font-size:11px;font-weight:700;display:grid}.bid-pG_learningSteps strong,.bid-pG_learningGrid strong{color:var(--dsw-alias-label-primary);margin-bottom:4px;font-size:13px;display:block}.bid-pG_learningGrid article{display:block}.bid-pG_toolbar{flex-wrap:wrap;flex:none;align-items:center;gap:8px;display:flex}.bid-pG_primaryButton,.bid-pG_secondaryButton,.bid-pG_dangerButton{cursor:pointer;white-space:nowrap;border-radius:7px;padding:5px 12px;font-size:13px}.bid-pG_primaryButton{border:1px solid var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-bg-base);font-weight:600}.bid-pG_primaryButton:hover:not(:disabled){filter:brightness(1.1)}.bid-pG_secondaryButton{border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);background:0 0;align-items:center;text-decoration:none;display:inline-flex}.bid-pG_secondaryButton:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.bid-pG_dangerButton{border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);background:0 0}.bid-pG_dangerButton:hover:not(:disabled){color:var(--dsw-alias-state-danger-primary,#f66);border-color:var(--dsw-alias-state-danger-primary,#f66)}.bid-pG_primaryButton:disabled,.bid-pG_secondaryButton:disabled,.bid-pG_dangerButton:disabled{opacity:.5;cursor:default}.bid-pG_studioForm{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-elevated,var(--dsw-alias-bg-base));border-radius:10px;flex-direction:column;gap:10px;padding:12px;display:flex}.bid-pG_studioSummary{color:var(--dsw-alias-label-secondary);margin:0;font-size:13px;font-weight:600}.bid-pG_studioForm label{color:var(--dsw-alias-label-secondary);flex-direction:column;gap:4px;font-size:12px;display:flex}.bid-pG_studioForm input,.bid-pG_studioForm textarea,.bid-pG_studioForm select{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-field,var(--dsw-alias-bg-base));border:1px solid var(--dsw-alias-border-l1);border-radius:7px;padding:6px 8px;font-family:inherit;font-size:13px}.bid-pG_studioForm input:focus,.bid-pG_studioForm textarea:focus,.bid-pG_studioForm select:focus{outline:1px solid var(--dsw-alias-state-business-primary)}.bid-pG_formGrid,.bid-pG_formGridThree{gap:10px;display:grid}.bid-pG_formGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.bid-pG_formGridThree{grid-template-columns:repeat(3,minmax(0,1fr))}.bid-pG_formFooter{justify-content:space-between;align-items:center;gap:10px;display:flex}.bid-pG_formFooter span{color:var(--dsw-alias-label-secondary);font-size:12px}.bid-pG_formFooter button{border:1px solid var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-bg-base);cursor:pointer;white-space:nowrap;border-radius:7px;padding:6px 14px;font-size:13px;font-weight:600}.bid-pG_formFooter button:disabled{opacity:.5;cursor:default}.bid-pG_sectionTitle{color:var(--dsw-alias-label-primary);margin:0;font-size:14px;font-weight:700}.bid-pG_catalog{flex-direction:column;flex:none;gap:7px;display:flex}.bid-pG_catalogItem{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-elevated,var(--dsw-alias-bg-base));border-radius:10px;justify-content:space-between;align-items:center;gap:12px;padding:9px 11px;display:flex}.bid-pG_actionRow{flex-wrap:wrap;flex:none;justify-content:flex-end;align-items:center;gap:6px;display:flex}.bid-pG_catalogBody{flex-direction:column;gap:3px;min-width:0;display:flex}.bid-pG_capabilityRow{flex-wrap:wrap;gap:4px;display:flex}.bid-pG_capabilityRow span{color:var(--dsw-alias-label-secondary);background:color-mix(in srgb, var(--dsw-alias-label-secondary) 8%, transparent);border-radius:999px;padding:1px 6px;font-size:10px}.bid-pG_providerLine{color:var(--dsw-alias-label-secondary);margin:0;font-size:11px}.bid-pG_verificationLine{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));margin:0;font-size:10px;line-height:1.45}.bid-pG_authStatus{color:var(--dsw-alias-label-secondary);margin:4px 0 0;font-size:11px}.bid-pG_authStatus[data-state=ready]{color:var(--dsw-alias-state-success-primary,#1aa260)}.bid-pG_authStatus[data-state=error],.bid-pG_authStatus[data-state=missing-permission],.bid-pG_authStatus[data-state=reauthorization-required]{color:var(--dsw-alias-state-danger-primary,#d64545)}.bid-pG_authStatus[data-state=authorizing]{color:var(--dsw-alias-state-business-primary)}.bid-pG_catalogLink{width:fit-content;color:var(--dsw-alias-state-business-primary);font-size:11px}.bid-pG_catalogPending{max-width:180px;color:var(--dsw-alias-label-secondary);text-align:right;flex:none;font-size:11px}.bid-pG_formHeader{justify-content:space-between;align-items:flex-start;gap:10px;display:flex}.bid-pG_formHint{color:var(--dsw-alias-label-secondary);margin:4px 0 0;font-size:12px}.bid-pG_connectorOverlay{z-index:20;box-sizing:border-box;background:color-mix(in srgb, var(--dsw-alias-bg-base) 92%, transparent);backdrop-filter:blur(6px);padding:12px;display:flex;position:absolute;inset:0}.bid-pG_connectorDialog{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-elevated,var(--dsw-alias-bg-base));border-radius:14px;flex-direction:column;width:min(860px,100%);height:100%;min-height:0;max-height:760px;margin:auto;display:flex;overflow:hidden;box-shadow:0 16px 48px #0003}.bid-pG_sourceDialog{height:auto;max-height:min(680px,100%)}.bid-pG_sourceGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;display:grid}.bid-pG_sourceCard{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);border-radius:11px;grid-template-columns:42px minmax(0,1fr);align-items:start;gap:10px;padding:12px;display:grid}.bid-pG_sourceCard>button{grid-column:2;width:fit-content}.bid-pG_sourceMark{width:42px;height:42px;color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent);border-radius:10px;place-items:center;font-size:17px;font-weight:700;display:grid}.bid-pG_sourceBody{flex-direction:column;gap:5px;min-width:0;display:flex}.bid-pG_connectorDialogHeader{border-bottom:1px solid var(--dsw-alias-border-l1);flex:none;justify-content:space-between;align-items:flex-start;gap:16px;padding:16px 18px 14px;display:flex}.bid-pG_dialogStep{color:var(--dsw-alias-state-business-primary);margin:0 0 4px;font-size:11px;font-weight:600}.bid-pG_dialogTitle{color:var(--dsw-alias-label-primary);margin:0;font-size:16px}.bid-pG_connectorDialogBody{flex:1;min-height:0;padding:16px 18px;overflow-y:auto}.bid-pG_dialogField{height:100%;color:var(--dsw-alias-label-secondary);flex-direction:column;gap:7px;font-size:12px;display:flex}.bid-pG_jsonEditor{box-sizing:border-box;resize:vertical;width:100%;min-height:280px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-field,var(--dsw-alias-bg-base));border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:10px 12px;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.bid-pG_jsonEditor:focus,.bid-pG_connectorDialog input:focus,.bid-pG_connectorDialog select:focus{outline:1px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.bid-pG_dialogError{color:var(--dsw-alias-state-danger-primary,#f66);background:color-mix(in srgb, var(--dsw-alias-state-danger-primary,#f66) 9%, transparent);border:1px solid var(--dsw-alias-state-danger-primary,#f66);overflow-wrap:anywhere;border-radius:8px;margin-bottom:12px;padding:9px 11px;font-size:12px;line-height:1.5}.bid-pG_connectorDialogFooter{border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-elevated,var(--dsw-alias-bg-base));flex:none;justify-content:space-between;align-items:center;gap:12px;padding:12px 18px;display:flex}.bid-pG_dialogFooterStatus{min-width:0;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere;font-size:12px}.bid-pG_dialogFooterStatus[data-ready]{color:var(--dsw-alias-state-success-primary,#1aa260)}.bid-pG_dialogFooterStatus[data-error]{color:var(--dsw-alias-state-danger-primary,#f66);font-weight:600}.bid-pG_connectorDialogActions{flex:none;align-items:center;gap:8px;display:flex}.bid-pG_conflictField{color:var(--dsw-alias-label-secondary);white-space:nowrap;align-items:center;gap:6px;font-size:12px;display:inline-flex}.bid-pG_conflictField select{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-field,var(--dsw-alias-bg-base));border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:5px 7px;font-size:12px}.bid-pG_importPreview{flex-direction:column;gap:8px;margin:0;padding:0;display:flex}.bid-pG_importServer{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;flex-direction:column;gap:7px;padding:9px;display:flex}.bid-pG_importServerHeader{min-width:0;color:var(--dsw-alias-label-primary);align-items:center;gap:7px;font-size:13px;display:flex}.bid-pG_importServerHeader .bid-pG_description{white-space:nowrap;text-overflow:ellipsis;flex:1;min-width:0;overflow:hidden}.bid-pG_trustBox{color:var(--dsw-alias-label-secondary);background:color-mix(in srgb, var(--dsw-alias-state-warning-primary,#d98c10) 8%, transparent);border:1px solid color-mix(in srgb, var(--dsw-alias-state-warning-primary,#d98c10) 45%, transparent);border-radius:8px;align-items:flex-start;gap:9px;padding:10px 12px;font-size:12px;line-height:1.5;display:flex}.bid-pG_trustBox input{margin-top:3px}.bid-pG_trustBox strong{color:var(--dsw-alias-label-primary);display:block}.bid-pG_inlineLabel{color:var(--dsw-alias-label-secondary);align-items:center;gap:5px;font-size:12px;display:inline-flex}.bid-pG_secretRow{color:var(--dsw-alias-label-secondary);grid-template-columns:minmax(120px,1fr) minmax(150px,2fr);align-items:center;gap:8px;padding-left:23px;font-size:12px;display:grid}.bid-pG_secretRow input{min-width:0;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-field,var(--dsw-alias-bg-base));border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:5px 7px}.bid-pG_secretRow input[aria-invalid=true]{border-color:var(--dsw-alias-state-danger-primary,#f66)}.bid-pG_list{flex-direction:column;gap:8px;display:flex}.bid-pG_item{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-elevated,var(--dsw-alias-bg-base));border-radius:10px;justify-content:space-between;align-items:flex-start;gap:12px;padding:10px 12px;display:flex}.bid-pG_itemBody{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}.bid-pG_nameRow{align-items:center;gap:8px;min-width:0;display:flex}.bid-pG_name{color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:600;overflow:hidden}.bid-pG_badge{border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);white-space:nowrap;border-radius:999px;flex:none;padding:1px 8px;font-size:11px}.bid-pG_badge[data-success]{color:var(--dsw-alias-state-success-primary,#1aa260);border-color:color-mix(in srgb, var(--dsw-alias-state-success-primary,#1aa260) 45%, transparent)}.bid-pG_description,.bid-pG_health{color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere;margin:0;font-size:12px}.bid-pG_health[data-error]{color:var(--dsw-alias-state-danger-primary,#f66)}.bid-pG_diagnostics{border:1px solid var(--dsw-alias-border-l1);background:color-mix(in srgb, var(--dsw-alias-bg-base) 82%, transparent);border-radius:8px;gap:5px;margin-top:5px;padding:8px;display:grid}.bid-pG_diagnosticRow{color:var(--dsw-alias-label-secondary);grid-template-columns:8px minmax(80px,auto) minmax(0,1fr);align-items:start;gap:7px;font-size:11px;line-height:1.5;display:grid}.bid-pG_diagnosticRow strong{color:var(--dsw-alias-label-primary)}.bid-pG_diagnosticDot{background:var(--dsw-alias-state-success-primary,#1aa260);border-radius:50%;width:7px;height:7px;margin-top:5px}.bid-pG_diagnosticRow[data-status=warn] .bid-pG_diagnosticDot,.bid-pG_diagnosticRow[data-status=skipped] .bid-pG_diagnosticDot{background:var(--dsw-alias-state-warning-primary,#d98c10)}.bid-pG_diagnosticRow[data-status=fail] .bid-pG_diagnosticDot{background:var(--dsw-alias-state-danger-primary,#f66)}.bid-pG_itemActions{flex:none;gap:8px;display:flex}.bid-pG_notice{text-align:center;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-elevated,var(--dsw-alias-bg-base));border-radius:12px;max-width:460px;margin:auto;padding:18px}.bid-pG_notice h3{color:var(--dsw-alias-label-primary);margin:0 0 8px;font-size:14px}.bid-pG_notice p{color:var(--dsw-alias-label-secondary);margin:0;font-size:13px;line-height:1.6}.bid-pG_empty{text-align:center;color:var(--dsw-alias-label-secondary);margin:0;padding:18px;font-size:13px}.bid-pG_toast{z-index:50;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-elevated,var(--dsw-alias-bg-base));max-height:40%;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere;border-radius:8px;padding:8px 12px;font-size:13px;position:absolute;bottom:16px;left:16px;right:16px;overflow-y:auto;box-shadow:0 8px 24px #00000029}.bid-pG_toast[data-error]{color:var(--dsw-alias-state-danger-primary,#f66);border-color:var(--dsw-alias-state-danger-primary,#f66)}@media (width<=760px){.bid-pG_connectorOverlay{padding:8px}.bid-pG_connectorDialogHeader,.bid-pG_connectorDialogBody,.bid-pG_connectorDialogFooter{padding-left:12px;padding-right:12px}.bid-pG_connectorDialogFooter,.bid-pG_connectorDialogActions{flex-direction:column;align-items:stretch}.bid-pG_connectorDialogActions,.bid-pG_connectorDialogActions>button,.bid-pG_conflictField,.bid-pG_conflictField select{width:100%}.bid-pG_secretRow{grid-template-columns:1fr;padding-left:0}.bid-pG_sourceGrid{grid-template-columns:1fr}.bid-pG_learningHero,.bid-pG_learningRule{flex-direction:column;display:flex}.bid-pG_learningSteps,.bid-pG_learningGrid{grid-template-columns:1fr}}";
		const tagId = "@linxin666/dsh-client-ui-extension-center/panel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@linxin666/dsh-client-ui-extension-center";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var panel_module_css_default = {
			"actionRow": "bid-pG_actionRow",
			"authStatus": "bid-pG_authStatus",
			"badge": "bid-pG_badge",
			"capabilityRow": "bid-pG_capabilityRow",
			"catalog": "bid-pG_catalog",
			"catalogBody": "bid-pG_catalogBody",
			"catalogItem": "bid-pG_catalogItem",
			"catalogLink": "bid-pG_catalogLink",
			"catalogPending": "bid-pG_catalogPending",
			"conflictField": "bid-pG_conflictField",
			"connectorDialog": "bid-pG_connectorDialog",
			"connectorDialogActions": "bid-pG_connectorDialogActions",
			"connectorDialogBody": "bid-pG_connectorDialogBody",
			"connectorDialogFooter": "bid-pG_connectorDialogFooter",
			"connectorDialogHeader": "bid-pG_connectorDialogHeader",
			"connectorOverlay": "bid-pG_connectorOverlay",
			"dangerButton": "bid-pG_dangerButton",
			"description": "bid-pG_description",
			"diagnosticDot": "bid-pG_diagnosticDot",
			"diagnosticRow": "bid-pG_diagnosticRow",
			"diagnostics": "bid-pG_diagnostics",
			"dialogError": "bid-pG_dialogError",
			"dialogField": "bid-pG_dialogField",
			"dialogFooterStatus": "bid-pG_dialogFooterStatus",
			"dialogStep": "bid-pG_dialogStep",
			"dialogTitle": "bid-pG_dialogTitle",
			"empty": "bid-pG_empty",
			"entry": "bid-pG_entry",
			"entryIcon": "bid-pG_entryIcon",
			"entryLabel": "bid-pG_entryLabel",
			"formFooter": "bid-pG_formFooter",
			"formGrid": "bid-pG_formGrid",
			"formGridThree": "bid-pG_formGridThree",
			"formHeader": "bid-pG_formHeader",
			"formHint": "bid-pG_formHint",
			"headerActions": "bid-pG_headerActions",
			"health": "bid-pG_health",
			"importPreview": "bid-pG_importPreview",
			"importServer": "bid-pG_importServer",
			"importServerHeader": "bid-pG_importServerHeader",
			"inlineLabel": "bid-pG_inlineLabel",
			"item": "bid-pG_item",
			"itemActions": "bid-pG_itemActions",
			"itemBody": "bid-pG_itemBody",
			"jsonEditor": "bid-pG_jsonEditor",
			"learningBody": "bid-pG_learningBody",
			"learningEyebrow": "bid-pG_learningEyebrow",
			"learningGrid": "bid-pG_learningGrid",
			"learningHero": "bid-pG_learningHero",
			"learningRule": "bid-pG_learningRule",
			"learningSteps": "bid-pG_learningSteps",
			"list": "bid-pG_list",
			"name": "bid-pG_name",
			"nameRow": "bid-pG_nameRow",
			"notice": "bid-pG_notice",
			"panel": "bid-pG_panel",
			"panelContent": "bid-pG_panelContent",
			"panelHeader": "bid-pG_panelHeader",
			"panelTitle": "bid-pG_panelTitle",
			"primaryButton": "bid-pG_primaryButton",
			"providerLine": "bid-pG_providerLine",
			"secondaryButton": "bid-pG_secondaryButton",
			"secretRow": "bid-pG_secretRow",
			"sectionTitle": "bid-pG_sectionTitle",
			"sourceBody": "bid-pG_sourceBody",
			"sourceCard": "bid-pG_sourceCard",
			"sourceDialog": "bid-pG_sourceDialog",
			"sourceGrid": "bid-pG_sourceGrid",
			"sourceMark": "bid-pG_sourceMark",
			"studioForm": "bid-pG_studioForm",
			"studioSummary": "bid-pG_studioSummary",
			"tab": "bid-pG_tab",
			"tabBar": "bid-pG_tabBar",
			"tabBody": "bid-pG_tabBody",
			"toast": "bid-pG_toast",
			"toolbar": "bid-pG_toolbar",
			"trustBox": "bid-pG_trustBox",
			"verificationLine": "bid-pG_verificationLine",
			"view": "bid-pG_view"
		};
		//#endregion
		//#region src/client/panel/SkillsTab.tsx
		/**
		* The Skills tab: the discovered-skill catalog, Skill Studio (create form),
		* bundle import, and the user skill root shortcut. Ports the dock's skill
		* surface; every mutation goes through the desktop bridge.
		*/
		/** The Skills tab component. */
		function SkillsTab({ bridge, refreshKey, notify }) {
			const [skills, setSkills] = (0, react.useState)(null);
			const [studioOpen, setStudioOpen] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const load = (0, react.useCallback)(async () => {
				try {
					const inventory = await bridge.listExtensions();
					setSkills(inventory.skills);
				} catch (error) {
					notify(errorMessage(error), true);
				}
			}, [bridge, notify]);
			(0, react.useEffect)(() => {
				load();
			}, [load, refreshKey]);
			const onImport = async () => {
				setBusy(true);
				try {
					const result = await bridge.importSkill();
					if (!result.canceled && result.skill !== void 0) {
						notify(tt("skills.imported", { name: result.skill.name }));
						await load();
					}
				} catch (error) {
					notify(errorMessage(error), true);
				} finally {
					setBusy(false);
				}
			};
			const onCreate = async (event) => {
				event.preventDefault();
				const form = event.currentTarget;
				const values = Object.fromEntries(new FormData(form));
				setBusy(true);
				try {
					notify(tt("skills.created", { name: (await bridge.createSkill(buildSkillInput({
						name: String(values.name ?? ""),
						description: String(values.description ?? ""),
						instructions: String(values.instructions ?? ""),
						examples: String(values.examples ?? "")
					}))).name }));
					form.reset();
					setStudioOpen(false);
					await load();
				} catch (error) {
					notify(errorMessage(error), true);
				} finally {
					setBusy(false);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.tabBody,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.toolbar,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.primaryButton,
								disabled: busy,
								onClick: () => {
									setStudioOpen((open) => !open);
								},
								children: tt("skills.create")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.secondaryButton,
								disabled: busy,
								onClick: () => {
									onImport();
								},
								children: tt("skills.import")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.secondaryButton,
								disabled: busy,
								onClick: () => {
									bridge.openSkillRoot();
								},
								children: tt("skills.openRoot")
							})
						]
					}),
					studioOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
						className: panel_module_css_default.studioForm,
						onSubmit: (event) => {
							onCreate(event);
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: panel_module_css_default.studioSummary,
								children: tt("skills.studio.summary")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.formGrid,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [tt("skills.form.name"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									name: "name",
									required: true,
									pattern: "[a-z0-9]+(?:-[a-z0-9]+)*",
									placeholder: tt("skills.form.name.placeholder")
								})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [tt("skills.form.description"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									name: "description",
									required: true,
									placeholder: tt("skills.form.description.placeholder")
								})] })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [tt("skills.form.instructions"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								name: "instructions",
								rows: 8,
								required: true,
								placeholder: tt("skills.form.instructions.placeholder")
							})] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [tt("skills.form.examples"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								name: "examples",
								rows: 4,
								placeholder: tt("skills.form.examples.placeholder")
							})] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.formFooter,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: tt("skills.form.hint") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "submit",
									disabled: busy,
									children: tt("skills.form.submit")
								})]
							})
						]
					}),
					skills === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.empty,
						children: tt("common.loading")
					}) : skills.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.empty,
						children: tt("skills.empty")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.list,
						"aria-live": "polite",
						children: skills.map((skill) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
							className: panel_module_css_default.item,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.itemBody,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.nameRow,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.name,
												children: skill.name
											}),
											skill.shadowed === true && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.badge,
												children: tt("skills.badge.shadowed")
											}),
											skill.managed !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.badge,
												"data-success": "true",
												children: tt("skills.badge.managed")
											})
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: panel_module_css_default.description,
										children: skill.description
									}),
									skill.managed?.version !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: panel_module_css_default.providerLine,
										children: tt("skills.managedVersion", { version: skill.managed.version })
									})
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.secondaryButton,
								onClick: () => {
									bridge.openSkill(skill.id);
								},
								children: skill.source
							})]
						}, skill.id))
					})
				]
			});
		}
		//#endregion
		//#region src/client/catalog.ts
		const CONNECTOR_PRESETS = [
			{
				id: "github",
				name: "GitHub MCP",
				provider: "GitHub",
				description: "GitHub 官方远程 MCP；可访问仓库、Issue、PR 与 Actions。",
				docsUrl: "https://github.com/github/github-mcp-server",
				capabilities: [
					"仓库",
					"Issue",
					"Pull Request",
					"Actions"
				],
				integration: "mcp-template",
				documentation: "official-mcp",
				authModes: ["oauth", "pat"],
				authScopes: [
					"repo",
					"read:user",
					"user:email"
				],
				json: JSON.stringify({ mcpServers: { github: {
					type: "http",
					url: "https://api.githubcopilot.com/mcp/",
					headers: { Authorization: "Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}" }
				} } }, null, 2)
			},
			{
				id: "feishu",
				name: "飞书 / Lark MCP",
				provider: "字节跳动",
				description: "飞书官方 OpenAPI MCP；使用自建应用 App ID 与 App Secret。",
				docsUrl: "https://github.com/larksuite/lark-openapi-mcp",
				capabilities: [
					"文档",
					"多维表格",
					"消息",
					"日历"
				],
				integration: "mcp-template",
				documentation: "official-mcp",
				authModes: ["official-cli", "app-credentials"],
				authScopes: ["offline_access"],
				json: JSON.stringify({ mcpServers: { "lark-mcp": {
					command: "npx",
					args: [
						"-y",
						"@larksuiteoapi/lark-mcp",
						"mcp",
						"-a",
						"${FEISHU_APP_ID}",
						"-s",
						"${FEISHU_APP_SECRET}"
					]
				} } }, null, 2)
			},
			{
				id: "gitlab",
				name: "GitLab MCP",
				provider: "GitLab",
				description: "GitLab 官方 MCP；需要实例开启 MCP，远程连接可能触发 OAuth 授权。",
				docsUrl: "https://docs.gitlab.com/user/model_context_protocol/mcp_server/",
				capabilities: [
					"仓库",
					"Issue",
					"Merge Request",
					"CI/CD"
				],
				integration: "mcp-template",
				documentation: "official-mcp",
				authModes: ["oauth"],
				authScopes: ["mcp"],
				json: JSON.stringify({ mcpServers: { gitlab: {
					type: "http",
					url: "https://gitlab.com/api/v4/mcp"
				} } }, null, 2)
			},
			{
				id: "dingtalk",
				name: "钉钉 MCP",
				provider: "钉钉",
				description: "钉钉官方 MCP；通过自建应用 Client ID、Client Secret 和能力 Profile 接入。",
				docsUrl: "https://github.com/open-dingtalk/dingtalk-mcp",
				capabilities: [
					"通讯录",
					"日历",
					"待办",
					"机器人"
				],
				integration: "mcp-template",
				documentation: "official-mcp",
				authModes: ["app-credentials"],
				authScopes: ["dingtalk-contacts"],
				json: JSON.stringify({ mcpServers: { "dingtalk-mcp": {
					command: "npx",
					args: ["-y", "dingtalk-mcp@latest"],
					env: {
						DINGTALK_Client_ID: "${DINGTALK_Client_ID}",
						DINGTALK_Client_Secret: "${DINGTALK_Client_Secret}",
						ACTIVE_PROFILES: "dingtalk-contacts"
					}
				} } }, null, 2)
			},
			{
				id: "tapd",
				name: "TAPD MCP",
				provider: "腾讯 TAPD",
				description: "直接粘贴 TAPD 页面提供的官方 mcpServers JSON，再替换其中令牌即可；应用不会要求重复填写组织或项目参数。",
				docsUrl: "https://www.tapd.cn/official/intelligent_collaboration_index",
				capabilities: [
					"需求",
					"缺陷",
					"迭代",
					"项目管理"
				],
				integration: "provider-json",
				documentation: "provider-config",
				providerId: "tapd"
			},
			{
				id: "tencent-gongfeng",
				name: "腾讯工蜂",
				provider: "腾讯工蜂",
				description: "当前仅确认工蜂官方 API / OAuth 能力；如团队提供 MCP JSON 可粘贴接入，应用不会把 API 文档冒充成官方 MCP。",
				docsUrl: "https://code.tencent.com/help/oauth2/",
				capabilities: [
					"仓库",
					"Issue",
					"Merge Request",
					"流水线"
				],
				integration: "provider-json",
				documentation: "official-api",
				providerId: "tencent-gongfeng"
			},
			{
				id: "tencent-meeting",
				name: "腾讯会议 Skill",
				provider: "腾讯会议",
				description: "腾讯会议当前官方路径是 Skill 与本地代理。打开官方说明安装后，Harness 会从技能目录发现。",
				docsUrl: "https://meeting.tencent.com/support/topic/2233/index.html",
				capabilities: [
					"会议查询",
					"会议创建",
					"参会管理"
				],
				integration: "official-skill",
				documentation: "official-skill"
			},
			{
				id: "wecom",
				name: "企业微信 Skill",
				provider: "企业微信",
				description: "企业微信官方团队当前提供 wecom-cli 与 Agent Skills；按官方仓库安装，不冒充通用 MCP 服务。",
				docsUrl: "https://github.com/WecomTeam/wecom-cli",
				capabilities: [
					"消息",
					"通讯录",
					"客户联系",
					"办公协作"
				],
				integration: "official-skill",
				documentation: "official-skill"
			}
		];
		//#endregion
		//#region src/client/panel/ConnectorsTab.tsx
		/**
		* Connector catalog and registry. The normal path is provider template or
		* official JSON -> preview -> fill only missing credentials -> encrypted
		* desktop import. Low-level fields remain available under Custom connector.
		*/
		const CLIENT_NAMES = {
			workbuddy: "WorkBuddy",
			codebuddy: "CodeBuddy",
			trae: "TRAE",
			qoder: "Qoder"
		};
		function sourceStatusText(status, count) {
			if (status === "available") return tt("connectors.sources.status.available", { count });
			if (status === "empty") return tt("connectors.sources.status.empty");
			if (status === "invalid") return tt("connectors.sources.status.invalid");
			if (status === "manual") return tt("connectors.sources.status.manual");
			return tt("connectors.sources.status.notFound");
		}
		function sourceDescription(clientId) {
			if (clientId === "workbuddy") return tt("connectors.sources.workbuddy");
			if (clientId === "codebuddy") return tt("connectors.sources.codebuddy");
			if (clientId === "trae") return tt("connectors.sources.trae");
			return tt("connectors.sources.qoder");
		}
		function diagnosticLabel(id) {
			if (id === "configuration") return tt("connectors.diagnostics.configuration");
			if (id === "credentials") return tt("connectors.diagnostics.credentials");
			if (id === "runtime") return tt("connectors.diagnostics.runtime");
			return tt("connectors.diagnostics.registration");
		}
		function providerJsonLabel(providerId) {
			return providerId === "tapd" ? "TAPD" : "腾讯工蜂";
		}
		function friendlyImportError(error) {
			const message = errorMessage(error);
			if (message.includes("local-command-trust-required")) return tt("connectors.import.localTrustRequired");
			if (message.startsWith("connector-conflict:")) return tt("connectors.import.conflictError", { name: message.slice(19) });
			return message;
		}
		function ConnectorsTab({ bridge, refreshKey, notify }) {
			const [connectors, setConnectors] = (0, react.useState)(null);
			const [health, setHealth] = (0, react.useState)({});
			const [authStatuses, setAuthStatuses] = (0, react.useState)({});
			const [authConnector, setAuthConnector] = (0, react.useState)(null);
			const [authForm, setAuthForm] = (0, react.useState)({
				mode: "oauth",
				token: "",
				appId: "",
				appSecret: "",
				domain: "https://open.feishu.cn",
				profiles: "dingtalk-contacts",
				baseUrl: "https://gitlab.com",
				clientId: "",
				scopes: ""
			});
			const [catalogOpen, setCatalogOpen] = (0, react.useState)(true);
			const [formOpen, setFormOpen] = (0, react.useState)(false);
			const [sourcePickerOpen, setSourcePickerOpen] = (0, react.useState)(false);
			const [clientSources, setClientSources] = (0, react.useState)(null);
			const [stagedSource, setStagedSource] = (0, react.useState)(null);
			const [importOpen, setImportOpen] = (0, react.useState)(false);
			const [jsonText, setJsonText] = (0, react.useState)("");
			const [preview, setPreview] = (0, react.useState)(null);
			const [selected, setSelected] = (0, react.useState)({});
			const [secretValues, setSecretValues] = (0, react.useState)({});
			const [conflict, setConflict] = (0, react.useState)("reject");
			const [importSource, setImportSource] = (0, react.useState)({ kind: "json" });
			const [importError, setImportError] = (0, react.useState)(null);
			const [localCommandTrusted, setLocalCommandTrusted] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [kind, setKind] = (0, react.useState)("mcp");
			const [transport, setTransport] = (0, react.useState)("stdio");
			const secretInputs = (0, react.useRef)({});
			const mcp = kind === "mcp";
			const remote = !mcp || transport !== "stdio";
			const canImportJson = typeof bridge.previewMcpJson === "function" && typeof bridge.importMcpJson === "function";
			const canImportClientSource = typeof bridge.listMcpClientSources === "function" && typeof bridge.previewMcpClientSource === "function" && typeof bridge.pickMcpClientSource === "function" && typeof bridge.importMcpClientSource === "function";
			const selectedNames = preview === null ? [] : selectedMcpServerNames(preview, selected);
			const missingSecrets = preview === null ? [] : missingMcpCredentials(preview, selected, secretValues);
			const requiresLocalExecution = preview !== null && selectedMcpRequiresLocalExecution(preview, selected);
			const load = (0, react.useCallback)(async () => {
				try {
					const next = await bridge.listConnectors();
					setConnectors(next);
					if (bridge.getConnectorAuthorizationStatus !== void 0) {
						const statuses = await Promise.all(next.filter((item) => connectorAuthProvider(item) !== void 0).map(async (item) => {
							try {
								return [item.id, await bridge.getConnectorAuthorizationStatus(item.id)];
							} catch {
								return null;
							}
						}));
						setAuthStatuses((current) => ({
							...current,
							...Object.fromEntries(statuses.filter((item) => item !== null))
						}));
					}
				} catch (error) {
					notify(errorMessage(error), true);
				}
			}, [bridge, notify]);
			const refreshAuthStatus = (0, react.useCallback)(async (connector) => {
				if (bridge.getConnectorAuthorizationStatus === void 0 || connectorAuthProvider(connector) === void 0) return void 0;
				try {
					const status = await bridge.getConnectorAuthorizationStatus(connector.id);
					setAuthStatuses((current) => ({
						...current,
						[connector.id]: status
					}));
					return status;
				} catch (error) {
					notify(errorMessage(error), true);
					return;
				}
			}, [bridge, notify]);
			const openAuthorization = (connector) => {
				const provider = connectorAuthProvider(connector);
				if (provider === void 0 || bridge.authorizeConnector === void 0) {
					notify(tt("connectors.auth.desktopRequired"), true);
					return;
				}
				const mode = provider === "github" || provider === "gitlab" ? "oauth" : provider === "feishu" ? "official-cli" : "app-credentials";
				setAuthForm((current) => ({
					...current,
					mode,
					token: "",
					appId: "",
					appSecret: "",
					profiles: "dingtalk-contacts"
				}));
				setAuthConnector(connector);
			};
			const onAuthorize = async (event) => {
				event.preventDefault();
				if (authConnector === null || bridge.authorizeConnector === void 0) return;
				const provider = connectorAuthProvider(authConnector);
				if (provider === void 0) return;
				setBusy(true);
				setAuthStatuses((current) => ({
					...current,
					[authConnector.id]: {
						connectorId: authConnector.id,
						providerId: provider,
						mode: authForm.mode,
						state: "authorizing"
					}
				}));
				try {
					const input = {
						mode: authForm.mode,
						...authForm.token ? { token: authForm.token } : {},
						...authForm.appId ? { appId: authForm.appId } : {},
						...authForm.appSecret ? { appSecret: authForm.appSecret } : {},
						...authForm.domain ? { domain: authForm.domain } : {},
						...authForm.profiles ? { profiles: splitComma(authForm.profiles) } : {},
						...authForm.baseUrl ? { baseUrl: authForm.baseUrl } : {},
						...authForm.clientId ? { clientId: authForm.clientId } : {},
						...authForm.scopes ? { scopes: splitComma(authForm.scopes) } : {}
					};
					const status = await bridge.authorizeConnector(authConnector.id, input);
					setAuthStatuses((current) => ({
						...current,
						[authConnector.id]: status
					}));
					if (status.state === "ready") {
						notify(tt("connectors.auth.ready"));
						setAuthConnector(null);
					} else notify(tt("connectors.auth.failed", { detail: status.detailKey ?? status.state }), true);
				} catch (error) {
					notify(errorMessage(error), true);
					await refreshAuthStatus(authConnector);
				} finally {
					setBusy(false);
				}
			};
			const onAuthAction = async (connector) => {
				const status = authStatuses[connector.id];
				const action = connectorAuthAction(status?.state);
				if (action === "cancel") {
					if (bridge.cancelConnectorAuthorization === void 0) return;
					setBusy(true);
					try {
						const next = await bridge.cancelConnectorAuthorization(connector.id);
						setAuthStatuses((current) => ({
							...current,
							[connector.id]: next
						}));
					} catch (error) {
						notify(errorMessage(error), true);
					} finally {
						setBusy(false);
					}
					return;
				}
				if (action === "disconnect") {
					if (bridge.disconnectConnector === void 0) return;
					setBusy(true);
					try {
						const next = await bridge.disconnectConnector(connector.id);
						setAuthStatuses((current) => ({
							...current,
							[connector.id]: next
						}));
						notify(tt("connectors.auth.disconnected"));
					} catch (error) {
						notify(errorMessage(error), true);
					} finally {
						setBusy(false);
					}
					return;
				}
				if (action === "reauthorize" || action === "authorize") openAuthorization(connector);
			};
			const onVerifyAuth = async (connector) => {
				if (bridge.verifyConnectorAuthorization === void 0) return;
				setBusy(true);
				try {
					const status = await bridge.verifyConnectorAuthorization(connector.id);
					setAuthStatuses((current) => ({
						...current,
						[connector.id]: status
					}));
					notify(status.state === "ready" ? tt("connectors.auth.verified") : tt("connectors.auth.failed", { detail: status.detailKey ?? status.state }), status.state !== "ready");
				} catch (error) {
					notify(errorMessage(error), true);
				} finally {
					setBusy(false);
				}
			};
			(0, react.useEffect)(() => {
				load();
			}, [load, refreshKey]);
			const closeImport = (0, react.useCallback)(() => {
				setImportOpen(false);
				setJsonText("");
				setPreview(null);
				setSelected({});
				setSecretValues({});
				setConflict("reject");
				setImportSource({ kind: "json" });
				setStagedSource(null);
				setImportError(null);
				setLocalCommandTrusted(false);
				secretInputs.current = {};
			}, []);
			const openSourcePicker = (0, react.useCallback)(async () => {
				if (!canImportClientSource || bridge.listMcpClientSources === void 0) {
					notify(tt("connectors.sources.desktopRequired"), true);
					return;
				}
				setSourcePickerOpen(true);
				setClientSources(null);
				setImportError(null);
				setLocalCommandTrusted(false);
				setBusy(true);
				try {
					setClientSources(await bridge.listMcpClientSources());
				} catch (error) {
					setSourcePickerOpen(false);
					notify(errorMessage(error), true);
				} finally {
					setBusy(false);
				}
			}, [
				bridge,
				canImportClientSource,
				notify
			]);
			const stageClientSource = (0, react.useCallback)((source) => {
				setStagedSource(source);
				setJsonText("");
				setImportSource({ kind: "json" });
				setPreview(source.preview);
				setSelected(Object.fromEntries(source.preview.servers.map((server) => [server.sourceName, true])));
				setSecretValues({});
				setConflict("reject");
				setImportError(null);
				setLocalCommandTrusted(false);
				setSourcePickerOpen(false);
				setImportOpen(true);
			}, []);
			const selectClientSource = (0, react.useCallback)(async (source) => {
				if (bridge.previewMcpClientSource === void 0 || bridge.pickMcpClientSource === void 0) return;
				setBusy(true);
				setImportError(null);
				try {
					if (canPreviewMcpClientSource(source)) stageClientSource(await bridge.previewMcpClientSource(source.clientId));
					else {
						const picked = await bridge.pickMcpClientSource(source.clientId);
						if (!picked.canceled && picked.source !== void 0 && picked.preview !== void 0) stageClientSource(picked);
					}
				} catch (error) {
					notify(friendlyImportError(error), true);
				} finally {
					setBusy(false);
				}
			}, [
				bridge,
				notify,
				stageClientSource
			]);
			const openJsonImport = (0, react.useCallback)((source = { kind: "json" }, replaceExisting = false) => {
				setImportSource(source);
				setJsonText("");
				setPreview(null);
				setSelected({});
				setSecretValues({});
				setImportError(null);
				setLocalCommandTrusted(false);
				setConflict(replaceExisting ? "replace" : "reject");
				setImportOpen(true);
			}, []);
			const previewJson = (0, react.useCallback)(async (text, source = { kind: "json" }, replaceExisting = false) => {
				if (!canImportJson || bridge.previewMcpJson === void 0) {
					notify(tt("connectors.import.desktopRequired"), true);
					return;
				}
				setImportSource(source);
				setJsonText(text);
				setImportOpen(true);
				setPreview(null);
				setSecretValues({});
				setImportError(null);
				setLocalCommandTrusted(false);
				setConflict(replaceExisting ? "replace" : "reject");
				setBusy(true);
				try {
					const result = await bridge.previewMcpJson(text);
					setPreview(result);
					setSelected(Object.fromEntries(result.servers.map((server) => [server.sourceName, true])));
				} catch (error) {
					setImportError(friendlyImportError(error));
				} finally {
					setBusy(false);
				}
			}, [
				bridge,
				canImportJson,
				notify
			]);
			const onPreviewSubmit = async (event) => {
				event.preventDefault();
				await previewJson(jsonText, importSource, conflict === "replace");
			};
			const onImport = async () => {
				if (preview === null) return;
				if (stagedSource === null && bridge.importMcpJson === void 0) return;
				if (stagedSource !== null && bridge.importMcpClientSource === void 0) return;
				if (selectedNames.length === 0) {
					setImportError(tt("connectors.import.selectOne"));
					return;
				}
				if (missingSecrets.length > 0) {
					const first = missingSecrets[0];
					setImportError(tt("connectors.import.missingSecret", { name: mcpCredentialLabel(first) }));
					requestAnimationFrame(() => {
						secretInputs.current[first.credentialRef]?.focus();
					});
					return;
				}
				if (requiresLocalExecution && !localCommandTrusted) {
					setImportError(tt("connectors.import.localTrustRequired"));
					return;
				}
				setImportError(null);
				setBusy(true);
				try {
					const importOptions = {
						selectedNames,
						conflict,
						secrets: Object.fromEntries(Object.entries(secretValues).filter(([, value]) => value.trim().length > 0)),
						allowLocalCommand: localCommandTrusted
					};
					const result = stagedSource === null ? await bridge.importMcpJson({
						text: jsonText,
						...importOptions,
						source: importSource
					}) : await bridge.importMcpClientSource({
						token: stagedSource.source.token,
						...importOptions
					});
					await load();
					const completedChecks = (await Promise.all(result.imported.map(async (connector) => {
						try {
							return [connector.id, await bridge.checkConnector(connector.id)];
						} catch {
							return null;
						}
					}))).filter((check) => check !== null);
					if (completedChecks.length > 0) setHealth((current) => ({
						...current,
						...Object.fromEntries(completedChecks)
					}));
					notify(tt("connectors.imported", { count: result.imported.length }));
					closeImport();
				} catch (error) {
					setImportError(friendlyImportError(error));
				} finally {
					setBusy(false);
				}
			};
			const onSave = async (event) => {
				event.preventDefault();
				const values = Object.fromEntries(new FormData(event.currentTarget));
				setBusy(true);
				try {
					notify(tt("connectors.saved", { name: (await bridge.saveConnector(buildConnectorInput({
						id: String(values.id ?? ""),
						name: String(values.name ?? ""),
						description: String(values.description ?? ""),
						kind,
						transport,
						url: String(values.url ?? ""),
						command: String(values.command ?? ""),
						args: String(values.args ?? ""),
						capabilities: String(values.capabilities ?? ""),
						secretEnvKeys: String(values.secretEnvKeys ?? "")
					}))).name }));
					event.currentTarget.reset();
					setKind("mcp");
					setTransport("stdio");
					setFormOpen(false);
					await load();
				} catch (error) {
					notify(errorMessage(error), true);
				} finally {
					setBusy(false);
				}
			};
			const onCheck = async (id) => {
				setBusy(true);
				try {
					const result = await bridge.checkConnector(id);
					setHealth((map) => ({
						...map,
						[id]: result
					}));
				} catch (error) {
					notify(errorMessage(error), true);
				} finally {
					setBusy(false);
				}
			};
			const onInstallOfficialSkill = async (preset) => {
				if (preset.id !== "tencent-meeting" && preset.id !== "wecom") return;
				if (bridge.previewOfficialSkill === void 0 || bridge.installOfficialSkill === void 0) return;
				setBusy(true);
				try {
					const result = await bridge.previewOfficialSkill(preset.id);
					if (result.canceled || result.token === void 0 || result.preview === void 0) return;
					const { preview } = result;
					const summary = tt("connectors.officialSkill.preview", {
						files: preview.files.length,
						bytes: preview.bytes,
						source: preview.sourceUrl ?? preset.docsUrl
					});
					if (!window.confirm(`${summary}\n\n${tt("connectors.officialSkill.confirm")}`)) return;
					const installed = await bridge.installOfficialSkill(result.token);
					notify(tt("connectors.officialSkill.installed", {
						name: installed.name,
						version: installed.version
					}));
					await load();
				} catch (error) {
					notify(errorMessage(error), true);
				} finally {
					setBusy(false);
				}
			};
			const onRemove = async (id) => {
				setBusy(true);
				try {
					await bridge.removeConnector(id);
					notify(tt("connectors.removed"));
					setHealth((map) => {
						const next = { ...map };
						delete next[id];
						return next;
					});
					await load();
				} catch (error) {
					notify(errorMessage(error), true);
				} finally {
					setBusy(false);
				}
			};
			const onToggleEnabled = async (connector) => {
				if (bridge.setConnectorEnabled === void 0) return;
				setBusy(true);
				try {
					const updated = await bridge.setConnectorEnabled(connector.id, connector.enabled === false);
					notify(updated.enabled ? tt("connectors.enabled", { name: updated.name }) : tt("connectors.disabled", { name: updated.name }));
					setHealth((map) => {
						const next = { ...map };
						delete next[connector.id];
						return next;
					});
					await load();
				} catch (error) {
					notify(errorMessage(error), true);
				} finally {
					setBusy(false);
				}
			};
			const renderPreset = (preset) => {
				const installed = connectors?.some((connector) => {
					if (preset.integration === "provider-json" && preset.providerId !== void 0) return connector.source?.kind === "provider-json" && connector.source.providerId === preset.providerId;
					return connector.source?.kind === "preset" && connector.source.presetId === preset.id;
				}) ?? false;
				const typeLabel = preset.integration === "mcp-template" ? tt("connectors.catalog.official") : preset.integration === "provider-json" ? tt("connectors.catalog.providerJson") : tt("connectors.catalog.officialSkill");
				const docsLabel = preset.documentation === "official-mcp" ? tt("connectors.catalog.docsOfficialMcp") : preset.documentation === "provider-config" ? tt("connectors.catalog.docsProviderConfig") : preset.documentation === "official-skill" ? tt("connectors.catalog.docsOfficialSkill") : tt("connectors.catalog.docsOfficialApi");
				const verification = preset.integration === "mcp-template" ? tt("connectors.catalog.verifiedTemplate") : preset.integration === "provider-json" ? tt("connectors.catalog.verifiedProvider") : tt("connectors.catalog.verifiedSkill");
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
					className: panel_module_css_default.catalogItem,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.catalogBody,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.nameRow,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.name,
										children: preset.name
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.badge,
										children: typeLabel
									}),
									installed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.badge,
										"data-success": "true",
										children: tt("connectors.catalog.installed")
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: panel_module_css_default.description,
								children: preset.description
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.capabilityRow,
								children: preset.capabilities.map((capability) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: capability }, capability))
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
								className: panel_module_css_default.providerLine,
								children: [
									tt("connectors.catalog.provider", { provider: preset.provider }),
									" · ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
										className: panel_module_css_default.catalogLink,
										href: preset.docsUrl,
										target: "_blank",
										rel: "noreferrer",
										children: docsLabel
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: panel_module_css_default.verificationLine,
								children: verification
							})
						]
					}), preset.integration === "official-skill" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.actionRow,
						children: [bridge.previewOfficialSkill !== void 0 && bridge.installOfficialSkill !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.secondaryButton,
							disabled: busy,
							onClick: () => {
								onInstallOfficialSkill(preset);
							},
							children: tt("connectors.catalog.installSkill")
						}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
							className: panel_module_css_default.secondaryButton,
							href: preset.docsUrl,
							target: "_blank",
							rel: "noreferrer",
							children: tt("connectors.catalog.openSkill")
						})]
					}) : preset.json === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: panel_module_css_default.secondaryButton,
						disabled: busy || !canImportJson || preset.providerId === void 0,
						onClick: () => {
							if (preset.providerId !== void 0) openJsonImport({
								kind: "provider-json",
								providerId: preset.providerId
							}, installed);
						},
						children: installed ? tt("connectors.catalog.reconfigure") : tt("connectors.catalog.paste")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: panel_module_css_default.secondaryButton,
						disabled: busy || !canImportJson,
						onClick: () => {
							previewJson(preset.json, {
								kind: "preset",
								presetId: preset.id
							}, installed);
						},
						children: installed ? tt("connectors.catalog.reconfigure") : tt("connectors.catalog.use")
					})]
				}, preset.id);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.tabBody,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.toolbar,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.primaryButton,
								disabled: busy,
								onClick: () => {
									setCatalogOpen((open) => !open);
								},
								children: tt("connectors.catalog.title")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.secondaryButton,
								disabled: busy || !canImportClientSource,
								onClick: () => {
									openSourcePicker();
								},
								children: tt("connectors.sources.open")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.secondaryButton,
								disabled: busy || !canImportJson,
								onClick: () => {
									openJsonImport();
								},
								children: tt("connectors.import.open")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.secondaryButton,
								disabled: busy,
								onClick: () => {
									setFormOpen((open) => !open);
								},
								children: tt("connectors.create")
							})
						]
					}),
					catalogOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: panel_module_css_default.catalog,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							className: panel_module_css_default.sectionTitle,
							children: tt("connectors.catalog.title")
						}), CONNECTOR_PRESETS.map(renderPreset)]
					}),
					sourcePickerOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.connectorOverlay,
						role: "dialog",
						"aria-modal": "true",
						"aria-labelledby": "mcp-source-title",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: `${panel_module_css_default.connectorDialog} ${panel_module_css_default.sourceDialog}`,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
									className: panel_module_css_default.connectorDialogHeader,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: panel_module_css_default.dialogStep,
											children: tt("connectors.sources.step")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
											id: "mcp-source-title",
											className: panel_module_css_default.dialogTitle,
											children: tt("connectors.sources.title")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: panel_module_css_default.formHint,
											children: tt("connectors.sources.hint")
										})
									] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: panel_module_css_default.secondaryButton,
										disabled: busy,
										onClick: () => {
											setSourcePickerOpen(false);
										},
										children: tt("common.close")
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.connectorDialogBody,
									children: clientSources === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: panel_module_css_default.empty,
										children: tt("common.loading")
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.sourceGrid,
										children: clientSources.map((source) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
											className: panel_module_css_default.sourceCard,
											"data-status": source.status,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: panel_module_css_default.sourceMark,
													"aria-hidden": "true",
													children: source.clientName.slice(0, 1)
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: panel_module_css_default.sourceBody,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: panel_module_css_default.nameRow,
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
															className: panel_module_css_default.name,
															children: source.clientName
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: panel_module_css_default.badge,
															children: sourceStatusText(source.status, source.serverCount)
														})]
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
														className: panel_module_css_default.description,
														children: sourceDescription(source.clientId)
													})]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: canPreviewMcpClientSource(source) ? panel_module_css_default.primaryButton : panel_module_css_default.secondaryButton,
													disabled: busy,
													onClick: () => {
														selectClientSource(source);
													},
													children: canPreviewMcpClientSource(source) ? tt("connectors.sources.preview") : tt("connectors.sources.pick")
												})
											]
										}, source.clientId))
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("footer", {
									className: panel_module_css_default.connectorDialogFooter,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.dialogFooterStatus,
										children: tt("connectors.sources.security")
									})
								})
							]
						})
					}),
					importOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.connectorOverlay,
						role: "dialog",
						"aria-modal": "true",
						"aria-labelledby": "mcp-import-title",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: panel_module_css_default.connectorDialog,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
									className: panel_module_css_default.connectorDialogHeader,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: panel_module_css_default.dialogStep,
											children: preview === null ? tt("connectors.import.step.json") : tt("connectors.import.step.review")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
											id: "mcp-import-title",
											className: panel_module_css_default.dialogTitle,
											children: stagedSource === null ? tt("connectors.import.title") : tt("connectors.sources.reviewTitle", { client: stagedSource.source.clientName })
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: panel_module_css_default.formHint,
											children: stagedSource === null ? tt("connectors.import.hint") : tt("connectors.sources.reviewHint")
										}),
										stagedSource === null && importSource.kind === "provider-json" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: panel_module_css_default.verificationLine,
											children: tt("connectors.import.providerSource", { provider: providerJsonLabel(importSource.providerId) })
										})
									] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: panel_module_css_default.secondaryButton,
										disabled: busy,
										onClick: closeImport,
										children: tt("common.close")
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.connectorDialogBody,
									children: preview === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("form", {
										id: "mcp-json-import-form",
										onSubmit: (event) => {
											onPreviewSubmit(event);
										},
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											className: panel_module_css_default.dialogField,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: tt("connectors.import.jsonLabel") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
												className: panel_module_css_default.jsonEditor,
												value: jsonText,
												onChange: (event) => {
													setJsonText(event.target.value);
													setImportError(null);
												},
												placeholder: tt("connectors.import.jsonPlaceholder"),
												autoFocus: true
											})]
										})
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.importPreview,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: panel_module_css_default.formHeader,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: tt("connectors.import.servers", { count: preview.servers.length }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
													className: panel_module_css_default.inlineLabel,
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
															type: "checkbox",
															checked: preview.servers.every((server) => selected[server.sourceName]),
															onChange: (event) => {
																setImportError(null);
																setLocalCommandTrusted(false);
																setSelected(Object.fromEntries(preview.servers.map((server) => [server.sourceName, event.target.checked])));
															}
														}),
														" ",
														tt("connectors.import.selectAll")
													]
												})]
											}),
											preview.servers.map((server) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: panel_module_css_default.importServer,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
													className: panel_module_css_default.importServerHeader,
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
															type: "checkbox",
															checked: Boolean(selected[server.sourceName]),
															onChange: (event) => {
																setImportError(null);
																setLocalCommandTrusted(false);
																setSelected((items) => ({
																	...items,
																	[server.sourceName]: event.target.checked
																}));
															}
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: server.sourceName }),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: panel_module_css_default.badge,
															children: server.transport
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: panel_module_css_default.description,
															children: server.command ? connectorEndpoint({
																kind: "mcp",
																transport: "stdio",
																command: server.command,
																args: server.args
															}) : server.url
														})
													]
												}), selected[server.sourceName] && server.secretSlots.map((slot) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
													className: panel_module_css_default.secretRow,
													children: slot.detected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: tt("connectors.import.detected", { name: mcpCredentialLabel(slot) }) }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: mcpCredentialLabel(slot) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
														ref: (node) => {
															secretInputs.current[slot.credentialRef] = node;
														},
														type: "password",
														autoComplete: "off",
														required: true,
														"aria-invalid": missingSecrets.some((missing) => missing.credentialRef === slot.credentialRef) && importError !== null,
														placeholder: tt("connectors.import.credentialPlaceholder"),
														value: secretValues[slot.credentialRef] ?? "",
														onChange: (event) => {
															setImportError(null);
															setSecretValues((values) => ({
																...values,
																[slot.credentialRef]: event.target.value
															}));
														}
													})] })
												}, slot.credentialRef))]
											}, server.sourceName)),
											requiresLocalExecution && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												className: panel_module_css_default.trustBox,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													type: "checkbox",
													checked: localCommandTrusted,
													onChange: (event) => {
														setLocalCommandTrusted(event.target.checked);
														setImportError(null);
													}
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: tt("connectors.import.localTrustTitle") }), tt("connectors.import.localTrustBody")] })]
											})
										]
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
									className: panel_module_css_default.connectorDialogFooter,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.dialogFooterStatus,
										"data-error": importError !== null ? "true" : void 0,
										"data-ready": importError === null && preview !== null && selectedNames.length > 0 && missingSecrets.length === 0 && (!requiresLocalExecution || localCommandTrusted) ? "true" : void 0,
										role: importError !== null ? "alert" : "status",
										children: importError ?? (preview === null ? tt("connectors.import.noSecret") : selectedNames.length === 0 ? tt("connectors.import.selectOne") : missingSecrets.length > 0 ? tt("connectors.import.missingCount", { count: missingSecrets.length }) : requiresLocalExecution && !localCommandTrusted ? tt("connectors.import.localTrustRequired") : tt("connectors.import.ready"))
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.connectorDialogActions,
										children: [preview !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: panel_module_css_default.secondaryButton,
											disabled: busy,
											onClick: () => {
												if (stagedSource === null) {
													setPreview(null);
													setImportError(null);
													setLocalCommandTrusted(false);
												} else {
													closeImport();
													setSourcePickerOpen(true);
												}
											},
											children: stagedSource === null ? tt("connectors.import.edit") : tt("connectors.sources.reselect")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											className: panel_module_css_default.conflictField,
											children: [
												tt("connectors.import.conflict"),
												" ",
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
													value: conflict,
													onChange: (event) => {
														setConflict(event.target.value);
														setImportError(null);
													},
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
															value: "reject",
															children: tt("connectors.import.conflict.reject")
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
															value: "replace",
															children: tt("connectors.import.conflict.replace")
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
															value: "rename",
															children: tt("connectors.import.conflict.rename")
														})
													]
												})
											]
										})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: preview === null ? "submit" : "button",
											form: preview === null ? "mcp-json-import-form" : void 0,
											className: panel_module_css_default.primaryButton,
											disabled: busy || (preview === null ? jsonText.trim().length === 0 : selectedNames.length === 0),
											onClick: preview === null ? void 0 : () => {
												onImport();
											},
											children: preview === null ? tt("connectors.import.preview") : tt("connectors.import.submit")
										})]
									})]
								})
							]
						})
					}),
					formOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
						className: panel_module_css_default.studioForm,
						onSubmit: (event) => {
							onSave(event);
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: panel_module_css_default.studioSummary,
								children: tt("connectors.advanced.title")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.formGridThree,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [tt("connectors.form.id"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										name: "id",
										required: true,
										pattern: "[a-z0-9]+(?:-[a-z0-9]+)*",
										placeholder: tt("connectors.form.id.placeholder")
									})] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [tt("connectors.form.name"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										name: "name",
										required: true,
										placeholder: tt("connectors.form.name.placeholder")
									})] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [tt("connectors.form.kind"), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										value: kind,
										onChange: (event) => {
											setKind(event.target.value === "http" ? "http" : "mcp");
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "mcp",
											children: tt("connectors.form.kind.mcp")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "http",
											children: tt("connectors.form.kind.http")
										})]
									})] })
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [tt("connectors.form.description"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								name: "description",
								placeholder: tt("connectors.form.description.placeholder")
							})] }),
							mcp && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [tt("connectors.form.transport"), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								value: transport,
								onChange: (event) => {
									setTransport(event.target.value === "streamable-http" ? "streamable-http" : "stdio");
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "stdio",
									children: tt("connectors.form.transport.stdio")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "streamable-http",
									children: tt("connectors.form.transport.http")
								})]
							})] }),
							mcp && !remote && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [tt("connectors.form.command"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								name: "command",
								placeholder: tt("connectors.form.command.placeholder")
							})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [tt("connectors.form.args"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								name: "args",
								rows: 3,
								placeholder: tt("connectors.form.args.placeholder")
							})] })] }),
							remote && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [tt("connectors.form.url"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								name: "url",
								type: "url",
								required: true,
								placeholder: tt("connectors.form.url.placeholder")
							})] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.formGrid,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [tt("connectors.form.capabilities"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									name: "capabilities",
									placeholder: tt("connectors.form.capabilities.placeholder")
								})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [tt("connectors.form.secrets"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									name: "secretEnvKeys",
									placeholder: tt("connectors.form.secrets.placeholder")
								})] })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.formFooter,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: tt("connectors.form.hint") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "submit",
									disabled: busy,
									children: tt("connectors.form.submit")
								})]
							})
						]
					}),
					authConnector !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.connectorOverlay,
						role: "dialog",
						"aria-modal": "true",
						"aria-labelledby": "connector-auth-title",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
							className: panel_module_css_default.connectorDialog,
							onSubmit: (event) => {
								onAuthorize(event);
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
									className: panel_module_css_default.connectorDialogHeader,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: panel_module_css_default.dialogStep,
											children: tt("connectors.auth.step")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
											id: "connector-auth-title",
											className: panel_module_css_default.dialogTitle,
											children: tt("connectors.auth.title", { name: authConnector.name })
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: panel_module_css_default.formHint,
											children: tt("connectors.auth.hint")
										})
									] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: panel_module_css_default.secondaryButton,
										disabled: busy,
										onClick: () => {
											setAuthConnector(null);
											setAuthForm((current) => ({
												...current,
												token: "",
												appSecret: ""
											}));
										},
										children: tt("common.close")
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.connectorDialogBody,
									children: [
										connectorAuthProvider(authConnector) === "github" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											className: panel_module_css_default.dialogField,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: tt("connectors.auth.mode") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
												value: authForm.mode,
												onChange: (event) => {
													setAuthForm((current) => ({
														...current,
														mode: event.target.value
													}));
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "oauth",
													children: "OAuth（浏览器授权）"
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "pat",
													children: "Fine-grained PAT"
												})]
											})]
										}), authForm.mode === "pat" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											className: panel_module_css_default.dialogField,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "Personal Access Token" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												type: "password",
												autoComplete: "off",
												value: authForm.token,
												onChange: (event) => {
													setAuthForm((current) => ({
														...current,
														token: event.target.value
													}));
												},
												required: true
											})]
										})] }),
										connectorAuthProvider(authConnector) === "gitlab" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											className: panel_module_css_default.dialogField,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: tt("connectors.auth.gitlabBaseUrl") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												type: "url",
												value: authForm.baseUrl,
												onChange: (event) => {
													setAuthForm((current) => ({
														...current,
														baseUrl: event.target.value
													}));
												},
												required: true
											})]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											className: panel_module_css_default.dialogField,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: tt("connectors.auth.gitlabClientId") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												value: authForm.clientId,
												onChange: (event) => {
													setAuthForm((current) => ({
														...current,
														clientId: event.target.value
													}));
												},
												placeholder: tt("connectors.auth.gitlabClientPlaceholder")
											})]
										})] }),
										connectorAuthProvider(authConnector) === "feishu" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												className: panel_module_css_default.dialogField,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "App ID" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													value: authForm.appId,
													onChange: (event) => {
														setAuthForm((current) => ({
															...current,
															appId: event.target.value
														}));
													},
													required: true
												})]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												className: panel_module_css_default.dialogField,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "App Secret" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													type: "password",
													autoComplete: "off",
													value: authForm.appSecret,
													onChange: (event) => {
														setAuthForm((current) => ({
															...current,
															appSecret: event.target.value
														}));
													},
													required: true
												})]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												className: panel_module_css_default.dialogField,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: tt("connectors.auth.feishuDomain") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
													value: authForm.domain,
													onChange: (event) => {
														setAuthForm((current) => ({
															...current,
															domain: event.target.value
														}));
													},
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
														value: "https://open.feishu.cn",
														children: "飞书（中国大陆）"
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
														value: "https://open.larksuite.com",
														children: "Lark（国际版）"
													})]
												})]
											})
										] }),
										connectorAuthProvider(authConnector) === "dingtalk" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												className: panel_module_css_default.dialogField,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "Client ID" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													value: authForm.clientId,
													onChange: (event) => {
														setAuthForm((current) => ({
															...current,
															clientId: event.target.value
														}));
													},
													required: true
												})]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												className: panel_module_css_default.dialogField,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "Client Secret" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													type: "password",
													autoComplete: "off",
													value: authForm.appSecret,
													onChange: (event) => {
														setAuthForm((current) => ({
															...current,
															appSecret: event.target.value
														}));
													},
													required: true
												})]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												className: panel_module_css_default.dialogField,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: tt("connectors.auth.dingtalkProfiles") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													value: authForm.profiles,
													onChange: (event) => {
														setAuthForm((current) => ({
															...current,
															profiles: event.target.value
														}));
													}
												})]
											})
										] })
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
									className: panel_module_css_default.connectorDialogFooter,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.dialogFooterStatus,
										children: tt("connectors.auth.security")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.connectorDialogActions,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "submit",
											className: panel_module_css_default.primaryButton,
											disabled: busy,
											children: tt("connectors.auth.submit")
										})
									})]
								})
							]
						})
					}),
					connectors === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.empty,
						children: tt("common.loading")
					}) : connectors.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.empty,
						children: tt("connectors.empty")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.list,
						"aria-live": "polite",
						children: connectors.map((connector) => {
							const endpoint = connectorEndpoint(connector);
							const checked = health[connector.id];
							const authStatus = authStatuses[connector.id];
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
								className: panel_module_css_default.item,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.itemBody,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.nameRow,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: panel_module_css_default.name,
													children: connector.name
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: panel_module_css_default.badge,
													children: connector.kind === "mcp" ? tt("connectors.type.mcp", { transport: connector.transport }) : tt("connectors.type.http")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: panel_module_css_default.badge,
													"data-success": connector.enabled === false ? void 0 : "true",
													children: connector.enabled === false ? tt("connectors.state.disabled") : tt("connectors.state.enabled")
												}),
												connector.source?.kind === "external-client" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: panel_module_css_default.badge,
													children: tt("connectors.source.external", { client: CLIENT_NAMES[connector.source.clientId ?? ""] ?? connector.source.clientId ?? tt("connectors.source.unknown") })
												})
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: panel_module_css_default.description,
											children: connector.description || endpoint
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: panel_module_css_default.health,
											"data-error": checked !== void 0 && !checked.ok ? "true" : void 0,
											children: checked !== void 0 ? checked.detail : tt("connectors.unchecked", { endpoint })
										}),
										authStatus !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
											className: panel_module_css_default.authStatus,
											"data-state": authStatus.state,
											children: [
												tt(`connectors.auth.state.${authStatus.state}`),
												authStatus.grantedScopes?.length ? ` · ${authStatus.grantedScopes.join(", ")}` : "",
												authStatus.missingPermissions?.length ? ` · ${tt("connectors.auth.missing", { permissions: authStatus.missingPermissions.join(", ") })}` : ""
											]
										}),
										checked?.checks !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
											className: panel_module_css_default.diagnostics,
											"aria-label": tt("connectors.diagnostics.title"),
											children: checked.checks.map((check) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: panel_module_css_default.diagnosticRow,
												"data-status": check.status,
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: panel_module_css_default.diagnosticDot,
														"aria-hidden": "true"
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: diagnosticLabel(check.id) }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: check.detail })
												]
											}, check.id))
										})
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.itemActions,
									children: [
										connectorAuthProvider(connector) !== void 0 && bridge.authorizeConnector !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: panel_module_css_default.secondaryButton,
											disabled: busy,
											onClick: () => {
												onAuthAction(connector);
											},
											children: connectorAuthAction(authStatuses[connector.id]?.state) === "cancel" ? tt("connectors.auth.cancel") : connectorAuthAction(authStatuses[connector.id]?.state) === "disconnect" ? tt("connectors.auth.disconnect") : authStatuses[connector.id]?.state === "reauthorization-required" || authStatuses[connector.id]?.state === "error" ? tt("connectors.auth.reauthorize") : tt("connectors.auth.authorize")
										}), (authStatuses[connector.id]?.state === "ready" || authStatuses[connector.id]?.state === "missing-permission") && bridge.verifyConnectorAuthorization !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: panel_module_css_default.secondaryButton,
											disabled: busy,
											onClick: () => {
												onVerifyAuth(connector);
											},
											children: tt("connectors.auth.verify")
										})] }),
										" ",
										bridge.setConnectorEnabled !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: panel_module_css_default.secondaryButton,
											disabled: busy,
											onClick: () => {
												onToggleEnabled(connector);
											},
											children: connector.enabled === false ? tt("connectors.enable") : tt("connectors.disable")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: panel_module_css_default.secondaryButton,
											disabled: busy,
											onClick: () => {
												onCheck(connector.id);
											},
											children: tt("connectors.check")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: panel_module_css_default.dangerButton,
											disabled: busy,
											onClick: () => {
												onRemove(connector.id);
											},
											children: tt("connectors.remove")
										})
									]
								})]
							}, connector.id);
						})
					})
				]
			});
		}
		//#endregion
		//#region src/client/panel/LearningTab.tsx
		const COMMUNITY_CAPABILITIES = [
			["连接器中心", "自动发现 WorkBuddy、CodeBuddy、TRAE、Qoder 配置，也能直接导入服务方给出的 MCP JSON。"],
			["Skill Studio", "把一套做事方法写成可复用的 SKILL.md；它是操作手册，不是拥有宿主权限的插件。"],
			["增强编排", "标准、自适应、增强三档只调整执行策略；官方 Agent 循环、工具和权限边界仍是底座。"],
			["可观测性", "查看缓存命中、模型健康、Token 消耗和 Agent 轨迹，发现问题后由人决定是否切换。"],
			["移动与渠道", "手机远程继续同一会话；IM 机器人属于外部消息渠道，两者共享 Harness，但不是同一功能。"],
			["桌面交付", "安全更新、失败回退、图片粘贴、自定义背景和跨平台安装都留在社区桌面层。"]
		];
		function LearningTab() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: `${panel_module_css_default.tabBody} ${panel_module_css_default.learningBody}`,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: panel_module_css_default.learningHero,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: panel_module_css_default.learningEyebrow,
								children: tt("learning.eyebrow")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: tt("learning.title") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: tt("learning.intro") })
						] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
							className: panel_module_css_default.primaryButton,
							href: "https://dsh-foundry-interactive.yufrank71.chatgpt.site",
							target: "_blank",
							rel: "noreferrer",
							children: tt("learning.open")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: panel_module_css_default.learningRule,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: tt("learning.rule.title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: tt("learning.rule.body") })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						className: panel_module_css_default.sectionTitle,
						children: tt("learning.start.title")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.learningSteps,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "1" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: tt("learning.start.workspace") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: tt("learning.start.workspace.body") })] })] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "2" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: tt("learning.start.mode") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: tt("learning.start.mode.body") })] })] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "3" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: tt("learning.start.permission") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: tt("learning.start.permission.body") })] })] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "4" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: tt("learning.start.request") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: tt("learning.start.request.body") })] })] })
						]
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							className: panel_module_css_default.sectionTitle,
							children: tt("learning.additions.title")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: panel_module_css_default.formHint,
							children: tt("learning.additions.hint")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.learningGrid,
							children: COMMUNITY_CAPABILITIES.map(([name, description]) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: name }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: description })] }, name))
						})
					] })
				]
			});
		}
		//#endregion
		//#region src/client/panel/ExtensionPanel.tsx
		/**
		* The extension-center panel shell: header, tab bar, desktop-only notice,
		* and toast host. The tab state lives in the PanelController (shared with
		* the sidebar entries) so both surfaces always agree.
		*/
		/** The panel shell component. */
		function ExtensionPanel({ controller, bridge }) {
			const snapshot = (0, react.useSyncExternalStore)(controller.subscribe, controller.getSnapshot);
			const [toast, setToast] = (0, react.useState)(null);
			const [refreshKey, setRefreshKey] = (0, react.useState)(0);
			const toastTimer = (0, react.useRef)();
			const notify = (0, react.useCallback)((message, error = false) => {
				setToast({
					message,
					error
				});
				clearTimeout(toastTimer.current);
				toastTimer.current = setTimeout(() => {
					setToast(null);
				}, 4e3);
			}, []);
			(0, react.useEffect)(() => () => clearTimeout(toastTimer.current), []);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.panel,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: panel_module_css_default.panelHeader,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							className: panel_module_css_default.panelTitle,
							children: tt("panel.title")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.headerActions,
							children: [bridge !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.secondaryButton,
								onClick: () => {
									setRefreshKey((key) => key + 1);
								},
								children: tt("common.refresh")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.secondaryButton,
								onClick: () => {
									controller.close();
								},
								children: tt("common.close")
							})]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("nav", {
						className: panel_module_css_default.tabBar,
						children: [
							{
								id: "skills",
								label: () => tt("tab.skills")
							},
							{
								id: "connectors",
								label: () => tt("tab.connectors")
							},
							{
								id: "learning",
								label: () => tt("tab.learning")
							}
						].map((tab) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.tab,
							"data-active": snapshot.panelOpen && snapshot.tab === tab.id ? "true" : void 0,
							onClick: () => {
								controller.open(tab.id);
							},
							children: tab.label()
						}, tab.id))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.panelContent,
						children: snapshot.tab === "learning" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LearningTab, {}) : bridge === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: panel_module_css_default.notice,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: tt("desktopOnly.title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: tt("desktopOnly.body") })]
						}) : snapshot.tab === "skills" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillsTab, {
							bridge,
							refreshKey,
							notify
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConnectorsTab, {
							bridge,
							refreshKey,
							notify
						})
					}),
					toast !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.toast,
						"data-error": toast.error ? "true" : void 0,
						role: toast.error ? "alert" : "status",
						children: toast.message
					})
				]
			});
		}
		//#endregion
		//#region src/client/mount.tsx
		/**
		* Panel view mounting.
		*
		* The `conversation` slot is single-occupant (ui-conversation) and external
		* plugins cannot declare slots, so the panel takes over the center column at
		* the DOM level: a container is appended inside the [data-pane="conversation"]
		* grid item (an extra trailing child React never manages), and a stylesheet
		* rule hides the conversation content while the panel is active. Toggling is
		* a data attribute on <html> — no React involvement, so the conversation
		* subtree underneath stays mounted and stateful. (dsh-ssh takeover pattern.)
		*/
		const CONVERSATION_COLUMN_SELECTOR = "[data-pane=\"conversation\"]";
		const ACTIVE_ATTR = "data-dsh-extension-active";
		/** Sibling center-column panels: opening one panel must release the column from the others. */
		const SIBLING_PANEL_ATTRS = ["data-dsh-ssh-active", "data-dsh-taskboard-active"];
		const SIBLING_ENTRY_SELECTOR = "[data-dsh-ssh-entry], [data-dsh-taskboard-entry]";
		/** Find the center column, or undefined while the frame is not mounted. */
		function conversationColumn() {
			return document.querySelector(CONVERSATION_COLUMN_SELECTOR) ?? void 0;
		}
		/**
		* Mount the panel React tree into the center column and bind its visibility
		* to the controller's panelOpen state.
		* @param controller - the panel controller driving the view.
		* @param bridge - the desktop IPC bridge (undefined in plain browser sessions).
		* @returns disposer unmounting the tree and restoring the column.
		*/
		function mountPanel(controller, bridge) {
			let root;
			let container;
			const ensure = () => {
				if (container !== void 0) {
					if (container.isConnected) return;
					root?.unmount();
					root = void 0;
					container.remove();
					container = void 0;
				}
				const column = conversationColumn();
				if (column === void 0) return;
				container = document.createElement("div");
				container.dataset.dshExtensionView = "";
				container.className = panel_module_css_default.view;
				column.appendChild(container);
				root = (0, react_dom_client.createRoot)(container);
				root.render(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ExtensionPanel, {
					controller,
					bridge
				}));
			};
			const waitObserver = new MutationObserver(() => {
				ensure();
			});
			waitObserver.observe(document.body, {
				childList: true,
				subtree: true
			});
			const applyActive = () => {
				if (controller.getSnapshot().panelOpen) {
					for (const attr of SIBLING_PANEL_ATTRS) document.documentElement.removeAttribute(attr);
					document.querySelectorAll(SIBLING_ENTRY_SELECTOR).forEach((element) => element.removeAttribute("data-active"));
					document.documentElement.setAttribute(ACTIVE_ATTR, "");
				} else document.documentElement.removeAttribute(ACTIVE_ATTR);
			};
			const unsubscribe = controller.subscribe(applyActive);
			applyActive();
			ensure();
			return () => {
				waitObserver.disconnect();
				unsubscribe();
				document.documentElement.removeAttribute(ACTIVE_ATTR);
				root?.unmount();
				root = void 0;
				container?.remove();
				container = void 0;
			};
		}
		//#endregion
		//#region src/client/panel/controller.ts
		/** The panel state owner the sidebar entries toggle and the view renders from. */
		var PanelController = class {
			panelOpen = false;
			tab = "skills";
			listeners = /* @__PURE__ */ new Set();
			/** Cached snapshot: useSyncExternalStore requires a stable reference between state changes. */
			snapshot = {
				panelOpen: false,
				tab: "skills"
			};
			/** Stable callback for React useSyncExternalStore (must retain this instance). */
			getSnapshot = () => {
				return this.snapshot;
			};
			/** Stable callback for React useSyncExternalStore (must retain this instance). */
			subscribe = (fn) => {
				this.listeners.add(fn);
				return () => {
					this.listeners.delete(fn);
				};
			};
			/** Open the panel on a tab (reopening on the same tab is a no-op). */
			open(tab) {
				if (!(!this.panelOpen || this.tab !== tab)) return;
				this.panelOpen = true;
				this.tab = tab;
				this.notify();
			}
			close() {
				if (!this.panelOpen) return;
				this.panelOpen = false;
				this.notify();
			}
			/** Toggle from an entry click: open on its tab, or close when already there. */
			toggle(tab) {
				if (this.panelOpen && this.tab === tab) this.close();
				else this.open(tab);
			}
			notify() {
				this.snapshot = {
					panelOpen: this.panelOpen,
					tab: this.tab
				};
				for (const fn of [...this.listeners]) fn();
			}
		};
		/** Official shell targets that navigate away from the extension center. */
		const SIDEBAR_SELECTOR = "[data-pane=\"sidebar\"], [class*=\"sidebarCol\"]";
		/**
		* Whether a click belongs to the official sidebar rather than one of this
		* plugin's injected rows. Closing before the shell handles that click lets
		* New Session and history rows reveal their real center-column route.
		*/
		function shouldCloseForSidebarTarget(target) {
			const element = target;
			if (typeof element?.closest !== "function") return false;
			return element.closest("[data-dsh-extension-entry]") == null && element.closest(SIDEBAR_SELECTOR) != null;
		}
		/** Inline icons (match the shell's 16px nav-icon look). */
		const ICONS = {
			skills: "<svg viewBox=\"0 0 16 16\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4.5 2.5h7a.5.5 0 0 1 .5.5v10.5L8 11l-4 2.5V3a.5.5 0 0 1 .5-.5z\"/></svg>",
			connectors: "<svg viewBox=\"0 0 16 16\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M5.5 2v3M10.5 2v3\"/><rect x=\"4\" y=\"5\" width=\"8\" height=\"4\" rx=\"1\"/><path d=\"M8 9v5\"/></svg>",
			learning: "<svg viewBox=\"0 0 16 16\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M2.5 3.5h3.2A2.3 2.3 0 0 1 8 5.8v7a2.3 2.3 0 0 0-2.3-2.3H2.5z\"/><path d=\"M13.5 3.5h-3.2A2.3 2.3 0 0 0 8 5.8v7a2.3 2.3 0 0 1 2.3-2.3h3.2z\"/></svg>"
		};
		/** One entry row per tab, with its locale keys. */
		const ENTRIES = [
			{
				tab: "skills",
				labelKey: "entry.skills.label",
				tooltipKey: "entry.skills.tooltip"
			},
			{
				tab: "connectors",
				labelKey: "entry.connectors.label",
				tooltipKey: "entry.connectors.tooltip"
			},
			{
				tab: "learning",
				labelKey: "entry.learning.label",
				tooltipKey: "entry.learning.tooltip"
			}
		];
		/** Find the sidebar shell root element, or undefined while not yet mounted. */
		function sidebarRoot() {
			const column = document.querySelector("[data-pane=\"sidebar\"], [class*=\"sidebarCol\"]");
			if (column === null) return void 0;
			return column.querySelector("[class*=\"logoRow\"]")?.parentElement ?? column.firstElementChild;
		}
		/** The New Session button: nested in the logo row on current shells, a direct child on legacy shells. */
		function newSessionButton(root) {
			const nested = root.querySelector("button[class*=\"newSession\"]");
			if (nested !== null) return nested;
			for (const child of root.children) if (child.tagName === "BUTTON") return child;
		}
		/** Build one entry row (a detached button; inserted once the shell is up). */
		function createEntry(tab, controller) {
			const entry = document.createElement("button");
			entry.type = "button";
			entry.dataset.dshExtensionEntry = tab;
			entry.className = panel_module_css_default.entry;
			const definition = ENTRIES.find((item) => item.tab === tab);
			const label = tt(definition.labelKey);
			entry.setAttribute("aria-label", label);
			entry.setAttribute("title", tt(definition.tooltipKey));
			entry.innerHTML = "<span class=\"" + panel_module_css_default.entryIcon + "\">" + ICONS[tab] + "</span><span class=\"" + panel_module_css_default.entryLabel + "\">" + label + "</span>";
			entry.addEventListener("click", () => {
				controller.toggle(tab);
			});
			return entry;
		}
		/** Re-insert the rows after the New Session row (before the browser region). */
		function placeEntries(root, entries) {
			const button = newSessionButton(root);
			if (button === void 0) return false;
			for (const entry of entries) if (entry.parentElement !== root) {
				const row = button.closest("[class*=\"logoRow\"]");
				if (row !== null && row.parentElement === root) root.insertBefore(entry, row.nextElementSibling);
				else if (button.parentElement === root) root.insertBefore(entry, button.nextElementSibling);
				else root.appendChild(entry);
			}
			return true;
		}
		/**
		* Mount both sidebar entries, waiting for the shell to render and
		* self-healing on later React re-renders.
		* @param controller - the panel controller the entries toggle.
		* @returns disposer removing the entries and their observers.
		*/
		function mountSidebarEntries(controller) {
			const entries = ENTRIES.map(({ tab }) => createEntry(tab, controller));
			const byTab = new Map(ENTRIES.map(({ tab }, index) => [tab, entries[index]]));
			let root;
			let placed = false;
			const tryPlace = () => {
				if (placed) return;
				if (root !== void 0 && !root.isConnected) {
					rootObserver.disconnect();
					root = void 0;
				}
				root ??= sidebarRoot();
				if (root === void 0) return;
				placed = placeEntries(root, entries);
				if (placed) rootObserver.observe(root, {
					childList: true,
					subtree: true
				});
			};
			const waitObserver = new MutationObserver(() => {
				tryPlace();
			});
			waitObserver.observe(document.body, {
				childList: true,
				subtree: true
			});
			const rootObserver = new MutationObserver(() => {
				if (root === void 0 || !root.isConnected) {
					placed = false;
					tryPlace();
					return;
				}
				const current = root;
				if (entries.some((entry) => !current.contains(entry))) placed = placeEntries(current, entries);
			});
			const applyEntryStates = () => {
				const current = controller.getSnapshot();
				for (const [tab, entry] of byTab) if (current.panelOpen && current.tab === tab) entry.setAttribute("data-active", "true");
				else entry.removeAttribute("data-active");
			};
			const unsubscribe = controller.subscribe(applyEntryStates);
			const onSidebarNavigation = (event) => {
				if (controller.getSnapshot().panelOpen && shouldCloseForSidebarTarget(event.target)) controller.close();
			};
			document.addEventListener("click", onSidebarNavigation, true);
			tryPlace();
			return () => {
				waitObserver.disconnect();
				rootObserver.disconnect();
				unsubscribe();
				document.removeEventListener("click", onSidebarNavigation, true);
				for (const entry of entries) entry.remove();
			};
		}
		//#endregion
		//#region src/client/index.ts
		/** Locale namespace this plugin owns. */
		const NS = "dsh-extension-center";
		/** Required services (fiber inject waiting — the runtime must be up first). */
		const inject = ["slots", "locale"];
		/**
		* Mount the extension center.
		* @param ctx - client root context (locale service).
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-extension-center: dictionaries");
			const controller = new PanelController();
			const disposers = [];
			try {
				disposers.push(mountSidebarEntries(controller));
				disposers.push(mountPanel(controller, getDesktopBridge()));
			} catch (error) {
				console.warn("[dsh-extension-center] mount failed:", error);
			}
			ctx.effect(() => () => {
				for (const dispose of disposers.splice(0)) dispose();
			}, "dsh-extension-center: ui mounts");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map