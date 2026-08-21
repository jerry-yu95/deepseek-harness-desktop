import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
//#region src/core.ts
const TRANSITIONS = {
	planning: ["executing", "blocked"],
	executing: ["evaluating", "blocked"],
	evaluating: [
		"repairing",
		"complete",
		"blocked"
	],
	repairing: [
		"executing",
		"evaluating",
		"blocked"
	],
	complete: [],
	blocked: [
		"planning",
		"executing",
		"repairing"
	]
};
const harnessDir = (cwd) => join(cwd, ".dsh-harness");
const paths = (cwd) => ({
	root: harnessDir(cwd),
	run: join(harnessDir(cwd), "run.json"),
	features: join(harnessDir(cwd), "feature-list.json"),
	progress: join(harnessDir(cwd), "progress.md"),
	cache: join(harnessDir(cwd), "cache"),
	runs: join(harnessDir(cwd), "runs"),
	ignore: join(harnessDir(cwd), ".gitignore")
});
async function atomicWrite(path, content) {
	await mkdir(dirname(path), { recursive: true });
	const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
	await writeFile(temp, content, "utf8");
	await rename(temp, path);
}
async function readJson(path) {
	return JSON.parse(await readFile(path, "utf8"));
}
function validateRun(value) {
	const run = value;
	if (run?.version !== 1 && run?.version !== 2 || typeof run.objective !== "string" || !Object.hasOwn(TRANSITIONS, run.phase)) throw new Error("invalid-harness-run");
	if (run.version === 1) return {
		...run,
		version: 2,
		orchestration: {
			mode: "standard",
			stage: "idle",
			cacheHits: 0,
			cacheMisses: 0
		}
	};
	const orchestration = run.orchestration;
	if (orchestration === void 0 || ![
		"standard",
		"enhanced",
		"adaptive"
	].includes(orchestration.mode) || ![
		"idle",
		"planning",
		"executing",
		"reviewing",
		"evaluating",
		"complete",
		"failed",
		"cancelled"
	].includes(orchestration.stage) || !Number.isSafeInteger(orchestration.cacheHits) || !Number.isSafeInteger(orchestration.cacheMisses)) throw new Error("invalid-harness-run");
	return run;
}
function validateFeatures(features) {
	if (!Array.isArray(features)) throw new Error("invalid-feature-list");
	const ids = /* @__PURE__ */ new Set();
	for (const item of features) {
		if (typeof item?.id !== "string" || item.id === "" || ids.has(item.id) || typeof item.title !== "string" || typeof item.acceptance !== "string" || ![
			"pending",
			"in_progress",
			"passed",
			"failed"
		].includes(item.status) || !Array.isArray(item.evidence)) throw new Error("invalid-feature-list");
		ids.add(item.id);
	}
	return features;
}
async function loadHarness(cwd) {
	const target = paths(cwd);
	try {
		const [run, features, progress] = await Promise.all([
			readJson(target.run),
			readJson(target.features),
			readFile(target.progress, "utf8").catch(() => "")
		]);
		return {
			run: validateRun(run),
			features: validateFeatures(features),
			progress
		};
	} catch (error) {
		if (error.code === "ENOENT") return void 0;
		throw error;
	}
}
async function initHarness(cwd, objective, featureTitles = []) {
	if (objective.trim() === "") throw new Error("objective-required");
	const existing = await loadHarness(cwd);
	if (existing !== void 0) return existing;
	const now = (/* @__PURE__ */ new Date()).toISOString();
	const run = {
		version: 2,
		objective: objective.trim(),
		phase: "planning",
		createdAt: now,
		updatedAt: now,
		orchestration: {
			mode: "standard",
			stage: "idle",
			cacheHits: 0,
			cacheMisses: 0
		}
	};
	const features = featureTitles.map((title, index) => ({
		id: `F${index + 1}`,
		title,
		acceptance: title,
		status: "pending",
		evidence: []
	}));
	const target = paths(cwd);
	await mkdir(target.root, { recursive: true });
	await atomicWrite(target.run, `${JSON.stringify(run, null, 2)}\n`);
	await atomicWrite(target.features, `${JSON.stringify(features, null, 2)}\n`);
	await atomicWrite(target.progress, `# Harness progress\n\nInitialized ${now}\n`);
	await ensureHarnessIgnore(cwd);
	return {
		run,
		features,
		progress: `# Harness progress\n\nInitialized ${now}\n`
	};
}
async function setOrchestrationMode(cwd, mode) {
	const snapshot = await loadHarness(cwd);
	if (snapshot === void 0) throw new Error("harness-not-initialized");
	snapshot.run = {
		...snapshot.run,
		updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
		orchestration: {
			...snapshot.run.orchestration,
			mode,
			...mode === "standard" ? { stage: "idle" } : {}
		}
	};
	await atomicWrite(paths(cwd).run, `${JSON.stringify(snapshot.run, null, 2)}\n`);
	return snapshot;
}
async function updateOrchestration(cwd, update) {
	const snapshot = await loadHarness(cwd);
	if (snapshot === void 0) throw new Error("harness-not-initialized");
	const next = {
		...snapshot.run.orchestration,
		...update
	};
	snapshot.run = {
		...snapshot.run,
		updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
		orchestration: next
	};
	await atomicWrite(paths(cwd).run, `${JSON.stringify(snapshot.run, null, 2)}\n`);
	return snapshot;
}
function createRunRecord(objective) {
	return {
		version: 1,
		id: randomUUID(),
		objective: redactSecrets(objective.trim()),
		startedAt: (/* @__PURE__ */ new Date()).toISOString(),
		stage: "planning",
		cache: {
			hits: 0,
			misses: 0
		},
		roles: {}
	};
}
async function writeRunRecord(cwd, record) {
	await atomicWrite(join(paths(cwd).runs, `${safeSegment(record.id)}.json`), `${JSON.stringify(sanitizeRunRecord(record), null, 2)}\n`);
}
function sanitizeRunRecord(record) {
	return {
		...record,
		objective: redactSecrets(record.objective).slice(0, 2e3),
		roles: Object.fromEntries(Object.entries(record.roles).map(([key, value]) => [key, value === void 0 ? value : {
			...value,
			summary: redactSecrets(value.summary).slice(0, 4e3)
		}])),
		...record.failure === void 0 ? {} : { failure: redactSecrets(record.failure).slice(0, 2e3) }
	};
}
function stableDigest(value) {
	return createHash("sha256").update(stableJson(value)).digest("hex");
}
function stableJson(value) {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
	return JSON.stringify(value) ?? "null";
}
function cacheKey(namespace, inputs) {
	return stableDigest({
		namespace,
		inputs
	});
}
function cachePath(cwd, namespace, key) {
	return join(paths(cwd).cache, safeSegment(namespace), `${safeSegment(key)}.json`);
}
function safeSegment(value) {
	const safe = value.replace(/[^a-zA-Z0-9._-]/g, "_");
	if (safe === "" || safe === "." || safe === "..") throw new Error("invalid-path-segment");
	return safe;
}
async function readCache(cwd, namespace, key, contract, now = Date.now()) {
	const target = cachePath(cwd, namespace, key);
	try {
		const envelope = await readJson(target);
		if (envelope.version !== 1 || envelope.key !== key || envelope.contract !== contract || envelope.expiresAt !== void 0 && Date.parse(envelope.expiresAt) <= now) {
			await rm(target, { force: true });
			return { hit: false };
		}
		return {
			hit: true,
			value: envelope.value
		};
	} catch (error) {
		if (error.code !== "ENOENT") await rm(target, { force: true }).catch(() => void 0);
		return { hit: false };
	}
}
async function writeCache(cwd, namespace, key, contract, value, ttlMs) {
	const now = Date.now();
	const envelope = {
		version: 1,
		contract,
		key,
		createdAt: new Date(now).toISOString(),
		...ttlMs === void 0 ? {} : { expiresAt: new Date(now + ttlMs).toISOString() },
		value
	};
	await atomicWrite(cachePath(cwd, namespace, key), `${JSON.stringify(envelope, null, 2)}\n`);
	await ensureHarnessIgnore(cwd);
}
const inFlight = /* @__PURE__ */ new Map();
async function cached(cwd, namespace, key, contract, producer, ttlMs) {
	const found = await readCache(cwd, namespace, key, contract);
	if (found.hit) return {
		value: found.value,
		cached: true
	};
	const identity = `${cwd}\0${namespace}\0${key}\0${contract}`;
	const existing = inFlight.get(identity);
	if (existing !== void 0) return {
		value: await existing,
		cached: true
	};
	const pending = producer();
	inFlight.set(identity, pending);
	try {
		const value = await pending;
		await writeCache(cwd, namespace, key, contract, value, ttlMs);
		return {
			value,
			cached: false
		};
	} finally {
		if (inFlight.get(identity) === pending) inFlight.delete(identity);
	}
}
async function ensureHarnessIgnore(cwd) {
	const content = "# Generated Harness runtime data\ncache/\nruns/\nmodel-health.json\nobservability.json\n";
	const target = paths(cwd).ignore;
	try {
		if (await readFile(target, "utf8") === content) return;
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	await atomicWrite(target, content);
}
async function transitionHarness(cwd, phase) {
	const snapshot = await loadHarness(cwd);
	if (snapshot === void 0) throw new Error("harness-not-initialized");
	if (!TRANSITIONS[snapshot.run.phase].includes(phase)) throw new Error(`invalid-transition:${snapshot.run.phase}->${phase}`);
	if (phase === "complete" && (snapshot.features.length === 0 || snapshot.features.some((item) => item.status !== "passed" || item.evidence.length === 0))) throw new Error("completion-requires-passed-features-with-evidence");
	snapshot.run = {
		...snapshot.run,
		phase,
		updatedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
	await atomicWrite(paths(cwd).run, `${JSON.stringify(snapshot.run, null, 2)}\n`);
	return snapshot;
}
async function updateFeature(cwd, id, status, evidence) {
	const snapshot = await loadHarness(cwd);
	if (snapshot === void 0) throw new Error("harness-not-initialized");
	const index = snapshot.features.findIndex((item) => item.id === id);
	if (index < 0) throw new Error("feature-not-found");
	const item = snapshot.features[index];
	snapshot.features[index] = {
		...item,
		status,
		evidence: evidence?.trim() ? [...item.evidence, redactSecrets(evidence.trim())] : item.evidence
	};
	snapshot.run = {
		...snapshot.run,
		updatedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
	await atomicWrite(paths(cwd).features, `${JSON.stringify(snapshot.features, null, 2)}\n`);
	await atomicWrite(paths(cwd).run, `${JSON.stringify(snapshot.run, null, 2)}\n`);
	return snapshot;
}
async function replaceFeatures(cwd, features) {
	const snapshot = await loadHarness(cwd);
	if (snapshot === void 0) throw new Error("harness-not-initialized");
	const next = validateFeatures(features.map((item) => ({
		...item,
		status: "pending",
		evidence: []
	})));
	snapshot.features = next;
	snapshot.run = {
		...snapshot.run,
		updatedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
	await atomicWrite(paths(cwd).features, `${JSON.stringify(next, null, 2)}\n`);
	await atomicWrite(paths(cwd).run, `${JSON.stringify(snapshot.run, null, 2)}\n`);
	return snapshot;
}
async function appendProgress(cwd, note) {
	const snapshot = await loadHarness(cwd);
	if (snapshot === void 0) throw new Error("harness-not-initialized");
	const line = `\n- ${(/* @__PURE__ */ new Date()).toISOString()} ${redactSecrets(note.trim())}\n`;
	snapshot.progress += line;
	await atomicWrite(paths(cwd).progress, snapshot.progress);
	return snapshot;
}
function redactSecrets(text) {
	return text.replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]").replace(/\bsk-[a-z0-9_-]{12,}\b/gi, "[REDACTED]").replace(/\bBearer\s+[a-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]");
}
function sanitizeTrajectory(items, maxChars = 6e3) {
	const lines = [];
	for (const item of items) {
		if (item.kind === "thinking" || item.kind === "credential") continue;
		const text = redactSecrets((item.text ?? "").replace(/\s+/g, " ").trim());
		if (item.kind === "tool") lines.push(`[tool:${item.name ?? "unknown"} ${item.ok === false ? "failed" : "ok"}] ${text.slice(0, 240)}`);
		else if (text !== "") lines.push(`[${item.kind}] ${text}`);
		if (lines.join("\n").length >= maxChars) break;
	}
	return lines.join("\n").slice(0, maxChars);
}
function retrieveMemory(query, memory, maxSnippets = 3, maxChars = 800) {
	const terms = new Set(query.toLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter((term) => term.length > 1));
	return memory.split(/\n{2,}/).map((text) => ({
		text: redactSecrets(text.trim()),
		score: [...terms].reduce((sum, term) => sum + (text.toLowerCase().includes(term) ? 1 : 0), 0)
	})).filter((item) => item.text !== "" && item.score > 0).sort((a, b) => b.score - a.score || a.text.length - b.text.length).slice(0, maxSnippets).map((item) => item.text.slice(0, maxChars));
}
async function harnessContext(cwd) {
	const snapshot = await loadHarness(cwd);
	if (snapshot === void 0) return "";
	const pending = snapshot.features.filter((item) => item.status !== "passed").slice(0, 8);
	return [
		"Harness project state (project-local source of truth):",
		`Objective: ${snapshot.run.objective}`,
		`Phase: ${snapshot.run.phase}`,
		`Acceptance: ${snapshot.features.filter((item) => item.status === "passed").length}/${snapshot.features.length} passed`,
		...pending.map((item) => `- ${item.id} [${item.status}] ${item.title}: ${item.acceptance}`),
		"Use harness_state to update evidence and transitions. Do not claim complete until every feature passed with evidence."
	].join("\n").slice(0, 2400);
}
function harnessContextSync(cwd) {
	const target = paths(cwd);
	try {
		const run = validateRun(JSON.parse(readFileSync(target.run, "utf8")));
		const features = validateFeatures(JSON.parse(readFileSync(target.features, "utf8")));
		const pending = features.filter((item) => item.status !== "passed").slice(0, 8);
		const adaptive = run.orchestration.mode === "adaptive" ? ["Adaptive orchestration is enabled. For a non-trivial task, call harness_orchestrate with action=\"route\" and a bounded objective before execution. Proceed directly for simple conversation or explanation.", ...run.orchestration.latestDecision === void 0 ? [] : [`Latest route: ${run.orchestration.latestDecision.strategy}; confidence ${Math.round(run.orchestration.latestDecision.confidence * 100)}%; budget ${run.orchestration.latestDecision.budget.maxAgents} agents / ${run.orchestration.latestDecision.budget.maxTotalTokens} tokens.`]] : [];
		return [
			"Harness project state (project-local source of truth):",
			`Objective: ${run.objective}`,
			`Phase: ${run.phase}`,
			`Orchestration: ${run.orchestration.mode}`,
			...adaptive,
			`Acceptance: ${features.filter((item) => item.status === "passed").length}/${features.length} passed`,
			...pending.map((item) => `- ${item.id} [${item.status}] ${item.title}: ${item.acceptance}`),
			"Use harness_state to update evidence and transitions. Do not claim complete until every feature passed with evidence."
		].join("\n").slice(0, 2400);
	} catch {
		return "";
	}
}
//#endregion
export { appendProgress, cacheKey, cached, createRunRecord, harnessContext, harnessContextSync, harnessDir, initHarness, loadHarness, readCache, redactSecrets, replaceFeatures, retrieveMemory, sanitizeTrajectory, setOrchestrationMode, stableDigest, transitionHarness, updateFeature, updateOrchestration, writeCache, writeRunRecord };
