//#region src/core/types.ts
const KNOWLEDGE_KINDS = [
	"decision",
	"lesson",
	"method",
	"fact",
	"preference"
];
const KNOWLEDGE_STATUSES = [
	"candidate",
	"confirmed",
	"dismissed"
];
const KNOWLEDGE_SOURCE_KINDS = [
	"conversation",
	"project",
	"manual",
	"tool",
	"url",
	"file"
];
const ARTICLE_IMAGE_FAILURES = [
	"access",
	"format",
	"limit",
	"timeout",
	"network",
	"cache",
	"unknown"
];
//#endregion
export { ARTICLE_IMAGE_FAILURES, KNOWLEDGE_KINDS, KNOWLEDGE_SOURCE_KINDS, KNOWLEDGE_STATUSES };
