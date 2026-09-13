import { ARTICLE_IMAGE_FAILURES, KNOWLEDGE_KINDS, KNOWLEDGE_SOURCE_KINDS, KNOWLEDGE_STATUSES } from "./types.js";
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
const MAX_AUTHOR = 160;
const MAX_ARTICLE_IMAGES = 50;
const MAX_ARTICLE_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_ARTICLE_IMAGE_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_PROVIDER = 160;
const MAX_MODEL = 160;
const MAX_SUMMARY = 4e3;
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
const ARTICLE_KEYS = /* @__PURE__ */ new Set([
	"author",
	"format",
	"truncated",
	"originalByteLength",
	"images",
	"imagesTruncated",
	"excerpt"
]);
const SUMMARY_KEYS = /* @__PURE__ */ new Set([
	"text",
	"provider",
	"model",
	"generatedAt",
	"sourceTruncated",
	"editedByUser"
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
	"article",
	"summary",
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
	const content = boundedText(value.content, "content", MAX_CONTENT, true, context.allowEmptyContent);
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
	const content = boundedText(value.content, "content", MAX_CONTENT, true, value.article !== void 0);
	rejectSecretLike(`${title}\n${content}`);
	const project = optionalText(value.project, "project", MAX_PROJECT);
	const category = optionalText(value.category, "category", MAX_CATEGORY);
	const article = normalizeArticleMetadata(value.article);
	const summary = normalizeKnowledgeSummary(value.summary);
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
		...article === void 0 ? {} : { article },
		...summary === void 0 ? {} : { summary },
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
	const content = boundedText(value.content, "content", MAX_CONTENT, true, current.article !== void 0);
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
function normalizeArticleMetadata(input) {
	if (input === void 0) return void 0;
	const value = objectValue(input, "article metadata");
	rejectUnknownKeys(value, ARTICLE_KEYS, "article metadata contains an unknown field");
	const author = optionalText(value.author, "article author", MAX_AUTHOR);
	const format = enumValue(value.format, ["markdown", "text"], "article format");
	const truncated = optionalBoolean(value.truncated, "article truncated");
	if (truncated === void 0) throw new TypeError("article truncated is required");
	const originalByteLength = optionalInteger(value.originalByteLength, "article originalByteLength");
	const images = normalizeArticleImages(value.images);
	const imagesTruncated = optionalBoolean(value.imagesTruncated, "article imagesTruncated");
	const excerpt = value.excerpt === void 0 ? void 0 : boundedText(value.excerpt, "article excerpt", 180, true);
	return {
		...author === void 0 ? {} : { author },
		format,
		truncated,
		...originalByteLength === void 0 ? {} : { originalByteLength },
		...images === void 0 ? {} : { images },
		...imagesTruncated === void 0 ? {} : { imagesTruncated },
		...excerpt === void 0 ? {} : { excerpt }
	};
}
function normalizeArticleImages(input, sparse = false) {
	if (input === void 0) return void 0;
	if (!Array.isArray(input) || input.length > MAX_ARTICLE_IMAGES) throw new TypeError(`article images must contain at most ${MAX_ARTICLE_IMAGES} values`);
	const seen = /* @__PURE__ */ new Set();
	let totalBytes = 0;
	return input.map((entry, index) => {
		const value = objectValue(entry, "article image");
		rejectUnknownKeys(value, /* @__PURE__ */ new Set([
			"id",
			"alt",
			"order",
			"offset",
			"status",
			"mimeType",
			"byteLength",
			"failureReason"
		]), "article image contains an unknown field");
		if (typeof value.id !== "string" || !/^image_[0-9a-f]{32}$/u.test(value.id) || seen.has(value.id)) throw new TypeError("article image id is invalid");
		seen.add(value.id);
		const alt = boundedText(value.alt, "article image alt", 200, true, true);
		if (!Number.isSafeInteger(value.order) || value.order < 0 || value.order >= MAX_ARTICLE_IMAGES) throw new TypeError("article image order is invalid");
		if (!sparse && value.order !== index) throw new TypeError("article image order must be stable");
		const offset = optionalInteger(value.offset, "article image offset");
		if (offset !== void 0 && offset > 1048576) throw new TypeError("article image offset is too large");
		if (value.status !== "ready" && value.status !== "unavailable") throw new TypeError("article image status is invalid");
		const failureReason = value.failureReason === void 0 ? void 0 : enumValue(value.failureReason, ARTICLE_IMAGE_FAILURES, "article image failure reason");
		if (value.status === "ready" && failureReason !== void 0) throw new TypeError("ready image cannot have a failure reason");
		const mimeType = value.mimeType === void 0 ? void 0 : enumValue(value.mimeType, [
			"image/jpeg",
			"image/png",
			"image/gif",
			"image/webp"
		], "article image mimeType");
		const byteLength = value.byteLength === void 0 ? void 0 : optionalInteger(value.byteLength, "article image byteLength");
		if (value.status === "ready" && (mimeType === void 0 || byteLength === void 0 || byteLength === 0 || byteLength > MAX_ARTICLE_IMAGE_BYTES)) throw new TypeError("ready article image metadata is incomplete");
		if (value.status === "unavailable" && (mimeType !== void 0 || byteLength !== void 0)) throw new TypeError("unavailable article image metadata is invalid");
		totalBytes += byteLength ?? 0;
		if (totalBytes > MAX_ARTICLE_IMAGE_TOTAL_BYTES) throw new TypeError("article images are too large");
		return {
			id: value.id,
			alt,
			order: value.order,
			...offset === void 0 ? {} : { offset },
			status: value.status,
			...failureReason === void 0 ? {} : { failureReason },
			...mimeType === void 0 ? {} : { mimeType },
			...byteLength === void 0 ? {} : { byteLength }
		};
	});
}
function normalizeArticleResources(input) {
	if (input === void 0) return void 0;
	if (!Array.isArray(input)) throw new TypeError("article resources must be an array");
	const metadata = normalizeArticleImages(input.map((entry) => {
		const { data: _data, ...image } = objectValue(entry, "article resource");
		return image;
	}), true);
	if (metadata === void 0) return void 0;
	return input.map((entry, index) => {
		const value = objectValue(entry, "article resource");
		if (typeof value.data !== "string" || value.data.length === 0) throw new TypeError("article resource data is required");
		const image = metadata[index];
		if (image.status !== "ready" || image.mimeType === void 0 || image.byteLength === void 0) throw new TypeError("article resource must be ready");
		decodeArticleImageData(value.data, image.mimeType, image.byteLength);
		return {
			...image,
			status: "ready",
			mimeType: image.mimeType,
			byteLength: image.byteLength,
			data: value.data
		};
	});
}
function decodeArticleImageData(data, mimeType, byteLength) {
	if (![
		"image/png",
		"image/jpeg",
		"image/gif",
		"image/webp"
	].includes(mimeType) || byteLength < 1 || byteLength > MAX_ARTICLE_IMAGE_BYTES || data.length > 4 * Math.ceil(MAX_ARTICLE_IMAGE_BYTES / 3)) throw new TypeError("article resource exceeds allowed bounds");
	if (data.length % 4 !== 0 || /[^A-Za-z0-9+/=]/u.test(data)) throw new TypeError("article resource data is not valid base64");
	const bytes = Buffer.from(data, "base64");
	if (bytes.toString("base64") !== data) throw new TypeError("article resource data is not valid base64");
	if (bytes.byteLength !== byteLength) throw new TypeError("article resource byte length does not match");
	if (!(mimeType === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([
		137,
		80,
		78,
		71,
		13,
		10,
		26,
		10
	])) : mimeType === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : mimeType === "image/gif" ? bytes.subarray(0, 6).toString("ascii") === "GIF87a" || bytes.subarray(0, 6).toString("ascii") === "GIF89a" : bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP")) throw new TypeError("article resource signature does not match mime type");
	return bytes;
}
function normalizeKnowledgeSummary(input) {
	if (input === void 0) return void 0;
	const value = objectValue(input, "knowledge summary");
	rejectUnknownKeys(value, SUMMARY_KEYS, "knowledge summary contains an unknown field");
	const text = boundedText(value.text, "summary text", MAX_SUMMARY, true);
	const provider = boundedText(value.provider, "summary provider", MAX_PROVIDER, false);
	const model = boundedText(value.model, "summary model", MAX_MODEL, false);
	const generatedAt = isoTimestamp(value.generatedAt, "summary generatedAt");
	const sourceTruncated = optionalBoolean(value.sourceTruncated, "summary sourceTruncated");
	const editedByUser = optionalBoolean(value.editedByUser, "summary editedByUser");
	if (sourceTruncated === void 0 || editedByUser === void 0) throw new TypeError("summary metadata is incomplete");
	rejectSecretLike(`${text}\n${provider}\n${model}`);
	return {
		text,
		provider,
		model,
		generatedAt,
		sourceTruncated,
		editedByUser
	};
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
function optionalInteger(input, label) {
	if (input === void 0) return void 0;
	if (!Number.isSafeInteger(input) || input < 0) throw new TypeError(`${label} must be a safe byte length`);
	return input;
}
function normalizeTags(input) {
	if (input === void 0) return [];
	if (!Array.isArray(input) || input.length > MAX_TAGS) throw new TypeError(`tags must contain at most ${MAX_TAGS} values`);
	const result = [];
	const seen = /* @__PURE__ */ new Set();
	for (const item of input) {
		const tag = boundedText(item, "tag", MAX_TAG, false).normalize("NFC");
		if (tag === "其他") throw new TypeError("tag “其他” is reserved for the virtual untagged group");
		if (tag.includes("..") || /[\\/]/u.test(tag) || !/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(tag)) throw new TypeError("tag contains unsupported characters");
		const key = tag;
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
function boundedText(input, label, max, multiline, allowEmpty = false) {
	if (typeof input !== "string") throw new TypeError(`${label} must be text`);
	const value = input.trim();
	if (!allowEmpty && value.length === 0 || value.length > max) throw new TypeError(`${label} must contain ${allowEmpty ? 0 : 1}-${max} characters`);
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
export { decodeArticleImageData, normalizeArticleMetadata, normalizeArticleResources, normalizeKnowledgeSummary, normalizeKnowledgeUpdate, normalizeProposal, validateKnowledgeItem };
