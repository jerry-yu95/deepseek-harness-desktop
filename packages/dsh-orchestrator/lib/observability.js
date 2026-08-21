import { harnessDir, redactSecrets, stableDigest } from "./core.js";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
//#region src/observability.ts
const MAX_EVENTS = 2e4;
const zero = () => ({
	uncachedInputTokens: 0,
	outputTokens: 0,
	cacheReadTokens: 0,
	cacheWriteTokens: 0
});
const ledgerPath = (cwd) => join(harnessDir(cwd), "observability.json");
const writes = /* @__PURE__ */ new Map();
async function load(cwd) {
	try {
		const value = JSON.parse(await readFile(ledgerPath(cwd), "utf8"));
		if (value.version !== 1 || !Array.isArray(value.events) || value.sessions === null || typeof value.sessions !== "object") throw new Error("invalid-observability-ledger");
		return value;
	} catch (error) {
		if (error.code === "ENOENT") return {
			version: 1,
			events: [],
			sessions: {}
		};
		return {
			version: 1,
			events: [],
			sessions: {}
		};
	}
}
async function atomicWrite(path, content) {
	await mkdir(dirname(path), { recursive: true });
	const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
	await writeFile(temp, content, "utf8");
	await rename(temp, path);
}
async function mutate(cwd, operation) {
	const pending = (writes.get(cwd) ?? Promise.resolve()).catch(() => void 0).then(async () => {
		const ledger = await load(cwd);
		operation(ledger);
		if (ledger.events.length > MAX_EVENTS) ledger.events = ledger.events.slice(-2e4);
		await atomicWrite(ledgerPath(cwd), `${JSON.stringify(ledger, null, 2)}\n`);
	});
	writes.set(cwd, pending);
	try {
		await pending;
	} finally {
		if (writes.get(cwd) === pending) writes.delete(cwd);
	}
}
async function recordTokenSnapshot(input) {
	await mutate(input.cwd, (ledger) => {
		const usage = normalizeBuckets(input.usage);
		const previous = ledger.sessions[input.sessionId];
		const delta = subtract(usage, previous);
		ledger.sessions[input.sessionId] = {
			...usage,
			modelKey: input.modelKey,
			project: input.project,
			estimated: input.estimated
		};
		if (total(delta) === 0) return;
		const event = {
			id: stableDigest({
				sessionId: input.sessionId,
				usage,
				modelKey: input.modelKey
			}),
			timestamp: validTimestamp(input.timestamp),
			kind: "tokens",
			sessionId: input.sessionId,
			modelKey: redactSecrets(input.modelKey).slice(0, 300),
			project: redactSecrets(input.project).slice(0, 300),
			estimated: input.estimated,
			...delta
		};
		if (!ledger.events.some((item) => item.id === event.id)) ledger.events.push(event);
	});
}
async function recordRuntimeEvent(cwd, event) {
	await mutate(cwd, (ledger) => {
		if (ledger.events.some((item) => item.id === event.id)) return;
		ledger.events.push(event.kind === "stage" ? {
			...event,
			timestamp: validTimestamp(event.timestamp),
			stage: event.stage.slice(0, 100),
			...event.summary === void 0 ? {} : { summary: redactSecrets(event.summary).slice(0, 1e3) }
		} : {
			...event,
			timestamp: validTimestamp(event.timestamp),
			namespace: event.namespace.slice(0, 100)
		});
	});
}
async function aggregateObservability(cwd, query) {
	const ledger = await load(cwd);
	const range = dateRange(query);
	const events = ledger.events.filter((event) => inRange(event.timestamp, range));
	const tokenEvents = events.filter((event) => event.kind === "tokens");
	const tokens = sumBuckets(tokenEvents);
	const grouped = /* @__PURE__ */ new Map();
	for (const event of tokenEvents) grouped.set(event.modelKey, [...grouped.get(event.modelKey) ?? [], event]);
	const models = [...grouped].map(([modelKey, values]) => ({
		modelKey,
		...sumBuckets(values),
		totalTokens: total(sumBuckets(values)),
		calls: values.length
	})).sort((a, b) => b.totalTokens - a.totalTokens || a.modelKey.localeCompare(b.modelKey));
	const dailyMap = /* @__PURE__ */ new Map();
	for (const event of tokenEvents) dailyMap.set(event.timestamp.slice(0, 10), (dailyMap.get(event.timestamp.slice(0, 10)) ?? 0) + total(event));
	const cacheEvents = events.filter((event) => event.kind === "cache");
	const hits = cacheEvents.filter((event) => event.hit).length;
	const misses = cacheEvents.length - hits;
	return {
		period: query.period,
		tokens: {
			...tokens,
			totalTokens: total(tokens)
		},
		models,
		daily: [...dailyMap].sort(([a], [b]) => a.localeCompare(b)).map(([date, totalTokens]) => ({
			date,
			totalTokens
		})),
		estimatedEvents: tokenEvents.filter((event) => event.estimated).length,
		traces: events.filter((event) => event.kind === "stage").slice(-50).reverse().map(({ id: _id, kind: _kind, ...event }) => event),
		cache: {
			hits,
			misses,
			...hits + misses === 0 ? {} : { hitRate: Math.round(hits / (hits + misses) * 100) },
			savedMs: cacheEvents.reduce((sum, event) => sum + (event.savedMs ?? 0), 0),
			savedTokens: cacheEvents.reduce((sum, event) => sum + (event.savedTokens ?? 0), 0)
		}
	};
}
function normalizeBuckets(value) {
	return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, Number.isSafeInteger(item) && item >= 0 ? item : 0]));
}
function subtract(next, previous) {
	return Object.fromEntries(Object.entries(next).map(([key, value]) => [key, Math.max(0, value - (previous?.[key] ?? 0))]));
}
function sumBuckets(values) {
	return values.reduce((sum, value) => ({
		uncachedInputTokens: sum.uncachedInputTokens + value.uncachedInputTokens,
		outputTokens: sum.outputTokens + value.outputTokens,
		cacheReadTokens: sum.cacheReadTokens + value.cacheReadTokens,
		cacheWriteTokens: sum.cacheWriteTokens + value.cacheWriteTokens
	}), zero());
}
function total(value) {
	return value.uncachedInputTokens + value.outputTokens + value.cacheReadTokens + value.cacheWriteTokens;
}
function validTimestamp(value) {
	return Number.isNaN(Date.parse(value)) ? (/* @__PURE__ */ new Date()).toISOString() : new Date(value).toISOString();
}
function inRange(value, range) {
	const time = Date.parse(value);
	return (range.from === void 0 || time >= range.from) && (range.to === void 0 || time <= range.to);
}
function dateRange(query) {
	const now = Date.parse(query.now ?? (/* @__PURE__ */ new Date()).toISOString());
	if (query.period === "all") return {};
	if (query.period === "custom") return {
		...query.from === void 0 ? {} : { from: Date.parse(query.from) },
		...query.to === void 0 ? {} : { to: Date.parse(query.to) }
	};
	const date = new Date(now);
	if (query.period === "today") return {
		from: Date.parse(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`),
		to: now
	};
	if (query.period === "month") return {
		from: Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
		to: now
	};
	return {
		from: now - (query.period === "7d" ? 7 : 30) * 864e5,
		to: now
	};
}
//#endregion
export { aggregateObservability, recordRuntimeEvent, recordTokenSnapshot };
