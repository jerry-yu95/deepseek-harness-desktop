export interface AdaptivePalette {
  mode: 'light' | 'dark'
  accent: string
  accentHover: string
  surface: string
  surfaceStrong: string
  text: string
  muted: string
  border: string
  scrim: string
}

interface RGB { r: number; g: number; b: number }

const clamp = (value: number): number => Math.max(0, Math.min(255, Math.round(value)))
const hex = ({ r, g, b }: RGB): string => `#${[r, g, b].map(value => clamp(value).toString(16).padStart(2, '0')).join('')}`
const luminance = ({ r, g, b }: RGB): number => {
  const channel = (value: number): number => {
    const normalized = value / 255
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  }
  return channel(r) * 0.2126 + channel(g) * 0.7152 + channel(b) * 0.0722
}

export function contrastRatio(left: RGB, right: RGB): number {
  const a = luminance(left)
  const b = luminance(right)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

function mix(left: RGB, right: RGB, amount: number): RGB {
  return { r: left.r + (right.r - left.r) * amount, g: left.g + (right.g - left.g) * amount, b: left.b + (right.b - left.b) * amount }
}

function saturation(color: RGB): number {
  const max = Math.max(color.r, color.g, color.b)
  const min = Math.min(color.r, color.g, color.b)
  return max === 0 ? 0 : (max - min) / max
}

export function paletteFromPixels(pixels: RGB[]): AdaptivePalette {
  if (pixels.length === 0) throw new Error('image-has-no-pixels')
  const average = pixels.reduce((sum, color) => ({ r: sum.r + color.r, g: sum.g + color.g, b: sum.b + color.b }), { r: 0, g: 0, b: 0 })
  average.r /= pixels.length; average.g /= pixels.length; average.b /= pixels.length
  const mode: 'light' | 'dark' = luminance(average) < 0.34 ? 'dark' : 'light'
  const ranked = [...pixels].sort((a, b) => saturation(b) - saturation(a))
  const saturated = ranked.slice(0, Math.max(1, Math.ceil(ranked.length * 0.18)))
  const accentBase = saturated.reduce((sum, color) => ({ r: sum.r + color.r, g: sum.g + color.g, b: sum.b + color.b }), { r: 0, g: 0, b: 0 })
  accentBase.r /= saturated.length; accentBase.g /= saturated.length; accentBase.b /= saturated.length
  const white = { r: 255, g: 255, b: 255 }
  const black = { r: 10, g: 16, b: 28 }
  const text = mode === 'dark' ? { r: 245, g: 248, b: 255 } : { r: 17, g: 24, b: 39 }
  const surfaceBase = mode === 'dark' ? mix(average, black, 0.68) : mix(average, white, 0.82)
  const safeSurface = contrastRatio(surfaceBase, text) >= 4.5 ? surfaceBase : (mode === 'dark' ? black : white)
  let accent = mode === 'dark' ? mix(accentBase, white, 0.22) : mix(accentBase, black, 0.16)
  if (contrastRatio(accent, mode === 'dark' ? black : white) < 3) accent = mode === 'dark' ? mix(accent, white, 0.35) : mix(accent, black, 0.35)
  return {
    mode,
    accent: hex(accent), accentHover: hex(mode === 'dark' ? mix(accent, white, 0.14) : mix(accent, black, 0.14)),
    surface: hex(safeSurface), surfaceStrong: hex(mode === 'dark' ? mix(safeSurface, white, 0.08) : mix(safeSurface, black, 0.05)),
    text: hex(text), muted: hex(mode === 'dark' ? mix(text, safeSurface, 0.35) : mix(text, safeSurface, 0.42)),
    border: hex(mode === 'dark' ? mix(safeSurface, white, 0.24) : mix(safeSurface, black, 0.18)),
    scrim: mode === 'dark' ? 'rgba(5, 10, 20, 0.52)' : 'rgba(255, 255, 255, 0.34)',
  }
}

export async function analyseImage(file: Blob): Promise<AdaptivePalette> {
  const bitmap = await createImageBitmap(file)
  if (bitmap.width < 320 || bitmap.height < 180 || bitmap.width > 12000 || bitmap.height > 12000) {
    bitmap.close(); throw new Error('invalid-image-dimensions')
  }
  const canvas = document.createElement('canvas'); canvas.width = 36; canvas.height = 36
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (context === null) throw new Error('canvas-unavailable')
  context.drawImage(bitmap, 0, 0, 36, 36); bitmap.close()
  const data = context.getImageData(0, 0, 36, 36).data
  const pixels: RGB[] = []
  for (let index = 0; index < data.length; index += 16) if (data[index + 3] >= 180) pixels.push({ r: data[index], g: data[index + 1], b: data[index + 2] })
  return paletteFromPixels(pixels)
}
