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
//#endregion
export { KNOWLEDGE_KINDS, KNOWLEDGE_SOURCE_KINDS, KNOWLEDGE_STATUSES };
