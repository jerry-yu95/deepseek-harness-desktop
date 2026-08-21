// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import type { AdaptivePalette } from '../src/client/palette.ts'
import { applyAdaptiveTheme, clearAdaptiveTheme, normalizeWallpaperVisibility } from '../src/client/runtime-theme.ts'

const palette: AdaptivePalette = {
  mode: 'dark', accent: '#55aaff', accentHover: '#77bbff', surface: '#081528', surfaceStrong: '#14243b',
  text: '#f5f8ff', muted: '#aab5c5', border: '#456078', scrim: 'rgba(5, 10, 20, 0.52)',
}

afterEach(() => clearAdaptiveTheme())

describe('adaptive theme runtime', () => {
  it('uses the vivid default for old manifests instead of their legacy heavy scrim', () => {
    applyAdaptiveTheme('/wallpaper.png', palette)
    const css = document.getElementById('dsh-adaptive-theme-runtime')?.textContent ?? ''
    expect(css).toContain('rgba(5,10,20,0.18)')
    expect(css).toContain('url("/wallpaper.png")')
    expect(css).toContain(`${palette.surface} 29%`)
  })

  it('clamps wallpaper visibility to the supported readable range', () => {
    expect(normalizeWallpaperVisibility(20)).toBe(35)
    expect(normalizeWallpaperVisibility(120)).toBe(100)
    expect(normalizeWallpaperVisibility(undefined)).toBe(82)
  })
})
