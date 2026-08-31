import { KNOWLEDGE_KINDS, KNOWLEDGE_SOURCE_KINDS, KNOWLEDGE_STATUSES } from "./types.js";
//#region src/core/validate.ts
const ID_PATTERN = /^knowledge_[0-9a-f]{32}$/u;
const MAX_TITLE = 160;
const MAX_CONTENT = 4e3;
const MAX_PROJECT = 240;
const MAX_CATEGORY = 64;
const MAX_TAGS = 8;
const MAX_TAG = 32;
const MAX_SOURCE_LABEL = 240;
const MAX_SESSION_ID = 160;
const MAX_SOURCE_URI = 2048;
const MAX_MIME_TYPE = 120;
const PROPOSAL_KEYS = /* @__PURE__ */ new Set([
	"kind",
	"title",
	"content",
	"project",
	"category",
	"tags",
	"confidence",
	"source"
]);
const UPDATE_KEYS = /* @__PURE__ */ new Set([
	"kind",
	"title",
	"content",
	"project",
	"category",
	"tags"
]);
const SOURCE_KEYS = /* @__PURE__ */ new Set([
	"kind",
	"label",
	"sessionId",
	"uri",
	"mimeType",
	"hasSnapshot",
	"capturedAt"
]);
const ITEM_KEYS = /* @__PURE__ */ new Set([
	"id",
	"status",
	"kind",
	"title",
	"content",
	"project",
	"category",
	"tags",
	"confidence",
	"source",
	"createdAt",
	"updatedAt",
	"confirmedAt",
	"dismissedAt"
]);
const SECRET_PATTERNS = [
	/authorization\s*[:=]\s*bearer\s+[^\s]{12,}/iu,
	/(?:api[_-]?key|access[_-]?token|client[_-]?secret|private[_-]?key)\s*[:=]\s*[^\s]{12,}/iu,
	/(?:x-api-key|x-tapd-access-token)\s*:\s*[^\s]{12,}/iu
];
function normalizeProposal(input, context) {
	const value = objectValue(input, "proposal");
	rejectUnknownKeys(value, PROPOSAL_KEYS, "proposal contains a reserved or unknown field");
	const id = knowledgeId(context.id);
	const now = isoTimestamp(context.now, "now");
	const title = boundedText(value.title, "title", MAX_TITLE, false);
	const content = boundedText(value.content, "content", MAX_CONTENT, true);
	rejectSecretLike(`${title}\n${content}`);
	const project = optionalText(value.project, "project", MAX_PROJECT);
	const category = optionalText(value.category, "category", MAX_CATEGORY);
	const source = normalizeSource(value.source, now);
	return {
		id,
		status: "candidate",
		kind: enumValue(value.kind, KNOWLEDGE_KINDS, "kind"),
		title,
		content,
		...project === void 0 ? {} : { project },
		...category === void 0 ? {} : { category },
		tags: normalizeTags(value.tags),
		confidence: confidenceValue(value.confidence),
		source,
		createdAt: now,
		updatedAt: now
	};
}
function validateKnowledgeItem(input) {
	const value = objectValue(input, "knowledge item");
	rejectUnknownKeys(value, ITEM_KEYS, "knowledge item contains an unknown field");
	const status = enumValue(value.status, KNOWLEDGE_STATUSES, "status");
	const createdAt = isoTimestamp(value.createdAt, "createdAt");
	const updatedAt = isoTimestamp(value.updatedAt, "updatedAt");
	const confirmedAt = optionalTimestamp(value.confirmedAt, "confirmedAt");
	const dismissedAt = optionalTimestamp(value.dismissedAt, "dismissedAt");
	if (status === "candidate" && (confirmedAt !== void 0 || dismissedAt !== void 0)) throw new Error("candidate lifecycle timestamps are invalid");
	if (status === "confirmed" && (confirmedAt === void 0 || dismissedAt !== void 0)) throw new Error("confirmedAt is required only for confirmed knowledge");
	if (status === "dismissed" && (dismissedAt === void 0 || confirmedAt !== void 0)) throw new Error("dismissedAt is required only for dismissed knowledge");
	const title = boundedText(value.title, "title", MAX_TITLE, false);
	const content = boundedText(value.content, "content", MAX_CONTENT, true);
	rejectSecretLike(`${title}\n${content}`);
	const project = optionalText(value.project, "project", MAX_PROJECT);
	const category = optionalText(value.category, "category", MAX_CATEGORY);
	return {
		id: knowledgeId(value.id),
		status,
		kind: enumValue(value.kind, KNOWLEDGE_KINDS, "kind"),
		title,
		content,
		...project === void 0 ? {} : { project },
		...category === void 0 ? {} : { category },
		tags: normalizeTags(value.tags),
		confidence: confidenceValue(value.confidence),
		source: normalizeStoredSource(value.source),
		createdAt,
		updatedAt,
		...confirmedAt === void 0 ? {} : { confirmedAt },
		...dismissedAt === void 0 ? {} : { dismissedAt }
	};
}
function normalizeKnowledgeUpdate(input, current, nowInput) {
	const value = objectValue(input, "knowledge update");
	rejectUnknownKeys(value, UPDATE_KEYS, "knowledge update contains an unknown field");
	const title = boundedText(value.title, "title", MAX_TITLE, false);
	const content = boundedText(value.content, "content", MAX_CONTENT, true);
	rejectSecretLike(`${title}\n${content}`);
	const project = optionalText(value.project, "project", MAX_PROJECT);
	const category = optionalText(value.category, "category", MAX_CATEGORY);
	return validateKnowledgeItem({
		...current,
		kind: enumValue(value.kind, KNOWLEDGE_KINDS, "kind"),
		title,
		content,
		...project === void 0 ? { project: void 0 } : { project },
		...category === void 0 ? { category: void 0 } : { category },
		tags: normalizeTags(value.tags),
		updatedAt: isoTimestamp(nowInput, "now")
	});
}
function normalizeSource(input, fallbackTime) {
	const value = objectValue(input, "source");
	rejectUnknownKeys(value, SOURCE_KEYS, "source contains an unknown field");
	const sessionId = optionalText(value.sessionId, "source sessionId", MAX_SESSION_ID);
	const uri = optionalSourceUri(value.uri);
	const mimeType = optionalText(value.mimeType, "source mimeType", MAX_MIME_TYPE);
	return {
		kind: enumValue(value.kind, KNOWLEDGE_SOURCE_KINDS, "source kind"),
		label: boundedText(value.label, "source label", MAX_SOURCE_LABEL, false),
		...sessionId === void 0 ? {} : { sessionId },
		...uri === void 0 ? {} : { uri },
		...mimeType === void 0 ? {} : { mimeType },
		capturedAt: value.capturedAt === void 0 ? fallbackTime : isoTimestamp(value.capturedAt, "source capturedAt")
	};
}
function normalizeStoredSource(input) {
	const value = objectValue(input, "source");
	rejectUnknownKeys(value, SOURCE_KEYS, "source contains an unknown field");
	const sessionId = optionalText(value.sessionId, "source sessionId", MAX_SESSION_ID);
	const uri = optionalSourceUri(value.uri);
	const mimeType = optionalText(value.mimeType, "source mimeType", MAX_MIME_TYPE);
	const hasSnapshot = optionalBoolean(value.hasSnapshot, "source hasSnapshot");
	return {
		kind: enumValue(value.kind, KNOWLEDGE_SOURCE_KINDS, "source kind"),
		label: boundedText(value.label, "source label", MAX_SOURCE_LABEL, false),
		...sessionId === void 0 ? {} : { sessionId },
		...uri === void 0 ? {} : { uri },
		...mimeType === void 0 ? {} : { mimeType },
		...hasSnapshot === void 0 ? {} : { hasSnapshot },
		capturedAt: isoTimestamp(value.capturedAt, "source capturedAt")
	};
}
function optionalSourceUri(input) {
	if (input === void 0) return void 0;
	const value = boundedText(input, "source uri", MAX_SOURCE_URI, false);
	let url;
	try {
		url = new URL(value);
	} catch {
		throw new TypeError("source uri must be a valid URL");
	}
	if (!["http:", "https:"].includes(url.protocol)) throw new TypeError("source uri must use http or https");
	url.username = "";
	url.password = "";
	return url.toString();
}
function optionalBoolean(input, label) {
	if (input === void 0) return void 0;
	if (typeof input !== "boolean") throw new TypeError(`${label} must be boolean`);
	return input;
}
function normalizeTags(input) {
	if (input === void 0) return [];
	if (!Array.isArray(input) || input.length > MAX_TAGS) throw new TypeError(`tags must contain at most ${MAX_TAGS} values`);
	const result = [];
	const seen = /* @__PURE__ */ new Set();
	for (const item of input) {
		const tag = boundedText(item, "tag", MAX_TAG, false);
		if (tag.includes("..") || /[\\/]/u.test(tag) || !/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(tag)) throw new TypeError("tag contains unsupported characters");
		const key = tag.toLocaleLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(tag);
	}
	return result;
}
function objectValue(input, label) {
	if (input === null || typeof input !== "object" || Array.isArray(input)) throw new TypeError(`${label} must be an object`);
	return input;
}
function rejectUnknownKeys(value, allowed, message) {
	if (Object.keys(value).some((key) => !allowed.has(key))) throw new TypeError(message);
}
function enumValue(input, values, label) {
	if (typeof input !== "string" || !values.includes(input)) throw new TypeError(`${label} is invalid`);
	return input;
}
function boundedText(input, label, max, multiline) {
	if (typeof input !== "string") throw new TypeError(`${label} must be text`);
	const value = input.trim();
	if (value.length === 0 || value.length > max) throw new TypeError(`${label} must contain 1-${max} characters`);
	if ((multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u : /[\u0000-\u001f\u007f]/u).test(value)) throw new TypeError(`${label} contains control characters`);
	return value;
}
function optionalText(input, label, max) {
	if (input === void 0) return void 0;
	return boundedText(input, label, max, false);
}
function confidenceValue(input) {
	if (input === void 0) return .7;
	if (typeof input !== "number" || !Number.isFinite(input) || input < 0 || input > 1) throw new TypeError("confidence must be between 0 and 1");
	return Math.round(input * 100) / 100;
}
function knowledgeId(input) {
	if (typeof input !== "string" || !ID_PATTERN.test(input)) throw new TypeError("knowledge id is invalid");
	return input;
}
function isoTimestamp(input, label) {
	if (typeof input !== "string") throw new TypeError(`${label} must be an ISO timestamp`);
	const parsed = new Date(input);
	if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== input) throw new TypeError(`${label} must be an ISO timestamp`);
	return input;
}
function optionalTimestamp(input, label) {
	return input === void 0 ? void 0 : isoTimestamp(input, label);
}
function rejectSecretLike(input) {
	if (SECRET_PATTERNS.some((pattern) => pattern.test(input))) throw new Error("knowledge content contains a secret-like value");
}
//#endregion
export { normalizeKnowledgeUpdate, normalizeProposal, validateKnowledgeItem };
