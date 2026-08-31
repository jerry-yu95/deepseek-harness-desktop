window.__ModuleLoader__.load({
	id: "@linxin666/dsh-text-context",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region src/wire.ts
		/** Shared browser/Host protocol for tool-readable local file attachments. */
		const FILE_ATTACHMENT_RPC_CHANNEL = "/dsh-text-context-files-v1";
		//#endregion
		//#region src/client/api.ts
		var TextContextClientApi = class {
			connection;
			constructor(connection) {
				this.connection = connection;
			}
			async upload(input, signal) {
				const result = await this.connection.rpc.call(FILE_ATTACHMENT_RPC_CHANNEL, "upload", input, signal);
				if (!result.ok) throw new Error(result.error.message);
				const value = result.value;
				if ("error" in value) throw new Error(value.error);
				return value.attachment;
			}
			async takeConnectorImport(signal) {
				const result = await this.connection.rpc.call(FILE_ATTACHMENT_RPC_CHANNEL, "take-connector-import", {}, signal);
				if (!result.ok) throw new Error(result.error.message);
				const value = result.value;
				if (value.error !== void 0) throw new Error(value.error);
				return value.request;
			}
		};
		//#endregion
		//#region src/client/connector-import.ts
		const CONNECTOR_IMPORT_EVENT = "dsh:connector-import-preview";
		const MAX_SOURCES = 8;
		const SOURCE_TTL_MS = 900 * 1e3;
		const sources = /* @__PURE__ */ new Map();
		function rememberConnectorImportSource(attachment, text) {
			pruneSources();
			sources.set(attachment.id, {
				text,
				name: attachment.name,
				createdAt: Date.now()
			});
			while (sources.size > MAX_SOURCES) {
				const oldest = sources.keys().next().value;
				if (oldest === void 0) break;
				sources.delete(oldest);
			}
		}
		function installConnectorImportBridge(api, doc = document, intervalMs = 500) {
			let disposed = false;
			let polling = false;
			const poll = async () => {
				if (disposed || polling) return;
				polling = true;
				try {
					const request = await api.takeConnectorImport();
					if (request === void 0 || disposed) return;
					pruneSources();
					const source = sources.get(request.attachmentId);
					if (source === void 0) return;
					sources.delete(request.attachmentId);
					doc.dispatchEvent(new CustomEvent(CONNECTOR_IMPORT_EVENT, { detail: {
						text: source.text,
						name: source.name,
						requestId: request.requestId,
						...request.requestedServerNames === void 0 ? {} : { requestedServerNames: request.requestedServerNames }
					} }));
				} catch {} finally {
					polling = false;
				}
			};
			const timer = setInterval(() => {
				poll();
			}, intervalMs);
			poll();
			return () => {
				disposed = true;
				clearInterval(timer);
			};
		}
		function pruneSources() {
			const cutoff = Date.now() - SOURCE_TTL_MS;
			for (const [id, source] of sources) if (source.createdAt < cutoff) sources.delete(id);
		}
		//#endregion
		//#region src/core/classify.ts
		/**
		* Classify dropped or pasted files so the capture listener can decide
		* whether to pass through to the official image path, intercept as text,
		* or reject as unsupported.
		*/
		/** Official image MIME types that normally stay on the official image path. */
		const OFFICIAL_IMAGE_MIME_TYPES = Object.freeze([
			"image/png",
			"image/jpeg",
			"image/webp",
			"image/gif"
		]);
		const TEXT_EXTENSION_SYNTAX = {
			json: "json",
			jsonc: "jsonc",
			md: "markdown",
			markdown: "markdown",
			txt: "text",
			csv: "csv",
			xml: "xml",
			yaml: "yaml",
			yml: "yaml"
		};
		const TEXT_MIME_SYNTAX = {
			"application/json": "json",
			"application/jsonc": "jsonc",
			"text/json": "json",
			"text/x-json": "json",
			"text/markdown": "markdown",
			"text/x-markdown": "markdown",
			"text/plain": "text",
			"text/csv": "csv",
			"application/csv": "csv",
			"text/xml": "xml",
			"application/xml": "xml",
			"application/yaml": "yaml",
			"application/x-yaml": "yaml",
			"text/yaml": "yaml",
			"text/x-yaml": "yaml"
		};
		const IMAGE_EXTENSIONS = /* @__PURE__ */ new Set([
			"png",
			"jpeg",
			"jpg",
			"webp",
			"gif"
		]);
		const OFFICE_EXTENSION_MIME = {
			docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
		};
		const OFFICE_MIMES = new Set(Object.values(OFFICE_EXTENSION_MIME));
		const BLOCKED_EXTENSIONS = /* @__PURE__ */ new Set([
			"pdf",
			"doc",
			"xls",
			"ppt",
			"zip",
			"rar",
			"7z",
			"gz",
			"tgz",
			"tar",
			"bz2",
			"xz",
			"exe",
			"dmg",
			"app",
			"bin",
			"dll",
			"so",
			"wasm",
			"class",
			"jar",
			"apk",
			"iso",
			"msi",
			"scr",
			"com"
		]);
		/**
		* Last path segment only; never expose a local directory.
		* @param name - File.name as provided by the browser.
		*/
		function fileBasename(name) {
			const base = name.replace(/\\/g, "/").split("/").pop() ?? "";
			return base.length > 0 ? base : "file";
		}
		/**
		* Lowercase MIME without parameters (`application/json; charset=utf-8` -> `application/json`).
		* @param type - File.type.
		*/
		function normalizeMime(type) {
			return type.split(";", 1)[0]?.trim().toLowerCase() ?? "";
		}
		function extensionOf(basename) {
			const dot = basename.lastIndexOf(".");
			if (dot <= 0 || dot === basename.length - 1) return "";
			return basename.slice(dot + 1).toLowerCase();
		}
		function isOfficialImageMime(mime) {
			return OFFICIAL_IMAGE_MIME_TYPES.includes(mime);
		}
		function isGenericBinaryMime(mime) {
			return mime === "application/octet-stream" || mime === "binary/octet-stream";
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
		/**
		* Classify one file. Sensitive basenames are blocked first. A known safe-text
		* extension then wins over an incorrect OS/Electron image MIME declaration;
		* strict UTF-8/binary validation still runs before the text reaches a draft.
		* This covers Finder/clipboard bridges that report `mcp.json` as an image.
		* @param file - dropped or pasted file.
		*/
		function classifyFile(file) {
			const basename = fileBasename(file.name);
			const mime = normalizeMime(file.type);
			const extension = extensionOf(basename);
			if (isSensitiveBasename(basename)) return {
				kind: "sensitive-file",
				basename
			};
			const extensionSyntax = TEXT_EXTENSION_SYNTAX[extension];
			if (extensionSyntax !== void 0 && (mime.length === 0 || isOfficialImageMime(mime) || isGenericBinaryMime(mime))) return {
				kind: "text",
				syntax: extensionSyntax,
				mime: TEXT_MIME_SYNTAX[mime] === void 0 ? mimeForSyntax(extensionSyntax, extension) : mime,
				basename
			};
			if (isOfficialImageMime(mime)) return { kind: "image" };
			const officeMime = OFFICE_EXTENSION_MIME[extension];
			if (officeMime !== void 0 && (mime.length === 0 || isGenericBinaryMime(mime) || mime === officeMime)) return {
				kind: "office",
				mime: officeMime,
				basename
			};
			if (OFFICE_MIMES.has(mime) && officeMime !== void 0) return {
				kind: "office",
				mime,
				basename
			};
			if (mime.length > 0) {
				const syntax = TEXT_MIME_SYNTAX[mime];
				if (syntax !== void 0) return {
					kind: "text",
					syntax,
					mime,
					basename
				};
				return { kind: "unsupported" };
			}
			if (IMAGE_EXTENSIONS.has(extension)) return { kind: "image" };
			if (BLOCKED_EXTENSIONS.has(extension)) return { kind: "unsupported" };
			return { kind: "unsupported" };
		}
		function mimeForSyntax(syntax, extension) {
			if (syntax === "json" || syntax === "jsonc") return "application/json";
			if (syntax === "markdown") return "text/markdown";
			if (syntax === "csv") return "text/csv";
			if (syntax === "xml") return "application/xml";
			if (syntax === "yaml") return "application/yaml";
			if (extension === "txt") return "text/plain";
			return "text/plain";
		}
		//#endregion
		//#region src/core/limits.ts
		/** Size and batch limits for safe text attachments. */
		/** Single safe-text ceiling (1 MiB); content reaches the model only through a paged tool. */
		const MAX_FILE_BYTES = 1024 * 1024;
		/** Single Open XML Office document ceiling (20 MiB). */
		const MAX_OFFICE_BYTES = 20 * 1024 * 1024;
		/** Combined ceiling for one paste or drop (40 MiB). */
		const MAX_TOTAL_BYTES = 40 * 1024 * 1024;
		/** Replacement token written in place of sensitive field values. */
		const REDACTED_VALUE = "<REDACTED>";
		/** Product defaults. */
		const DEFAULT_LIMITS = {
			maxFiles: 4,
			maxFileBytes: MAX_FILE_BYTES,
			maxOfficeBytes: MAX_OFFICE_BYTES,
			maxTotalBytes: MAX_TOTAL_BYTES
		};
		/**
		* Check count / per-file / total size before reading bytes.
		* @param files - file-like objects with a byte size.
		* @param limits - ceilings to apply.
		* @returns the first limit that failed, or undefined when the batch is within bounds.
		*/
		function batchLimitError(files, limits = DEFAULT_LIMITS) {
			if (files.length > limits.maxFiles) return "too-many";
			if (files.some((file) => file.size > (file.kind === "office" ? limits.maxOfficeBytes ?? 20971520 : limits.maxFileBytes))) return "too-large";
			if (files.reduce((sum, file) => sum + file.size, 0) > limits.maxTotalBytes) return "total-too-large";
		}
		//#endregion
		//#region src/core/read-text.ts
		const UTF8_BOM = [
			239,
			187,
			191
		];
		/**
		* Decode file bytes as UTF-8. Does not persist content.
		* @param file - browser File.
		* @param maxBytes - per-file ceiling.
		*/
		async function readTextFile(file, maxBytes) {
			if (file.size > maxBytes) return {
				ok: false,
				reason: "too-large"
			};
			let bytes;
			try {
				bytes = await readBlobBytes(file);
			} catch {
				return {
					ok: false,
					reason: "utf8"
				};
			}
			if (bytes.byteLength > maxBytes) return {
				ok: false,
				reason: "too-large"
			};
			let offset = 0;
			if (bytes.length >= 3 && bytes[0] === UTF8_BOM[0] && bytes[1] === UTF8_BOM[1] && bytes[2] === UTF8_BOM[2]) offset = 3;
			let text;
			try {
				text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(offset));
			} catch {
				return {
					ok: false,
					reason: "utf8"
				};
			}
			if (text.includes("\0")) return {
				ok: false,
				reason: "binary"
			};
			if (looksBinary(text)) return {
				ok: false,
				reason: "binary"
			};
			if (text.charCodeAt(0) === 65279) text = text.slice(1);
			return {
				ok: true,
				text,
				bytes: bytes.byteLength
			};
		}
		/**
		* Read blob bytes even when File.arrayBuffer is missing (some test hosts).
		* @param file - File or Blob.
		*/
		async function readBlobBytes(file) {
			if (typeof file.arrayBuffer === "function") return new Uint8Array(await file.arrayBuffer());
			if (typeof FileReader === "function") return await new Promise((resolve, reject) => {
				const reader = new FileReader();
				reader.onload = () => {
					if (reader.result instanceof ArrayBuffer) resolve(new Uint8Array(reader.result));
					else reject(/* @__PURE__ */ new TypeError("expected ArrayBuffer"));
				};
				reader.onerror = () => {
					reject(reader.error ?? /* @__PURE__ */ new TypeError("read failed"));
				};
				reader.readAsArrayBuffer(file);
			});
			throw new TypeError("no binary reader available");
		}
		/**
		* Reject payloads that are mostly C0 controls (excluding tab / LF / CR).
		* @param text - already-decoded UTF-8.
		*/
		function looksBinary(text) {
			let control = 0;
			for (let i = 0; i < text.length; i += 1) {
				const code = text.charCodeAt(i);
				if (code < 32 && code !== 9 && code !== 10 && code !== 13) control += 1;
			}
			if (control === 0) return false;
			return control > 8 || control / Math.max(text.length, 1) > .02;
		}
		//#endregion
		//#region src/core/sensitive-key.ts
		/**
		* Sensitive field-name matching: case, separators, and compound suffixes.
		* Uses trailing word segments so tokenCount / maxTokens / secretary stay clean.
		*/
		/** Canonical names after case-fold and separator strip. */
		const SENSITIVE_CANONICAL = /* @__PURE__ */ new Set([
			"token",
			"accesstoken",
			"refreshtoken",
			"personalaccesstoken",
			"apikey",
			"secret",
			"clientsecret",
			"password",
			"authorization",
			"cookie",
			"privatekey",
			"bearertoken",
			"credential",
			"credentials",
			"pat",
			"awsaccesskeyid",
			"awssecretaccesskey",
			"awssessiontoken",
			"awssecuritytoken",
			"azureclientsecret",
			"googleapplicationcredentials",
			"secretaccesskey",
			"accesskeyid"
		]);
		/**
		* Fold a field name: lowercase, drop spaces / underscores / hyphens / dots.
		* @param key - object key, YAML key, or env var name.
		*/
		function normalizeKey(key) {
			return key.toLowerCase().replace(/[\s_.-]+/gu, "");
		}
		/**
		* Split a key into alphanumeric word segments (snake, kebab, and camelCase).
		* @param key - original field name.
		*/
		function keySegments(key) {
			const pieces = key.split(/[^A-Za-z0-9]+/u).filter((part) => part.length > 0);
			const segs = [];
			for (const piece of pieces) {
				const split = piece.replace(/([a-z0-9])([A-Z])/gu, "$1\0$2").replace(/([A-Z]+)([A-Z][a-z])/gu, "$1\0$2");
				for (const bit of split.split("\0")) if (bit.length > 0) segs.push(bit.toLowerCase());
			}
			return segs;
		}
		/**
		* Whether this object / YAML / env key should have its value hidden.
		* Matches exact canonical names and trailing compound suffixes
		* (OPENAI_API_KEY, GITHUB_PERSONAL_ACCESS_TOKEN), not substrings like secretary.
		* @param key - field name.
		*/
		function isSensitiveKey(key) {
			if (key.length === 0) return false;
			const folded = normalizeKey(key);
			if (SENSITIVE_CANONICAL.has(folded)) return true;
			const segs = keySegments(key);
			if (segs.length === 0) return false;
			let suffix = "";
			for (let i = segs.length - 1; i >= 0; i -= 1) {
				suffix = `${segs[i]}${suffix}`;
				if (SENSITIVE_CANONICAL.has(suffix)) return true;
			}
			return false;
		}
		/**
		* Flag name inside a CLI argument, without leading dashes or `=value`.
		* @param arg - one argv element, e.g. `--token` or `--api-key=...`.
		*/
		function cliFlagName(arg) {
			if (!arg.startsWith("-")) return void 0;
			const stripped = arg.replace(/^-+/u, "");
			if (stripped.length === 0) return void 0;
			const eq = stripped.indexOf("=");
			const name = eq === -1 ? stripped : stripped.slice(0, eq);
			return name.length > 0 ? name : void 0;
		}
		/**
		* Whether this argv element is a sensitive flag (`--token`, `--api-key=...`).
		* Uses the same name rules as object keys, so `--maxTokens` / `--tokenCount` stay clean.
		* @param arg - one argv element.
		*/
		function isSensitiveCliFlag(arg) {
			const name = cliFlagName(arg);
			return name !== void 0 && isSensitiveKey(name);
		}
		/**
		* curl-style header carriers: `--header` / `--Header` and `-H` (not `-h` / help).
		* @param arg - one argv element, with or without `=value`.
		*/
		function isHeaderCarrierArg(arg) {
			const name = cliFlagName(arg);
			if (name === void 0) return false;
			if (name === "H") return true;
			return name.toLowerCase() === "header";
		}
		//#endregion
		//#region src/core/redact.ts
		/**
		* Best-effort redaction of credential-like fields in JSON / JSONC / YAML
		* and conservative env-assignment lines in ordinary text.
		* Never logs or returns the original secret separately from the rewritten text.
		*/
		const YAML_BLOCK_INDICATOR = /^[|>][+-]?(?:\d+)?\s*(?:#.*)?$/u;
		/**
		* Redact according to the file's syntax family.
		* @param text - UTF-8 document body (BOM already stripped).
		* @param syntax - classified syntax.
		*/
		function redactStructured(text, syntax) {
			if (syntax === "json" || syntax === "jsonc") return redactJsonFamily(text, syntax);
			if (syntax === "yaml") {
				const asJson = tryParseAndRedactJson(text);
				if (asJson !== void 0) return asJson;
				return finishTextFamily(text);
			}
			return finishTextFamily(text);
		}
		/**
		* Parse JSON or JSONC, then rewrite; fall back to conservative key-value edits.
		* Unparseable documents that still contain sensitive keys or flags are blocked
		* when those values cannot be rewritten reliably.
		* @param text - original document.
		* @param syntax - json vs jsonc (comments stripped only for jsonc).
		*/
		function redactJsonFamily(text, syntax) {
			const stripped = syntax === "jsonc" ? stripJsonc(text) : text;
			for (const candidate of [stripped, stripTrailingCommas(stripped)]) {
				const parsed = tryParseAndRedactJson(candidate);
				if (parsed !== void 0) return parsed;
			}
			let current = {
				text,
				redacted: false,
				blocked: false
			};
			current = applyPass(current, redactPlaintextKeys);
			current = applyPass(current, redactUnquotedKeys);
			current = applyPass(current, redactCliFlagsInText);
			current = applyPass(current, redactInlineArgvSecrets);
			current = applyPass(current, redactEnvAssignments);
			current = applyPass(current, redactYamlInlineMaps);
			return finish(current, true, true);
		}
		function finishTextFamily(text) {
			let current = {
				text,
				redacted: false,
				blocked: false
			};
			current = applyPass(current, redactYamlLines);
			current = applyPass(current, redactYamlInlineMaps);
			current = applyPass(current, redactEnvAssignments);
			current = applyPass(current, redactCliFlagsInText);
			current = applyPass(current, redactInlineArgvSecrets);
			return finish(current, false, true);
		}
		function tryParseAndRedactJson(text) {
			try {
				const rewritten = redactUnknown(JSON.parse(text));
				return finish({
					text: `${JSON.stringify(rewritten.value, null, 2)}\n`,
					redacted: rewritten.redacted,
					blocked: false
				}, false, true);
			} catch {
				return;
			}
		}
		function redactUnknown(value) {
			if (typeof value === "string") return redactArgvString(value);
			if (Array.isArray(value)) return redactCliArgList(value);
			if (value !== null && typeof value === "object") {
				const next = {};
				let redacted = false;
				for (const [key, nested] of Object.entries(value)) {
					if (isSensitiveKey(key)) {
						next[key] = REDACTED_VALUE;
						redacted = true;
						continue;
					}
					const inner = redactUnknown(nested);
					next[key] = inner.value;
					redacted = redacted || inner.redacted;
				}
				return {
					value: next,
					redacted
				};
			}
			return {
				value,
				redacted: false
			};
		}
		/**
		* Rewrite sensitive CLI flags in an argv-style array (`--token value`, `--api-key=value`).
		* @param items - parsed JSON array (nested objects are still walked).
		*/
		function redactCliArgList(items) {
			const next = items.map((item) => item);
			let redacted = false;
			let i = 0;
			while (i < next.length) {
				const item = next[i];
				if (typeof item !== "string") {
					const inner = redactUnknown(item);
					next[i] = inner.value;
					redacted = redacted || inner.redacted;
					i += 1;
					continue;
				}
				if (isHeaderCarrierArg(item) && !item.includes("=")) {
					const nxt = next[i + 1];
					if (typeof nxt === "string" && !nxt.startsWith("-")) {
						const header = redactHttpHeaderLine(nxt) ?? redactPlainArgvAssignment(nxt);
						if (header.redacted) {
							next[i + 1] = header.value;
							redacted = true;
							i += 2;
							continue;
						}
					}
				}
				if (isSensitiveCliFlag(item) && !item.includes("=")) {
					const nxt = next[i + 1];
					if (nxt !== void 0 && !(typeof nxt === "string" && nxt.startsWith("-"))) {
						if (nxt !== null && typeof nxt === "object") {
							i += 1;
							continue;
						}
						next[i + 1] = REDACTED_VALUE;
						redacted = true;
						i += 2;
						continue;
					}
				}
				const rewritten = redactArgvString(item);
				next[i] = rewritten.value;
				redacted = redacted || rewritten.redacted;
				i += 1;
			}
			return {
				value: next,
				redacted
			};
		}
		const AUTH_SCHEME = /^(Bearer|Basic|Token|Digest)$/iu;
		function looksLikeUrl(arg) {
			return /^[a-z][a-z0-9+.-]*:\/\//iu.test(arg);
		}
		/**
		* Rewrite one argv element: `--flag=value`, `KEY=value`, or `Header: Bearer value`.
		* @param arg - a single CLI argument string.
		*/
		function redactArgvString(arg) {
			const eq = /^(?<dashes>-{1,2})(?<name>[^=]+)=(?<val>[\s\S]*)$/u.exec(arg);
			if (eq?.groups !== void 0) {
				const flagToken = `${eq.groups.dashes}${eq.groups.name}`;
				if (isHeaderCarrierArg(flagToken)) {
					const inner = redactHttpHeaderLine(eq.groups.val) ?? redactPlainArgvAssignment(eq.groups.val);
					if (inner.redacted) return {
						value: `${flagToken}=${inner.value}`,
						redacted: true
					};
					return {
						value: arg,
						redacted: false
					};
				}
				if (isSensitiveKey(eq.groups.name)) return {
					value: `${flagToken}=${REDACTED_VALUE}`,
					redacted: true
				};
			}
			return redactPlainArgvAssignment(arg);
		}
		function redactPlainArgvAssignment(arg) {
			const header = redactHttpHeaderLine(arg);
			if (header !== void 0) return header;
			if (looksLikeUrl(arg)) return {
				value: arg,
				redacted: false
			};
			const env = /^(?<key>[A-Za-z_][A-Za-z0-9_.-]*)=(?<val>[\s\S]*)$/u.exec(arg);
			if (env?.groups !== void 0 && isSensitiveKey(env.groups.key)) return {
				value: `${env.groups.key}=${REDACTED_VALUE}`,
				redacted: true
			};
			return {
				value: arg,
				redacted: false
			};
		}
		function redactHttpHeaderLine(text) {
			const match = /^(?<name>[A-Za-z][A-Za-z0-9_.-]*)\s*:\s*(?<rest>[\s\S]*)$/u.exec(text);
			if (match?.groups === void 0) return void 0;
			if (!isSensitiveKey(match.groups.name)) return void 0;
			const rest = match.groups.rest.trim();
			const scheme = /^(?<kind>Bearer|Basic|Token|Digest)\s+(?<token>[\s\S]*)$/iu.exec(rest);
			if (scheme?.groups !== void 0) return {
				value: `${match.groups.name}: ${scheme.groups.kind} ${REDACTED_VALUE}`,
				redacted: true
			};
			return {
				value: `${match.groups.name}: ${REDACTED_VALUE}`,
				redacted: true
			};
		}
		/**
		* Line-oriented YAML: replace sensitive scalars and collapse block scalars.
		* @param text - YAML document.
		*/
		function redactYamlLines(text) {
			const lines = text.split("\n");
			const out = [];
			let redacted = false;
			let index = 0;
			while (index < lines.length) {
				const line = lines[index] ?? "";
				const match = /^(?<indent>\s*)(?<key>["'][^"']+["']|[A-Za-z0-9_.-]+)(?<sep>\s*:\s*)(?<rest>.*)$/u.exec(line);
				if (match?.groups === void 0) {
					out.push(line);
					index += 1;
					continue;
				}
				if (!isSensitiveKey(match.groups.key.replace(/^['"]|['"]$/gu, ""))) {
					out.push(line);
					index += 1;
					continue;
				}
				redacted = true;
				const trimmed = match.groups.rest.trim();
				out.push(`${match.groups.indent}${match.groups.key}${match.groups.sep}${REDACTED_VALUE}`);
				index += 1;
				if (YAML_BLOCK_INDICATOR.test(trimmed)) index = skipYamlBlock(lines, index, match.groups.indent.length);
			}
			return {
				text: out.join("\n"),
				redacted,
				blocked: false
			};
		}
		function skipYamlBlock(lines, start, baseIndent) {
			let index = start;
			while (index < lines.length) {
				const line = lines[index] ?? "";
				if (line.trim().length === 0) {
					index += 1;
					continue;
				}
				if ((/^\s*/u.exec(line)?.[0].length ?? 0) > baseIndent) {
					index += 1;
					continue;
				}
				break;
			}
			return index;
		}
		/**
		* Conservative env / assignment lines: KEY=value, export KEY="value", KEY: value.
		* Does not rewrite prose that merely mentions the words token or secret.
		* @param text - plaintext, markdown, or leftover YAML.
		*/
		function redactEnvAssignments(text) {
			let redacted = false;
			return {
				text: text.split("\n").map((line) => {
					const match = /^(?<prefix>\s*(?:export\s+)?)(?<key>[A-Za-z_][A-Za-z0-9_.-]*)(?<sep>\s*[=:]\s*)(?<value>.*)$/u.exec(line);
					if (match?.groups === void 0) return line;
					if (!isSensitiveKey(match.groups.key)) return line;
					const trimmed = match.groups.value.trim();
					if (YAML_BLOCK_INDICATOR.test(trimmed)) return line;
					if (trimmed.startsWith("{") || trimmed.startsWith("[")) return line;
					redacted = true;
					return `${match.groups.prefix}${match.groups.key}${match.groups.sep}${quotedRedacted(match.groups.value)}`;
				}).join("\n"),
				redacted,
				blocked: false
			};
		}
		function quotedRedacted(original) {
			const trimmed = original.trimStart();
			if (trimmed.startsWith("\"")) return `"${REDACTED_VALUE}"`;
			if (trimmed.startsWith("'")) return `'${REDACTED_VALUE}'`;
			return REDACTED_VALUE;
		}
		function replaceScalarKeepWs(valueRaw) {
			const lead = /^\s*/u.exec(valueRaw)?.[0] ?? "";
			const trail = /\s*$/u.exec(valueRaw)?.[0] ?? "";
			if (lead.length + trail.length >= valueRaw.length) return valueRaw;
			return `${lead}${quotedRedacted(valueRaw.slice(lead.length, valueRaw.length - trail.length))}${trail}`;
		}
		/**
		* Conservative edits for unparseable JSON: only rewrite values of known keys.
		* Does not scan for token-shaped strings.
		* @param text - original bytes decoded as UTF-8.
		*/
		function redactPlaintextKeys(text) {
			let redacted = false;
			return {
				text: text.replace(/(?<key>"(?:\\.|[^"\\])*")\s*:\s*(?<value>"(?:\\.|[^"\\])*")/gu, (whole, keyQuoted, valueQuoted) => {
					let key;
					try {
						key = JSON.parse(keyQuoted);
					} catch {
						return whole;
					}
					if (!isSensitiveKey(key)) return whole;
					redacted = true;
					return `${keyQuoted}: "${REDACTED_VALUE}"`;
				}),
				redacted,
				blocked: false
			};
		}
		/**
		* Rewrite unquoted `GITHUB_TOKEN: "value"` / `Authorization: value` assignments.
		* Nested `{` / `[` values are left for the unresolved/block check.
		* @param text - unparseable JSON or JS-object literal.
		*/
		function redactUnquotedKeys(text) {
			let redacted = false;
			return {
				text: text.replace(/(^|[{,\s]+)([A-Za-z_][A-Za-z0-9_.-]*)(\s*:\s*)("(?:\\.|[^"\\])*"|'[^']*'|[^\s,}\]]+)/gu, (whole, prefix, key, sep, value) => {
					if (!isSensitiveKey(key)) return whole;
					if (value.startsWith("{") || value.startsWith("[")) return whole;
					redacted = true;
					return `${prefix}${key}${sep}${quotedRedacted(value)}`;
				}),
				redacted,
				blocked: false
			};
		}
		/**
		* Conservative CLI-flag rewrites in raw text (invalid JSON, YAML sequences).
		* @param text - document body.
		*/
		function redactCliFlagsInText(text) {
			let redacted = false;
			let next = text;
			next = next.replace(/(-{1,2})([A-Za-z0-9_.-]+)=("(?:\\.|[^"\\])*"|'[^']*'|[^\s,\]}"']+)/gu, (whole, dashes, name, value) => {
				if (!isSensitiveKey(name)) return whole;
				redacted = true;
				return `${dashes}${name}=${REDACTED_VALUE}`;
			});
			next = next.replace(/(-{1,2})([A-Za-z0-9_.-]+)"(\s*,\s*)"((?:\\.|[^"\\])*)"/gu, (whole, dashes, name, mid, value) => {
				if (!isSensitiveKey(name)) return whole;
				redacted = true;
				return `${dashes}${name}"${mid}"${REDACTED_VALUE}"`;
			});
			next = next.replace(/(-{1,2})([A-Za-z0-9_.-]+)'(\s*,\s*)'([^']*)'/gu, (whole, dashes, name, mid, value) => {
				if (!isSensitiveKey(name)) return whole;
				redacted = true;
				return `${dashes}${name}'${mid}'${REDACTED_VALUE}'`;
			});
			next = next.replace(/(-{1,2})([A-Za-z0-9_.-]+)(\s*,\s*)(?!-|"|')([^\s,\]}]+)/gu, (whole, dashes, name, mid, value) => {
				if (!isSensitiveKey(name)) return whole;
				redacted = true;
				return `${dashes}${name}${mid}${REDACTED_VALUE}`;
			});
			next = next.replace(/(-{1,2})([A-Za-z0-9_.-]+)(\s+)(?!-|"|')([^\s,\]}]+)/gu, (whole, dashes, name, ws, value) => {
				if (!isSensitiveKey(name)) return whole;
				redacted = true;
				return `${dashes}${name}${ws}${REDACTED_VALUE}`;
			});
			return {
				text: next,
				redacted,
				blocked: false
			};
		}
		/**
		* Conservative KEY=value and Header: value rewrites inside raw text.
		* Skips ordinary JSON `"key": "value"` pairs (quoted name then `":`).
		* @param text - document body.
		*/
		function redactInlineArgvSecrets(text) {
			let redacted = false;
			let next = text;
			next = next.replace(/(^|["'\s,\[])([A-Za-z_][A-Za-z0-9_.-]*)=([^\s"'\\,}\]]+)/gu, (whole, prefix, key, value) => {
				if (!isSensitiveKey(key) || isRedactedScalar(value)) return whole;
				redacted = true;
				return `${prefix}${key}=${REDACTED_VALUE}`;
			});
			next = next.replace(/(^|["'\s,\[])([A-Za-z][A-Za-z0-9_.-]*)(\s*:\s*)(Bearer|Basic|Token|Digest)(\s+)([^\s"'\\]+)/gu, (whole, prefix, name, colon, scheme, space, value) => {
				if (!isSensitiveKey(name) || isRedactedScalar(`${scheme} ${value}`)) return whole;
				redacted = true;
				return `${prefix}${name}${colon}${scheme}${space}${REDACTED_VALUE}`;
			});
			next = next.replace(/(^|["'\s,\[])([A-Za-z][A-Za-z0-9_.-]*)(\s*:\s*)([^\s"'\\,}\]]+)/gu, (whole, prefix, name, colon, value) => {
				if (!isSensitiveKey(name) || AUTH_SCHEME.test(value) || isRedactedScalar(value)) return whole;
				redacted = true;
				return `${prefix}${name}${colon}${REDACTED_VALUE}`;
			});
			return {
				text: next,
				redacted,
				blocked: false
			};
		}
		/**
		* Redact one-level YAML/JSON flow mappings `{ Authorization: secret }`.
		* Nested maps under a sensitive key are collapsed; unparseable sensitive maps block.
		* @param text - document body.
		*/
		function redactYamlInlineMaps(text) {
			let current = text;
			let redacted = false;
			let blocked = false;
			for (let guard = 0; guard < 32; guard += 1) {
				let changed = false;
				const next = current.replace(/\{([^{}]*)\}/gu, (whole, inner) => {
					const result = redactFlowInner(inner);
					if (!result.ok) {
						if (flowLooksSensitive(inner)) blocked = true;
						return whole;
					}
					if (result.redacted) {
						redacted = true;
						changed = true;
					}
					return `{${result.inner}}`;
				});
				if (!changed || next === current) {
					current = next;
					break;
				}
				current = next;
			}
			const collapsed = collapseSensitiveNestedFlows(current);
			return {
				text: collapsed.text,
				redacted: redacted || collapsed.redacted,
				blocked: blocked || collapsed.blocked
			};
		}
		function flowLooksSensitive(inner) {
			for (const match of inner.matchAll(/(["']?)([A-Za-z_][A-Za-z0-9_.-]*)\1\s*:/gu)) if (isSensitiveKey(match[2] ?? "")) return true;
			return false;
		}
		function redactFlowInner(inner) {
			const parsed = tryParseFlowMap(inner);
			if (parsed === null) return {
				inner,
				redacted: false,
				ok: false
			};
			let redacted = false;
			let out = "";
			for (const pair of parsed.pairs) {
				out += pair.leading + pair.keyRaw + pair.colon;
				if (isSensitiveKey(pair.key)) {
					redacted = true;
					out += replaceScalarKeepWs(pair.valueRaw);
				} else out += pair.valueRaw;
				out += pair.suffix;
			}
			out += parsed.trailing;
			return {
				inner: out,
				redacted,
				ok: true
			};
		}
		function tryParseFlowMap(inner) {
			let i = 0;
			const n = inner.length;
			const pairs = [];
			const eatWs = () => {
				const start = i;
				while (i < n && /\s/u.test(inner[i] ?? "")) i += 1;
				return inner.slice(start, i);
			};
			const readQuoted = () => {
				const quote = inner[i];
				if (quote !== "\"" && quote !== "'") return null;
				const start = i;
				i += 1;
				while (i < n) {
					if (quote === "\"" && inner[i] === "\\") {
						i += 2;
						continue;
					}
					if (inner[i] === quote) {
						i += 1;
						return inner.slice(start, i);
					}
					i += 1;
				}
				return null;
			};
			const readUnquotedKey = () => {
				if (!/[A-Za-z_]/u.test(inner[i] ?? "")) return null;
				const start = i;
				i += 1;
				while (i < n && /[A-Za-z0-9_.-]/u.test(inner[i] ?? "")) i += 1;
				return inner.slice(start, i);
			};
			while (i < n) {
				const leading = eatWs();
				if (i >= n) return {
					pairs,
					trailing: leading
				};
				let keyRaw;
				let key;
				if (inner[i] === "\"" || inner[i] === "'") {
					const raw = readQuoted();
					if (raw === null) return null;
					keyRaw = raw;
					key = raw.slice(1, -1);
				} else {
					const raw = readUnquotedKey();
					if (raw === null) return null;
					keyRaw = raw;
					key = raw;
				}
				const wsBeforeColon = eatWs();
				if (inner[i] !== ":") return null;
				i += 1;
				const colon = `${wsBeforeColon}:${eatWs()}`;
				if (inner[i] === "{" || inner[i] === "[") return null;
				let valueRaw;
				if (inner[i] === "\"" || inner[i] === "'") {
					const quoted = readQuoted();
					if (quoted === null) return null;
					valueRaw = quoted;
				} else {
					const start = i;
					while (i < n && inner[i] !== ",") i += 1;
					valueRaw = inner.slice(start, i);
				}
				const pair = {
					leading,
					keyRaw,
					key,
					colon,
					valueRaw,
					suffix: ""
				};
				pairs.push(pair);
				const wsAfter = eatWs();
				if (i >= n) return {
					pairs,
					trailing: wsAfter
				};
				if (inner[i] !== ",") return null;
				pair.suffix = ",";
				i += 1;
			}
			return {
				pairs,
				trailing: ""
			};
		}
		function findBalancedBrace(text, openIndex) {
			let depth = 0;
			let inString = null;
			let escape = false;
			for (let i = openIndex; i < text.length; i += 1) {
				const char = text[i] ?? "";
				if (inString !== null) {
					if (escape) {
						escape = false;
						continue;
					}
					if (inString === "\"" && char === "\\") {
						escape = true;
						continue;
					}
					if (char === inString) inString = null;
					continue;
				}
				if (char === "\"" || char === "'") {
					inString = char;
					continue;
				}
				if (char === "{") depth += 1;
				else if (char === "}") {
					depth -= 1;
					if (depth === 0) return i;
				}
			}
			return -1;
		}
		function collapseSensitiveNestedFlows(text) {
			let current = text;
			let redacted = false;
			let blocked = false;
			const pattern = /(["']?)([A-Za-z_][A-Za-z0-9_.-]*)\1(\s*:\s*)\{/gu;
			for (let guard = 0; guard < 32; guard += 1) {
				const matches = [...current.matchAll(pattern)];
				let replaced = false;
				for (let index = matches.length - 1; index >= 0; index -= 1) {
					const match = matches[index];
					if (match?.index === void 0) continue;
					if (!isSensitiveKey(match[2] ?? "")) continue;
					const braceAt = match.index + match[0].length - 1;
					const close = findBalancedBrace(current, braceAt);
					if (close < 0) {
						blocked = true;
						continue;
					}
					current = `${current.slice(0, braceAt)}${REDACTED_VALUE}${current.slice(close + 1)}`;
					redacted = true;
					replaced = true;
					break;
				}
				if (!replaced) break;
			}
			return {
				text: current,
				redacted,
				blocked
			};
		}
		function isRedactedScalar(value) {
			const trimmed = value.trim().replace(/^["']|["']$/gu, "");
			if (trimmed.length === 0) return true;
			if (trimmed === "<REDACTED>") return true;
			if (trimmed === `"<REDACTED>"` || trimmed === `'<REDACTED>'`) return true;
			if (/^(Bearer|Basic|Token|Digest)\s+<REDACTED>$/iu.test(trimmed)) return true;
			return false;
		}
		/**
		* True when a sensitive key, env assignment, header line, or CLI flag still has
		* a value that is not `<REDACTED>`. Used to fail closed instead of inserting secrets.
		* @param text - rewritten document.
		*/
		function hasUnresolvedSensitive(text) {
			for (const match of text.matchAll(/"((?:\\.|[^"\\])*)"\s*:\s*("(?:\\.|[^"\\])*"|'[^']*'|(?:Bearer|Basic|Token|Digest)\s+[^\s,}\]]+|[^\s,}\]]+)/gu)) {
				let key;
				try {
					key = JSON.parse(`"${match[1]}"`);
				} catch {
					key = match[1] ?? "";
				}
				if (isSensitiveKey(key) && !isRedactedScalar(match[2] ?? "")) return true;
			}
			for (const match of text.matchAll(/(?:^|[{,\s])([A-Za-z_][A-Za-z0-9_.-]*)\s*:\s*("(?:\\.|[^"\\])*"|'[^']*'|(?:Bearer|Basic|Token|Digest)\s+[^\s,}\]]+|[^\s,}\]]+)/gu)) if (isSensitiveKey(match[1] ?? "") && !isRedactedScalar(match[2] ?? "")) return true;
			for (const match of text.matchAll(/(?:^|["'\s,\[?])([A-Za-z_][A-Za-z0-9_.-]*)=([^\s"'\\,}\]]+)/gu)) if (isSensitiveKey(match[1] ?? "") && !isRedactedScalar(match[2] ?? "")) return true;
			for (const match of text.matchAll(/(?:^|["'\s,\[])([A-Za-z][A-Za-z0-9_.-]*)\s*:\s*((?:Bearer|Basic|Token|Digest)\s+[^\s"']+|[^\s"']+)/gu)) if (isSensitiveKey(match[1] ?? "") && !isRedactedScalar(match[2] ?? "")) return true;
			return hasUnconfirmedSensitiveCliFlags(text);
		}
		function hasUnconfirmedSensitiveCliFlags(text) {
			for (const match of text.matchAll(/(-{1,2})([A-Za-z0-9_.-]+)/gu)) {
				const token = match[0] ?? "";
				const name = match[2] ?? "";
				const headerCarrier = isHeaderCarrierArg(token);
				if (!isSensitiveKey(name) && !headerCarrier) continue;
				const after = text.slice((match.index ?? 0) + match[0].length);
				if (after.startsWith("=")) {
					const value = headerCarrier ? /^=("(?:\\.|[^"\\])*"|'[^']*'|[^"'\n]+)/u.exec(after) : /^=("(?:\\.|[^"\\])*"|'[^']*'|[^\s,\]}"']+)/u.exec(after);
					if (value === null || followingArgUnresolved(value[1] ?? "", headerCarrier)) return true;
					continue;
				}
				if (after.startsWith("\"")) {
					const paired = /^"(\s*,\s*)"((?:\\.|[^"\\])*)"/u.exec(after);
					if (paired === null) {
						if (/^"\s*,/u.test(after)) return true;
						continue;
					}
					if (followingArgUnresolved(paired[2] ?? "", headerCarrier)) return true;
					continue;
				}
				if (after.startsWith("'")) {
					const paired = /^'(\s*,\s*)'([^']*)'/u.exec(after);
					if (paired === null) {
						if (/^'\s*,/u.test(after)) return true;
						continue;
					}
					if (followingArgUnresolved(paired[2] ?? "", headerCarrier)) return true;
					continue;
				}
				const spaced = headerCarrier ? /^(\s*,\s*|\s+)(?!-|"|')(.+)/u.exec(after) : /^(\s*,\s*|\s+)(?!-|"|')([^\s,\]}]+)/u.exec(after);
				if (spaced !== null && followingArgUnresolved(spaced[2] ?? "", headerCarrier)) return true;
			}
			return false;
		}
		function followingArgUnresolved(value, headerCarrier) {
			const trimmed = value.trim().replace(/["',\s]+$/u, "");
			if (headerValueIsRedacted(trimmed)) return false;
			if (!headerCarrier) return !isRedactedScalar(trimmed);
			const header = /^(?<name>[A-Za-z][A-Za-z0-9_.-]*)\s*:\s*(?<rest>[\s\S]*)$/u.exec(trimmed);
			if (header?.groups === void 0) return true;
			if (!isSensitiveKey(header.groups.name)) return false;
			return !isRedactedScalar(header.groups.rest);
		}
		function headerValueIsRedacted(value) {
			if (isRedactedScalar(value)) return true;
			const header = /^(?<name>[A-Za-z][A-Za-z0-9_.-]*)\s*:\s*(?<rest>[\s\S]*)$/u.exec(value);
			return header?.groups !== void 0 && isSensitiveKey(header.groups.name) && isRedactedScalar(header.groups.rest);
		}
		function applyPass(current, fn) {
			if (current.blocked) return current;
			const next = fn(current.text);
			return {
				text: next.text,
				redacted: current.redacted || next.redacted,
				blocked: current.blocked || next.blocked
			};
		}
		function finish(current, jsonInvalid, checkUnresolved) {
			const unresolved = checkUnresolved && hasUnresolvedSensitive(current.text);
			const blocked = current.blocked || unresolved;
			return {
				text: blocked ? "" : current.text,
				redacted: current.redacted,
				jsonInvalid,
				blocked
			};
		}
		/**
		* Strip `//` and `/* *\/` comments outside of strings. Best-effort JSONC support.
		* @param input - JSONC document.
		*/
		function stripJsonc(input) {
			let out = "";
			let i = 0;
			let inString = false;
			let escape = false;
			while (i < input.length) {
				const char = input[i];
				const next = input[i + 1];
				if (inString) {
					out += char;
					if (escape) escape = false;
					else if (char === "\\") escape = true;
					else if (char === "\"") inString = false;
					i += 1;
					continue;
				}
				if (char === "\"") {
					inString = true;
					out += char;
					i += 1;
					continue;
				}
				if (char === "/" && next === "/") {
					while (i < input.length && input[i] !== "\n") i += 1;
					continue;
				}
				if (char === "/" && next === "*") {
					i += 2;
					while (i < input.length && !(input[i] === "*" && input[i + 1] === "/")) i += 1;
					i += 2;
					continue;
				}
				out += char;
				i += 1;
			}
			return out;
		}
		function stripTrailingCommas(text) {
			return text.replace(/,(?<ws>\s*[}\]])/gu, "$<ws>");
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* text-context copy: zh is the key source, en mirrors every key.
		* Core logic looks up these keys; it must not embed Chinese literals.
		*/
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"block.reference": "文件附件：{name}",
			"toast.added": "已添加 {count} 个可读取文件",
			"toast.redacted": "已自动隐藏可能的密钥字段",
			"toast.tooLarge": "文件超过当前格式的大小上限",
			"toast.tooMany": "一次最多添加 4 个文件",
			"toast.totalTooLarge": "附件总大小超过 40 MiB",
			"toast.invalidUtf8": "文件不是有效 UTF-8",
			"toast.binary": "文件包含无效或二进制内容",
			"toast.unsupported": "当前支持图片、安全文本和 docx/xlsx/pptx 文件",
			"toast.mixed": "请将图片和文档分开上传",
			"toast.noComposer": "未找到当前会话输入框",
			"toast.jsonInvalid": "JSON 无法解析，已按纯文本做保守脱敏，请检查后修复",
			"toast.unsafeRedact": "无法安全隐藏密钥字段，已阻止导入",
			"toast.sensitiveFile": "已阻止可能包含密钥的敏感文件",
			"toast.sessionSwitched": "会话已切换，请重新添加文件",
			"toast.storeFailed": "文件保存失败，请重试",
			"composer.placeholder": "给智能体发消息"
		};
		/** English mirrors the zh key set. */
		const en = {
			"block.reference": "File attachment: {name}",
			"toast.added": "Added {count} tool-readable file(s)",
			"toast.redacted": "Possible secret fields were hidden automatically",
			"toast.tooLarge": "File exceeds the size limit for this format",
			"toast.tooMany": "At most 4 files can be added at once",
			"toast.totalTooLarge": "Attachments exceed 40 MiB in total",
			"toast.invalidUtf8": "File is not valid UTF-8",
			"toast.binary": "File contains invalid or binary content",
			"toast.unsupported": "Images, safe text, and docx/xlsx/pptx files are supported",
			"toast.mixed": "Please upload images and documents separately",
			"toast.noComposer": "Could not find the current session input",
			"toast.jsonInvalid": "JSON could not be parsed; conservative redaction was applied. Please fix the file.",
			"toast.unsafeRedact": "Could not safely hide secret fields; the file was not added",
			"toast.sensitiveFile": "Blocked a sensitive file that may contain secrets",
			"toast.sessionSwitched": "The session changed. Please add the file again.",
			"toast.storeFailed": "Could not store the file. Please try again.",
			"composer.placeholder": "Message the agent"
		};
		/** Tiny interpolation: {name} -> value. */
		function t(dictionary, key, values) {
			let text = dictionary[key] ?? key;
			if (values !== void 0) for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{${name}}`, String(value));
			return text;
		}
		/**
		* Pick zh or en from a BCP 47 tag. Default zh (product UI is Chinese-first).
		* @param lang - documentElement.lang or navigator.language.
		*/
		function dictionaryFor(lang) {
			return (lang ?? "").toLowerCase().startsWith("en") ? en : zh;
		}
		//#endregion
		//#region src/client/composer.ts
		/**
		* Locate the official session composer and insert draft text without
		* depending on hashed CSS class names.
		*/
		const COMPOSER_COPY = [zh["composer.placeholder"], en["composer.placeholder"]];
		/**
		* True when the remote mobile surface is showing (`/m`). Desktop chat stays active.
		* @param loc - location-like object.
		*/
		function isMobileRemoteSurface(loc = window.location) {
			return loc.pathname === "/m" || loc.pathname.startsWith("/m/");
		}
		/**
		* True when the extension-center panel has taken over the conversation column.
		* @param doc - document.
		*/
		function isExtensionCenterOpen(doc = document) {
			return doc.documentElement.hasAttribute("data-dsh-extension-active");
		}
		function isVisible(el) {
			if (!el.isConnected) return false;
			if (el.hidden || el.getAttribute("aria-hidden") === "true") return false;
			const style = getComputedStyle(el);
			if (style.display === "none" || style.visibility === "hidden") return false;
			return true;
		}
		function isBlockedByExtensionCenter(el, doc) {
			if (el.closest("[data-dsh-extension-view]")) return true;
			if (!isExtensionCenterOpen(doc)) return false;
			if (el.closest("[data-pane=\"conversation\"]")) return true;
			if (el.closest("[class*=\"centerCol\"]")) return true;
			return false;
		}
		/**
		* True when the captured composer is still the visible session input.
		* @param captured - element recorded at capture time.
		* @param doc - document.
		*/
		function composerStillCurrent(captured, doc = document) {
			if (!captured.isConnected) return false;
			if (!isVisible(captured)) return false;
			if (isBlockedByExtensionCenter(captured, doc)) return false;
			return findComposer(doc) === captured;
		}
		function matchesComposerSemantics(el) {
			const placeholder = (el.getAttribute("placeholder") ?? "").trim();
			const aria = (el.getAttribute("aria-label") ?? "").trim();
			return COMPOSER_COPY.includes(placeholder) || COMPOSER_COPY.includes(aria);
		}
		function isUsableComposer(el, doc) {
			if (!isVisible(el)) return false;
			if (isBlockedByExtensionCenter(el, doc)) return false;
			return true;
		}
		/**
		* Find the current visible session composer.
		* Order: official textarea[data-phase], contenteditable in the conversation
		* column, then placeholder / aria-label semantics.
		* @param doc - document.
		*/
		function findComposer(doc = document) {
			const phase = doc.querySelectorAll("textarea[data-phase]");
			for (const el of phase) if (isUsableComposer(el, doc)) return el;
			const editables = doc.querySelectorAll("[data-pane=\"conversation\"] [contenteditable=\"true\"], [class*=\"centerCol\"] [contenteditable=\"true\"]");
			for (const el of editables) if (isUsableComposer(el, doc)) return el;
			const semantic = doc.querySelectorAll("textarea[placeholder], textarea[aria-label], [contenteditable=\"true\"][aria-label], [contenteditable=\"true\"][placeholder]");
			for (const el of semantic) {
				if (!matchesComposerSemantics(el)) continue;
				if (isUsableComposer(el, doc)) return el;
			}
			return null;
		}
		//#endregion
		//#region src/client/toast.ts
		/**
		* Lightweight toast using official theme tokens. No extra UI framework.
		*/
		const TOAST_ATTR = "data-dsh-text-context-toast";
		const TOAST_MS = 3600;
		const TOAST_STYLE = [
			"position:fixed",
			"z-index:2147483646",
			"left:50%",
			"bottom:24px",
			"transform:translateX(-50%)",
			"max-width:min(480px, calc(100vw - 32px))",
			"padding:8px 14px",
			"border-radius:8px",
			"border:1px solid var(--dsw-alias-border-l1, #3a3a3a)",
			"background:var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-base, #1f1f1f))",
			"color:var(--dsw-alias-label-primary, #f5f5f5)",
			"font-size:13px",
			"line-height:1.4",
			"box-shadow:0 8px 24px color-mix(in srgb, #000 28%, transparent)",
			"pointer-events:none"
		].join(";");
		const pending = /* @__PURE__ */ new Set();
		/**
		* Show a short status message. Stacks upward when several fire together.
		* @param message - already-translated copy.
		* @param doc - document to mount into.
		*/
		function showToast(message, doc = document) {
			const existing = [...doc.querySelectorAll(`[${TOAST_ATTR}]`)];
			if (existing.some((el) => el.textContent === message)) return;
			const el = doc.createElement("div");
			el.setAttribute("role", "status");
			el.setAttribute(TOAST_ATTR, "");
			el.textContent = message;
			el.style.cssText = TOAST_STYLE;
			if (existing.length > 0) el.style.bottom = `${24 + existing.length * 48}px`;
			doc.body.append(el);
			const timer = setTimeout(() => {
				pending.delete(timer);
				el.remove();
			}, TOAST_MS);
			pending.add(timer);
		}
		/** Remove every toast this plugin created (used on uninstall). */
		function clearToasts(doc = document) {
			for (const timer of pending) clearTimeout(timer);
			pending.clear();
			for (const el of doc.querySelectorAll(`[${TOAST_ATTR}]`)) el.remove();
		}
		//#endregion
		//#region src/client/intake.ts
		/**
		* Document capture listener for paste and drop. Official image files pass
		* through; supported text becomes composer draft; mixed and unsupported
		* batches are blocked with a toast.
		*/
		const CAPTURE_REGISTRY = Symbol.for("@linxin666/dsh-text-context:capture-registry");
		function collectFiles(event) {
			const data = fileCarrierOf(event);
			if (data === null) return [];
			const fromList = arrayFromFiles(data.files);
			if (fromList.length > 0) return fromList;
			return collectFromItems(data.items);
		}
		function fileCarrierOf(event) {
			const record = event;
			return record.dataTransfer ?? record.clipboardData ?? null;
		}
		function arrayFromFiles(list) {
			if (list == null) return [];
			return Array.from(list);
		}
		function collectFromItems(items) {
			if (items == null) return [];
			const list = typeof items[Symbol.iterator] === "function" ? [...items] : Array.from(items);
			const files = [];
			for (const item of list) {
				if (item.kind !== "file" || typeof item.getAsFile !== "function") continue;
				const file = item.getAsFile();
				if (file !== null) files.push(file);
			}
			return files;
		}
		function intercept(event) {
			event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation();
		}
		/**
		* Install capture-phase paste/drop listeners. Returns a disposer that removes them.
		* @param options - document, limits, language.
		*/
		function installTextContextCapture(options = {}) {
			const doc = options.document ?? document;
			const registryOwner = doc;
			const activeRegistry = registryOwner[CAPTURE_REGISTRY];
			if (activeRegistry !== void 0) {
				activeRegistry.references += 1;
				let released = false;
				return () => {
					if (released) return;
					released = true;
					activeRegistry.references -= 1;
					if (activeRegistry.references === 0) activeRegistry.disposeActual();
				};
			}
			const limits = options.limits ?? DEFAULT_LIMITS;
			const dict = dictionaryFor(options.lang ?? doc.documentElement.lang);
			const toast = (key, values) => {
				showToast(t(dict, key, values), doc);
			};
			let generation = 0;
			let disposed = false;
			const onPaste = (event) => {
				onCapture(event);
			};
			const onDrop = (event) => {
				onCapture(event);
			};
			doc.addEventListener("paste", onPaste, true);
			doc.addEventListener("drop", onDrop, true);
			async function onCapture(event) {
				if (disposed) return;
				const files = collectFiles(event);
				if (files.length === 0) return;
				const classified = files.map((file) => ({
					file,
					result: classifyFile(file)
				}));
				const hasImage = classified.some((entry) => entry.result.kind === "image");
				const hasDocument = classified.some((entry) => entry.result.kind === "text" || entry.result.kind === "office");
				const hasUnsupported = classified.some((entry) => entry.result.kind === "unsupported");
				const hasSensitive = classified.some((entry) => entry.result.kind === "sensitive-file");
				if (hasImage && !hasDocument && !hasUnsupported && !hasSensitive) return;
				intercept(event);
				if (hasImage && hasDocument) {
					toast("toast.mixed");
					return;
				}
				if (hasSensitive) {
					toast("toast.sensitiveFile");
					return;
				}
				if (hasUnsupported) {
					toast("toast.unsupported");
					return;
				}
				const captured = findComposer(doc);
				if (captured === null) {
					toast("toast.noComposer");
					return;
				}
				if (options.uploader === void 0) {
					toast("toast.storeFailed");
					return;
				}
				if (options.attachmentInserter === void 0) {
					toast("toast.storeFailed");
					return;
				}
				const documentEntries = classified.filter((entry) => entry.result.kind === "text" || entry.result.kind === "office");
				const limit = batchLimitError(documentEntries.map((entry) => ({
					size: entry.file.size,
					kind: entry.result.kind
				})), limits);
				if (limit === "too-many") {
					toast("toast.tooMany");
					return;
				}
				if (limit === "too-large") {
					toast("toast.tooLarge");
					return;
				}
				if (limit === "total-too-large") {
					toast("toast.totalTooLarge");
					return;
				}
				const myGen = generation + 1;
				generation = myGen;
				const prepared = [];
				let anyRedacted = false;
				let anyJsonInvalid = false;
				for (const { file, result } of documentEntries) {
					let bytes;
					let redacted = false;
					let jsonInvalid = false;
					let connectorText;
					if (result.kind === "text") {
						const read = await readTextFile(file, limits.maxFileBytes);
						if (!read.ok) {
							if (read.reason === "too-large") toast("toast.tooLarge");
							else if (read.reason === "utf8") toast("toast.invalidUtf8");
							else toast("toast.binary");
							return;
						}
						const rewritten = redactStructured(read.text, result.syntax);
						if (rewritten.blocked) {
							toast("toast.unsafeRedact");
							return;
						}
						bytes = new TextEncoder().encode(rewritten.text);
						redacted = rewritten.redacted;
						jsonInvalid = rewritten.jsonInvalid;
						if ((result.syntax === "json" || result.syntax === "jsonc") && looksLikeMcpDocument(read.text)) connectorText = read.text;
					} else bytes = new Uint8Array(await file.arrayBuffer());
					if (disposed || generation !== myGen) return;
					if (options.stall !== void 0) await options.stall();
					if (disposed || generation !== myGen) return;
					if (!composerStillCurrent(captured, doc)) {
						toast("toast.sessionSwitched");
						return;
					}
					try {
						const attachment = await options.uploader.upload({
							name: result.basename,
							mediaType: result.mime.length > 0 ? result.mime : file.type,
							bytes: bytes.byteLength,
							base64: bytesToBase64(bytes),
							redacted,
							kind: result.kind
						});
						prepared.push({
							attachment,
							connectorText
						});
					} catch {
						toast("toast.storeFailed");
						return;
					}
					anyRedacted ||= redacted;
					anyJsonInvalid ||= jsonInvalid;
				}
				if (!composerStillCurrent(captured, doc)) {
					toast("toast.sessionSwitched");
					return;
				}
				for (const { attachment, connectorText } of prepared) {
					if (connectorText !== void 0) options.connectorImportSource?.(attachment, connectorText);
					if (!options.attachmentInserter(captured, attachment)) {
						toast("toast.storeFailed");
						return;
					}
				}
				toast("toast.added", { count: prepared.length });
				if (anyRedacted) toast("toast.redacted");
				if (anyJsonInvalid) toast("toast.jsonInvalid");
			}
			const registry = {
				references: 1,
				disposeActual: () => {
					if (registryOwner[CAPTURE_REGISTRY] !== registry) return;
					delete registryOwner[CAPTURE_REGISTRY];
					disposed = true;
					generation += 1;
					doc.removeEventListener("paste", onPaste, true);
					doc.removeEventListener("drop", onDrop, true);
					clearToasts(doc);
				}
			};
			registryOwner[CAPTURE_REGISTRY] = registry;
			let released = false;
			return () => {
				if (released) return;
				released = true;
				registry.references -= 1;
				if (registry.references > 0) return;
				registry.disposeActual();
			};
		}
		function looksLikeMcpDocument(text) {
			try {
				const value = JSON.parse(text);
				return value !== null && typeof value === "object" && value.mcpServers !== null && typeof value.mcpServers === "object" && !Array.isArray(value.mcpServers);
			} catch {
				return false;
			}
		}
		function bytesToBase64(bytes) {
			let binary = "";
			const chunkSize = 32768;
			for (let offset = 0; offset < bytes.length; offset += chunkSize) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize)));
			return btoa(binary);
		}
		//#endregion
		//#region src/core/format.ts
		/**
		* Render one attachment as ordinary markdown text (not an image content block).
		* @param attachment - prepared file.
		* @param dictionary - zh or en copy.
		*/
		function formatAttachmentReference(attachment, dictionary) {
			return dictionary["block.reference"].replace("{name}", attachment.name).replace("{id}", "");
		}
		//#endregion
		//#region src/client/reference.ts
		const FILE_REFERENCE_SOURCE = "local-file-attachment";
		/**
		* Encode source-owned reference metadata. The value is retained by the input
		* machine but never rendered in the textarea; only the basename label is.
		*/
		function encodeFileReference(attachment) {
			return JSON.stringify(attachment);
		}
		/** Decode and validate one source-owned reference. */
		function decodeFileReference(ref) {
			const value = JSON.parse(ref);
			if (typeof value.id !== "string" || !/^file_[a-f0-9]{32}$/u.test(value.id) || typeof value.name !== "string" || value.name.length === 0 || value.name.length > 255 || typeof value.mediaType !== "string" || typeof value.bytes !== "number" || !Number.isSafeInteger(value.bytes) || value.bytes < 0 || value.kind !== "text" && value.kind !== "office" || typeof value.redacted !== "boolean") throw new Error("invalid local file attachment reference");
			return value;
		}
		/** Create the native @-reference source used for submit-time serialization. */
		function createFileReferenceSource(dictionary) {
			return {
				trigger: "@",
				name: FILE_REFERENCE_SOURCE,
				order: 100,
				showGroupTitle: false,
				async candidates() {
					return [];
				},
				onPick() {},
				codec: {
					clipboardText(ref) {
						return `@${decodeFileReference(ref).name}`;
					},
					async serialize(ref) {
						return formatAttachmentReference(decodeFileReference(ref), dictionary);
					}
				}
			};
		}
		/** Build the official file-appearance reference inserted into the input machine. */
		function fileReferenceInsert(attachment) {
			return {
				source: FILE_REFERENCE_SOURCE,
				ref: encodeFileReference(attachment),
				label: attachment.name,
				appearance: "file",
				clipboardText: `@${attachment.name}`
			};
		}
		/**
		* Insert an uploaded file through the official input machine. The composer
		* renders a native file chip while the model receives the opaque tool protocol
		* only when the draft is submitted.
		*/
		function insertFileReference(ctx, composer, attachment) {
			const sessionId = ctx.sessions.list.getSnapshot().current;
			if (sessionId === void 0) return false;
			const actx = ctx.sessions.scope(sessionId);
			if (actx === void 0) return false;
			const input = ctx.conversation.input.for(actx);
			const state = input.state.getSnapshot();
			let start = state.draft.length;
			let end = start;
			if (composer instanceof HTMLTextAreaElement && composer.value === state.draft) {
				start = composer.selectionStart ?? start;
				end = composer.selectionEnd ?? start;
			}
			const inserted = input.insertReference(fileReferenceInsert(attachment), {
				start,
				end,
				draftRev: state.draftRev
			});
			if (inserted) composer.focus();
			return inserted;
		}
		//#endregion
		//#region src/client/index.ts
		const inject = [
			"connection",
			"sessions",
			"inputTriggers",
			"conversation"
		];
		/**
		* Register capture listeners for the page lifetime.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			if (isMobileRemoteSurface()) return;
			const api = new TextContextClientApi(ctx.get("connection"));
			const dictionary = dictionaryFor(document.documentElement.lang);
			ctx.effect(() => ctx.inputTriggers.registerSource(createFileReferenceSource(dictionary)), "dsh-text-context: native file reference source");
			ctx.effect(() => installTextContextCapture({
				uploader: api,
				attachmentInserter: (composer, attachment) => insertFileReference(ctx, composer, attachment),
				connectorImportSource: rememberConnectorImportSource
			}), "dsh-text-context: capture listeners");
			ctx.effect(() => installConnectorImportBridge(api), "dsh-text-context: connector import handoff");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map