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
			"panel.title": "扩展中心",
			"tab.skills": "技能",
			"tab.connectors": "连接器",
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
			"connectors.empty": "尚未配置连接器。可先添加 MCP 服务或 HTTP API。",
			"connectors.create": "自定义连接器",
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
			"connectors.check": "检测",
			"connectors.remove": "移除",
			"connectors.unchecked": "尚未检测 · {endpoint}",
			"connectors.type.mcp": "MCP · {transport}",
			"connectors.type.http": "HTTP API"
		};
		const en = {
			"entry.skills.label": "Skills",
			"entry.skills.tooltip": "Skill catalog and Skill Studio",
			"entry.connectors.label": "Connectors",
			"entry.connectors.tooltip": "Connector Center (MCP / HTTP)",
			"panel.title": "Extension Center",
			"tab.skills": "Skills",
			"tab.connectors": "Connectors",
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
			"connectors.empty": "No connectors configured yet. Add an MCP server or an HTTP API first.",
			"connectors.create": "Custom connector",
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
			"connectors.check": "Check",
			"connectors.remove": "Remove",
			"connectors.unchecked": "Not checked · {endpoint}",
			"connectors.type.mcp": "MCP · {transport}",
			"connectors.type.http": "HTTP API"
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
		const css = "[data-pane=conversation]{position:relative}[data-dsh-extension-view]{z-index:5;display:none;position:absolute;inset:0}html[data-dsh-extension-active] [data-dsh-extension-view]{display:block}html[data-dsh-extension-active] [data-pane=conversation]>:not([data-dsh-extension-view]){display:none}.bid-pG_entry{width:100%;height:32px;color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap;background:0 0;border:none;border-radius:8px;align-items:center;gap:8px;padding:0 12px;font-size:13px;display:flex}.bid-pG_entry:hover{background:var(--dsw-specific-sidebar-nav-item-hover);color:var(--dsw-alias-label-primary)}.bid-pG_entry[data-active]{background:var(--dsw-specific-sidebar-nav-item-active);color:var(--dsw-alias-label-primary);font-weight:600}.bid-pG_entryIcon{flex:none;justify-content:center;align-items:center;display:inline-flex}.bid-pG_entryLabel{text-overflow:ellipsis;overflow:hidden}[data-dsh-frame][data-sidebar-collapsed] .bid-pG_entry{justify-content:center;width:100%;padding:0}[data-dsh-frame][data-sidebar-collapsed] .bid-pG_entryLabel{display:none}.bid-pG_view{overflow:hidden}.bid-pG_panel{background:var(--dsw-alias-bg-base);min-width:0;height:100%;min-height:0;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);flex-direction:column;gap:10px;padding:14px 16px 16px;display:flex}.bid-pG_panelHeader{flex:none;align-items:center;gap:10px;display:flex}.bid-pG_panelTitle{color:var(--dsw-alias-label-primary);white-space:nowrap;flex:1;margin:0;font-size:16px;font-weight:700}.bid-pG_headerActions{gap:8px;display:flex}.bid-pG_tabBar{border-bottom:1px solid var(--dsw-alias-border-l1);flex:none;gap:2px;display:flex}.bid-pG_tab{color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap;background:0 0;border:none;border-bottom:2px solid #0000;border-radius:6px 6px 0 0;padding:7px 14px;font-size:13px}.bid-pG_tab:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.bid-pG_tab[data-active]{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-state-business-primary);font-weight:600}.bid-pG_panelContent{flex-direction:column;flex:1;min-height:0;display:flex;overflow:hidden}.bid-pG_tabBody{flex-direction:column;flex:1;gap:10px;min-height:0;display:flex;overflow-y:auto}.bid-pG_toolbar{flex-wrap:wrap;flex:none;align-items:center;gap:8px;display:flex}.bid-pG_primaryButton,.bid-pG_secondaryButton,.bid-pG_dangerButton{cursor:pointer;white-space:nowrap;border-radius:7px;padding:5px 12px;font-size:13px}.bid-pG_primaryButton{border:1px solid var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-bg-base);font-weight:600}.bid-pG_primaryButton:hover:not(:disabled){filter:brightness(1.1)}.bid-pG_secondaryButton{border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);background:0 0}.bid-pG_secondaryButton:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.bid-pG_dangerButton{border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);background:0 0}.bid-pG_dangerButton:hover:not(:disabled){color:var(--dsw-alias-state-danger-primary,#f66);border-color:var(--dsw-alias-state-danger-primary,#f66)}.bid-pG_primaryButton:disabled,.bid-pG_secondaryButton:disabled,.bid-pG_dangerButton:disabled{opacity:.5;cursor:default}.bid-pG_studioForm{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-elevated,var(--dsw-alias-bg-base));border-radius:10px;flex-direction:column;gap:10px;padding:12px;display:flex}.bid-pG_studioSummary{color:var(--dsw-alias-label-secondary);margin:0;font-size:13px;font-weight:600}.bid-pG_studioForm label{color:var(--dsw-alias-label-secondary);flex-direction:column;gap:4px;font-size:12px;display:flex}.bid-pG_studioForm input,.bid-pG_studioForm textarea,.bid-pG_studioForm select{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-field,var(--dsw-alias-bg-base));border:1px solid var(--dsw-alias-border-l1);border-radius:7px;padding:6px 8px;font-family:inherit;font-size:13px}.bid-pG_studioForm input:focus,.bid-pG_studioForm textarea:focus,.bid-pG_studioForm select:focus{outline:1px solid var(--dsw-alias-state-business-primary)}.bid-pG_formGrid,.bid-pG_formGridThree{gap:10px;display:grid}.bid-pG_formGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.bid-pG_formGridThree{grid-template-columns:repeat(3,minmax(0,1fr))}.bid-pG_formFooter{justify-content:space-between;align-items:center;gap:10px;display:flex}.bid-pG_formFooter span{color:var(--dsw-alias-label-secondary);font-size:12px}.bid-pG_formFooter button{border:1px solid var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-bg-base);cursor:pointer;white-space:nowrap;border-radius:7px;padding:6px 14px;font-size:13px;font-weight:600}.bid-pG_formFooter button:disabled{opacity:.5;cursor:default}.bid-pG_list{flex-direction:column;gap:8px;display:flex}.bid-pG_item{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-elevated,var(--dsw-alias-bg-base));border-radius:10px;justify-content:space-between;align-items:flex-start;gap:12px;padding:10px 12px;display:flex}.bid-pG_itemBody{flex-direction:column;gap:4px;min-width:0;display:flex}.bid-pG_nameRow{align-items:center;gap:8px;min-width:0;display:flex}.bid-pG_name{color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:600;overflow:hidden}.bid-pG_badge{border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);white-space:nowrap;border-radius:999px;flex:none;padding:1px 8px;font-size:11px}.bid-pG_description,.bid-pG_health{color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere;margin:0;font-size:12px}.bid-pG_health[data-error]{color:var(--dsw-alias-state-danger-primary,#f66)}.bid-pG_itemActions{flex:none;gap:8px;display:flex}.bid-pG_notice{text-align:center;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-elevated,var(--dsw-alias-bg-base));border-radius:12px;max-width:460px;margin:auto;padding:18px}.bid-pG_notice h3{color:var(--dsw-alias-label-primary);margin:0 0 8px;font-size:14px}.bid-pG_notice p{color:var(--dsw-alias-label-secondary);margin:0;font-size:13px;line-height:1.6}.bid-pG_empty{text-align:center;color:var(--dsw-alias-label-secondary);margin:0;padding:18px;font-size:13px}.bid-pG_toast{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-elevated,var(--dsw-alias-bg-base));color:var(--dsw-alias-label-primary);overflow-wrap:anywhere;border-radius:8px;flex:none;padding:8px 12px;font-size:13px}.bid-pG_toast[data-error]{color:var(--dsw-alias-state-danger-primary,#f66);border-color:var(--dsw-alias-state-danger-primary,#f66)}";
		const tagId = "@linxin666/dsh-client-ui-extension-center/panel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@linxin666/dsh-client-ui-extension-center";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var panel_module_css_default = {
			"badge": "bid-pG_badge",
			"dangerButton": "bid-pG_dangerButton",
			"description": "bid-pG_description",
			"empty": "bid-pG_empty",
			"entry": "bid-pG_entry",
			"entryIcon": "bid-pG_entryIcon",
			"entryLabel": "bid-pG_entryLabel",
			"formFooter": "bid-pG_formFooter",
			"formGrid": "bid-pG_formGrid",
			"formGridThree": "bid-pG_formGridThree",
			"headerActions": "bid-pG_headerActions",
			"health": "bid-pG_health",
			"item": "bid-pG_item",
			"itemActions": "bid-pG_itemActions",
			"itemBody": "bid-pG_itemBody",
			"list": "bid-pG_list",
			"name": "bid-pG_name",
			"nameRow": "bid-pG_nameRow",
			"notice": "bid-pG_notice",
			"panel": "bid-pG_panel",
			"panelContent": "bid-pG_panelContent",
			"panelHeader": "bid-pG_panelHeader",
			"panelTitle": "bid-pG_panelTitle",
			"primaryButton": "bid-pG_primaryButton",
			"secondaryButton": "bid-pG_secondaryButton",
			"studioForm": "bid-pG_studioForm",
			"studioSummary": "bid-pG_studioSummary",
			"tab": "bid-pG_tab",
			"tabBar": "bid-pG_tabBar",
			"tabBody": "bid-pG_tabBody",
			"toast": "bid-pG_toast",
			"toolbar": "bid-pG_toolbar",
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
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.nameRow,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.name,
										children: skill.name
									}), skill.shadowed === true && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.badge,
										children: tt("skills.badge.shadowed")
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: panel_module_css_default.description,
									children: skill.description
								})]
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
		//#region src/client/panel/ConnectorsTab.tsx
		/**
		* The Connectors tab: the connector registry list, the custom-connector form
		* (kind/transport dependent fields), health checks, and removal. Ports the
		* dock's connector surface; validation is host-side and surfaces via toasts.
		*/
		/** The Connectors tab component. */
		function ConnectorsTab({ bridge, refreshKey, notify }) {
			const [connectors, setConnectors] = (0, react.useState)(null);
			const [health, setHealth] = (0, react.useState)({});
			const [formOpen, setFormOpen] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [kind, setKind] = (0, react.useState)("mcp");
			const [transport, setTransport] = (0, react.useState)("stdio");
			const mcp = kind === "mcp";
			const remote = !mcp || transport !== "stdio";
			const load = (0, react.useCallback)(async () => {
				try {
					setConnectors(await bridge.listConnectors());
				} catch (error) {
					notify(errorMessage(error), true);
				}
			}, [bridge, notify]);
			(0, react.useEffect)(() => {
				load();
			}, [load, refreshKey]);
			const onSave = async (event) => {
				event.preventDefault();
				const form = event.currentTarget;
				const values = Object.fromEntries(new FormData(form));
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
					form.reset();
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
					setBusy(false);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.tabBody,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.toolbar,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.primaryButton,
							disabled: busy,
							onClick: () => {
								setFormOpen((open) => !open);
							},
							children: tt("connectors.create")
						})
					}),
					formOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
						className: panel_module_css_default.studioForm,
						onSubmit: (event) => {
							onSave(event);
						},
						children: [
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
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
								className: panel_module_css_default.item,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.itemBody,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.nameRow,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.name,
												children: connector.name
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.badge,
												children: connector.kind === "mcp" ? tt("connectors.type.mcp", { transport: connector.transport }) : tt("connectors.type.http")
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: panel_module_css_default.description,
											children: connector.description || endpoint
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: panel_module_css_default.health,
											"data-error": checked !== void 0 && !checked.ok ? "true" : void 0,
											children: checked !== void 0 ? checked.detail : tt("connectors.unchecked", { endpoint })
										})
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.itemActions,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: panel_module_css_default.secondaryButton,
										disabled: busy,
										onClick: () => {
											onCheck(connector.id);
										},
										children: tt("connectors.check")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: panel_module_css_default.dangerButton,
										disabled: busy,
										onClick: () => {
											onRemove(connector.id);
										},
										children: tt("connectors.remove")
									})]
								})]
							}, connector.id);
						})
					})
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
						children: [{
							id: "skills",
							label: () => tt("tab.skills")
						}, {
							id: "connectors",
							label: () => tt("tab.connectors")
						}].map((tab) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
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
						children: bridge === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
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
						role: "status",
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
			getSnapshot() {
				return this.snapshot;
			}
			subscribe(fn) {
				this.listeners.add(fn);
				return () => {
					this.listeners.delete(fn);
				};
			}
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
		//#endregion
		//#region src/client/sidebar-entry.ts
		/** Inline icons (match the shell's 16px nav-icon look). */
		const ICONS = {
			skills: "<svg viewBox=\"0 0 16 16\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4.5 2.5h7a.5.5 0 0 1 .5.5v10.5L8 11l-4 2.5V3a.5.5 0 0 1 .5-.5z\"/></svg>",
			connectors: "<svg viewBox=\"0 0 16 16\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M5.5 2v3M10.5 2v3\"/><rect x=\"4\" y=\"5\" width=\"8\" height=\"4\" rx=\"1\"/><path d=\"M8 9v5\"/></svg>"
		};
		/** One entry row per tab, with its locale keys. */
		const ENTRIES = [{
			tab: "skills",
			labelKey: "entry.skills.label",
			tooltipKey: "entry.skills.tooltip"
		}, {
			tab: "connectors",
			labelKey: "entry.connectors.label",
			tooltipKey: "entry.connectors.tooltip"
		}];
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
			const label = tt(tab === "skills" ? "entry.skills.label" : "entry.connectors.label");
			entry.setAttribute("aria-label", label);
			entry.setAttribute("title", tt(tab === "skills" ? "entry.skills.tooltip" : "entry.connectors.tooltip"));
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
			tryPlace();
			return () => {
				waitObserver.disconnect();
				rootObserver.disconnect();
				unsubscribe();
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