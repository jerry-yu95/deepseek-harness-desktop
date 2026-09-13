import { lookup } from 'node:dns/promises'
import { request } from 'node:https'
import { isIP } from 'node:net'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import { articleImageCandidates, articleText, boundArticleText, prepareArticleMedia, type ArticleImageCandidate } from './article-text.ts'
import type { KnowledgeArticleMetadata } from './types.ts'
import { assertActive, withDeadline } from './cancellation.ts'
import { cacheArticleImages, type ArticleImageFetcher } from './article-images.ts'
import type { KnowledgeArticleResource } from './types.ts'

const MAX_REDIRECTS = 3
const MAX_BYTES = 1_048_576
const ALLOWED_TYPES = /^(?:text\/html|application\/xhtml\+xml|text\/plain)(?:;|$)/iu

export interface ImportedKnowledgeUrl {
  title: string
  content: string
  snapshot: string
  article: KnowledgeArticleMetadata
  articleResources?: KnowledgeArticleResource[]
  source: {
    kind: 'url'
    label: string
    uri: string
    mimeType: string
  }
}

interface PageResponse {
  status: number
  headers: Record<string, string>
  body: string
}

export type KnowledgeUrlFetcher = (url: URL, signal?: AbortSignal) => Promise<PageResponse>

/** Fetch one public text page without allowing local-network or credential-bearing URLs. */
export async function importKnowledgeUrl(input: string, fetchPage: KnowledgeUrlFetcher = fetchPublicPage, signal?: AbortSignal, fetchImage?: ArticleImageFetcher): Promise<ImportedKnowledgeUrl> {
  return withDeadline(signal ?? new AbortController().signal, 45_000, active => importPage(input, fetchPage, active, fetchImage), 'knowledge-fetch-timeout')
}

async function importPage(input: string, fetchPage: KnowledgeUrlFetcher, signal: AbortSignal, fetchImage?: ArticleImageFetcher): Promise<ImportedKnowledgeUrl> {
  let current = safePublicUrl(input)
  let response: PageResponse | undefined
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    assertActive(signal)
    response = await fetchPage(current, signal)
    assertActive(signal)
    if (response.status < 300 || response.status >= 400) break
    const location = response.headers.location
    if (location === undefined || redirects === MAX_REDIRECTS) throw new Error('knowledge URL redirected too many times')
    current = safePublicUrl(new URL(location, current).toString())
  }
  if (response === undefined || response.status < 200 || response.status >= 300) throw new Error(`knowledge URL returned HTTP ${response?.status ?? 0}`)
  const mimeType = response.headers['content-type']?.toLowerCase() ?? ''
  if (!ALLOWED_TYPES.test(mimeType)) throw new Error('knowledge URL is not a supported text page')
  const declared = Number(response.headers['content-length'] ?? 0)
  if (Number.isFinite(declared) && declared > MAX_BYTES) throw new Error('knowledge URL is too large')
  const raw = response.body
  if (Buffer.byteLength(raw, 'utf8') > MAX_BYTES) throw new Error('knowledge URL is too large')
  const html = /^text\/plain/iu.test(mimeType) ? undefined : raw
  const parsed = html === undefined ? { title: '', text: normalizeWhitespace(raw) } : extractReadableDocument(html, current)
  const bounded = boundArticleText(parsed.text)
  const snapshot = bounded.text
  if (snapshot.length === 0) throw new Error('knowledge URL did not contain readable text')
  const pageTitle = parsed.title
  const title = (pageTitle || current.hostname).slice(0, 160)
  const candidates = 'images' in parsed ? parsed.images ?? [] : []
  const cached = await cacheArticleImages(candidates.filter(image => (image.offset ?? 0) <= snapshot.length), signal, fetchImage)
  return {
    title,
    content: '',
    snapshot,
    article: { format: html === undefined ? 'text' : 'markdown', truncated: bounded.truncated, originalByteLength: bounded.originalByteLength, excerpt: snapshot.slice(0, 180), ...('author' in parsed && parsed.author ? { author: parsed.author as string } : {}), ...(cached.images.length ? { images: cached.images } : {}), ...(cached.imagesTruncated ? { imagesTruncated: true } : {}) },
    ...(cached.resources.length ? { articleResources: cached.resources } : {}),
    source: {
      kind: 'url',
      label: pageTitle ? `${pageTitle} · ${current.hostname}` : current.hostname,
      uri: current.toString(),
      mimeType: mimeType.split(';', 1)[0] || 'text/plain',
    },
  }
}

