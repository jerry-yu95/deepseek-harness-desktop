window.__ModuleLoader__.load({
	id: "@harness-design/dsh-orchestrator",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/wire.ts
		const HARNESS_RPC_CHANNEL = "/harness-orchestrator";
		//#endregion
		//#region src/client/api.ts
		var HarnessClientApi = class {
			connection;
			constructor(connection) {
				this.connection = connection;
			}
			status(sessionId, signal, period = "7d") {
				return this.call("status", {
					sessionId,
					period
				}, signal);
			}
			async mode(sessionId, mode, objective) {
				return (await this.call("mode", {
					sessionId,
					mode,
					...objective === void 0 ? {} : { objective }
				})).status;
			}
			async probe(sessionId, bypassCache = false) {
				return this.call("probe", {
					sessionId,
					bypassCache
				});
			}
			async feedback(sessionId, verdict) {
				return (await this.call("feedback", {
					sessionId,
					verdict
				})).status;
			}
			async call(endpoint, payload, signal) {
				const result = await this.connection.rpc.call(HARNESS_RPC_CHANNEL, endpoint, payload, signal);
				if (!result.ok) throw new Error(result.error.message);
				const value = result.value;
				if (typeof value === "object" && value !== null && "error" in value) throw new Error(String(value.error));
				return value;
			}
		};
		//#endregion
		//#region src/client/health-ui.ts
		function healthTone(status) {
			if (status === "healthy") return "good";
			if (status === "degraded") return "bad";
			if (status === "volatile") return "warn";
			return "muted";
		}
		function healthLabel(status) {
			return {
				healthy: "健康",
				volatile: "波动",
				degraded: "疑似降智",
				"insufficient-data": "采样中"
			}[status];
		}
		function dimensionLabel(dimension) {
			return {
				instruction: "指令遵循",
				context: "上下文保持",
				reasoning: "推理稳定",
				structuredOutput: "结构化输出",
				toolPlanning: "工具规划",
				completeness: "回答完整度"
			}[dimension];
		}
		function cacheRate(summary) {
			const cache = summary.harness?.run.orchestration;
			if (cache === void 0) return void 0;
			const total = cache.cacheHits + cache.cacheMisses;
			return total === 0 ? void 0 : Math.round(cache.cacheHits / total * 100);
		}
		function sparklinePoints(trend, width = 240, height = 54) {
			if (trend.length === 0) return "";
			if (trend.length === 1) return `${width / 2},${height - trend[0].score / 100 * height}`;
			return trend.map((item, index) => `${index / (trend.length - 1) * width},${height - item.score / 100 * height}`).join(" ");
		}
		//#endregion
		//#region src/client/useHarnessStatus.ts
		function useHarnessStatus(api, sessionId) {
			const [status, setStatus] = (0, react.useState)();
			const [loading, setLoading] = (0, react.useState)(true);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)();
			const [period, setPeriod] = (0, react.useState)("7d");
			const request = (0, react.useRef)(0);
			const refresh = (0, react.useCallback)(async () => {
				const seq = ++request.current;
				const controller = new AbortController();
				try {
					const value = await api.status(sessionId, controller.signal, period);
					if (request.current === seq) {
						setStatus(value);
						setError(void 0);
					}
				} catch (cause) {
					if (request.current === seq) setError(messageOf(cause));
				} finally {
					if (request.current === seq) setLoading(false);
				}
			}, [
				api,
				period,
				sessionId
			]);
			(0, react.useEffect)(() => {
				setLoading(true);
				setStatus(void 0);
				refresh();
				const timer = window.setInterval(() => {
					refresh();
				}, 3e4);
				const onFocus = () => {
					refresh();
				};
				window.addEventListener("focus", onFocus);
				return () => {
					request.current += 1;
					window.clearInterval(timer);
					window.removeEventListener("focus", onFocus);
				};
			}, [refresh]);
			const action = (0, react.useCallback)(async (operation) => {
				setBusy(true);
				try {
					setStatus(await operation());
					setError(void 0);
				} catch (cause) {
					setError(messageOf(cause));
				} finally {
					setBusy(false);
				}
			}, []);
			return {
				status,
				loading,
				busy,
				period,
				...error === void 0 ? {} : { error },
				refresh,
				setPeriod,
				setMode: (mode, objective) => action(() => api.mode(sessionId, mode, objective)),
				probe: (bypassCache) => action(async () => {
					await api.probe(sessionId, bypassCache);
					return api.status(sessionId);
				}),
				feedback: (verdict) => action(() => api.feedback(sessionId, verdict))
			};
		}
		function messageOf(value) {
			return value instanceof Error ? value.message : String(value);
		}
		//#endregion
		//#region \0dsh-css:<repository-root>/packages/dsh-orchestrator/src/client/harness.module.css.mjs
		const css = ".bcJosq_controls{align-items:center;gap:6px;display:flex;position:relative}.bcJosq_toolbarControl{color:inherit;font:inherit;cursor:pointer;white-space:nowrap;background:0 0;border:0;border-radius:6px;align-items:center;gap:5px;padding:5px 3px;font-size:12px;display:inline-flex}.bcJosq_toolbarControl:hover,.bcJosq_toolbarControl[aria-expanded=true]{color:#3374e8}.bcJosq_toolbarControl:focus-visible{outline-offset:2px;outline:2px solid #3374e8b3}.bcJosq_toolbarControl:disabled{opacity:.55;cursor:wait}.bcJosq_lineIcon{fill:none;stroke:currentColor;stroke-width:1.5px;stroke-linecap:round;stroke-linejoin:round;flex:none;width:16px;height:16px}.bcJosq_chevronIcon{fill:none;stroke:currentColor;stroke-width:1.6px;stroke-linecap:round;stroke-linejoin:round;opacity:.58;width:13px;height:13px}.bcJosq_modeMenu{z-index:32;border:1px solid color-mix(in srgb, currentColor 16%, transparent);background:var(--color-bg,#fff);width:min(390px,82vw);color:var(--color-text,#18202a);border-radius:16px;gap:3px;padding:8px;display:grid;position:absolute;bottom:calc(100% + 10px);left:0;box-shadow:0 18px 50px #0003}.bcJosq_modeMenu>button{width:100%;color:inherit;cursor:pointer;text-align:left;font:inherit;background:0 0;border:0;border-radius:11px;grid-template-columns:1fr 24px;gap:10px;padding:11px 12px;display:grid}.bcJosq_modeMenu>button:hover,.bcJosq_modeMenu>button[aria-checked=true]{background:#3374e81a}.bcJosq_modeMenu>button span{gap:4px;display:grid}.bcJosq_modeMenu b{font-size:14px}.bcJosq_modeMenu small{opacity:.62;font-size:12px;line-height:1.45}.bcJosq_modeMenu i{color:#3374e8;text-align:center;align-self:center;font-size:18px;font-style:normal}.bcJosq_good{color:#16865b}.bcJosq_warn{color:#b06c00}.bcJosq_bad{color:#cf3439}.bcJosq_muted{color:inherit}.bcJosq_popover{z-index:30;border:1px solid color-mix(in srgb, currentColor 16%, transparent);background:var(--color-bg,#fff);width:min(430px,78vw);color:var(--color-text,#18202a);border-radius:16px;padding:14px;position:absolute;bottom:calc(100% + 10px);left:0;box-shadow:0 18px 50px #0003}.bcJosq_settingsCard{border:1px solid color-mix(in srgb, currentColor 14%, transparent);background:color-mix(in srgb, currentColor 2%, transparent);border-radius:16px;margin:8px 0;padding:22px}.bcJosq_settingsCard header{justify-content:space-between;align-items:center;margin-bottom:18px;display:flex}.bcJosq_settingsCard h3{margin:0 0 4px;font-size:18px}.bcJosq_settingsCard header p{opacity:.62;margin:0}.bcJosq_dashboard{gap:18px;display:grid}.bcJosq_compact{gap:12px}.bcJosq_summary{grid-template-columns:auto 1fr auto;align-items:center;gap:14px;display:grid}.bcJosq_score{text-align:center;background:color-mix(in srgb, currentColor 8%, transparent);border-radius:18px;place-content:center;width:66px;height:66px;display:grid}.bcJosq_score strong{font-size:24px;line-height:1}.bcJosq_score span{margin-top:5px;font-size:11px}.bcJosq_score.bcJosq_good{color:#16865b}.bcJosq_score.bcJosq_warn{color:#b06c00}.bcJosq_score.bcJosq_bad{color:#cf3439}.bcJosq_score.bcJosq_muted{color:#6f7782}.bcJosq_meta{gap:5px;min-width:0;display:grid}.bcJosq_meta b{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.bcJosq_meta span{opacity:.64;font-size:12px}.bcJosq_primary,.bcJosq_orchestration button,.bcJosq_feedback button,.bcJosq_error button{color:#fff;cursor:pointer;font:inherit;background:#3374e8;border:0;border-radius:9px;padding:8px 12px}.bcJosq_diagnosticAction{color:inherit;cursor:pointer;font:inherit;white-space:nowrap;background:0 0;border:0;align-items:center;gap:6px;padding:6px 3px;display:inline-flex}.bcJosq_diagnosticAction:hover{color:#3374e8}.bcJosq_diagnosticAction:focus-visible{outline-offset:2px;border-radius:6px;outline:2px solid #3374e8b3}.bcJosq_primary:disabled,.bcJosq_diagnosticAction:disabled,.bcJosq_orchestration button:disabled,.bcJosq_feedback button:disabled{opacity:.55;cursor:wait}.bcJosq_alert{color:#c52d33;background:#e5484d21;border-radius:10px;padding:10px 12px;font-size:13px}.bcJosq_orchestration{background:color-mix(in srgb, currentColor 5%, transparent);border-radius:10px;flex-wrap:wrap;align-items:center;gap:14px;padding:11px 12px;font-size:13px;display:flex}.bcJosq_orchestration button{background:color-mix(in srgb, currentColor 12%, transparent);color:inherit;margin-left:auto}.bcJosq_dimensions{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 18px;display:grid}.bcJosq_dimension{grid-template-columns:88px 1fr 28px;align-items:center;gap:8px;font-size:12px;display:grid}.bcJosq_dimension>div{background:color-mix(in srgb, currentColor 9%, transparent);border-radius:999px;height:7px;overflow:hidden}.bcJosq_dimension i{border-radius:inherit;background:linear-gradient(90deg,#587cf6,#22a06b);height:100%;display:block}.bcJosq_trend h4,.bcJosq_anomalies h4{margin:0 0 8px}.bcJosq_trend p{opacity:.58;margin:0;font-size:13px}.bcJosq_trend svg{width:100%;height:64px;overflow:visible}.bcJosq_trend polyline{fill:none;stroke:#5c8dff;stroke-width:2.5px;vector-effect:non-scaling-stroke}.bcJosq_feedback{flex-wrap:wrap;align-items:center;gap:8px;font-size:13px;display:flex}.bcJosq_feedback button{background:color-mix(in srgb, currentColor 10%, transparent);color:inherit;padding:6px 10px}.bcJosq_feedback small{opacity:.58;margin-left:auto}.bcJosq_anomalies{border-top:1px solid color-mix(in srgb, currentColor 10%, transparent);padding-top:12px}.bcJosq_anomalies p{color:#c52d33;margin:6px 0;font-size:12px}.bcJosq_empty,.bcJosq_error{background:color-mix(in srgb, currentColor 5%, transparent);opacity:.75;border-radius:12px;padding:20px}.bcJosq_inlineError{color:#c52d33;font-size:12px}@media (width<=720px){.bcJosq_dimensions{grid-template-columns:1fr}.bcJosq_summary{grid-template-columns:auto 1fr}.bcJosq_summary .bcJosq_diagnosticAction{grid-column:1/-1}.bcJosq_settingsCard{padding:14px}}.bcJosq_tabs{background:color-mix(in srgb, currentColor 6%, transparent);border-radius:12px;gap:6px;padding:4px;display:flex;overflow-x:auto}.bcJosq_tabs button,.bcJosq_periods button{color:inherit;cursor:pointer;white-space:nowrap;background:0 0;border:0;border-radius:9px;padding:8px 12px}.bcJosq_tabs .bcJosq_activeTab,.bcJosq_periods .bcJosq_activePeriod{color:#3374e8;background:#3374e82e;font-weight:650}.bcJosq_panel{gap:14px;display:grid}.bcJosq_metricGrid{grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;display:grid}.bcJosq_metric{background:color-mix(in srgb, currentColor 5%, transparent);border-radius:12px;gap:7px;padding:14px;display:grid}.bcJosq_metric span{opacity:.62;font-size:12px}.bcJosq_metric strong{font-variant-numeric:tabular-nums;font-size:22px}.bcJosq_periods{flex-wrap:wrap;gap:5px;display:flex}.bcJosq_cacheBenefit,.bcJosq_estimateNote{background:#3374e817;border-radius:10px;padding:10px 12px;font-size:13px}.bcJosq_traceList,.bcJosq_modelList{gap:8px;display:grid}.bcJosq_traceRow,.bcJosq_modelRow{border:1px solid color-mix(in srgb, currentColor 10%, transparent);border-radius:10px;grid-template-columns:minmax(100px,1fr) auto auto;align-items:center;gap:10px;padding:12px;display:grid}.bcJosq_traceRow small,.bcJosq_modelRow small{opacity:.62;grid-column:1/-1}.bcJosq_modelRow{grid-template-columns:minmax(0,1fr) auto}@media (width<=720px){.bcJosq_metricGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.bcJosq_traceRow{grid-template-columns:1fr auto}.bcJosq_traceRow>span:nth-of-type(2){display:none}}";
		const tagId = "@harness-design/dsh-orchestrator/harness.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@harness-design/dsh-orchestrator";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var harness_module_css_default = {
			"activePeriod": "bcJosq_activePeriod",
			"activeTab": "bcJosq_activeTab",
			"alert": "bcJosq_alert",
			"anomalies": "bcJosq_anomalies",
			"bad": "bcJosq_bad",
			"cacheBenefit": "bcJosq_cacheBenefit",
			"chevronIcon": "bcJosq_chevronIcon",
			"compact": "bcJosq_compact",
			"controls": "bcJosq_controls",
			"dashboard": "bcJosq_dashboard",
			"diagnosticAction": "bcJosq_diagnosticAction",
			"dimension": "bcJosq_dimension",
			"dimensions": "bcJosq_dimensions",
			"empty": "bcJosq_empty",
			"error": "bcJosq_error",
			"estimateNote": "bcJosq_estimateNote",
			"feedback": "bcJosq_feedback",
			"good": "bcJosq_good",
			"inlineError": "bcJosq_inlineError",
			"lineIcon": "bcJosq_lineIcon",
			"meta": "bcJosq_meta",
			"metric": "bcJosq_metric",
			"metricGrid": "bcJosq_metricGrid",
			"modeMenu": "bcJosq_modeMenu",
			"modelList": "bcJosq_modelList",
			"modelRow": "bcJosq_modelRow",
			"muted": "bcJosq_muted",
			"orchestration": "bcJosq_orchestration",
			"panel": "bcJosq_panel",
			"periods": "bcJosq_periods",
			"popover": "bcJosq_popover",
			"primary": "bcJosq_primary",
			"score": "bcJosq_score",
			"settingsCard": "bcJosq_settingsCard",
			"summary": "bcJosq_summary",
			"tabs": "bcJosq_tabs",
			"toolbarControl": "bcJosq_toolbarControl",
			"traceList": "bcJosq_traceList",
			"traceRow": "bcJosq_traceRow",
			"trend": "bcJosq_trend",
			"warn": "bcJosq_warn"
		};
		//#endregion
		//#region src/client/HarnessHealthPanel.tsx
		const modeOptions = [
			{
				mode: "standard",
				label: "标准编排",
				description: "保持官方对话路径，不额外启动规划或复核角色。"
			},
			{
				mode: "adaptive",
				label: "自适应编排",
				description: "自动判断任务复杂度，选择最小够用的编排策略。"
			},
			{
				mode: "enhanced",
				label: "增强编排",
				description: "显式启用 Planner、Reviewer 与 Evaluator 协作。"
			}
		];
		function HarnessComposerControls(props) {
			const state = useHarnessStatus(props.api, props.sessionId);
			const [healthOpen, setHealthOpen] = (0, react.useState)(false);
			const [modeOpen, setModeOpen] = (0, react.useState)(false);
			const mode = state.status?.harness?.run.orchestration.mode ?? "standard";
			const title = props.useSessions((snapshot) => snapshot.byId[props.sessionId]?.displayTitle);
			const health = state.status?.health;
			const tone = health === void 0 ? "muted" : healthTone(health.status);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: harness_module_css_default.controls,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						className: harness_module_css_default.toolbarControl,
						disabled: state.busy,
						onClick: () => {
							setModeOpen((value) => !value);
							setHealthOpen(false);
						},
						"aria-expanded": modeOpen,
						"aria-haspopup": "menu",
						title: "选择编排模式",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(OrchestrationIcon, {}),
							modeLabel(mode),
							"编排 ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChevronIcon, {})
						]
					}),
					modeOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: harness_module_css_default.modeMenu,
						role: "menu",
						"aria-label": "选择编排模式",
						children: modeOptions.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							role: "menuitemradio",
							"aria-checked": mode === option.mode,
							onClick: () => {
								setModeOpen(false);
								state.setMode(option.mode, title);
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: option.label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: option.description })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { children: mode === option.mode ? "✓" : "" })]
						}, option.mode))
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						className: `${harness_module_css_default.toolbarControl} ${harness_module_css_default[tone]}`,
						onClick: () => {
							setHealthOpen((value) => !value);
							setModeOpen(false);
						},
						"aria-expanded": healthOpen,
						"aria-haspopup": "dialog",
						title: "查看模型健康度",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(HealthIcon, {}),
							"模型",
							health === void 0 ? "检测中" : healthLabel(health.status),
							" ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChevronIcon, {})
						]
					}),
					healthOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: harness_module_css_default.popover,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(HealthDashboard, {
							state,
							compact: true
						})
					}) : null
				]
			});
		}
		function HarnessSettingsCard(props) {
			const sessionId = props.useSessions((snapshot) => snapshot.current);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: harness_module_css_default.settingsCard,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("header", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "Agent Harness" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "增强编排、缓存命中与模型健康度" })] }) }), sessionId === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: harness_module_css_default.empty,
					children: "请先打开一个会话，再查看当前模型与项目状态。"
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsDashboard, {
					api: props.api,
					sessionId
				})]
			});
		}
		function SettingsDashboard({ api, sessionId }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(HealthDashboard, { state: useHarnessStatus(api, sessionId) });
		}
		function HealthDashboard({ state, compact = false }) {
			const [tab, setTab] = (0, react.useState)("overview");
			if (state.loading && state.status === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: harness_module_css_default.empty,
				children: "正在读取健康数据…"
			});
			if (state.status === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: harness_module_css_default.error,
				children: [
					"暂时无法读取：",
					state.error ?? "未知错误",
					" ",
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						onClick: () => {
							state.refresh();
						},
						children: "重试"
					})
				]
			});
			const { health, harness, modelKey } = state.status;
			const tone = healthTone(health.status);
			const mode = harness?.run.orchestration.mode ?? "standard";
			const hitRate = cacheRate(state.status);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: `${harness_module_css_default.dashboard} ${compact ? harness_module_css_default.compact : ""}`,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: harness_module_css_default.summary,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: `${harness_module_css_default.score} ${harness_module_css_default[tone]}`,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: health.sampleCount === 0 ? "—" : health.score }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: healthLabel(health.status) })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: harness_module_css_default.meta,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: modelKey }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
									"样本 ",
									health.sampleCount,
									" · 基线 ",
									health.baselineScore ?? "待建立",
									" · 变化 ",
									health.delta === void 0 ? "—" : `${health.delta > 0 ? "+" : ""}${health.delta}`
								] })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								className: harness_module_css_default.diagnosticAction,
								disabled: state.busy,
								onClick: () => {
									state.probe(true);
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(HealthIcon, {}), state.busy ? "检测中…" : "立即检测"]
							})
						]
					}),
					health.status === "degraded" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: harness_module_css_default.alert,
						children: "检测到持续质量下降；仅提醒，不会自动切换模型。建议重试任务或运行一次健康检测。"
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: harness_module_css_default.orchestration,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["编排：", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: modeLabel(mode) })] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["阶段：", harness?.run.orchestration.stage ?? "未初始化"] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["缓存：", hitRate === void 0 ? "暂无命中" : `${hitRate}% 命中`] }),
							[
								"standard",
								"adaptive",
								"enhanced"
							].map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: mode === item ? harness_module_css_default.activePeriod : "",
								disabled: state.busy,
								onClick: () => {
									state.setMode(item);
								},
								children: modeLabel(item)
							}, item))
						]
					}),
					mode === "adaptive" && harness?.run.orchestration.latestDecision !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: harness_module_css_default.cacheBenefit,
						children: [
							"策略 ",
							harness.run.orchestration.latestDecision.strategy,
							" · 置信度 ",
							Math.round(harness.run.orchestration.latestDecision.confidence * 100),
							"% · 最多 ",
							harness.run.orchestration.latestDecision.budget.maxAgents,
							" Agent / ",
							formatNumber(harness.run.orchestration.latestDecision.budget.maxTotalTokens),
							" Token"
						]
					}) : null,
					!compact ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: harness_module_css_default.tabs,
						role: "tablist",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: tab === "overview" ? harness_module_css_default.activeTab : "",
								onClick: () => {
									setTab("overview");
								},
								children: "总览"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: tab === "health" ? harness_module_css_default.activeTab : "",
								onClick: () => {
									setTab("health");
								},
								children: "模型健康"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: tab === "trace" ? harness_module_css_default.activeTab : "",
								onClick: () => {
									setTab("trace");
								},
								children: "Agent 轨迹"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: tab === "tokens" ? harness_module_css_default.activeTab : "",
								onClick: () => {
									setTab("tokens");
								},
								children: "Token 消耗"
							})
						]
					}) : null,
					!compact && tab === "overview" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Overview, { state }) : null,
					!compact && tab === "health" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: harness_module_css_default.dimensions,
							children: Object.entries(health.dimensions).map(([key, value]) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: harness_module_css_default.dimension,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: dimensionLabel(key) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { style: { width: `${value.score ?? 0}%` } }) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: value.score ?? "—" })
								]
							}, key))
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: harness_module_css_default.trend,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: "近期趋势" }), health.trend.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "暂无数据，点击“立即检测”建立首批样本。" }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
								viewBox: "0 0 240 54",
								role: "img",
								"aria-label": "模型健康度趋势",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("polyline", { points: sparklinePoints(health.trend) })
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: harness_module_css_default.feedback,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "这次模型表现符合预期吗？" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									disabled: state.busy,
									onClick: () => {
										state.feedback("normal");
									},
									children: "正常"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									disabled: state.busy,
									onClick: () => {
										state.feedback("degraded");
									},
									children: "疑似降智"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [
									"正常 ",
									health.feedback.normal,
									" · 降智 ",
									health.feedback.degraded
								] })
							]
						}),
						health.anomalies.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: harness_module_css_default.anomalies,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: "近期异常" }), health.anomalies.slice(0, 5).map((item, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: dimensionLabel(item.dimension) }),
								" ",
								item.summary
							] }, `${item.timestamp}-${index}`))]
						}) : null
					] }) : null,
					!compact && tab === "trace" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TraceDashboard, { state }) : null,
					!compact && tab === "tokens" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TokenDashboard, { state }) : null,
					state.error !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: harness_module_css_default.inlineError,
						children: state.error
					}) : null
				]
			});
		}
		function Overview({ state }) {
			const data = state.status.observability;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: harness_module_css_default.metricGrid,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
						label: "总 Token",
						value: formatNumber(data.tokens.totalTokens)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
						label: "模型数量",
						value: String(data.models.length)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
						label: "缓存命中",
						value: data.cache.hitRate === void 0 ? "—" : `${data.cache.hitRate}%`
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
						label: "节省 Token",
						value: formatNumber(data.cache.savedTokens)
					})
				]
			});
		}
		function TraceDashboard({ state }) {
			const data = state.status.observability;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: harness_module_css_default.panel,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: harness_module_css_default.cacheBenefit,
					children: [
						"缓存 ",
						data.cache.hits,
						" 次命中 / ",
						data.cache.misses,
						" 次未命中 · 节省 ",
						formatNumber(data.cache.savedTokens),
						" Token · ",
						formatDuration(data.cache.savedMs)
					]
				}), data.traces.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: harness_module_css_default.empty,
					children: "暂无增强编排轨迹。"
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: harness_module_css_default.traceList,
					children: data.traces.map((trace, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: harness_module_css_default.traceRow,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: trace.stage }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: trace.status }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: formatDuration(trace.durationMs ?? 0) }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: trace.summary ?? trace.runId })
						]
					}, `${trace.runId}-${trace.stage}-${index}`))
				})]
			});
		}
		const periods = [
			["today", "今天"],
			["7d", "最近 7 天"],
			["30d", "最近 30 天"],
			["month", "本月"],
			["all", "全部"]
		];
		function TokenDashboard({ state }) {
			const data = state.status.observability;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: harness_module_css_default.panel,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: harness_module_css_default.periods,
						children: periods.map(([period, label]) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: state.period === period ? harness_module_css_default.activePeriod : "",
							onClick: () => {
								state.setPeriod(period);
							},
							children: label
						}, period))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: harness_module_css_default.metricGrid,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: "全部模型总计",
								value: formatNumber(data.tokens.totalTokens)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: "输入",
								value: formatNumber(data.tokens.uncachedInputTokens)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: "输出",
								value: formatNumber(data.tokens.outputTokens)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: "缓存读取",
								value: formatNumber(data.tokens.cacheReadTokens)
							})
						]
					}),
					data.estimatedEvents > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: harness_module_css_default.estimateNote,
						children: [
							"其中 ",
							data.estimatedEvents,
							" 条记录由本地估算；提供商精确 usage 会自动覆盖估算。"
						]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: harness_module_css_default.modelList,
						children: data.models.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: harness_module_css_default.empty,
							children: "当前周期暂无 Token 记录。"
						}) : data.models.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: harness_module_css_default.modelRow,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: model.modelKey }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [formatNumber(model.totalTokens), " Token"] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [
									model.calls,
									" 次采样 · 输入 ",
									formatNumber(model.uncachedInputTokens),
									" · 输出 ",
									formatNumber(model.outputTokens),
									" · 缓存 ",
									formatNumber(model.cacheReadTokens)
								] })
							]
						}, model.modelKey))
					})
				]
			});
		}
		function Metric({ label, value }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: harness_module_css_default.metric,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: value })]
			});
		}
		function formatNumber(value) {
			return new Intl.NumberFormat("zh-CN").format(value);
		}
		function formatDuration(value) {
			return value < 1e3 ? `${value}ms` : `${Math.round(value / 100) / 10}s`;
		}
		function modeLabel(mode) {
			return mode === "enhanced" ? "增强" : mode === "adaptive" ? "自适应" : "标准";
		}
		function OrchestrationIcon() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				className: harness_module_css_default.lineIcon,
				viewBox: "0 0 20 20",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "5",
						cy: "5",
						r: "2"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "15",
						cy: "5",
						r: "2"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "10",
						cy: "15",
						r: "2"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M6.7 6.1 8.9 13M13.3 6.1 11.1 13M7 5h6" })
				]
			});
		}
		function HealthIcon() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				className: harness_module_css_default.lineIcon,
				viewBox: "0 0 20 20",
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M2.5 10h3l1.5-4 3 8 2-5 1.3 3h4.2" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "10",
					cy: "10",
					r: "8"
				})]
			});
		}
		function ChevronIcon() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				className: harness_module_css_default.chevronIcon,
				viewBox: "0 0 16 16",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m4 6 4 4 4-4" })
			});
		}
		//#endregion
		//#region src/client/index.ts
		const inject = ["slots", "connection"];
		function apply(ctx) {
			const api = new HarnessClientApi(ctx.get("connection"));
			const inject = () => ({ api });
			ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
				name: "conversation.input.left",
				id: "harness-health",
				order: 80,
				inject
			}, HarnessComposerControls));
			ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
				name: "settings.plugin.item",
				id: "agent-harness",
				order: 70,
				inject
			}, HarnessSettingsCard));
		}
		//#endregion
		exports.HarnessClientApi = HarnessClientApi;
		exports.apply = apply;
		exports.cacheRate = cacheRate;
		exports.dimensionLabel = dimensionLabel;
		exports.healthLabel = healthLabel;
		exports.healthTone = healthTone;
		exports.inject = inject;
		exports.sparklinePoints = sparklinePoints;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map