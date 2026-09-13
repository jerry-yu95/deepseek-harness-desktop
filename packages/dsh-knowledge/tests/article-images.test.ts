import { describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { articleImageCandidates, articleText } from '../src/core/article-text.ts'
import { importKnowledgeUrl } from '../src/core/url-import.ts'
import { cacheArticleImages, fetchArticleImage } from '../src/core/article-images.ts'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
const response = (body = png, type = 'image/png') => ({ status: 200, headers: { 'content-type': type }, body })
const signal = () => new AbortController().signal
const publicLookup = vi.fn(async () => [{ address: '93.184.216.34', family: 4 }])

describe('restricted article image pipeline', () => {
  it('persists only safe failure categories and hides transport details', async () => {
    const candidates = ['format', 'access', 'timeout', 'unknown'].map((alt, order) => ({ src: `https://example.com/${order}`, alt, order }))
    const result = await cacheArticleImages(candidates, signal(), async url => {
      if (url.endsWith('/0')) throw new Error('knowledge-image-format')
      if (url.endsWith('/1')) return fetchArticleImage(url, signal(), { lookup: async () => [{ address: '198.18.0.1', family: 4 }], read: vi.fn() })
      if (url.endsWith('/2')) throw new Error('knowledge-image-timeout')
      throw Object.assign(new Error('synthetic-private-transport-detail'), { reason: 'synthetic-private-reason' })
    })
    expect(result.images.map(image => image.failureReason)).toEqual(['format', 'access', 'timeout', 'unknown'])
    expect(JSON.stringify(result)).not.toMatch(/synthetic-private|https:/)
  })
  it('caps aggregate cached bytes and preserves placeholders beyond the budget', async () => {
    const bytes = Buffer.alloc(5 * 1024 * 1024)
    png.copy(bytes)
    const fetch = vi.fn(async () => ({ mimeType: 'image/png' as const, byteLength: bytes.length, data: bytes.toString('base64') }))
    const candidates = Array.from({ length: 6 }, (_, order) => ({ src: `https://example.com/${order}.png`, alt: '', order }))
    const result = await cacheArticleImages(candidates, signal(), fetch)
    expect(result.resources).toHaveLength(4)
    expect(result.images.map(image => image.status)).toEqual(['ready', 'ready', 'ready', 'ready', 'unavailable', 'unavailable'])
    expect(result.imagesTruncated).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(4)
  })

  it('validates each public redirect and stops redirect loops', async () => {
    const read = vi.fn(async () => ({ status: 302, headers: { location: '/again' }, body: Buffer.alloc(0) }))
    const lookup = vi.fn(async () => [{ address: '93.184.216.34', family: 4 }])
    await expect(fetchArticleImage('https://example.com/a', signal(), { lookup, read })).rejects.toThrow('knowledge-image-unavailable')
    expect(lookup).toHaveBeenCalledTimes(4)
    expect(read).toHaveBeenCalledTimes(4)
  })
  it('keeps lazy images at their text offsets with relative and empty attributes', () => {
    const dom = new JSDOM('<article><p>前段</p><img data-src="" src="/a.png" alt="图一"><p>中段</p><img data-src="/b.png" src="/placeholder.png"><p>末段</p></article>')
    const root = dom.window.document.querySelector('article')!
    const text = articleText(root)
    const images = articleImageCandidates(root, 'https://example.com/article')
    expect(images).toMatchObject([{ src: 'https://example.com/a.png', offset: text.indexOf('前段') + 2 }, { src: 'https://example.com/b.png', offset: text.indexOf('中段') + 2 }])
    expect(text).not.toContain('https:')
    dom.window.close()
  })

  it('imports a new article with empty notes and cached image metadata', async () => {
    const fetchPage = async () => ({ status: 200, headers: { 'content-type': 'text/html' }, body: '<h1 id="activity-name">合成文章</h1><div id="js_content"><p>前段正文</p><img src="https://example.com/a.png" alt="示例"><p>后段正文</p></div>' })
    const fetchImage = vi.fn(async () => ({ mimeType: 'image/png' as const, byteLength: png.length, data: png.toString('base64') }))
    const imported = await importKnowledgeUrl('https://mp.weixin.qq.com/s/fixture', fetchPage, signal(), fetchImage)
    expect(imported.content).toBe('')
    expect(imported.article.images).toMatchObject([{ alt: '示例', offset: 4, status: 'ready' }])
    expect(imported.articleResources).toHaveLength(1)
    expect(JSON.stringify(imported.article)).not.toContain('https://')
  })

  it('pins every redirect lookup and rejects private redirect targets before transport', async () => {
    const read = vi.fn(async (_url: URL, _address: unknown) => ({ status: 302, headers: { location: 'https://127.0.0.1/a' }, body: Buffer.alloc(0) }))
    await expect(fetchArticleImage('https://example.com/a', signal(), { lookup: publicLookup, read })).rejects.toThrow('knowledge-image-unavailable')
    expect(read).toHaveBeenCalledTimes(1)
    expect(read.mock.calls[0][1]).toEqual({ address: '93.184.216.34', family: 4 })
  })

  it('rejects private DNS, credentials and unsupported schemes without a request', async () => {
    const read = vi.fn()
    for (const url of ['https://localhost/a', 'https://user:pass@example.com/a', 'file:///a', 'data:image/png,x', 'https://[::1]/a', 'https://[::ffff:127.0.0.1]/a']) {
      await expect(fetchArticleImage(url, signal(), { lookup: publicLookup, read })).rejects.toThrow('knowledge-image-unavailable')
    }
    await expect(fetchArticleImage('https://example.com/a', signal(), { lookup: async () => [{ address: '10.0.0.1', family: 4 }], read })).rejects.toThrow('knowledge-image-unavailable')
    expect(read).not.toHaveBeenCalled()
  })

  it('validates MIME, signature and response budget', async () => {
    for (const bad of [response(png, 'image/svg+xml'), response(Buffer.from('<html>bad</html>')), response(Buffer.alloc(5 * 1024 * 1024 + 1))]) {
      await expect(fetchArticleImage('https://example.com/a', signal(), { lookup: publicLookup, read: async () => bad })).rejects.toThrow('knowledge-image-unavailable')
    }
    expect(await fetchArticleImage('https://example.com/a', signal(), { lookup: publicLookup, read: async () => response() })).toMatchObject({ mimeType: 'image/png', byteLength: png.length })
  })

  it('bounds stalled downloads and cancellation without late resource publication', async () => {
    vi.useFakeTimers()
    try {
      const pending = fetchArticleImage('https://example.com/a', signal(), { lookup: publicLookup, read: () => new Promise(() => {}) })
      const checked = expect(pending).rejects.toThrow('knowledge-image-unavailable')
      await vi.advanceTimersByTimeAsync(8_001)
      await checked
    } finally { vi.useRealTimers() }
    const controller = new AbortController()
    const pending = cacheArticleImages([{ src: 'https://example.com/a', alt: '', order: 0 }], controller.signal, () => new Promise(() => {}))
    controller.abort()
    await expect(pending).rejects.toThrow('knowledge-cancelled')
  })

  it('retains failed placeholders and caps images without dropping the article', async () => {
    const candidates = Array.from({ length: 51 }, (_, order) => ({ src: `https://example.com/${order}.png`, alt: '', order }))
    const fetch = vi.fn(async () => { throw new Error('fixture') })
    const result = await cacheArticleImages(candidates, signal(), fetch)
    expect(result.images).toHaveLength(50)
    expect(result.images.every(image => image.status === 'unavailable')).toBe(true)
    expect(result.imagesTruncated).toBe(true)
    expect(result.resources).toEqual([])
  })
})