async function fetchPublicPage(url: URL, signal?: AbortSignal): Promise<PageResponse> {
  assertActive(signal)
  const address = await pinnedPublicAddress(url.hostname)
  assertActive(signal)
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: 'GET',
      signal,
      headers: {
        accept: 'text/html, application/xhtml+xml, text/plain;q=0.9',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.7',
        'user-agent': isWeChatArticleUrl(url)
          ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/127.0 Safari/537.36'
          : 'JIWEI/knowledge-import',
      },
      lookup: (_hostname, options, callback) => {
        if (typeof options === 'object' && options.all) callback(null, [address])
        else callback(null, address.address, address.family)
      },
    }, (response) => {
      response.on('error', reject)
      const chunks: Buffer[] = []
      let total = 0
      response.on('data', (chunk: Buffer) => {
        total += chunk.byteLength
        if (total > MAX_BYTES) {
          req.destroy(new Error('knowledge URL is too large'))
          return
        }
        chunks.push(chunk)
      })
      response.on('end', () => {
        try {
          const headers = Object.fromEntries(Object.entries(response.headers).flatMap(([key, value]) => value === undefined ? [] : [[key.toLowerCase(), Array.isArray(value) ? value.join(', ') : value]]))
          const body = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))
          resolve({ status: response.statusCode ?? 0, headers, body })
        } catch (error) { reject(error) }
      })
    })
    req.setTimeout(15_000, () => { req.destroy(new Error('knowledge URL timed out')) })
    req.on('error', reject)
    req.end()
  })
}

function safePublicUrl(input: string): URL {
  let url: URL
  try { url = new URL(input.trim()) } catch { throw new TypeError('knowledge URL is invalid') }
  if (url.protocol !== 'https:') throw new TypeError('knowledge URL must use https')
  if (url.username || url.password) throw new TypeError('knowledge URL must not contain credentials')
  url.hash = ''
  return url
}

async function pinnedPublicAddress(hostname: string): Promise<{ address: string; family: 4 | 6 }> {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/gu, '').replace(/\.$/u, '')
  if (normalized === 'localhost' || normalized.endsWith('.localhost') || normalized.endsWith('.local')) throw new Error('knowledge URL must use a public host')
  const literalFamily = isIP(normalized)
  const addresses = literalFamily ? [{ address: normalized, family: literalFamily as 4 | 6 }] : await lookup(normalized, { all: true, verbatim: true })
  return selectPinnedAddress(normalized, addresses.map(({ address, family }) => ({ address, family: family as 4 | 6 })))
}

/** Select one address while allowing proxy fake-IP only for exact trusted platform hosts. */
export function selectPinnedAddress(hostname: string, addresses: Array<{ address: string; family: 4 | 6 }>): { address: string; family: 4 | 6 } {
  if (addresses.length === 0) throw new Error('knowledge URL resolved to a private or unsupported address')
  const normalized = hostname.toLowerCase().replace(/\.$/u, '')
  if (isTrustedContentPlatformHost(normalized)) {
    const publicAddress = addresses.find(({ address }) => isPublicAddress(address))
    if (publicAddress !== undefined) return publicAddress
    if (addresses.every(({ address }) => isProxyFakeIpv4(address))) return addresses[0]
  }
  if (addresses.some(({ address }) => !isPublicAddress(address))) throw new Error('knowledge URL resolved to a private or unsupported address')
  return addresses[0]
}

export function isPublicAddress(address: string): boolean {
  if (address.includes(':')) {
    const value = address.toLowerCase()
    return value !== '::1' && value !== '::' && !value.startsWith('fc') && !value.startsWith('fd') && !/^fe[89ab]/u.test(value) && !value.startsWith('ff') && !value.startsWith('2001:db8:') && !value.startsWith('::ffff:')
  }
  const octets = address.split('.').map(Number)
  if (octets.length !== 4 || octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return false
  const [a, b, c] = octets
  return !(a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113) || a >= 224)
}

