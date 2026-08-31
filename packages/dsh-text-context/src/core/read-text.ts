/**
 * Read a browser File as UTF-8 text: strip BOM, reject NUL / non-UTF-8 / binary.
 */

/** Why a text read failed. */
export type ReadTextError = 'too-large' | 'utf8' | 'binary'

/** Successful or failed UTF-8 read. */
export type ReadTextResult =
  | { ok: true; text: string; bytes: number }
  | { ok: false; reason: ReadTextError }

const UTF8_BOM = [0xef, 0xbb, 0xbf] as const

/**
 * Decode file bytes as UTF-8. Does not persist content.
 * @param file - browser File.
 * @param maxBytes - per-file ceiling.
 */
export async function readTextFile(file: File, maxBytes: number): Promise<ReadTextResult> {
  if (file.size > maxBytes) return { ok: false, reason: 'too-large' }
  let bytes: Uint8Array
  try {
    bytes = await readBlobBytes(file)
  } catch {
    return { ok: false, reason: 'utf8' }
  }
  if (bytes.byteLength > maxBytes) return { ok: false, reason: 'too-large' }

  let offset = 0
  if (
    bytes.length >= 3
    && bytes[0] === UTF8_BOM[0]
    && bytes[1] === UTF8_BOM[1]
    && bytes[2] === UTF8_BOM[2]
  ) {
    offset = 3
  }

  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(offset))
  } catch {
    return { ok: false, reason: 'utf8' }
  }

  if (text.includes('\0')) return { ok: false, reason: 'binary' }
  if (looksBinary(text)) return { ok: false, reason: 'binary' }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  return { ok: true, text, bytes: bytes.byteLength }
}

/**
 * Read blob bytes even when File.arrayBuffer is missing (some test hosts).
 * @param file - File or Blob.
 */
export async function readBlobBytes(file: Blob): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') {
    return new Uint8Array(await file.arrayBuffer())
  }
  if (typeof FileReader === 'function') {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) resolve(new Uint8Array(reader.result))
        else reject(new TypeError('expected ArrayBuffer'))
      }
      reader.onerror = () => { reject(reader.error ?? new TypeError('read failed')) }
      reader.readAsArrayBuffer(file)
    })
  }
  throw new TypeError('no binary reader available')
}

/**
 * Reject payloads that are mostly C0 controls (excluding tab / LF / CR).
 * @param text - already-decoded UTF-8.
 */
export function looksBinary(text: string): boolean {
  let control = 0
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) control += 1
  }
  if (control === 0) return false
  return control > 8 || control / Math.max(text.length, 1) > 0.02
}
