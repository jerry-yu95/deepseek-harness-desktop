import { decodeArticleImageData, normalizeArticleMetadata, normalizeArticleResources, normalizeKnowledgeSummary, normalizeKnowledgeUpdate, normalizeProposal, validateKnowledgeItem } from "./core/validate.js";
import { t as assertActive } from "./cancellation-jXG1hdt8.js";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
//#region src/core/tags.ts
const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 32;
const OTHER_TAG = "其他";
/** Pure, exact-match tag move used by both menu and drag/drop callers. */
function moveTags(tags, move) {
	const current = uniqueTags(tags);
	if (move.to === null) return [];
	const destination = normalizeTag(move.to);
	if (destination === OTHER_TAG) throw new Error("tag destination is reserved");
	if (!destination) throw new Error("tag destination is required");
	if (destination.length > MAX_TAG_LENGTH) throw new Error("tag destination is too long");
	const source = move.from === null ? null : normalizeTag(move.from);
	const withoutSource = source === null ? current : current.filter((tag) => tag !== source);
	if (!withoutSource.includes(destination)) withoutSource.push(destination);
	if (withoutSource.length > MAX_TAGS) throw new Error("knowledge tags cannot exceed 8 values");
	return withoutSource;
}
function normalizeTag(value) {
	return value.trim().normalize("NFC");
}
function uniqueTags(values) {
	const result = [];
	const seen = /* @__PURE__ */ new Set();
	for (const raw of values) {
		const tag = normalizeTag(raw);
		if (!tag || tag === OTHER_TAG || seen.has(tag)) continue;
		seen.add(tag);
		result.push(tag);
	}
	return result;
}
//#endregion
//#region src/core/store.ts
const ID_PATTERN = /^knowledge_[0-9a-f]{32}$/u;
const MAX_SNAPSHOT_BYTES = 1048576;
var KnowledgeStore = class {
	root;
	transitions = /* @__PURE__ */ new Map();
	constructor(root = join(process.env.DSH_HOME?.trim() || join(homedir(), ".dsh"), "desktop", "knowledge", "v1")) {
		this.root = root;
	}
	async propose(input, options = {}) {
		assertActive(options.signal);
		const article = normalizeArticleMetadata(options.article);
		const articleResources = normalizeArticleResources(options.articleResources);
		assertArticleResources(article, articleResources);
		let item = normalizeProposal(input, {
			id: options.id ?? `knowledge_${randomUUID().replaceAll("-", "")}`,
			now: options.now ?? (/* @__PURE__ */ new Date()).toISOString(),
			allowEmptyContent: article !== void 0
		});
		if (options.snapshot !== void 0) {
			await this.writeSnapshot(item.id, options.snapshot, options.signal);
			item = validateKnowledgeItem({
				...item,
				source: {
					...item.source,
					hasSnapshot: true
				},
				...article === void 0 ? {} : { article }
			});
		} else if (article !== void 0) throw new TypeError("article snapshot is required");
		try {
			if (articleResources !== void 0) await this.writeArticleResources(item.id, articleResources, options.signal);
			await this.write(item, options.signal);
		} catch (error) {
			const committed = await stat(this.itemPath(item.id)).then(() => true, (failure) => {
				if (failure.code === "ENOENT") return false;
				throw failure;
			});
			if (!committed && options.snapshot !== void 0) await unlink(this.snapshotPath(item.id)).catch(() => {});
			if (!committed && articleResources !== void 0) await rm(this.resourceDirectory(item.id), {
				recursive: true,
				force: true
			}).catch(() => {});
			throw error;
		}
		return item;
	}
	async proposeOnce(requestId, input, options = {}) {
		if (typeof requestId !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/u.test(requestId)) throw new Error("knowledge-invalid-request");
		const id = `knowledge_${createHash("sha256").update(`article-import:${requestId}`).digest("hex").slice(0, 32)}`;
		return this.withTransitionLock(id, async () => {
			assertActive(options.signal);
			if (await stat(this.trashPath(id)).then(() => true, (error) => {
				if (error.code === "ENOENT") return false;
				throw error;
			})) throw new Error("knowledge-deleted");
			try {
				return await this.read(id);
			} catch (error) {
				if (error.code !== "ENOENT") throw error;
			}
			return this.propose(input, {
				...options,
				id
			});
		});
	}
	async list(options = {}, deleted = false) {
		const directory = deleted ? join(this.root, "trash") : this.itemsDirectory();
		const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
			if (error.code === "ENOENT") return [];
			throw error;
		});
		const items = [];
		for (const entry of entries) {
			if (!entry.isFile() || !/^knowledge_[0-9a-f]{32}\.json$/u.test(entry.name)) continue;
			try {
				const item = validateKnowledgeItem(JSON.parse(await readFile(join(directory, entry.name), "utf8")));
				if (options.status === void 0 || item.status === options.status) items.push(item);
			} catch {}
		}
		return items.sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
	}
	async read(id) {
		assertId(id);
		return validateKnowledgeItem(JSON.parse(await readFile(this.itemPath(id), "utf8")));
	}
	async confirm(id, options = {}) {
		return this.transition(id, "confirmed", options);
	}
	async dismiss(id, options = {}) {
		return this.transition(id, "dismissed", options);
	}
	/** Atomically remove the visible record. Its owned source/resources remain recoverable. */
	async trash(id, expectedUpdatedAt, options = {}) {
		assertId(id);
		await this.withTransitionLock(id, async () => {
			assertActive(options.signal);
			if ((await this.read(id)).updatedAt !== expectedUpdatedAt) throw new Error("knowledge revision conflict");
			if (await stat(this.trashPath(id)).then(() => true, (error) => {
				if (error.code === "ENOENT") return false;
				throw error;
			})) throw new Error("knowledge revision conflict");
			await mkdir(join(this.root, "trash"), {
				recursive: true,
				mode: 448
			});
			assertActive(options.signal);
			await rename(this.itemPath(id), this.trashPath(id));
		});
	}
	async restore(id, options = {}) {
		assertId(id);
		return this.withTransitionLock(id, async () => {
			assertActive(options.signal);
			const item = validateKnowledgeItem(JSON.parse(await readFile(this.trashPath(id), "utf8")));
			if (item.id !== id) throw new Error("knowledge-invalid-request");
			if (await stat(this.itemPath(id)).then(() => true, (error) => {
				if (error.code === "ENOENT") return false;
				throw error;
			})) throw new Error("knowledge revision conflict");
			await mkdir(this.itemsDirectory(), {
				recursive: true,
				mode: 448
			});
			assertActive(options.signal);
			await rename(this.trashPath(id), this.itemPath(id));
			return item;
		});
	}
	trashPath(id) {
		assertId(id);
		return join(this.root, "trash", `${id}.json`);
	}
	async update(id, input, options = {}) {
		assertId(id);
		return this.withTransitionLock(id, async () => {
			assertActive(options.signal);
			const current = await this.read(id);
			if (current.status === "dismissed") throw new Error("dismissed knowledge cannot be edited");
			const next = normalizeKnowledgeUpdate(input, current, revisionNow(current.updatedAt, options.now));
			await this.write(next, options.signal);
			return next;
		});
	}
	async readSnapshot(id) {
		assertId(id);
		const file = await open(this.snapshotPath(id), "r").catch((error) => {
			if (error.code === "ENOENT") return void 0;
			throw error;
		});
		if (!file) return void 0;
		try {
			const bytes = Buffer.alloc(1048577);
			let length = 0;
			while (length < bytes.length) {
				const result = await file.read(bytes, length, bytes.length - length, null);
				if (result.bytesRead === 0) break;
				length += result.bytesRead;
			}
			if (length > MAX_SNAPSHOT_BYTES) throw new Error("knowledge snapshot is too large");
			return bytes.subarray(0, length).toString("utf8");
		} finally {
			await file.close();
		}
	}
	async readDetail(id) {
		const item = await this.read(id);
		const body = await this.readSnapshot(id);
		if (body !== void 0) return {
			item,
			body,
			bodyKind: item.article === void 0 ? "legacy-snapshot" : "article",
			...await this.readArticleResources(item.id, item.article?.images)
		};
		return {
			item,
			body: item.content,
			bodyKind: "legacy-excerpt"
		};
	}
	async updateSummary(id, input, expectedUpdatedAt, options = {}) {
		assertId(id);
		return this.withTransitionLock(id, async () => {
			assertActive(options.signal);
			const current = await this.read(id);
			if (current.status === "dismissed") throw new Error("dismissed knowledge cannot be summarized");
			if (expectedUpdatedAt !== void 0 && current.updatedAt !== expectedUpdatedAt) throw new Error("knowledge revision conflict");
			const summary = normalizeKnowledgeSummary(input);
			if (summary === void 0) throw new TypeError("knowledge summary is required");
			const next = validateKnowledgeItem({
				...current,
				summary,
				updatedAt: revisionNow(current.updatedAt, options.now)
			});
			await this.write(next, options.signal);
			return next;
		});
	}
	async editSummary(id, text, expectedUpdatedAt, options = {}) {
		assertId(id);
		return this.withTransitionLock(id, async () => {
			assertActive(options.signal);
			const current = await this.read(id);
			if (current.status === "dismissed") throw new Error("dismissed knowledge cannot be edited");
			if (current.updatedAt !== expectedUpdatedAt) throw new Error("knowledge revision conflict");
			if (!current.summary) throw new Error("knowledge summary is required");
			const summary = normalizeKnowledgeSummary({
				...current.summary,
				text,
				editedByUser: true
			});
			const next = validateKnowledgeItem({
				...current,
				summary,
				updatedAt: revisionNow(current.updatedAt)
			});
			await this.write(next, options.signal);
			return next;
		});
	}
	async moveTag(id, move, expectedUpdatedAt) {
		assertId(id);
		return this.withTransitionLock(id, async () => {
			const current = await this.read(id);
			if (current.status !== "confirmed") throw new Error("only confirmed knowledge can be tagged");
			if (current.updatedAt !== expectedUpdatedAt) throw new Error("knowledge revision conflict");
			if (move.from !== null && !current.tags.includes(move.from.trim().normalize("NFC"))) throw new Error("knowledge tag source is not present");
			const tags = moveTags(current.tags, move);
			if (tags.length === current.tags.length && tags.every((tag, index) => tag === current.tags[index])) return current;
			const next = validateKnowledgeItem({
				...current,
				tags,
				updatedAt: revisionNow(current.updatedAt)
			});
			await this.write(next);
			return next;
		});
	}
	async transition(id, target, options = {}) {
		assertId(id);
		return this.withTransitionLock(id, async () => {
			assertActive(options.signal);
			const current = await this.read(id);
			if (current.status === target) return current;
			if (current.status !== "candidate") throw new Error(`knowledge is already in final state: ${current.status}`);
			const now = normalizedNow(options.now);
			const next = validateKnowledgeItem({
				...current,
				status: target,
				updatedAt: now,
				...target === "confirmed" ? { confirmedAt: now } : { dismissedAt: now }
			});
			await this.write(next, options.signal);
			return next;
		});
	}
	async write(item, signal) {
		assertActive(signal);
		const value = validateKnowledgeItem(item);
		await mkdir(this.itemsDirectory(), {
			recursive: true,
			mode: 448
		});
		const path = this.itemPath(value.id);
		const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
		try {
			await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
				encoding: "utf8",
				flag: "wx",
				mode: 384
			});
			assertActive(signal);
			await rename(temporary, path);
		} finally {
			await unlink(temporary).catch((error) => {
				if (error.code !== "ENOENT") throw error;
			});
		}
		if (!(await stat(path)).isFile()) throw new Error("knowledge storage did not create a regular file");
	}
	itemsDirectory() {
		return join(this.root, "items");
	}
	itemPath(id) {
		assertId(id);
		return join(this.itemsDirectory(), `${id}.json`);
	}
	snapshotPath(id) {
		assertId(id);
		return join(this.root, "sources", `${id}.txt`);
	}
	resourceDirectory(id) {
		assertId(id);
		return join(this.root, "resources", id);
	}
	resourcePath(id, imageId) {
		if (!/^image_[0-9a-f]{32}$/u.test(imageId)) throw new TypeError("article image id is invalid");
		return join(this.resourceDirectory(id), `${imageId}.bin`);
	}
	async writeArticleResources(id, resources, signal) {
		await mkdir(this.resourceDirectory(id), {
			recursive: true,
			mode: 448
		});
		for (const resource of resources) {
			assertActive(signal);
			const bytes = decodeArticleImageData(resource.data, resource.mimeType, resource.byteLength);
			const path = this.resourcePath(id, resource.id);
			const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
			try {
				await writeFile(temporary, bytes, {
					flag: "wx",
					mode: 384
				});
				assertActive(signal);
				await rename(temporary, path);
			} finally {
				await unlink(temporary).catch((error) => {
					if (error.code !== "ENOENT") throw error;
				});
			}
		}
	}
	async readArticleResources(id, metadata) {
		if (metadata === void 0 || metadata.length === 0) return {};
		const images = [];
		for (const image of metadata) {
			if (image.status === "unavailable" || image.mimeType === void 0 || image.byteLength === void 0) {
				images.push(image);
				continue;
			}
			try {
				const file = await open(this.resourcePath(id, image.id), "r");
				let bytes;
				try {
					if ((await file.stat()).size !== image.byteLength) throw new Error("knowledge-image-unavailable");
					bytes = Buffer.alloc(image.byteLength);
					let offset = 0;
					while (offset < bytes.length) {
						const result = await file.read(bytes, offset, bytes.length - offset, offset);
						if (!result.bytesRead) throw new Error("knowledge-image-unavailable");
						offset += result.bytesRead;
					}
				} finally {
					await file.close();
				}
				const data = bytes.toString("base64");
				decodeArticleImageData(data, image.mimeType, image.byteLength);
				images.push({
					...image,
					status: "ready",
					data
				});
			} catch {
				images.push({
					id: image.id,
					alt: image.alt,
					order: image.order,
					...image.offset === void 0 ? {} : { offset: image.offset },
					status: "unavailable",
					failureReason: "cache"
				});
			}
		}
		return { images };
	}
	async writeSnapshot(id, input, signal) {
		assertActive(signal);
		if (typeof input !== "string") throw new TypeError("knowledge snapshot must be text");
		const snapshot = input.trim();
		const bytes = Buffer.byteLength(snapshot, "utf8");
		if (bytes === 0 || bytes > MAX_SNAPSHOT_BYTES) throw new TypeError(`knowledge snapshot must contain 1-${MAX_SNAPSHOT_BYTES} bytes`);
		if (/\u0000/u.test(snapshot)) throw new TypeError("knowledge snapshot contains binary data");
		await mkdir(join(this.root, "sources"), {
			recursive: true,
			mode: 448
		});
		const path = this.snapshotPath(id);
		const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
		try {
			assertActive(signal);
			await writeFile(temporary, snapshot, {
				encoding: "utf8",
				flag: "wx",
				mode: 384
			});
			assertActive(signal);
			await rename(temporary, path);
		} finally {
			await unlink(temporary).catch((error) => {
				if (error.code !== "ENOENT") throw error;
			});
		}
	}
	async withTransitionLock(id, operation) {
		const current = (this.transitions.get(id) ?? Promise.resolve()).catch(() => void 0).then(operation);
		this.transitions.set(id, current);
		try {
			return await current;
		} finally {
			if (this.transitions.get(id) === current) this.transitions.delete(id);
		}
	}
};
function assertArticleResources(article, resources) {
	if (resources !== void 0 && article === void 0) throw new TypeError("article metadata is required for image resources");
	const metadata = article?.images ?? [];
	if (resources === void 0) {
		if (metadata.some((image) => image.status === "ready")) throw new TypeError("ready article image resource is missing");
		return;
	}
	const byId = new Map(resources.map((resource) => [resource.id, resource]));
	if (byId.size !== resources.length || resources.some((resource) => resource.status !== "ready")) throw new TypeError("article image resources are invalid");
	for (const image of metadata) {
		const resource = byId.get(image.id);
		if (image.status === "ready" && (resource === void 0 || resource.alt !== image.alt || resource.order !== image.order || resource.mimeType !== image.mimeType || resource.byteLength !== image.byteLength)) throw new TypeError("article image metadata does not match resource");
		if (image.status === "unavailable" && resource !== void 0) throw new TypeError("unavailable article image cannot have a resource");
	}
	if (resources.some((resource) => !metadata.some((image) => image.id === resource.id))) throw new TypeError("article image resource is not declared");
}
function assertId(id) {
	if (!ID_PATTERN.test(id)) throw new TypeError("knowledge id is invalid");
}
function normalizedNow(input) {
	const value = input ?? (/* @__PURE__ */ new Date()).toISOString();
	const parsed = new Date(value);
	if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== value) throw new TypeError("now must be an ISO timestamp");
	return value;
}
function revisionNow(previous, input) {
	const now = normalizedNow(input);
	return new Date(Math.max(Date.parse(now), Date.parse(previous) + 1)).toISOString();
}
//#endregion
export { moveTags as n, KnowledgeStore as t };