export function isWeChatArticleUrl(url: URL): boolean {
  return url.hostname.toLowerCase().replace(/\.$/u, '') === 'mp.weixin.qq.com' && (url.pathname === '/s' || url.pathname.startsWith('/s/'))
}

function isTrustedContentPlatformHost(hostname: string): boolean {
  return hostname === 'mp.weixin.qq.com'
}

function isProxyFakeIpv4(address: string): boolean {
  const octets = address.split('.').map(Number)
  return octets.length === 4 && octets[0] === 198 && (octets[1] === 18 || octets[1] === 19) && octets.every(value => Number.isInteger(value) && value >= 0 && value <= 255)
}

function extractReadableDocument(html: string, url: URL): { title: string; text: string; author?: string; images?: ArticleImageCandidate[] } {
  const dom = new JSDOM(html, { url: url.toString(), contentType: 'text/html' })
  try {
    const document = dom.window.document
    if (isWeChatArticleUrl(url)) return extractWeChatArticle(document)
    prepareArticleMedia(document.body)
    const article = new Readability(document.cloneNode(true) as Document, { charThreshold: 80, maxElemsToParse: 20_000 }).parse()
    const container = document.createElement('div')
    if (article?.content) container.innerHTML = article.content
    const text = articleText(article?.content ? container : document.body)
    const title = normalizeWhitespace(article?.title ?? extractTitle(html)).slice(0, 160)
    return { title, text, images: articleImageCandidates(article?.content ? container : document.body, url.toString()) }
  } finally {
    dom.window.close()
  }
}

function extractWeChatArticle(document: Document): { title: string; text: string; author?: string; images?: ArticleImageCandidate[] } {
  const source = document.querySelector('#js_content')
  if (source === null) {
    const errorText = normalizeWhitespace(document.body?.textContent ?? '')
    if (/\u53c2\u6570\u9519\u8bef|\u73af\u5883\u5f02\u5e38|\u8bbf\u95ee\u8fc7\u4e8e\u9891\u7e41|\u8bf7\u5728\u5fae\u4fe1\u5ba2\u6237\u7aef\u6253\u5f00/iu.test(errorText) || errorText.length < 200) {
      throw new Error('knowledge WeChat article requires browser session')
    }
    throw new Error('knowledge WeChat article did not contain readable content')
  }
  const content = source.cloneNode(true) as Element
  for (const element of content.querySelectorAll('script, style, noscript, svg, template')) element.remove()
  prepareArticleMedia(content)
  const title = normalizeWhitespace(document.querySelector('#activity-name')?.textContent ?? document.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? document.title).slice(0, 160)
  const author = normalizeWhitespace(document.querySelector('#js_name')?.textContent ?? document.querySelector('meta[name="author"]')?.getAttribute('content') ?? '')
  const body = articleText(content)
  if (body.length === 0) throw new Error('knowledge WeChat article did not contain readable content')
  const prefix = author === '' ? '' : `作者：${author}\n\n`
  return { title, ...(author ? { author } : {}), text: prefix + body, images: articleImageCandidates(content, document.location?.href).map(image => ({ ...image, offset: (image.offset ?? 0) + prefix.length })) }
}

function extractTitle(html: string): string {
  const match = /<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/iu.exec(html)
  return match === null ? '' : normalizeWhitespace(decodeEntities(match[1])).slice(0, 160)
}

function htmlToText(html: string): string {
  return decodeEntities(html
    .replace(/<!--[\s\S]*?-->/gu, ' ')
    .replace(/<(?:script|style|noscript|svg|template)(?:\s[^>]*)?>[\s\S]*?<\/(?:script|style|noscript|svg|template)>/giu, ' ')
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/tr)>/giu, '\n')
    .replace(/<[^>]+>/gu, ' '))
}

function decodeEntities(input: string): string {
  const named: Record<string, string> = { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"' }
  return input.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/giu, (_match, decimal: string | undefined, hex: string | undefined, name: string | undefined) => {
    if (decimal !== undefined) return String.fromCodePoint(Number(decimal))
    if (hex !== undefined) return String.fromCodePoint(Number.parseInt(hex, 16))
    return named[name?.toLowerCase() ?? ''] ?? ' '
  })
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\r\n?/gu, '\n').replace(/[\t\f ]+/gu, ' ').replace(/ *\n */gu, '\n').replace(/\n{3,}/gu, '\n\n').trim()
}
