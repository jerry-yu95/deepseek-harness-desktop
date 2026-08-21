import { cacheKey, cached, createRunRecord, loadHarness, redactSecrets, replaceFeatures, stableDigest, transitionHarness, updateFeature, updateOrchestration, writeRunRecord } from "./core.js";
import { recordHealthSignals } from "./model-health.js";
import { recordRuntimeEvent } from "./observability.js";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
//#region src/orchestration.ts
const execFileAsync = promisify(execFile);
const ROLE_CONTRACT = "orchestration-role-v1";
const schemas = {
	planner: {
		type: "object",
		additionalProperties: false,
		required: [
			"summary",
			"features",
			"risks"
		],
		properties: {
			summary: { type: "string" },
			risks: {
				type: "array",
				items: { type: "string" }
			},
			features: {
				type: "array",
				items: {
					type: "object",
					additionalProperties: false,
					required: [
						"id",
						"title",
						"acceptance"
					],
					properties: {
						id: { type: "string" },
						title: { type: "string" },
						acceptance: { type: "string" }
					}
				}
			}
		}
	},
	reviewer: {
		type: "object",
		additionalProperties: false,
		required: [
			"summary",
			"verdict",
			"findings"
		],
		properties: {
			summary: { type: "string" },
			verdict: {
				type: "string",
				enum: ["pass", "repair"]
			},
			findings: {
				type: "array",
				items: { type: "string" }
			}
		}
	},
	evaluator: {
		type: "object",
		additionalProperties: false,
		required: [
			"summary",
			"decision",
			"featureResults"
		],
		properties: {
			summary: { type: "string" },
			decision: {
				type: "string",
				enum: [
					"complete",
					"repair",
					"blocked"
				]
			},
			featureResults: {
				type: "array",
				items: {
					type: "object",
					additionalProperties: false,
					required: [
						"id",
						"status",
						"evidence"
					],
					properties: {
						id: { type: "string" },
						status: {
							type: "string",
							enum: ["passed", "failed"]
						},
						evidence: { type: "string" }
					}
				}
			}
		}
	}
};
const SCRIPT = `
phase(args.phase);
const result = await agent(args.prompt, { label: args.label, phase: args.phase, schema: args.schema });
if (result === null) throw new Error(args.label + " child failed");
return result;
`;
async function workspaceFingerprint(cwd) {
	try {
		const options = {
			cwd,
			maxBuffer: 8 * 1024 * 1024,
			encoding: "utf8"
		};
		const [head, status, diff] = await Promise.all([
			execFileAsync("git", ["rev-parse", "HEAD"], options),
			execFileAsync("git", [
				"status",
				"--porcelain=v1",
				"--untracked-files=no"
			], options),
			execFileAsync("git", [
				"diff",
				"--no-ext-diff",
				"--binary"
			], options)
		]);
		return stableDigest({
			head: head.stdout.trim(),
			status: status.stdout,
			diff: diff.stdout
		});
	} catch {
		return stableDigest({ cwd: "non-git-workspace" });
	}
}
async function runOrchestrationRole(request) {
	const snapshot = await loadHarness(request.cwd);
	if (snapshot === void 0) throw new Error("harness-not-initialized");
	if (snapshot.run.orchestration.mode !== "enhanced" && snapshot.run.orchestration.mode !== "adaptive") throw new Error("orchestration-not-enabled");
	const stage = request.role === "planner" ? "planning" : request.role === "reviewer" ? "reviewing" : "evaluating";
	const objective = request.objective?.trim() || snapshot.run.objective;
	const record = createRunRecord(objective);
	record.stage = stage;
	await updateOrchestration(request.cwd, {
		stage,
		latestRunId: record.id,
		lastFailure: void 0
	});
	await writeRunRecord(request.cwd, record);
	const started = Date.now();
	await recordRuntimeEvent(request.cwd, {
		id: `${record.id}:${request.role}:start`,
		timestamp: record.startedAt,
		kind: "stage",
		runId: record.id,
		stage: request.role,
		status: "running"
	});
	const fingerprint = await workspaceFingerprint(request.cwd);
	const roleInput = buildRoleInput(request.role, objective, snapshot.features, request.evidence);
	const key = cacheKey(request.role, {
		fingerprint,
		roleInput,
		contract: ROLE_CONTRACT
	});
	try {
		const execute = () => executeRole(request.workflowEngine, request.parent, request.signal, request.role, roleInput);
		const outcome = request.bypassCache === true ? {
			value: await execute(),
			cached: false
		} : await cached(request.cwd, request.role, key, ROLE_CONTRACT, execute);
		record.cache[outcome.cached ? "hits" : "misses"] += 1;
		record.roles[request.role] = {
			cached: outcome.cached,
			summary: summarizeResult(outcome.value)
		};
		record.stage = request.role === "evaluator" ? "complete" : request.role === "planner" ? "executing" : "evaluating";
		record.finishedAt = (/* @__PURE__ */ new Date()).toISOString();
		await applyRoleResult(request.cwd, request.role, outcome.value);
		if (!outcome.cached) await recordRoleHealthSignals(request, outcome.value);
		const current = await loadHarness(request.cwd);
		await updateOrchestration(request.cwd, {
			stage: record.stage,
			cacheHits: (current?.run.orchestration.cacheHits ?? 0) + (outcome.cached ? 1 : 0),
			cacheMisses: (current?.run.orchestration.cacheMisses ?? 0) + (outcome.cached ? 0 : 1)
		});
		await writeRunRecord(request.cwd, record);
		const durationMs = Date.now() - started;
		await recordRuntimeEvent(request.cwd, {
			id: `${record.id}:${request.role}:complete`,
			timestamp: record.finishedAt,
			kind: "stage",
			runId: record.id,
			stage: request.role,
			status: "complete",
			durationMs,
			summary: summarizeResult(outcome.value)
		});
		await recordRuntimeEvent(request.cwd, {
			id: `${record.id}:${request.role}:cache`,
			timestamp: record.finishedAt,
			kind: "cache",
			runId: record.id,
			namespace: request.role,
			hit: outcome.cached,
			...outcome.cached ? { savedMs: durationMs } : {}
		});
		return {
			ok: true,
			cached: outcome.cached,
			role: request.role,
			result: outcome.value
		};
	} catch (error) {
		const message = redactSecrets(error instanceof Error ? error.message : String(error));
		record.stage = request.signal.aborted ? "cancelled" : "failed";
		record.failure = message;
		record.finishedAt = (/* @__PURE__ */ new Date()).toISOString();
		await updateOrchestration(request.cwd, {
			stage: record.stage,
			lastFailure: message
		});
		await writeRunRecord(request.cwd, record);
		await recordRuntimeEvent(request.cwd, {
			id: `${record.id}:${request.role}:failed`,
			timestamp: record.finishedAt,
			kind: "stage",
			runId: record.id,
			stage: request.role,
			status: "failed",
			durationMs: Date.now() - started,
			summary: message
		});
		return {
			ok: false,
			cached: false,
			role: request.role,
			...request.role === "planner" ? { fallback: "standard" } : {},
			error: message
		};
	}
}
async function recordRoleHealthSignals(request, result) {
	const parentOptions = request.parent.options;
	const modelKey = `${parentOptions?.provider ?? "default"}/${parentOptions?.model ?? "default"}`;
	const timestamp = (/* @__PURE__ */ new Date()).toISOString();
	const signals = [healthSignal("structuredOutput", 100), healthSignal("instruction", result.summary.trim() === "" ? 55 : 92)];
	if (request.role === "planner") {
		const planner = result;
		signals.push(healthSignal("toolPlanning", planner.features.length > 0 ? 94 : 40), healthSignal("completeness", planner.features.every((item) => item.acceptance.trim() !== "") ? 95 : 55));
	} else if (request.role === "reviewer") {
		const reviewer = result;
		signals.push(healthSignal("context", 92), healthSignal("reasoning", reviewer.verdict === "repair" && reviewer.findings.length === 0 ? 55 : 91));
	} else {
		const evaluator = result;
		signals.push(healthSignal("context", 93), healthSignal("completeness", evaluator.featureResults.every((item) => item.evidence.trim() !== "") ? 96 : 58));
	}
	await recordHealthSignals(request.cwd, signals);
	function healthSignal(dimension, score) {
		return {
			timestamp,
			modelKey,
			dimension,
			score,
			source: "passive"
		};
	}
}
async function executeRole(engine, parent, signal, role, input) {
	const prompt = `${await rolePrompt(role)}\n\nTask context (bounded and redacted):\n${redactSecrets(input).slice(0, 2e4)}`;
	const meta = {
		name: `harness-${role}`,
		description: `Run the Harness ${role} role with structured output.`,
		phases: [{ title: role }]
	};
	const run = engine.start({
		script: SCRIPT,
		meta,
		args: {
			phase: role,
			label: `Harness ${role}`,
			prompt,
			schema: schemas[role]
		},
		parent,
		signal,
		maxTotalAgents: 1
	});
	let result;
	try {
		result = await run.result;
		if (result.stopReason !== "completed") throw new Error(result.stopReason === "error" ? result.error ?? "workflow-error" : `workflow-${result.stopReason}`);
		return validateRoleResult(role, result.value);
	} finally {
		await run.dispose();
	}
}
async function rolePrompt(role) {
	return readFile(new URL(`../roles/${role === "reviewer" ? "grounding-reviewer" : role === "evaluator" ? "completion-evaluator" : "planner"}.md`, import.meta.url), "utf8");
}
function buildRoleInput(role, objective, features, evidence) {
	return JSON.stringify({
		role,
		objective,
		...role === "planner" ? {} : { features },
		evidence: redactSecrets(evidence ?? "").slice(0, 12e3)
	});
}
function validateRoleResult(role, value) {
	if (value === null || typeof value !== "object") throw new Error(`invalid-${role}-result`);
	const result = value;
	if (typeof result.summary !== "string") throw new Error(`invalid-${role}-result`);
	if (role === "planner" && Array.isArray(result.features) && Array.isArray(result.risks)) return value;
	if (role === "reviewer" && ["pass", "repair"].includes(String(result.verdict)) && Array.isArray(result.findings)) return value;
	if (role === "evaluator" && [
		"complete",
		"repair",
		"blocked"
	].includes(String(result.decision)) && Array.isArray(result.featureResults)) return value;
	throw new Error(`invalid-${role}-result`);
}
async function applyRoleResult(cwd, role, result) {
	if (role === "planner") {
		const planner = result;
		if (planner.features.length === 0) throw new Error("planner-returned-no-features");
		await replaceFeatures(cwd, planner.features);
		if ((await loadHarness(cwd))?.run.phase === "planning") await transitionHarness(cwd, "executing");
		return;
	}
	if (role === "reviewer") {
		const reviewer = result;
		const snapshot = await loadHarness(cwd);
		if (reviewer.verdict === "repair" && snapshot?.run.phase === "evaluating") await transitionHarness(cwd, "repairing");
		return;
	}
	const evaluator = result;
	for (const item of evaluator.featureResults) await updateFeature(cwd, item.id, item.status, item.evidence);
	const snapshot = await loadHarness(cwd);
	if (snapshot === void 0) return;
	if (evaluator.decision === "complete" && snapshot.run.phase === "evaluating") await transitionHarness(cwd, "complete");
	else if (evaluator.decision === "repair" && snapshot.run.phase === "evaluating") await transitionHarness(cwd, "repairing");
	else if (evaluator.decision === "blocked" && snapshot.run.phase !== "complete" && snapshot.run.phase !== "blocked") await transitionHarness(cwd, "blocked");
}
function summarizeResult(result) {
	return redactSecrets(result.summary).slice(0, 4e3);
}
//#endregion
export { runOrchestrationRole, workspaceFingerprint };
