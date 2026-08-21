window.__ModuleLoader__.load({
	id: "@linxin666/dsh-client-ui-skin-center",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/palette.ts
		const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));
		const hex = ({ r, g, b }) => `#${[
			r,
			g,
			b
		].map((value) => clamp(value).toString(16).padStart(2, "0")).join("")}`;
		const luminance = ({ r, g, b }) => {
			const channel = (value) => {
				const normalized = value / 255;
				return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
			};
			return channel(r) * .2126 + channel(g) * .7152 + channel(b) * .0722;
		};
		function contrastRatio(left, right) {
			const a = luminance(left);
			const b = luminance(right);
			return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
		}
		function mix(left, right, amount) {
			return {
				r: left.r + (right.r - left.r) * amount,
				g: left.g + (right.g - left.g) * amount,
				b: left.b + (right.b - left.b) * amount
			};
		}
		function saturation(color) {
			const max = Math.max(color.r, color.g, color.b);
			const min = Math.min(color.r, color.g, color.b);
			return max === 0 ? 0 : (max - min) / max;
		}
		function paletteFromPixels(pixels) {
			if (pixels.length === 0) throw new Error("image-has-no-pixels");
			const average = pixels.reduce((sum, color) => ({
				r: sum.r + color.r,
				g: sum.g + color.g,
				b: sum.b + color.b
			}), {
				r: 0,
				g: 0,
				b: 0
			});
			average.r /= pixels.length;
			average.g /= pixels.length;
			average.b /= pixels.length;
			const mode = luminance(average) < .34 ? "dark" : "light";
			const ranked = [...pixels].sort((a, b) => saturation(b) - saturation(a));
			const saturated = ranked.slice(0, Math.max(1, Math.ceil(ranked.length * .18)));
			const accentBase = saturated.reduce((sum, color) => ({
				r: sum.r + color.r,
				g: sum.g + color.g,
				b: sum.b + color.b
			}), {
				r: 0,
				g: 0,
				b: 0
			});
			accentBase.r /= saturated.length;
			accentBase.g /= saturated.length;
			accentBase.b /= saturated.length;
			const white = {
				r: 255,
				g: 255,
				b: 255
			};
			const black = {
				r: 10,
				g: 16,
				b: 28
			};
			const text = mode === "dark" ? {
				r: 245,
				g: 248,
				b: 255
			} : {
				r: 17,
				g: 24,
				b: 39
			};
			const surfaceBase = mode === "dark" ? mix(average, black, .68) : mix(average, white, .82);
			const safeSurface = contrastRatio(surfaceBase, text) >= 4.5 ? surfaceBase : mode === "dark" ? black : white;
			let accent = mode === "dark" ? mix(accentBase, white, .22) : mix(accentBase, black, .16);
			if (contrastRatio(accent, mode === "dark" ? black : white) < 3) accent = mode === "dark" ? mix(accent, white, .35) : mix(accent, black, .35);
			return {
				mode,
				accent: hex(accent),
				accentHover: hex(mode === "dark" ? mix(accent, white, .14) : mix(accent, black, .14)),
				surface: hex(safeSurface),
				surfaceStrong: hex(mode === "dark" ? mix(safeSurface, white, .08) : mix(safeSurface, black, .05)),
				text: hex(text),
				muted: hex(mode === "dark" ? mix(text, safeSurface, .35) : mix(text, safeSurface, .42)),
				border: hex(mode === "dark" ? mix(safeSurface, white, .24) : mix(safeSurface, black, .18)),
				scrim: mode === "dark" ? "rgba(5, 10, 20, 0.52)" : "rgba(255, 255, 255, 0.34)"
			};
		}
		async function analyseImage(file) {
			const bitmap = await createImageBitmap(file);
			if (bitmap.width < 320 || bitmap.height < 180 || bitmap.width > 12e3 || bitmap.height > 12e3) {
				bitmap.close();
				throw new Error("invalid-image-dimensions");
			}
			const canvas = document.createElement("canvas");
			canvas.width = 36;
			canvas.height = 36;
			const context = canvas.getContext("2d", { willReadFrequently: true });
			if (context === null) throw new Error("canvas-unavailable");
			context.drawImage(bitmap, 0, 0, 36, 36);
			bitmap.close();
			const data = context.getImageData(0, 0, 36, 36).data;
			const pixels = [];
			for (let index = 0; index < data.length; index += 16) if (data[index + 3] >= 180) pixels.push({
				r: data[index],
				g: data[index + 1],
				b: data[index + 2]
			});
			return paletteFromPixels(pixels);
		}
		//#endregion
		//#region src/client/runtime-theme.ts
		const STYLE_ID = "dsh-adaptive-theme-runtime";
		function normalizeWallpaperVisibility(value) {
			return typeof value === "number" && Number.isFinite(value) ? Math.max(35, Math.min(100, Math.round(value))) : 82;
		}
		function applyAdaptiveTheme(imageUrl, palette, requestedVisibility = 82) {
			let style = document.getElementById(STYLE_ID);
			if (style === null) {
				style = document.createElement("style");
				style.id = STYLE_ID;
				document.head.append(style);
			}
			const safeUrl = imageUrl.replaceAll("\"", "%22").replaceAll("\\", "%5C");
			const visibility = normalizeWallpaperVisibility(requestedVisibility);
			const scrimOpacity = Math.max(0, Math.min(.48, (100 - visibility) / 100));
			const scrim = palette.mode === "dark" ? `rgba(5,10,20,${scrimOpacity.toFixed(2)})` : `rgba(255,255,255,${scrimOpacity.toFixed(2)})`;
			const baseOpacity = Math.max(18, Math.round(72 - visibility * .52));
			const layerOneOpacity = Math.max(54, Math.round(94 - visibility * .32));
			const layerTwoOpacity = Math.max(64, Math.round(98 - visibility * .24));
			style.textContent = `body[data-dsh-adaptive-theme]{color:${palette.text};background-color:${palette.surface};background-image:linear-gradient(${scrim},${scrim}),url("${safeUrl}");background-position:center;background-size:cover;background-attachment:fixed;background-repeat:no-repeat;--dsw-alias-bg-base:color-mix(in srgb,${palette.surface} ${baseOpacity}%,transparent);--dsw-alias-bg-layer-1:color-mix(in srgb,${palette.surface} ${layerOneOpacity}%,transparent);--dsw-alias-bg-layer-2:color-mix(in srgb,${palette.surfaceStrong} ${layerTwoOpacity}%,transparent);--dsw-alias-bg-layer-3:color-mix(in srgb,${palette.surfaceStrong} 88%,transparent);--dsw-alias-bg-overlay:color-mix(in srgb,${palette.surface} 90%,transparent);--dsw-alias-bg-module-platform:color-mix(in srgb,${palette.surface} 72%,transparent);--dsw-alias-label-primary:${palette.text};--dsw-alias-label-secondary:${palette.muted};--dsw-alias-label-tertiary:${palette.muted};--dsw-alias-label-primary-foreground:${palette.mode === "dark" ? "#07101c" : "#ffffff"};--dsw-alias-border-l1:color-mix(in srgb,${palette.border} 42%,transparent);--dsw-alias-border-l2:color-mix(in srgb,${palette.border} 62%,transparent);--dsw-alias-border-l3:${palette.border};--dsw-alias-brand-primary:${palette.accent};--dsw-alias-brand-text:${palette.accent};--dsw-alias-button-primary-fill:${palette.accent};--dsw-alias-button-primary-hover:${palette.accentHover};--dsw-alias-interactive-bg-hover:color-mix(in srgb,${palette.accent} 14%,transparent);--dsw-alias-interactive-bg-active:color-mix(in srgb,${palette.accent} 22%,transparent)}body[data-dsh-adaptive-theme] [id='root']{background:transparent}`;
			document.body.dataset.dshAdaptiveTheme = "";
		}
		function clearAdaptiveTheme() {
			delete document.body.dataset.dshAdaptiveTheme;
			document.getElementById(STYLE_ID)?.remove();
		}
		//#endregion
		//#region \0dsh-css:<repository-root>/packages/skins/skin-center/src/client/skin-center.module.css.mjs
		const css = ".EfYupa_pluginCard{border:1px solid var(--dsw-alias-border-l1,#d8dde6);background:var(--dsw-alias-bg-layer-1,#fff);border-radius:14px;list-style:none;overflow:hidden}.EfYupa_cardHeader{appearance:none;color:var(--dsw-alias-label-primary,#172033);text-align:left;cursor:pointer;background:0 0;border:0;align-items:center;gap:16px;width:100%;padding:18px 22px;display:flex}.EfYupa_headText{flex:1;gap:5px;min-width:0;display:grid}.EfYupa_pluginName{align-items:center;gap:8px;font-size:16px;font-weight:700;display:flex}.EfYupa_titleBadge{letter-spacing:.08em;color:var(--dsw-alias-brand-primary,#2878d0);border:1px solid;border-radius:999px;padding:2px 6px;font-size:10px}.EfYupa_cardDescription,.EfYupa_intro,.EfYupa_privacy{color:var(--dsw-alias-label-secondary,#667085);font-size:13px;line-height:1.55}.EfYupa_chevron,.EfYupa_chevronOpen{transition:transform .18s}.EfYupa_chevronOpen{transform:rotate(180deg)}.EfYupa_cardBody{border-top:1px solid var(--dsw-alias-border-l1,#d8dde6);gap:14px;padding:18px 22px;display:grid}.EfYupa_intro,.EfYupa_privacy,.EfYupa_previewNotice,.EfYupa_error{margin:0}.EfYupa_hiddenInput{display:none}.EfYupa_dropZone{border:1px dashed var(--dsw-alias-border-l3,#98a2b3);background:var(--dsw-alias-bg-layer-2,#f7f8fa);cursor:pointer;border-radius:12px;width:100%;min-height:210px;padding:0;position:relative;overflow:hidden}.EfYupa_preview{object-fit:cover;width:100%;height:250px;display:block}.EfYupa_emptyPreview{min-height:210px;color:var(--dsw-alias-label-secondary,#667085);flex-direction:column;justify-content:center;align-items:center;gap:8px;font-size:30px;display:flex}.EfYupa_emptyPreview strong{color:var(--dsw-alias-label-primary,#172033);font-size:14px}.EfYupa_emptyPreview small{font-size:12px}.EfYupa_palette{color:var(--dsw-alias-label-secondary,#667085);align-items:center;gap:8px;font-size:12px;display:flex}.EfYupa_palette i{border:1px solid var(--dsw-alias-border-l2,#d0d5dd);border-radius:50%;width:22px;height:22px}.EfYupa_palette b{color:var(--dsw-alias-label-primary,#172033);margin-left:auto}.EfYupa_previewNotice{color:var(--dsw-alias-brand-primary,#2878d0);font-size:12px}.EfYupa_error{color:var(--dsw-alias-state-error-primary,#b42318);font-size:12px}.EfYupa_actions{gap:10px;display:flex}.EfYupa_button,.EfYupa_buttonPrimary{appearance:none;border:1px solid var(--dsw-alias-border-l2,#d0d5dd);background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#172033);cursor:pointer;border-radius:9px;padding:9px 15px;font-weight:600}.EfYupa_buttonPrimary{background:var(--dsw-alias-button-primary-fill,#2878d0);color:var(--dsw-alias-label-primary-foreground,#fff);border-color:#0000}.EfYupa_button:disabled,.EfYupa_buttonPrimary:disabled{opacity:.5;cursor:default}.EfYupa_privacy{font-size:11.5px}.EfYupa_visibilityControl{color:var(--dsw-alias-label-secondary,#667085);grid-template-columns:auto minmax(120px,1fr) 44px;align-items:center;gap:12px;font-size:12px;display:grid}.EfYupa_visibilityControl input{width:100%;accent-color:var(--dsw-alias-brand-primary,#2878d0)}.EfYupa_visibilityControl b{text-align:right;color:var(--dsw-alias-label-primary,#172033)}";
		const tagId = "@linxin666/dsh-client-ui-skin-center/skin-center.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@linxin666/dsh-client-ui-skin-center";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var skin_center_module_css_default = {
			"actions": "EfYupa_actions",
			"button": "EfYupa_button",
			"buttonPrimary": "EfYupa_buttonPrimary",
			"cardBody": "EfYupa_cardBody",
			"cardDescription": "EfYupa_cardDescription",
			"cardHeader": "EfYupa_cardHeader",
			"chevron": "EfYupa_chevron",
			"chevronOpen": "EfYupa_chevronOpen",
			"dropZone": "EfYupa_dropZone",
			"emptyPreview": "EfYupa_emptyPreview",
			"error": "EfYupa_error",
			"headText": "EfYupa_headText",
			"hiddenInput": "EfYupa_hiddenInput",
			"intro": "EfYupa_intro",
			"palette": "EfYupa_palette",
			"pluginCard": "EfYupa_pluginCard",
			"pluginName": "EfYupa_pluginName",
			"preview": "EfYupa_preview",
			"previewNotice": "EfYupa_previewNotice",
			"privacy": "EfYupa_privacy",
			"titleBadge": "EfYupa_titleBadge",
			"visibilityControl": "EfYupa_visibilityControl"
		};
		//#endregion
		//#region src/client/SkinCenter.tsx
		const API = "/api/adaptive-theme";
		const MAX_FILE_BYTES = 15 * 1024 * 1024;
		const ACCEPTED_TYPES = /* @__PURE__ */ new Set([
			"image/jpeg",
			"image/png",
			"image/webp"
		]);
		function fileToBase64(file) {
			return new Promise((resolve, reject) => {
				const reader = new FileReader();
				reader.onerror = () => reject(reader.error ?? /* @__PURE__ */ new Error("file-read-failed"));
				reader.onload = () => {
					const value = String(reader.result ?? "");
					const comma = value.indexOf(",");
					if (comma < 0) reject(/* @__PURE__ */ new Error("file-read-failed"));
					else resolve(value.slice(comma + 1));
				};
				reader.readAsDataURL(file);
			});
		}
		function SkinCenter({ t, theme }) {
			const input = (0, react.useRef)(null);
			const previewUrl = (0, react.useRef)(null);
			const [open, setOpen] = (0, react.useState)(false);
			const [state, setState] = (0, react.useState)({ enabled: false });
			const [candidate, setCandidate] = (0, react.useState)(null);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const [visibility, setVisibility] = (0, react.useState)(82);
			const [visibilityDirty, setVisibilityDirty] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				fetch(`${API}/state`).then(async (response) => {
					const payload = await response.json();
					if (response.ok && payload.ok === true) {
						setState(payload);
						setVisibility(normalizeWallpaperVisibility(payload.visibility));
					}
				}).catch(() => {});
				return () => {
					if (previewUrl.current !== null) URL.revokeObjectURL(previewUrl.current);
				};
			}, []);
			const choose = async (file) => {
				setError(null);
				if (!ACCEPTED_TYPES.has(file.type)) return setError(t("invalidType"));
				if (file.size > MAX_FILE_BYTES) return setError(t("tooLarge"));
				try {
					const palette = await analyseImage(file);
					const url = URL.createObjectURL(file);
					if (previewUrl.current !== null) URL.revokeObjectURL(previewUrl.current);
					previewUrl.current = url;
					setCandidate({
						file,
						palette,
						url
					});
					theme.setTheme(palette.mode);
					applyAdaptiveTheme(url, palette, visibility);
				} catch {
					setError(t("decodeFailed"));
				}
			};
			const apply = async () => {
				if (candidate === null && (!state.enabled || !visibilityDirty)) return;
				setBusy(true);
				setError(null);
				try {
					const response = candidate === null ? await fetch(`${API}/visibility`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ visibility })
					}) : await fetch(`${API}/apply`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							mime: candidate.file.type,
							data: await fileToBase64(candidate.file),
							palette: candidate.palette,
							visibility
						})
					});
					const payload = await response.json().catch(() => null);
					if (!response.ok || payload?.ok !== true) throw new Error(payload?.error ?? `HTTP ${response.status}`);
					setState(payload);
					const palette = payload.palette ?? candidate?.palette;
					const imageUrl = payload.imageUrl ?? candidate?.url;
					if (palette !== void 0 && imageUrl !== void 0) applyAdaptiveTheme(imageUrl, palette, visibility);
					setCandidate(null);
					setVisibilityDirty(false);
				} catch (cause) {
					setError(`${t("applyFailed")}: ${cause instanceof Error ? cause.message : String(cause)}`);
				} finally {
					setBusy(false);
				}
			};
			const restore = async () => {
				setBusy(true);
				setError(null);
				try {
					const response = await fetch(`${API}/restore`, { method: "POST" });
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					clearAdaptiveTheme();
					setCandidate(null);
					setState({ enabled: false });
					setVisibility(82);
					setVisibilityDirty(false);
				} catch (cause) {
					setError(`${t("restoreFailed")}: ${cause instanceof Error ? cause.message : String(cause)}`);
				} finally {
					setBusy(false);
				}
			};
			const visiblePalette = candidate?.palette ?? state.palette;
			const visibleImage = candidate?.url ?? state.imageUrl;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: skin_center_module_css_default.pluginCard,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: skin_center_module_css_default.cardHeader,
					"aria-expanded": open,
					onClick: () => setOpen((value) => !value),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: skin_center_module_css_default.headText,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: skin_center_module_css_default.pluginName,
							children: [t("title"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: skin_center_module_css_default.titleBadge,
								children: "AUTO"
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: skin_center_module_css_default.cardDescription,
							children: t("cardDescription")
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: open ? skin_center_module_css_default.chevronOpen : skin_center_module_css_default.chevron,
						children: "▾"
					})]
				}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: skin_center_module_css_default.cardBody,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: skin_center_module_css_default.intro,
							children: t("intro")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							ref: input,
							className: skin_center_module_css_default.hiddenInput,
							type: "file",
							accept: "image/png,image/jpeg,image/webp",
							onChange: (event) => {
								const file = event.currentTarget.files?.[0];
								if (file !== void 0) choose(file);
								event.currentTarget.value = "";
							}
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: skin_center_module_css_default.dropZone,
							onClick: () => input.current?.click(),
							children: visibleImage !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
								className: skin_center_module_css_default.preview,
								src: visibleImage,
								alt: ""
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: skin_center_module_css_default.emptyPreview,
								children: [
									"＋",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("choose") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("formatHint") })
								]
							})
						}),
						visiblePalette !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: skin_center_module_css_default.palette,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("generatedPalette") }),
								[
									visiblePalette.accent,
									visiblePalette.surface,
									visiblePalette.text,
									visiblePalette.muted
								].map((color) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {
									style: { backgroundColor: color },
									title: color
								}, color)),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: visiblePalette.mode === "dark" ? t("themeDark") : t("themeLight") })
							]
						}),
						visibleImage !== void 0 && visiblePalette !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: skin_center_module_css_default.visibilityControl,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("visibility") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "range",
									min: "35",
									max: "100",
									step: "1",
									value: visibility,
									onChange: (event) => {
										const next = normalizeWallpaperVisibility(Number(event.currentTarget.value));
										setVisibility(next);
										setVisibilityDirty(true);
										applyAdaptiveTheme(visibleImage, visiblePalette, next);
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: [visibility, "%"] })
							]
						}),
						candidate !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: skin_center_module_css_default.previewNotice,
							children: t("previewNotice")
						}),
						error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: skin_center_module_css_default.error,
							children: error
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: skin_center_module_css_default.actions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: skin_center_module_css_default.buttonPrimary,
								disabled: candidate === null && !visibilityDirty || busy,
								onClick: () => void apply(),
								children: busy ? t("saving") : t("apply")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: skin_center_module_css_default.button,
								disabled: busy || !state.enabled && candidate === null,
								onClick: () => void restore(),
								children: t("restore")
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: skin_center_module_css_default.privacy,
							children: t("privacy")
						})
					]
				})]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		const zh = {
			title: "自定义皮肤",
			cardDescription: "上传一张图片，自动生成可读、协调的界面主题。",
			intro: "保留官方布局，只根据图片自动适配背景、明暗模式、强调色与安全对比度。",
			choose: "选择皮肤图片",
			formatHint: "PNG / JPEG / WebP，最大 15 MB，建议横图",
			generatedPalette: "自动配色",
			themeLight: "亮色",
			themeDark: "暗色",
			visibility: "壁纸可见度",
			previewNotice: "当前为即时预览；点击应用后才会在重启后保留。",
			apply: "应用此皮肤",
			saving: "正在保存…",
			restore: "恢复官方默认",
			privacy: "图片仅保存在本机，不会上传到任何外部服务。",
			invalidType: "仅支持 PNG、JPEG 或 WebP 图片。",
			tooLarge: "图片不能超过 15 MB。",
			decodeFailed: "图片无法解析，或尺寸不在 320×180 至 12000×12000 范围内。",
			applyFailed: "应用失败",
			restoreFailed: "恢复失败"
		};
		const en = {
			title: "Custom Theme",
			cardDescription: "Upload one image and generate a coordinated, readable theme automatically.",
			intro: "Keeps the official layout while adapting the backdrop, color mode, accent, and safe contrast.",
			choose: "Choose theme image",
			formatHint: "PNG / JPEG / WebP, up to 15 MB; landscape recommended",
			generatedPalette: "Generated palette",
			themeLight: "Light",
			themeDark: "Dark",
			visibility: "Wallpaper visibility",
			previewNotice: "This is a live preview. Apply it to keep it after restart.",
			apply: "Apply theme",
			saving: "Saving…",
			restore: "Restore official default",
			privacy: "The image stays on this computer and is never uploaded externally.",
			invalidType: "Only PNG, JPEG, and WebP images are supported.",
			tooLarge: "The image must be 15 MB or smaller.",
			decodeFailed: "The image cannot be decoded or its dimensions are outside 320×180–12000×12000.",
			applyFailed: "Apply failed",
			restoreFailed: "Restore failed"
		};
		//#endregion
		//#region src/client/index.ts
		const NS = "skinCenter";
		const inject = [
			"slots",
			"locale",
			"theme",
			"settingsScope",
			"connection",
			"remote"
		];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "adaptive-theme: dictionaries");
			document.body.dataset.dshSkinCenter = "";
			ctx.effect(() => () => {
				delete document.body.dataset.dshSkinCenter;
				clearAdaptiveTheme();
			}, "adaptive-theme: body scope");
			const theme = ctx.get("theme");
			const injected = () => ({ theme: {
				getTheme: () => theme.getTheme(),
				subscribe: (listener) => ctx.on("theme/change", listener),
				setTheme: (id) => theme.setTheme(id)
			} });
			fetch("/api/adaptive-theme/state").then(async (response) => {
				const state = await response.json();
				if (response.ok && state.ok === true && state.enabled === true && state.imageUrl !== void 0 && state.palette !== void 0) {
					theme.setTheme(state.palette.mode);
					applyAdaptiveTheme(state.imageUrl, state.palette, state.visibility);
				}
			}).catch(() => {});
			ctx.slots.inject("web-ui.plugin.item", () => ctx.slots.register({
				name: "web-ui.plugin.item",
				id: "adaptive-theme",
				order: 110,
				locale: NS,
				inject: injected
			}, SkinCenter));
		}
		//#endregion
		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map