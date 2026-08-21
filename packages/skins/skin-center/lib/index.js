import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
//#region src/routes.ts
const ADAPTIVE_THEME_API_PREFIX = "/api/adaptive-theme";
const MAX_BODY_BYTES = 21 * 1024 * 1024;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const HEX = /^#[0-9a-f]{6}$/i;
const SCRIM = /^rgba\(\d{1,3},\s*\d{1,3},\s*\d{1,3},\s*(?:0(?:\.\d+)?|1(?:\.0+)?)\)$/;
const themeDir = () => join(process.env.DSH_HOME ?? join(homedir(), ".dsh"), "desktop", "adaptive-theme");
const manifestPath = () => join(themeDir(), "theme.json");
const imagePath = (extension) => join(themeDir(), `background.${extension}`);
function json(res, status, body) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	res.end(JSON.stringify(body));
}
function sameOrigin(req) {
	if (req.headers["sec-fetch-site"] === "cross-site") return false;
	const origin = req.headers.origin;
	if (typeof origin !== "string" || origin === "" || origin === "null") return true;
	try {
		return new URL(origin).host === req.headers.host;
	} catch {
		return false;
	}
}
function guard(req, res, method) {
	if (req.method !== method) {
		json(res, 405, {
			ok: false,
			error: "method-not-allowed"
		});
		return false;
	}
	if (!sameOrigin(req)) {
		json(res, 403, {
			ok: false,
			error: "cross-site-request-rejected"
		});
		return false;
	}
	return true;
}
function readBody(req) {
	return new Promise((resolve, reject) => {
		let size = 0;
		const chunks = [];
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > MAX_BODY_BYTES) reject(/* @__PURE__ */ new Error("body-too-large"));
			else chunks.push(chunk);
		});
		req.on("end", () => {
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
			} catch {
				reject(/* @__PURE__ */ new Error("invalid-json"));
			}
		});
		req.on("error", reject);
	});
}
function validatePalette(value) {
	if (typeof value !== "object" || value === null) throw new Error("invalid-palette");
	const record = value;
	if (record.mode !== "light" && record.mode !== "dark") throw new Error("invalid-palette-mode");
	for (const key of [
		"accent",
		"accentHover",
		"surface",
		"surfaceStrong",
		"text",
		"muted",
		"border"
	]) if (typeof record[key] !== "string" || !HEX.test(record[key])) throw new Error(`invalid-palette-${key}`);
	if (typeof record.scrim !== "string" || !SCRIM.test(record.scrim)) throw new Error("invalid-palette-scrim");
	return record;
}
function validateVisibility(value) {
	if (value === void 0) return 82;
	if (typeof value !== "number" || !Number.isFinite(value) || value < 35 || value > 100) throw new Error("invalid-visibility");
	return Math.round(value);
}
function imageInfo(mime, buffer) {
	if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) throw new Error("invalid-image-size");
	if (mime === "image/png" && buffer.subarray(0, 8).equals(Buffer.from([
		137,
		80,
		78,
		71,
		13,
		10,
		26,
		10
	]))) return {
		mime,
		extension: "png"
	};
	if (mime === "image/jpeg" && buffer[0] === 255 && buffer[1] === 216 && buffer.at(-2) === 255 && buffer.at(-1) === 217) return {
		mime,
		extension: "jpg"
	};
	if (mime === "image/webp" && buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP") return {
		mime,
		extension: "webp"
	};
	throw new Error("invalid-image-content");
}
async function atomicWrite(path, data) {
	await mkdir(dirname(path), { recursive: true });
	const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
	await writeFile(temp, data);
	await rename(temp, path);
}
async function readManifest() {
	try {
		const value = JSON.parse(await readFile(manifestPath(), "utf8"));
		validatePalette(value.palette);
		if (value.version !== 1 || ![
			"png",
			"jpg",
			"webp"
		].includes(value.extension)) return void 0;
		return value;
	} catch {
		return;
	}
}
async function state() {
	const manifest = await readManifest();
	if (manifest === void 0) return {
		ok: true,
		enabled: false
	};
	return {
		ok: true,
		enabled: true,
		palette: manifest.palette,
		visibility: validateVisibility(manifest.visibility),
		updatedAt: manifest.updatedAt,
		imageUrl: `${ADAPTIVE_THEME_API_PREFIX}/image?v=${encodeURIComponent(manifest.updatedAt)}`
	};
}
function exact(path, method, run) {
	return {
		kind: "exact",
		path,
		handler: (req, res) => {
			if (!guard(req, res, method)) return;
			run(req, res).catch((error) => json(res, 400, {
				ok: false,
				error: error instanceof Error ? error.message : String(error)
			}));
		}
	};
}
function makeAdaptiveThemeRoutes() {
	return [
		exact(`${ADAPTIVE_THEME_API_PREFIX}/state`, "GET", async (_req, res) => json(res, 200, await state())),
		exact(`${ADAPTIVE_THEME_API_PREFIX}/image`, "GET", async (_req, res) => {
			const manifest = await readManifest();
			if (manifest === void 0) return json(res, 404, {
				ok: false,
				error: "theme-not-found"
			});
			res.writeHead(200, {
				"content-type": manifest.mime,
				"cache-control": "private, max-age=31536000, immutable"
			});
			createReadStream(imagePath(manifest.extension)).on("error", () => res.destroy()).pipe(res);
		}),
		exact(`${ADAPTIVE_THEME_API_PREFIX}/apply`, "POST", async (req, res) => {
			const body = await readBody(req);
			if (typeof body.data !== "string" || body.data.length > MAX_BODY_BYTES) throw new Error("invalid-image-data");
			const buffer = Buffer.from(body.data, "base64");
			const info = imageInfo(body.mime, buffer);
			const palette = validatePalette(body.palette);
			const visibility = validateVisibility(body.visibility);
			await mkdir(themeDir(), { recursive: true });
			for (const extension of [
				"png",
				"jpg",
				"webp"
			]) if (extension !== info.extension) await rm(imagePath(extension), { force: true });
			await atomicWrite(imagePath(info.extension), buffer);
			await atomicWrite(manifestPath(), `${JSON.stringify({
				version: 1,
				...info,
				palette,
				visibility,
				updatedAt: (/* @__PURE__ */ new Date()).toISOString()
			}, null, 2)}\n`);
			json(res, 200, await state());
		}),
		exact(`${ADAPTIVE_THEME_API_PREFIX}/visibility`, "POST", async (req, res) => {
			const visibility = validateVisibility((await readBody(req)).visibility);
			const manifest = await readManifest();
			if (manifest === void 0) throw new Error("theme-not-found");
			await atomicWrite(manifestPath(), `${JSON.stringify({
				...manifest,
				visibility,
				updatedAt: (/* @__PURE__ */ new Date()).toISOString()
			}, null, 2)}\n`);
			json(res, 200, await state());
		}),
		exact(`${ADAPTIVE_THEME_API_PREFIX}/restore`, "POST", async (_req, res) => {
			await rm(themeDir(), {
				recursive: true,
				force: true
			});
			json(res, 200, {
				ok: true,
				enabled: false
			});
		})
	];
}
//#endregion
//#region src/index.ts
const name = "ui-skin-center";
const inject = ["webServer"];
function apply(ctx) {
	try {
		ctx.effect(() => {
			const disposers = [];
			for (const route of makeAdaptiveThemeRoutes()) disposers.push(ctx.webServer.register(route));
			return () => {
				for (const dispose of disposers) dispose();
			};
		}, "adaptive-theme: routes");
	} catch (error) {
		console.error("[adaptive-theme] route registration failed:", error);
	}
}
//#endregion
export { ADAPTIVE_THEME_API_PREFIX, apply, inject, makeAdaptiveThemeRoutes, name };
