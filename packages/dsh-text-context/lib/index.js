import { defineTool } from "@deepseek-ai/dsh-tools";
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { unzipSync } from "fflate";
//#region src/core/office.ts
const OFFICE_EXTENSIONS = /* @__PURE__ */ new Set([
	"docx",
	"xlsx",
	"pptx"
]);
/** Extract bounded plain text from Open XML Office files without executing macros. */
async function extractOfficeText(name, data, maxChars) {
	const extension = name.split(".").pop()?.toLowerCase() ?? "";
	if (!OFFICE_EXTENSIONS.has(extension)) throw new Error("unsupported Office attachment");
	let archive;
	try {
		archive = unzipSync(data, { filter: (file) => wantedXml(extension, file.name) });
	} catch {
		throw new Error("Office attachment is not a valid Open XML document");
	}
	const names = Object.keys(archive).sort(naturalCompare);
	const sections = [];
	let remaining = maxChars;
	for (const path of names) {
		if (remaining <= 0) break;
		const bytes = archive[path];
		if (bytes === void 0 || bytes.byteLength > 8 * 1024 * 1024) continue;
		const text = xmlToText(new TextDecoder("utf-8", { fatal: true }).decode(bytes)).trim();
		if (text === "") continue;
		const chunk = `${officeHeading(extension, path)}\n${text}`.slice(0, remaining);
		sections.push(chunk);
		remaining -= chunk.length + 2;
	}
	if (sections.length === 0) throw new Error("Office attachment contains no readable text");
	return sections.join("\n\n");
}
function wantedXml(extension, path) {
	if (extension === "docx") return path === "word/document.xml" || /^word\/(?:footnotes|endnotes|comments)\.xml$/u.test(path);
	if (extension === "xlsx") return path === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/u.test(path);
	return /^ppt\/slides\/slide\d+\.xml$/u.test(path) || /^ppt\/notesSlides\/notesSlide\d+\.xml$/u.test(path);
}
function xmlToText(xml) {
	return decodeEntities(xml.replace(/<w:tab\b[^>]*\/>/gu, "	").replace(/<w:br\b[^>]*\/>/gu, "\n").replace(/<a:br\b[^>]*\/>/gu, "\n").replace(/<\/w:p>/gu, "\n").replace(/<\/a:p>/gu, "\n").replace(/<\/row>/gu, "\n").replace(/<\/c>/gu, "	").replace(/<[^>]+>/gu, "")).replace(/[ \t]+\n/gu, "\n").replace(/\n{3,}/gu, "\n\n").trim();
}
function decodeEntities(value) {
	return value.replace(/&#(\d+);/gu, (_match, code) => String.fromCodePoint(Number(code))).replace(/&#x([0-9a-f]+);/giu, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16))).replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", "\"").replaceAll("&apos;", "'").replaceAll("&amp;", "&");
}
function officeHeading(extension, path) {
	if (extension === "docx") return `[Word: ${path.split("/").pop()}]`;
	if (extension === "xlsx") return `[Excel: ${path.split("/").pop()}]`;
	return `[PowerPoint: ${path.split("/").pop()}]`;
}
function naturalCompare(left, right) {
	return left.localeCompare(right, void 0, { numeric: true });
}
Object.freeze([
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif"
]);
new Set(Object.values({
	docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
}));
function extensionOf(basename) {
	const dot = basename.lastIndexOf(".");
	if (dot <= 0 || dot === basename.length - 1) return "";
	return basename.slice(dot + 1).toLowerCase();
}
const SENSITIVE_NAME_FRAGMENTS = [
	"credentials",
	"client-secret",
	"client_secret",
	"client-secrets",
	"client_secrets",
	"private-key",
	"private_key",
	"secrets"
];
const PRIVATE_KEY_BASENAME = /^(?:id_rsa|id_dsa|id_ecdsa|id_ed25519)(?:_sk)?(?:\.pub)?$/u;
const SENSITIVE_KEY_EXTENSIONS = /* @__PURE__ */ new Set([
	"pem",
	"key",
	"p12",
	"pfx"
]);
/**
* True when the basename looks like an env file, private key, or credential dump.
* Path directories are ignored; mcp.json / settings.json / config.json stay allowed.
* @param basename - last path segment only.
*/
function isSensitiveBasename(basename) {
	const name = basename.trim();
	if (name.length === 0) return false;
	const lower = name.toLowerCase();
	if (lower === ".env" || lower.startsWith(".env.")) return true;
	if (lower === ".npmrc" || lower === ".pypirc") return true;
	if (PRIVATE_KEY_BASENAME.test(lower)) return true;
	const extension = extensionOf(name);
	if (SENSITIVE_KEY_EXTENSIONS.has(extension)) return true;
	const folded = lower.replace(/[._]+/gu, "-");
	for (const fragment of SENSITIVE_NAME_FRAGMENTS) {
		const needle = fragment.replace(/_/gu, "-");
		if (lower.includes(fragment) || folded.includes(needle)) return true;
	}
	return false;
}
//#endregion
//#region src/core/store.ts
const ID_PATTERN = /^file_[0-9a-f]{32}$/u;
const MAX_STORED_BYTES = 20 * 1024 * 1024;
const MAX_EXTRACTED_CHARS = 1024 * 1024;
const DEFAULT_LINES = 200;
const MAX_LINES = 500;
var FileAttachmentStore = class {
	root;
	constructor(root = join(process.env.DSH_HOME?.trim() || join(homedir(), ".dsh"), "desktop", "file-attachments", "v1")) {
		this.root = root;
	}
	async save(input) {
		validateUpload(input);
		const data = Buffer.from(input.base64, "base64");
		if (data.byteLength !== input.bytes) throw new Error("attachment byte length does not match payload");
		if (data.byteLength === 0 || data.byteLength > MAX_STORED_BYTES) throw new Error("attachment size is outside the supported range");
		const id = `file_${randomUUID().replaceAll("-", "")}`;
		const directory = join(this.root, id);
		const digest = createHash("sha256").update(data).digest("hex");
		const attachment = {
			id,
			name: basename(input.name),
			mediaType: input.mediaType,
			bytes: data.byteLength,
			kind: input.kind,
			redacted: input.redacted
		};
		const metadata = {
			...attachment,
			sha256: digest,
			createdAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		await mkdir(directory, {
			recursive: true,
			mode: 448
		});
		await atomicWrite(join(directory, "content.bin"), data);
		await atomicWrite(join(directory, "metadata.json"), Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`));
		return attachment;
	}
	async read(id, options = {}) {
		if (!ID_PATTERN.test(id)) throw new Error("invalid attachment id");
		const directory = join(this.root, id);
		const metadata = JSON.parse(await readFile(join(directory, "metadata.json"), "utf8"));
		validateMetadata(metadata, id);
		const data = await readFile(join(directory, "content.bin"));
		if (data.byteLength !== metadata.bytes) throw new Error("stored attachment size mismatch");
		if (createHash("sha256").update(data).digest("hex") !== metadata.sha256) throw new Error("stored attachment integrity check failed");
		const lines = (metadata.kind === "office" ? await extractOfficeText(metadata.name, data, MAX_EXTRACTED_CHARS) : decodeText(data)).replace(/\r\n?/gu, "\n").split("\n");
		const startLine = clampInteger(options.startLine, 1, Math.max(1, lines.length), 1);
		const maxLines = clampInteger(options.maxLines, 1, MAX_LINES, DEFAULT_LINES);
		const selected = lines.slice(startLine - 1, startLine - 1 + maxLines);
		const endLine = Math.min(lines.length, startLine + selected.length - 1);
		return {
			attachment: stripMetadata(metadata),
			text: selected.join("\n"),
			startLine,
			endLine,
			totalLines: lines.length,
			truncated: endLine < lines.length
		};
	}
	async resolve(selector = {}) {
		if (selector.attachmentId !== void 0) return this.metadata(selector.attachmentId);
		const requestedName = selector.name === void 0 ? void 0 : basename(selector.name);
		if (selector.name !== void 0 && (requestedName === "" || requestedName !== selector.name)) throw new Error("invalid attachment name");
		const entries = await readdir(this.root, { withFileTypes: true }).catch((error) => {
			if (error.code === "ENOENT") return [];
			throw error;
		});
		const candidates = [];
		for (const entry of entries) {
			if (!entry.isDirectory() || !ID_PATTERN.test(entry.name)) continue;
			try {
				const metadata = await this.storedMetadata(entry.name);
				if (requestedName === void 0 || metadata.name === requestedName) candidates.push(metadata);
			} catch {}
		}
		candidates.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
		if (candidates.length === 0) throw new Error(requestedName === void 0 ? "no file attachment is available" : `attachment not found: ${requestedName}`);
		return stripMetadata(candidates[0]);
	}
	async readSelected(selector = {}, options = {}) {
		const attachment = await this.resolve(selector);
		return this.read(attachment.id, options);
	}
	async metadata(id) {
		return stripMetadata(await this.storedMetadata(id));
	}
	async storedMetadata(id) {
		if (!ID_PATTERN.test(id)) throw new Error("invalid attachment id");
		const metadata = JSON.parse(await readFile(join(this.root, id, "metadata.json"), "utf8"));
		validateMetadata(metadata, id);
		return metadata;
	}
};
function validateUpload(input) {
	if (input === null || typeof input !== "object") throw new TypeError("invalid attachment upload");
	const name = basename(input.name);
	if (name === "" || name !== input.name || isSensitiveBasename(name)) throw new Error("unsafe attachment name");
	if (input.kind !== "text" && input.kind !== "office") throw new Error("unsupported attachment kind");
	if (!Number.isSafeInteger(input.bytes) || input.bytes < 1 || input.bytes > MAX_STORED_BYTES) throw new Error("invalid attachment size");
	if (typeof input.mediaType !== "string" || input.mediaType.length > 160) throw new Error("invalid attachment media type");
	if (typeof input.base64 !== "string" || input.base64.length > Math.ceil(MAX_STORED_BYTES * 4 / 3) + 8) throw new Error("invalid attachment payload");
}
function validateMetadata(metadata, id) {
	if (metadata.id !== id || !ID_PATTERN.test(metadata.id)) throw new Error("stored attachment metadata is invalid");
	if (basename(metadata.name) !== metadata.name || isSensitiveBasename(metadata.name)) throw new Error("stored attachment name is invalid");
	if (!/^[0-9a-f]{64}$/u.test(metadata.sha256)) throw new Error("stored attachment digest is invalid");
}
function decodeText(data) {
	const text = new TextDecoder("utf-8", { fatal: true }).decode(data);
	if (text.includes("\0")) throw new Error("attachment is not valid text");
	return text.charCodeAt(0) === 65279 ? text.slice(1) : text;
}
function clampInteger(value, min, max, fallback) {
	if (!Number.isSafeInteger(value)) return fallback;
	return Math.min(max, Math.max(min, value));
}
function stripMetadata(metadata) {
	const { id, name, mediaType, bytes, kind, redacted } = metadata;
	return {
		id,
		name,
		mediaType,
		bytes,
		kind,
		redacted
	};
}
async function atomicWrite(path, data) {
	const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
	await writeFile(temporary, data, {
		flag: "wx",
		mode: 384
	});
	await rename(temporary, path);
	if (!(await stat(path)).isFile()) throw new Error("attachment storage did not create a regular file");
}
//#endregion
//#region src/wire.ts
/** Shared browser/Host protocol for tool-readable local file attachments. */
const FILE_ATTACHMENT_RPC_CHANNEL = "/dsh-text-context-files-v1";
//#endregion
//#region src/index.ts
const name = "text-context";
const inject = [
	"connection",
	"tools",
	"systemPrompt"
];
function apply(ctx) {
	const store = new FileAttachmentStore();
	const connectorImports = [];
	ctx.effect(() => ctx.connection.rpc.handle(FILE_ATTACHMENT_RPC_CHANNEL, async (endpoint, payload) => {
		try {
			if (endpoint === "upload") return {
				ok: true,
				value: { attachment: await store.save(payload) }
			};
			if (endpoint === "take-connector-import") {
				pruneConnectorImports(connectorImports);
				const request = connectorImports.shift();
				return {
					ok: true,
					value: request === void 0 ? {} : { request: stripCreatedAt(request) }
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
	}, { authority: "loopback" }), "dsh-text-context: file upload rpc");
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "attachment_read",
		description: "Read a local file attachment referenced in the user message. Supports bounded UTF-8 text plus docx/xlsx/pptx text extraction. Select by file name, or omit both selectors to read the newest attachment. Use startLine/maxLines for paging.",
		parameters: {
			attachmentId: {
				type: "string",
				description: "Optional opaque file_* id returned by a previous tool result."
			},
			name: {
				type: "string",
				description: "Optional visible attachment file name. The newest matching attachment is used."
			},
			startLine: {
				type: "integer",
				description: "First 1-based extracted text line. Defaults to 1."
			},
			maxLines: {
				type: "integer",
				description: "Number of lines to return, 1-500. Defaults to 200."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: true
			},
			render: (_args, value) => [{
				type: "text",
				text: renderReadResult(value)
			}]
		},
		execute: async (args) => await store.readSelected({
			attachmentId: args.attachmentId,
			name: args.name
		}, {
			startLine: args.startLine,
			maxLines: args.maxLines
		})
	})), "dsh-text-context: attachment_read tool");
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "connector_import_prepare",
		description: "Prepare an attached MCP JSON configuration for the desktop Connector Center. Use this immediately when the user asks to add, configure, or import MCP servers from an attached mcp.json. If the user names specific servers, pass those names or keywords in requestedServerNames so only matching entries are selected. Select by file name, or omit both selectors for the newest attachment. This opens the controlled preview flow; do not search settings files, app.asar, node_modules, web endpoints, or credentials first.",
		parameters: {
			attachmentId: {
				type: "string",
				description: "Optional opaque file_* id returned by a previous tool result."
			},
			name: {
				type: "string",
				description: "Optional visible attachment file name."
			},
			requestedServerNames: {
				type: "array",
				items: { type: "string" },
				description: "Optional MCP server names or distinctive keywords explicitly requested by the user, for example [\"tapd\"]."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: true
			},
			render: (_args, value) => [{
				type: "text",
				text: renderConnectorImportResult(value)
			}]
		},
		execute: async (args, exec) => {
			const read = await store.readSelected({
				attachmentId: args.attachmentId,
				name: args.name
			}, {
				startLine: 1,
				maxLines: 500
			});
			if (read.truncated) throw new Error("MCP configuration is too large to validate safely");
			assertMcpDocument(read.attachment.name, read.text);
			pruneConnectorImports(connectorImports);
			connectorImports.push({
				requestId: randomUUID(),
				attachmentId: read.attachment.id,
				name: read.attachment.name,
				...normalizeRequestedServerNames(args.requestedServerNames),
				createdAt: Date.now()
			});
			exec.concludeTurn();
			return {
				prepared: true,
				name: read.attachment.name
			};
		}
	})), "dsh-text-context: connector_import_prepare tool");
	ctx.effect(() => ctx.systemPrompt.section({
		name: "plugin:file-attachments",
		order: 145,
		text: "Messages may contain a plain “File attachment: <name>” marker. It is a local file reference, not file content. Use attachment_read with the visible name, or omit selectors for the newest attachment. When the user asks to add or configure MCP from an attached JSON file, call connector_import_prepare immediately; if the user names one or more target servers, include those names or distinctive keywords in requestedServerNames so unrelated entries are not selected. Do not search settings.yaml, app.asar, node_modules, user client configs, or provider web APIs. The desktop then opens a controlled Connector Center preview and the turn must end. Text configuration files exposed to the model are redacted; hidden credentials are available only to the encrypted connector runtime. Never ask the user to paste tokens or cookies into chat, and never use Bash, curl, Search, or browser probing as a substitute for an MCP connector. If a saved connector has no registered MCP tools, report its Connector Center diagnostic instead. Images continue through the native image attachment path."
	}), "dsh-text-context: agent guidance");
}
function assertMcpDocument(name, text) {
	if (!/\.jsonc?$/iu.test(name)) throw new Error("only MCP JSON attachments can be prepared for Connector Center");
	let value;
	try {
		value = JSON.parse(text);
	} catch {
		throw new Error("MCP attachment is not valid JSON");
	}
	const servers = value?.mcpServers;
	if (servers === null || typeof servers !== "object" || Array.isArray(servers)) throw new Error("MCP attachment must contain an mcpServers object");
}
function pruneConnectorImports(queue) {
	const cutoff = Date.now() - 900 * 1e3;
	while (queue.length > 0 && queue[0].createdAt < cutoff) queue.shift();
	if (queue.length > 8) queue.splice(0, queue.length - 8);
}
function stripCreatedAt(request) {
	const { requestId, attachmentId, name, requestedServerNames } = request;
	return {
		requestId,
		attachmentId,
		name,
		...requestedServerNames === void 0 ? {} : { requestedServerNames }
	};
}
function normalizeRequestedServerNames(value) {
	if (value === void 0) return {};
	if (!Array.isArray(value) || value.length === 0 || value.length > 16) throw new TypeError("requestedServerNames must contain 1-16 server names");
	return { requestedServerNames: [...new Set(value.map((item) => {
		if (typeof item !== "string") throw new TypeError("requestedServerNames must contain strings");
		const name = item.trim();
		if (name.length === 0 || name.length > 128 || /[\u0000-\u001f\u007f]/u.test(name)) throw new TypeError("requested server name is invalid");
		return name;
	}))] };
}
function renderConnectorImportResult(value) {
	return value.prepared ? `${value.name} is ready in Connector Center. Review the detected servers and credentials, then confirm Save and connect.` : "Connector import could not be prepared.";
}
function renderReadResult(value) {
	const header = `${value.attachment.name} (${value.attachment.mediaType}, ${value.attachment.bytes} bytes${value.attachment.redacted ? ", redacted" : ""})`;
	const range = `lines ${value.startLine}-${value.endLine} of ${value.totalLines}${value.truncated ? "; more available" : ""}`;
	const nextAction = /"mcpServers"\s*:/u.test(value.text) ? `\n\nMCP configuration detected. If the user asked to configure or import it, call connector_import_prepare with attachmentId ${value.attachment.id} now; do not inspect application internals.` : "";
	return `${header}\n${range}\n\n${value.text}${nextAction}`;
}
function safeError(error) {
	return (error instanceof Error ? error.message : "attachment operation failed").replace(/(authorization|api[_-]?key|token|secret)\s*[:=]\s*\S+/giu, "$1=<REDACTED>").slice(0, 300);
}
//#endregion
export { apply, inject, name };
