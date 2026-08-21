import { describe, expect, it } from 'vitest'
import { contrastRatio, paletteFromPixels } from '../src/client/palette.ts'

const rgb = (hex: string) => ({ r: Number.parseInt(hex.slice(1, 3), 16), g: Number.parseInt(hex.slice(3, 5), 16), b: Number.parseInt(hex.slice(5, 7), 16) })

describe('adaptive palette', () => {
  it('selects dark mode for dark imagery and keeps body text readable', () => {
    const palette = paletteFromPixels([{ r: 8, g: 20, b: 45 }, { r: 30, g: 70, b: 120 }, { r: 15, g: 28, b: 50 }])
    expect(palette.mode).toBe('dark')
    expect(contrastRatio(rgb(palette.surface), rgb(palette.text))).toBeGreaterThanOrEqual(4.5)
  })

  it('selects light mode for bright imagery and keeps body text readable', () => {
    const palette = paletteFromPixels([{ r: 245, g: 220, b: 190 }, { r: 180, g: 220, b: 245 }, { r: 250, g: 245, b: 235 }])
    expect(palette.mode).toBe('light')
    expect(contrastRatio(rgb(palette.surface), rgb(palette.text))).toBeGreaterThanOrEqual(4.5)
  })
})
