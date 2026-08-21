import { appendProgress, cacheKey, cached, createRunRecord, harnessContext, harnessContextSync, harnessDir, initHarness, loadHarness, readCache, redactSecrets, replaceFeatures, retrieveMemory, sanitizeTrajectory, setOrchestrationMode, stableDigest, transitionHarness, updateFeature, updateOrchestration, writeCache, writeRunRecord } from "./core.js";
import { assessModelHealth, getModelHealth, loadHealthStore, recordHealthFeedback, recordHealthSignals, runModelHealthProbe } from "./model-health.js";
import { runOrchestrationRole, workspaceFingerprint } from "./orchestration.js";
import { HARNESS_RPC_CHANNEL } from "./wire.js";
import { defineTool } from "@deepseek-ai/dsh-tools";
//#region src/index.ts
const name = "harness-orchestrator";
const inject = [
	"systemPrompt",
	"tools",
	"connection",
	"agents",
	"commands"
];
function apply(ctx) {
	ctx.effect(() => ctx.commands.register({
		name: "harness",
		description: "查看或切换 Agent Harness 编排模式",
		input: { hint: "on | off | status | run planner|reviewer|evaluator [evidence]" },
		recordInput: false,
		handler: executeHarnessCommand
	}), "harness-orchestrator: slash command");
	ctx.effect(() => ctx.connection.rpc.handle(HARNESS_RPC_CHANNEL, async (endpoint, payload, signal) => {
		try {
			if (endpoint === "status") return {
				ok: true,
				value: await dashboardStatus(ctx, parseSessionRequest(payload).sessionId)
			};
			if (endpoint === "mode") {
				const request = parseModeRequest(payload);
				const cwd = requireWorkspace(requireLiveAgent(ctx, request.sessionId).session.header.cwd);
				let snapshot = await loadHarness(cwd);
				if (snapshot === void 0) snapshot = await initHarness(cwd, request.objective?.trim() || `Enhanced orchestration for ${cwd.split("/").filter(Boolean).at(-1) ?? "workspace"}`);
				await setOrchestrationMode(cwd, request.mode);
				return {
					ok: true,
					value: { status: await dashboardStatus(ctx, request.sessionId) }
				};
			}
			if (endpoint === "probe") {
				const request = parseProbeRequest(payload);
				const agent = requireLiveAgent(ctx, request.sessionId);
				return {
					ok: true,
					value: await runModelHealthProbe({
						cwd: requireWorkspace(agent.session.header.cwd),
						modelKey: currentModelKey(agent),
						parent: agent,
						signal,
						workflowEngine: requireAgentWorkflowEngine(agent),
						...request.bypassCache === void 0 ? {} : { bypassCache: request.bypassCache }
					})
				};
			}
			if (endpoint === "feedback") {
				const request = parseFeedbackRequest(payload);
				const agent = requireLiveAgent(ctx, request.sessionId);
				await recordHealthFeedback(requireWorkspace(agent.session.header.cwd), {
					timestamp: (/* @__PURE__ */ new Date()).toISOString(),
					modelKey: currentModelKey(agent),
					verdict: request.verdict,
					...request.note === void 0 ? {} : { note: request.note }
				});
				return {
					ok: true,
					value: { status: await dashboardStatus(ctx, request.sessionId) }
				};
			}
			return {
				ok: true,
				value: { error: "unknown-endpoint" }
			};
		} catch (error) {
			return {
				ok: true,
				value: { error: safeError(error) }
			};
		}
	}, { authority: "loopback" }), "harness-orchestrator: dashboard rpc");
	ctx.systemPrompt.context({
		name: "harness:project-state",
		order: 80,
		text: (assemble) => assemble.agent?.session.header.cwd === void 0 ? "" : harnessContextSync(assemble.agent.session.header.cwd)
	});
	ctx.tools.register(defineTool({
		name: "harness_state",
		description: "Manage the project-local Harness objective, acceptance ledger, progress checkpoints, and validated phase transitions.",
		parameters: {
			action: {
				type: "string",
				required: true,
				enum: [
					"init",
					"status",
					"transition",
					"feature",
					"checkpoint"
				]
			},
			objective: { type: "string" },
			features: {
				type: "array",
				items: { type: "string" }
			},
			phase: {
				type: "string",
				enum: [
					"planning",
					"executing",
					"evaluating",
					"repairing",
					"complete",
					"blocked"
				]
			},
			featureId: { type: "string" },
			status: {
				type: "string",
				enum: [
					"pending",
					"in_progress",
					"passed",
					"failed"
				]
			},
			evidence: { type: "string" },
			note: { type: "string" }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: true
			},
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value, null, 2)
			}]
		},
		async execute(args, exec) {
			const cwd = exec.agent?.session.header.cwd;
			if (cwd === void 0) throw new Error("harness_state requires an agent workspace");
			switch (args.action) {
				case "init": return summarize(await initHarness(cwd, args.objective ?? "", args.features ?? []));
				case "status": {
					const value = await loadHarness(cwd);
					return value === void 0 ? { initialized: false } : summarize(value);
				}
				case "transition":
					if (args.phase === void 0) throw new Error("phase-required");
					return summarize(await transitionHarness(cwd, args.phase));
				case "feature":
					if (args.featureId === void 0 || args.status === void 0) throw new Error("featureId-and-status-required");
					return summarize(await updateFeature(cwd, args.featureId, args.status, args.evidence));
				case "checkpoint":
					if (args.note === void 0) throw new Error("note-required");
					return summarize(await appendProgress(cwd, args.note));
			}
		}
	}));
	ctx.tools.register(defineTool({
		name: "harness_orchestrate",
		description: "Explicitly enable/disable Enhanced orchestration or run its structured Planner, Grounding Reviewer, and Completion Evaluator through the official DSH workflow engine. Never use implicitly in Standard mode.",
		parameters: {
			action: {
				type: "string",
				required: true,
				enum: [
					"on",
					"off",
					"status",
					"run"
				]
			},
			role: {
				type: "string",
				enum: [
					"planner",
					"reviewer",
					"evaluator"
				]
			},
			evidence: {
				type: "string",
				description: "Bounded implementation/test evidence for reviewer or evaluator. Do not include secrets or hidden reasoning."
			},
			bypassCache: {
				type: "boolean",
				description: "Ignore an existing role cache entry for this run."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: true
			},
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value, null, 2)
			}]
		},
		async execute(args, exec) {
			const agent = exec.agent;
			const cwd = agent?.session.header.cwd;
			if (cwd === void 0 || agent === void 0) throw new Error("harness_orchestrate requires an agent workspace");
			if (args.action === "on") return summarize(await setOrchestrationMode(cwd, "enhanced"));
			if (args.action === "off") return summarize(await setOrchestrationMode(cwd, "standard"));
			if (args.action === "status") {
				const snapshot = await loadHarness(cwd);
				return snapshot === void 0 ? { initialized: false } : summarize(snapshot);
			}
			if (args.role === void 0) throw new Error("role-required");
			return await runOrchestrationRole({
				cwd,
				role: args.role,
				parent: agent,
				signal: exec.signal,
				workflowEngine: requireAgentWorkflowEngine(agent),
				...args.evidence === void 0 ? {} : { evidence: args.evidence },
				...args.bypassCache === void 0 ? {} : { bypassCache: args.bypassCache }
			});
		}
	}));
	ctx.tools.register(defineTool({
		name: "model_health",
		description: "Inspect model health, run an explicit isolated diagnostic, record a bounded passive quality signal, or record user feedback. This warns about sustained regression and never switches models.",
		parameters: {
			action: {
				type: "string",
				required: true,
				enum: [
					"status",
					"probe",
					"record",
					"feedback"
				]
			},
			modelKey: {
				type: "string",
				description: "Stable provider/model route identity. Defaults to the current agent provider/model."
			},
			dimension: {
				type: "string",
				enum: [
					"instruction",
					"context",
					"reasoning",
					"structuredOutput",
					"toolPlanning",
					"completeness"
				]
			},
			score: { type: "number" },
			anomaly: { type: "string" },
			verdict: {
				type: "string",
				enum: ["normal", "degraded"]
			},
			note: { type: "string" },
			bypassCache: { type: "boolean" }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: true
			},
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value, null, 2)
			}]
		},
		async execute(args, exec) {
			const agent = exec.agent;
			const cwd = agent?.session.header.cwd;
			if (cwd === void 0 || agent === void 0) throw new Error("model_health requires an agent workspace");
			const modelKey = args.modelKey?.trim() || `${agent.options.provider ?? "default"}/${agent.options.model ?? "default"}`;
			if (args.action === "status") return await getModelHealth(cwd, modelKey);
			if (args.action === "probe") return await runModelHealthProbe({
				cwd,
				modelKey,
				parent: agent,
				signal: exec.signal,
				workflowEngine: requireAgentWorkflowEngine(agent),
				...args.bypassCache === void 0 ? {} : { bypassCache: args.bypassCache }
			});
			if (args.action === "feedback") {
				if (args.verdict === void 0) throw new Error("verdict-required");
				return await recordHealthFeedback(cwd, {
					timestamp: (/* @__PURE__ */ new Date()).toISOString(),
					modelKey,
					verdict: args.verdict,
					...args.note === void 0 ? {} : { note: args.note }
				});
			}
			if (args.dimension === void 0 || args.score === void 0) throw new Error("dimension-and-score-required");
			return await recordHealthSignals(cwd, [{
				timestamp: (/* @__PURE__ */ new Date()).toISOString(),
				modelKey,
				dimension: args.dimension,
				score: args.score,
				source: "passive",
				...args.anomaly === void 0 ? {} : { anomaly: args.anomaly }
			}]);
		}
	}));
}
/** Direct UI fallback for environments where the enhanced-mode control is unavailable. */
async function executeHarnessCommand(invocation) {
	const cwd = invocation.agent.session.header.cwd;
	if (cwd === void 0 || cwd.trim() === "") return {
		kind: "error",
		text: "当前会话没有工作区。"
	};
	const [action = "status", role, ...evidenceParts] = invocation.rawInput.trim().split(/\s+/);
	if (action === "on" || action === "off") {
		let snapshot = await loadHarness(cwd);
		if (snapshot === void 0) snapshot = await initHarness(cwd, `Enhanced orchestration for ${cwd.split("/").filter(Boolean).at(-1) ?? "workspace"}`);
		snapshot = await setOrchestrationMode(cwd, action === "on" ? "enhanced" : "standard");
		return {
			kind: "success",
			text: `Agent Harness 已切换为${snapshot.run.orchestration.mode === "enhanced" ? "增强" : "标准"}编排。`
		};
	}
	if (action === "status") {
		const snapshot = await loadHarness(cwd);
		if (snapshot === void 0) return {
			kind: "success",
			text: "Agent Harness 尚未初始化；使用 /harness on 开启增强编排。"
		};
		const { orchestration } = snapshot.run;
		const total = orchestration.cacheHits + orchestration.cacheMisses;
		const rate = total === 0 ? "暂无" : `${Math.round(orchestration.cacheHits / total * 100)}%`;
		return {
			kind: "success",
			text: `Agent Harness：${orchestration.mode === "enhanced" ? "增强" : "标准"}编排；阶段 ${orchestration.stage}；缓存命中率 ${rate}。`
		};
	}
	if (action === "run") {
		if (role !== "planner" && role !== "reviewer" && role !== "evaluator") return {
			kind: "error",
			text: "用法：/harness run planner|reviewer|evaluator [evidence]"
		};
		if ((await loadHarness(cwd))?.run.orchestration.mode !== "enhanced") return {
			kind: "error",
			text: "请先使用 /harness on 开启增强编排。"
		};
		const outcome = await runOrchestrationRole({
			cwd,
			role,
			parent: invocation.agent,
			signal: invocation.signal,
			workflowEngine: requireAgentWorkflowEngine(invocation.agent),
			...evidenceParts.length === 0 ? {} : { evidence: evidenceParts.join(" ") }
		});
		return outcome.ok ? {
			kind: "success",
			text: `${role} 已完成${outcome.cached ? "（缓存命中）" : ""}。`
		} : {
			kind: "error",
			text: outcome.error ?? `${role} 运行失败。`
		};
	}
	return {
		kind: "error",
		text: "用法：/harness on | off | status | run planner|reviewer|evaluator [evidence]"
	};
}
function summarize(snapshot) {
	return {
		initialized: true,
		objective: snapshot.run.objective,
		phase: snapshot.run.phase,
		passed: snapshot.features.filter((item) => item.status === "passed").length,
		total: snapshot.features.length,
		orchestration: { ...snapshot.run.orchestration },
		features: snapshot.features.map((item) => ({
			id: item.id,
			title: item.title,
			acceptance: item.acceptance,
			status: item.status,
			evidence: [...item.evidence]
		}))
	};
}
function requireLiveAgent(ctx, sessionId) {
	const agent = ctx.agents.get(sessionId);
	if (agent === void 0) throw new Error("session-not-live");
	return agent;
}
function requireWorkspace(cwd) {
	if (cwd === void 0 || cwd.trim() === "") throw new Error("workspace-unavailable");
	return cwd;
}
function currentModelKey(agent) {
	return `${agent.options.provider ?? "default"}/${agent.options.model ?? "default"}`;
}
function requireAgentWorkflowEngine(agent) {
	try {
		return agent.ctx.workflowEngine;
	} catch {
		throw new Error("workflow-engine-unavailable-for-agent");
	}
}
async function dashboardStatus(ctx, sessionId) {
	const agent = requireLiveAgent(ctx, sessionId);
	const cwd = requireWorkspace(agent.session.header.cwd);
	const modelKey = currentModelKey(agent);
	const [harness, health] = await Promise.all([loadHarness(cwd), getModelHealth(cwd, modelKey)]);
	return {
		initialized: harness !== void 0,
		modelKey,
		...harness === void 0 ? {} : { harness },
		health
	};
}
function parseSessionRequest(payload) {
	if (!isRecord(payload) || typeof payload.sessionId !== "string" || payload.sessionId === "") throw new Error("sessionId-required");
	return { sessionId: payload.sessionId };
}
function parseModeRequest(payload) {
	const request = parseSessionRequest(payload);
	if (!isRecord(payload) || payload.mode !== "standard" && payload.mode !== "enhanced") throw new Error("mode-required");
	return {
		...request,
		mode: payload.mode,
		...typeof payload.objective === "string" ? { objective: payload.objective } : {}
	};
}
function parseProbeRequest(payload) {
	return {
		...parseSessionRequest(payload),
		...isRecord(payload) && typeof payload.bypassCache === "boolean" ? { bypassCache: payload.bypassCache } : {}
	};
}
function parseFeedbackRequest(payload) {
	const request = parseSessionRequest(payload);
	if (!isRecord(payload) || payload.verdict !== "normal" && payload.verdict !== "degraded") throw new Error("verdict-required");
	return {
		...request,
		verdict: payload.verdict,
		...typeof payload.note === "string" ? { note: payload.note } : {}
	};
}
function isRecord(value) {
	return typeof value === "object" && value !== null;
}
function safeError(error) {
	return redactError(error instanceof Error ? error.message : String(error));
}
function redactError(message) {
	return message.replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]").slice(0, 500);
}
//#endregion
export { HARNESS_RPC_CHANNEL, appendProgress, apply, assessModelHealth, cacheKey, cached, createRunRecord, executeHarnessCommand, getModelHealth, harnessContext, harnessContextSync, harnessDir, initHarness, inject, loadHarness, loadHealthStore, name, readCache, recordHealthFeedback, recordHealthSignals, redactSecrets, replaceFeatures, retrieveMemory, runModelHealthProbe, runOrchestrationRole, sanitizeTrajectory, setOrchestrationMode, stableDigest, transitionHarness, updateFeature, updateOrchestration, workspaceFingerprint, writeCache, writeRunRecord };
