import { createReadStream } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'

export const ADAPTIVE_THEME_API_PREFIX = '/api/adaptive-theme'
const MAX_BODY_BYTES = 21 * 1024 * 1024
const MAX_IMAGE_BYTES = 15 * 1024 * 1024
const HEX = /^#[0-9a-f]{6}$/i
const SCRIM = /^rgba\(\d{1,3},\s*\d{1,3},\s*\d{1,3},\s*(?:0(?:\.\d+)?|1(?:\.0+)?)\)$/

interface Palette {
  mode: 'light' | 'dark'; accent: string; accentHover: string; surface: string; surfaceStrong: string
  text: string; muted: string; border: string; scrim: string
}
interface Manifest { version: 1; mime: string; extension: string; palette: Palette; updatedAt: string; visibility?: number }

const themeDir = (): string => join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'desktop', 'adaptive-theme')
const manifestPath = (): string => join(themeDir(), 'theme.json')
const imagePath = (extension: string): string => join(themeDir(), `background.${extension}`)

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body))
}
function sameOrigin(req: IncomingMessage): boolean {
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers.origin
  if (typeof origin !== 'string' || origin === '' || origin === 'null') return true
  try { return new URL(origin).host === req.headers.host } catch { return false }
}
function guard(req: IncomingMessage, res: ServerResponse, method: string): boolean {
  if (req.method !== method) { json(res, 405, { ok: false, error: 'method-not-allowed' }); return false }
  if (!sameOrigin(req)) { json(res, 403, { ok: false, error: 'cross-site-request-rejected' }); return false }
  return true
}
function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => { size += chunk.length; if (size > MAX_BODY_BYTES) reject(new Error('body-too-large')); else chunks.push(chunk) })
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>) } catch { reject(new Error('invalid-json')) } })
    req.on('error', reject)
  })
}
function validatePalette(value: unknown): Palette {
  if (typeof value !== 'object' || value === null) throw new Error('invalid-palette')
  const record = value as Record<string, unknown>
  if (record.mode !== 'light' && record.mode !== 'dark') throw new Error('invalid-palette-mode')
  for (const key of ['accent', 'accentHover', 'surface', 'surfaceStrong', 'text', 'muted', 'border']) if (typeof record[key] !== 'string' || !HEX.test(record[key])) throw new Error(`invalid-palette-${key}`)
  if (typeof record.scrim !== 'string' || !SCRIM.test(record.scrim)) throw new Error('invalid-palette-scrim')
  return record as unknown as Palette
}
function validateVisibility(value: unknown): number {
  if (value === undefined) return 82
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 35 || value > 100) throw new Error('invalid-visibility')
  return Math.round(value)
}
function imageInfo(mime: unknown, buffer: Buffer): { mime: string; extension: string } {
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) throw new Error('invalid-image-size')
  if (mime === 'image/png' && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mime, extension: 'png' }
  if (mime === 'image/jpeg' && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer.at(-2) === 0xff && buffer.at(-1) === 0xd9) return { mime, extension: 'jpg' }
  if (mime === 'image/webp' && buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return { mime, extension: 'webp' }
  throw new Error('invalid-image-content')
}
async function atomicWrite(path: string, data: string | Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`
  await writeFile(temp, data)
  await rename(temp, path)
}
async function readManifest(): Promise<Manifest | undefined> {
  try {
    const value = JSON.parse(await readFile(manifestPath(), 'utf8')) as Manifest
    validatePalette(value.palette)
    if (value.version !== 1 || !['png', 'jpg', 'webp'].includes(value.extension)) return undefined
    return value
  } catch { return undefined }
}
async function state(): Promise<Record<string, unknown>> {
  const manifest = await readManifest()
  if (manifest === undefined) return { ok: true, enabled: false }
  return { ok: true, enabled: true, palette: manifest.palette, visibility: validateVisibility(manifest.visibility), updatedAt: manifest.updatedAt, imageUrl: `${ADAPTIVE_THEME_API_PREFIX}/image?v=${encodeURIComponent(manifest.updatedAt)}` }
}
function exact(path: string, method: string, run: (req: IncomingMessage, res: ServerResponse) => Promise<void>): WebRoute {
  return { kind: 'exact', path, handler: (req, res) => { if (!guard(req, res, method)) return; void run(req, res).catch(error => json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })) } }
}

export function makeAdaptiveThemeRoutes(): WebRoute[] {
  return [
    exact(`${ADAPTIVE_THEME_API_PREFIX}/state`, 'GET', async (_req, res) => json(res, 200, await state())),
    exact(`${ADAPTIVE_THEME_API_PREFIX}/image`, 'GET', async (_req, res) => {
      const manifest = await readManifest(); if (manifest === undefined) return json(res, 404, { ok: false, error: 'theme-not-found' })
      res.writeHead(200, { 'content-type': manifest.mime, 'cache-control': 'private, max-age=31536000, immutable' })
      createReadStream(imagePath(manifest.extension)).on('error', () => res.destroy()).pipe(res)
    }),
    exact(`${ADAPTIVE_THEME_API_PREFIX}/apply`, 'POST', async (req, res) => {
      const body = await readBody(req)
      if (typeof body.data !== 'string' || body.data.length > MAX_BODY_BYTES) throw new Error('invalid-image-data')
      const buffer = Buffer.from(body.data, 'base64'); const info = imageInfo(body.mime, buffer); const palette = validatePalette(body.palette); const visibility = validateVisibility(body.visibility)
      await mkdir(themeDir(), { recursive: true })
      for (const extension of ['png', 'jpg', 'webp']) if (extension !== info.extension) await rm(imagePath(extension), { force: true })
      await atomicWrite(imagePath(info.extension), buffer)
      await atomicWrite(manifestPath(), `${JSON.stringify({ version: 1, ...info, palette, visibility, updatedAt: new Date().toISOString() }, null, 2)}\n`)
      json(res, 200, await state())
    }),
    exact(`${ADAPTIVE_THEME_API_PREFIX}/visibility`, 'POST', async (req, res) => {
      const body = await readBody(req); const visibility = validateVisibility(body.visibility); const manifest = await readManifest()
      if (manifest === undefined) throw new Error('theme-not-found')
      await atomicWrite(manifestPath(), `${JSON.stringify({ ...manifest, visibility, updatedAt: new Date().toISOString() }, null, 2)}\n`)
      json(res, 200, await state())
    }),
    exact(`${ADAPTIVE_THEME_API_PREFIX}/restore`, 'POST', async (_req, res) => { await rm(themeDir(), { recursive: true, force: true }); json(res, 200, { ok: true, enabled: false }) }),
  ]
}
