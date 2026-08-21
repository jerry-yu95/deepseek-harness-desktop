import type { AdaptivePalette } from './palette.ts'

const STYLE_ID = 'dsh-adaptive-theme-runtime'
export const DEFAULT_WALLPAPER_VISIBILITY = 82

export function normalizeWallpaperVisibility(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(35, Math.min(100, Math.round(value)))
    : DEFAULT_WALLPAPER_VISIBILITY
}

export function applyAdaptiveTheme(imageUrl: string, palette: AdaptivePalette, requestedVisibility = DEFAULT_WALLPAPER_VISIBILITY): void {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (style === null) { style = document.createElement('style'); style.id = STYLE_ID; document.head.append(style) }
  const safeUrl = imageUrl.replaceAll('"', '%22').replaceAll('\\', '%5C')
  const visibility = normalizeWallpaperVisibility(requestedVisibility)
  const scrimOpacity = Math.max(0, Math.min(0.48, (100 - visibility) / 100))
  const scrim = palette.mode === 'dark'
    ? `rgba(5,10,20,${scrimOpacity.toFixed(2)})`
    : `rgba(255,255,255,${scrimOpacity.toFixed(2)})`
  const baseOpacity = Math.max(18, Math.round(72 - visibility * 0.52))
  const layerOneOpacity = Math.max(54, Math.round(94 - visibility * 0.32))
  const layerTwoOpacity = Math.max(64, Math.round(98 - visibility * 0.24))
  style.textContent = `body[data-dsh-adaptive-theme]{color:${palette.text};background-color:${palette.surface};background-image:linear-gradient(${scrim},${scrim}),url("${safeUrl}");background-position:center;background-size:cover;background-attachment:fixed;background-repeat:no-repeat;--dsw-alias-bg-base:color-mix(in srgb,${palette.surface} ${baseOpacity}%,transparent);--dsw-alias-bg-layer-1:color-mix(in srgb,${palette.surface} ${layerOneOpacity}%,transparent);--dsw-alias-bg-layer-2:color-mix(in srgb,${palette.surfaceStrong} ${layerTwoOpacity}%,transparent);--dsw-alias-bg-layer-3:color-mix(in srgb,${palette.surfaceStrong} 88%,transparent);--dsw-alias-bg-overlay:color-mix(in srgb,${palette.surface} 90%,transparent);--dsw-alias-bg-module-platform:color-mix(in srgb,${palette.surface} 72%,transparent);--dsw-alias-label-primary:${palette.text};--dsw-alias-label-secondary:${palette.muted};--dsw-alias-label-tertiary:${palette.muted};--dsw-alias-label-primary-foreground:${palette.mode === 'dark' ? '#07101c' : '#ffffff'};--dsw-alias-border-l1:color-mix(in srgb,${palette.border} 42%,transparent);--dsw-alias-border-l2:color-mix(in srgb,${palette.border} 62%,transparent);--dsw-alias-border-l3:${palette.border};--dsw-alias-brand-primary:${palette.accent};--dsw-alias-brand-text:${palette.accent};--dsw-alias-button-primary-fill:${palette.accent};--dsw-alias-button-primary-hover:${palette.accentHover};--dsw-alias-interactive-bg-hover:color-mix(in srgb,${palette.accent} 14%,transparent);--dsw-alias-interactive-bg-active:color-mix(in srgb,${palette.accent} 22%,transparent)}body[data-dsh-adaptive-theme] [id='root']{background:transparent}`
  document.body.dataset.dshAdaptiveTheme = ''
}

export function clearAdaptiveTheme(): void {
  delete document.body.dataset.dshAdaptiveTheme
  document.getElementById(STYLE_ID)?.remove()
}
