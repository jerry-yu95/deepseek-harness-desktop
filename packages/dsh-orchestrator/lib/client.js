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
			status(sessionId, signal) {
				return this.call("status", { sessionId }, signal);
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
			const request = (0, react.useRef)(0);
			const refresh = (0, react.useCallback)(async () => {
				const seq = ++request.current;
				const controller = new AbortController();
				try {
					const value = await api.status(sessionId, controller.signal);
					if (request.current === seq) {
						setStatus(value);
						setError(void 0);
					}
				} catch (cause) {
					if (request.current === seq) setError(messageOf(cause));
				} finally {
					if (request.current === seq) setLoading(false);
				}
			}, [api, sessionId]);
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
				...error === void 0 ? {} : { error },
				refresh,
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
		const css = ".bcJosq_controls{align-items:center;gap:6px;display:flex;position:relative}.bcJosq_pill{border:1px solid color-mix(in srgb, currentColor 18%, transparent);background:color-mix(in srgb, currentColor 7%, transparent);color:inherit;font:inherit;cursor:pointer;white-space:nowrap;border-radius:999px;align-items:center;gap:6px;padding:5px 9px;font-size:12px;display:inline-flex}.bcJosq_pill:disabled{opacity:.55;cursor:wait}.bcJosq_dot,.bcJosq_modeOn,.bcJosq_modeOff{background:#89919e;border-radius:50%;width:7px;height:7px}.bcJosq_modeOn{background:#5c8dff;box-shadow:0 0 0 3px #5c8dff2e}.bcJosq_modeOff{background:#89919e}.bcJosq_good .bcJosq_dot{background:#22a06b}.bcJosq_warn .bcJosq_dot{background:#d99000}.bcJosq_bad .bcJosq_dot{background:#e5484d}.bcJosq_muted .bcJosq_dot{background:#89919e}.bcJosq_popover{z-index:30;border:1px solid color-mix(in srgb, currentColor 16%, transparent);background:var(--color-bg,#fff);width:min(430px,78vw);color:var(--color-text,#18202a);border-radius:16px;padding:14px;position:absolute;bottom:calc(100% + 10px);left:0;box-shadow:0 18px 50px #0003}.bcJosq_settingsCard{border:1px solid color-mix(in srgb, currentColor 14%, transparent);background:color-mix(in srgb, currentColor 2%, transparent);border-radius:16px;margin:8px 0;padding:22px}.bcJosq_settingsCard header{justify-content:space-between;align-items:center;margin-bottom:18px;display:flex}.bcJosq_settingsCard h3{margin:0 0 4px;font-size:18px}.bcJosq_settingsCard header p{opacity:.62;margin:0}.bcJosq_dashboard{gap:18px;display:grid}.bcJosq_compact{gap:12px}.bcJosq_summary{grid-template-columns:auto 1fr auto;align-items:center;gap:14px;display:grid}.bcJosq_score{text-align:center;background:color-mix(in srgb, currentColor 8%, transparent);border-radius:18px;place-content:center;width:66px;height:66px;display:grid}.bcJosq_score strong{font-size:24px;line-height:1}.bcJosq_score span{margin-top:5px;font-size:11px}.bcJosq_score.bcJosq_good{color:#16865b}.bcJosq_score.bcJosq_warn{color:#b06c00}.bcJosq_score.bcJosq_bad{color:#cf3439}.bcJosq_score.bcJosq_muted{color:#6f7782}.bcJosq_meta{gap:5px;min-width:0;display:grid}.bcJosq_meta b{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.bcJosq_meta span{opacity:.64;font-size:12px}.bcJosq_primary,.bcJosq_orchestration button,.bcJosq_feedback button,.bcJosq_error button{color:#fff;cursor:pointer;font:inherit;background:#3374e8;border:0;border-radius:9px;padding:8px 12px}.bcJosq_primary:disabled,.bcJosq_orchestration button:disabled,.bcJosq_feedback button:disabled{opacity:.55;cursor:wait}.bcJosq_alert{color:#c52d33;background:#e5484d21;border-radius:10px;padding:10px 12px;font-size:13px}.bcJosq_orchestration{background:color-mix(in srgb, currentColor 5%, transparent);border-radius:10px;flex-wrap:wrap;align-items:center;gap:14px;padding:11px 12px;font-size:13px;display:flex}.bcJosq_orchestration button{background:color-mix(in srgb, currentColor 12%, transparent);color:inherit;margin-left:auto}.bcJosq_dimensions{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 18px;display:grid}.bcJosq_dimension{grid-template-columns:88px 1fr 28px;align-items:center;gap:8px;font-size:12px;display:grid}.bcJosq_dimension>div{background:color-mix(in srgb, currentColor 9%, transparent);border-radius:999px;height:7px;overflow:hidden}.bcJosq_dimension i{border-radius:inherit;background:linear-gradient(90deg,#587cf6,#22a06b);height:100%;display:block}.bcJosq_trend h4,.bcJosq_anomalies h4{margin:0 0 8px}.bcJosq_trend p{opacity:.58;margin:0;font-size:13px}.bcJosq_trend svg{width:100%;height:64px;overflow:visible}.bcJosq_trend polyline{fill:none;stroke:#5c8dff;stroke-width:2.5px;vector-effect:non-scaling-stroke}.bcJosq_feedback{flex-wrap:wrap;align-items:center;gap:8px;font-size:13px;display:flex}.bcJosq_feedback button{background:color-mix(in srgb, currentColor 10%, transparent);color:inherit;padding:6px 10px}.bcJosq_feedback small{opacity:.58;margin-left:auto}.bcJosq_anomalies{border-top:1px solid color-mix(in srgb, currentColor 10%, transparent);padding-top:12px}.bcJosq_anomalies p{color:#c52d33;margin:6px 0;font-size:12px}.bcJosq_empty,.bcJosq_error{background:color-mix(in srgb, currentColor 5%, transparent);opacity:.75;border-radius:12px;padding:20px}.bcJosq_inlineError{color:#c52d33;font-size:12px}@media (width<=720px){.bcJosq_dimensions{grid-template-columns:1fr}.bcJosq_summary{grid-template-columns:auto 1fr}.bcJosq_summary .bcJosq_primary{grid-column:1/-1}.bcJosq_settingsCard{padding:14px}}";
		const tagId = "@harness-design/dsh-orchestrator/harness.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@harness-design/dsh-orchestrator";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var harness_module_css_default = {
			"alert": "bcJosq_alert",
			"anomalies": "bcJosq_anomalies",
			"bad": "bcJosq_bad",
			"compact": "bcJosq_compact",
			"controls": "bcJosq_controls",
			"dashboard": "bcJosq_dashboard",
			"dimension": "bcJosq_dimension",
			"dimensions": "bcJosq_dimensions",
			"dot": "bcJosq_dot",
			"empty": "bcJosq_empty",
			"error": "bcJosq_error",
			"feedback": "bcJosq_feedback",
			"good": "bcJosq_good",
			"inlineError": "bcJosq_inlineError",
			"meta": "bcJosq_meta",
			"modeOff": "bcJosq_modeOff",
			"modeOn": "bcJosq_modeOn",
			"muted": "bcJosq_muted",
			"orchestration": "bcJosq_orchestration",
			"pill": "bcJosq_pill",
			"popover": "bcJosq_popover",
			"primary": "bcJosq_primary",
			"score": "bcJosq_score",
			"settingsCard": "bcJosq_settingsCard",
			"summary": "bcJosq_summary",
			"trend": "bcJosq_trend",
			"warn": "bcJosq_warn"
		};
		//#endregion
		//#region src/client/HarnessHealthPanel.tsx
		function HarnessComposerControls(props) {
			const state = useHarnessStatus(props.api, props.sessionId);
			const [open, setOpen] = (0, react.useState)(false);
			const mode = state.status?.harness?.run.orchestration.mode ?? "standard";
			const title = props.useSessions((snapshot) => snapshot.byId[props.sessionId]?.displayTitle);
			const health = state.status?.health;
			const tone = health === void 0 ? "muted" : healthTone(health.status);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: harness_module_css_default.controls,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						className: harness_module_css_default.pill,
						disabled: state.busy,
						onClick: () => {
							state.setMode(mode === "enhanced" ? "standard" : "enhanced", title);
						},
						title: "切换 Agent 编排模式",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: mode === "enhanced" ? harness_module_css_default.modeOn : harness_module_css_default.modeOff }), mode === "enhanced" ? "增强编排" : "标准编排"]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						className: `${harness_module_css_default.pill} ${harness_module_css_default[tone]}`,
						onClick: () => {
							setOpen((value) => !value);
						},
						"aria-expanded": open,
						title: "查看模型健康度",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: harness_module_css_default.dot }),
							"模型 ",
							health === void 0 ? "检测中" : healthLabel(health.status)
						]
					}),
					open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
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
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: harness_module_css_default.primary,
								disabled: state.busy,
								onClick: () => {
									state.probe();
								},
								children: state.busy ? "检测中…" : "立即检测"
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
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["编排：", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: mode === "enhanced" ? "增强" : "标准" })] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["阶段：", harness?.run.orchestration.stage ?? "未初始化"] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["缓存：", hitRate === void 0 ? "暂无命中" : `${hitRate}% 命中`] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								disabled: state.busy,
								onClick: () => {
									state.setMode(mode === "enhanced" ? "standard" : "enhanced");
								},
								children: ["切换为", mode === "enhanced" ? "标准" : "增强"]
							})
						]
					}),
					!compact ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
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
					state.error !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: harness_module_css_default.inlineError,
						children: state.error
					}) : null
				]
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