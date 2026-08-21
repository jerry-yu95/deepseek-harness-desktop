/**
 * Convert Electron's native clipboard image into a renderer-safe payload.
 * Only PNG bytes cross the IPC boundary; no file path or clipboard object is
 * exposed to the sandboxed renderer.
 */
export function serializeClipboardImage(image, text = '') {
  if (!image || typeof image.isEmpty !== 'function' || image.isEmpty()) return null
  const png = image.toPNG()
  if (!png || png.byteLength === 0) return null
  return {
    data: Uint8Array.from(png),
    type: 'image/png',
    name: 'pasted-image.png',
    text: typeof text === 'string' ? text : '',
  }
}
