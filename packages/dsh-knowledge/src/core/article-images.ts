import { createHash } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'
import { isIP } from 'node:net'
import { assertActive, withDeadline } from './cancellation.ts'
import { decodeArticleImageData } from './validate.ts'
import type { ArticleImageCandidate } from './article-text.ts'
import type { KnowledgeArticleImageMetadata, KnowledgeArticleResource } from './types.ts'
import { ARTICLE_IMAGE_FAILURES, type ArticleImageFailure } from './types.ts'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_TOTAL_BYTES = 20 * 1024 * 1024
type Address = { address: string; family: number }
type ImageBytes = Pick<KnowledgeArticleResource, 'mimeType' | 'byteLength' | 'data'>
type ImageResponse = { status: number; headers: Record<string, string>; body: Buffer }
type ImageDependencies = {
  lookup?: (hostname: string) => Promise<Address[]>
  read?: (url: URL, address: Address, signal: AbortSignal, maxBytes: number) => Promise<ImageResponse>
}
export type ArticleImageFetcher = (url: string, signal: AbortSignal) => Promise<ImageBytes>

function failureReason(error: unknown): ArticleImageFailure {
  const message = error instanceof Error ? error.message : ''
  return ARTICLE_IMAGE_FAILURES.find(reason => message === `knowledge-image-${reason}`) ?? 'unknown'
}

/** Shared byte validation for pinned HTTP and the desktop's fixed-CDN transport. */
export function decodeArticleImageResponse(body: Buffer, contentType?: string): ImageBytes {
  if (!body.length || body.length > MAX_IMAGE_BYTES) throw new Error('knowledge-image-limit')
  const mimeType = contentType?.split(';', 1)[0].trim().toLowerCase()
  if (mimeType !== 'image/png' && mimeType !== 'image/jpeg' && mimeType !== 'image/gif' && mimeType !== 'image/webp') throw new Error('knowledge-image-format')
  const data = body.toString('base64')
  try { decodeArticleImageData(data, mimeType, body.length) } catch { throw new Error('knowledge-image-format') }
  return { mimeType, data, byteLength: body.length }
}

/** Public images only: no browser session, cookies, proxy, or Referer. */
export async function fetchArticleImage(input: string, signal: AbortSignal, dependencies: ImageDependencies = {}): Promise<ImageBytes> {
  try {
    return await withDeadline(signal, 8_000, async active => {
      let url = new URL(input)
      for (let redirects = 0; redirects <= 3; redirects++) {
        assertActive(active)
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('knowledge-image-access')
        const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/gu, '').replace(/\.$/u, '')
        if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) throw new Error('knowledge-image-access')
        const family = isIP(hostname)
        const addresses = family ? [{ address: hostname, family }] : await (dependencies.lookup ?? (host => lookup(host, { all: true, verbatim: true })))(hostname)
        assertActive(active)
        if (!addresses.length || addresses.some(address => !publicImageAddress(address.address))) throw new Error('knowledge-image-access')
        const response = await (dependencies.read ?? readImage)(url, addresses[0], active, MAX_IMAGE_BYTES)
        assertActive(active)
        if (response.status >= 300 && response.status < 400) {
          if (redirects === 3 || !response.headers.location) throw new Error()
          url = new URL(response.headers.location, url)
          continue
        }
        if (response.status < 200 || response.status >= 300) throw new Error('knowledge-image-access')
        return decodeArticleImageResponse(response.body, response.headers['content-type'])
      }
      throw new Error()
    }, 'knowledge-image-timeout')
  } catch (error) {
    assertActive(signal)
    throw Object.assign(new Error('knowledge-image-unavailable'), { reason: failureReason(error) })
  }
}

/** Reject special ranges as well as local addresses; do not honor proxy fake IPs. */
function publicImageAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const value = address.toLowerCase()
    return /^[23][0-9a-f]{3}:/u.test(value) && !value.startsWith('2001:') && !value.startsWith('2002:') && !value.startsWith('3fff:')
  }
  if (isIP(address) !== 4) return false
  const [a, b, c] = address.split('.').map(Number)
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113))
}

function readImage(url: URL, address: Address, signal: AbortSignal, maxBytes: number): Promise<ImageResponse> {
  return new Promise((resolve, reject) => {
    const request = url.protocol === 'https:' ? httpsRequest : httpRequest
    const req = request(url, {
      signal,
      headers: { accept: 'image/png,image/jpeg,image/gif,image/webp' },
      lookup: (_hostname, options, callback) => {
        if (typeof options === 'object' && options.all) callback(null, [address])
        else callback(null, address.address, address.family)
      },
    }, response => {
      response.on('error', reject)
      const headers = Object.fromEntries(Object.entries(response.headers).flatMap(([key, value]) => value === undefined ? [] : [[key, Array.isArray(value) ? value.join(', ') : value]]))
      const status = response.statusCode ?? 0
      if (status >= 300 && status < 400) { resolve({ status, headers, body: Buffer.alloc(0) }); response.destroy(); return }
      if (Number(headers['content-length']) > maxBytes) { req.destroy(new Error('knowledge-image-limit')); return }
      let size = 0
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > maxBytes) req.destroy(new Error('knowledge-image-limit'))
        else chunks.push(chunk)
      })
      response.on('end', () => resolve({ status, headers, body: Buffer.concat(chunks) }))
    })
    req.on('error', reject)
    req.end()
  })
}

export async function cacheArticleImages(candidates: ArticleImageCandidate[], signal: AbortSignal, fetchImage: ArticleImageFetcher = fetchArticleImage) {
  const images: KnowledgeArticleImageMetadata[] = []
  const resources: KnowledgeArticleResource[] = []
  let total = 0
  let imagesTruncated = candidates.length > 50
  const started = Date.now()
  for (const candidate of candidates.slice(0, 50)) {
    assertActive(signal)
    const metadata: KnowledgeArticleImageMetadata = { id: `image_${createHash('sha256').update(candidate.src).digest('hex').slice(0, 32)}`, alt: candidate.alt, order: images.length, ...(candidate.offset === undefined ? {} : { offset: candidate.offset }), status: 'unavailable' }
    try {
      if (total >= MAX_TOTAL_BYTES || Date.now() - started >= 30_000) { imagesTruncated = true; throw new Error('knowledge-image-limit') }
      const bytes = await withDeadline(signal, Math.min(8_000, 30_000 - (Date.now() - started)), active => fetchImage(candidate.src, active), 'knowledge-image-timeout')
      assertActive(signal)
      if (bytes.byteLength <= 0 || bytes.byteLength > MAX_IMAGE_BYTES || total + bytes.byteLength > MAX_TOTAL_BYTES) { imagesTruncated = true; throw new Error('knowledge-image-limit') }
      decodeArticleImageData(bytes.data, bytes.mimeType, bytes.byteLength)
      total += bytes.byteLength
      images.push({ ...metadata, status: 'ready', mimeType: bytes.mimeType, byteLength: bytes.byteLength })
      resources.push({ ...metadata, ...bytes, status: 'ready' })
    } catch (error) {
      assertActive(signal)
      const reported = error && typeof error === 'object' && 'reason' in error ? error.reason : undefined
      const reason = ARTICLE_IMAGE_FAILURES.find(value => value === reported) ?? failureReason(error)
      images.push({ ...metadata, failureReason: reason })
    }
  }
  return { images, resources, imagesTruncated }
}
