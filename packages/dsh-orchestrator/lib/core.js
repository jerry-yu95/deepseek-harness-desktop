import { readFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
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
	progress: join(harnessDir(cwd), "progress.md")
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
function validateRun(run) {
	if (run?.version !== 1 || typeof run.objective !== "string" || !Object.hasOwn(TRANSITIONS, run.phase)) throw new Error("invalid-harness-run");
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
		version: 1,
		objective: objective.trim(),
		phase: "planning",
		createdAt: now,
		updatedAt: now
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
	return {
		run,
		features,
		progress: `# Harness progress\n\nInitialized ${now}\n`
	};
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
		return [
			"Harness project state (project-local source of truth):",
			`Objective: ${run.objective}`,
			`Phase: ${run.phase}`,
			`Acceptance: ${features.filter((item) => item.status === "passed").length}/${features.length} passed`,
			...pending.map((item) => `- ${item.id} [${item.status}] ${item.title}: ${item.acceptance}`),
			"Use harness_state to update evidence and transitions. Do not claim complete until every feature passed with evidence."
		].join("\n").slice(0, 2400);
	} catch {
		return "";
	}
}
//#endregion
export { appendProgress, harnessContext, harnessContextSync, harnessDir, initHarness, loadHarness, redactSecrets, retrieveMemory, sanitizeTrajectory, transitionHarness, updateFeature };
