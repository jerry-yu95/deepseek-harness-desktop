import { normalizeKnowledgeUpdate, normalizeProposal, validateKnowledgeItem } from "./validate.js";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
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
		let item = normalizeProposal(input, {
			id: options.id ?? `knowledge_${randomUUID().replaceAll("-", "")}`,
			now: options.now ?? (/* @__PURE__ */ new Date()).toISOString()
		});
		if (options.snapshot !== void 0) {
			await this.writeSnapshot(item.id, options.snapshot);
			item = validateKnowledgeItem({
				...item,
				source: {
					...item.source,
					hasSnapshot: true
				}
			});
		}
		await this.write(item);
		return item;
	}
	async list(options = {}) {
		const directory = this.itemsDirectory();
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
		return this.transition(id, "confirmed", options.now);
	}
	async dismiss(id, options = {}) {
		return this.transition(id, "dismissed", options.now);
	}
	async update(id, input, options = {}) {
		assertId(id);
		return this.withTransitionLock(id, async () => {
			const current = await this.read(id);
			if (current.status === "dismissed") throw new Error("dismissed knowledge cannot be edited");
			const next = normalizeKnowledgeUpdate(input, current, normalizedNow(options.now));
			await this.write(next);
			return next;
		});
	}
	async readSnapshot(id) {
		assertId(id);
		return readFile(this.snapshotPath(id), "utf8").catch((error) => {
			if (error.code === "ENOENT") return void 0;
			throw error;
		});
	}
	async transition(id, target, nowInput) {
		assertId(id);
		return this.withTransitionLock(id, async () => {
			const current = await this.read(id);
			if (current.status === target) return current;
			if (current.status !== "candidate") throw new Error(`knowledge is already in final state: ${current.status}`);
			const now = normalizedNow(nowInput);
			const next = validateKnowledgeItem({
				...current,
				status: target,
				updatedAt: now,
				...target === "confirmed" ? { confirmedAt: now } : { dismissedAt: now }
			});
			await this.write(next);
			return next;
		});
	}
	async write(item) {
		const value = validateKnowledgeItem(item);
		await mkdir(this.itemsDirectory(), {
			recursive: true,
			mode: 448
		});
		const path = this.itemPath(value.id);
		const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
		await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
			encoding: "utf8",
			flag: "wx",
			mode: 384
		});
		await rename(temporary, path);
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
	async writeSnapshot(id, input) {
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
		await writeFile(temporary, snapshot, {
			encoding: "utf8",
			flag: "wx",
			mode: 384
		});
		await rename(temporary, path);
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
function assertId(id) {
	if (!ID_PATTERN.test(id)) throw new TypeError("knowledge id is invalid");
}
function normalizedNow(input) {
	const value = input ?? (/* @__PURE__ */ new Date()).toISOString();
	const parsed = new Date(value);
	if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== value) throw new TypeError("now must be an ISO timestamp");
	return value;
}
//#endregion
export { KnowledgeStore };
