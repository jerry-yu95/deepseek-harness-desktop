import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'

import { importKnowledgeUrl, isPublicAddress, selectPinnedAddress } from '../src/core/url-import.ts'

describe('knowledge URL import', () => {
  it('bounds a nonresponsive fetch independently from its implementation', async () => {
    vi.useFakeTimers()
    try {
      let signal: AbortSignal | undefined
      const pending = importKnowledgeUrl('https://example.com/article', (_url, active) => { signal = active; return new Promise(() => {}) })
      const assertion = expect(pending).rejects.toThrow('knowledge-fetch-timeout')
      await vi.advanceTimersByTimeAsync(45_000)
      await assertion
      expect(signal?.aborted).toBe(true)
      expect(vi.getTimerCount()).toBe(0)
    } finally { vi.useRealTimers() }
  })

  it('cancels a stalled fetch and never follows a late redirect', async () => {
    const controller = new AbortController()
    let complete!: (value: never) => void
    const fetcher = vi.fn((_url: URL, signal?: AbortSignal) => { expect(signal).toBeDefined(); return new Promise<never>(resolve => { complete = resolve }) })
    const pending = importKnowledgeUrl('https://example.com/article', fetcher, controller.signal)
    controller.abort()
    await expect(pending).rejects.toThrow('knowledge-cancelled')
    complete({ status: 302, headers: { location: '/late' }, body: '' } as never)
    await Promise.resolve()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('extracts readable text and provenance without executing page content', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: '<html><head><title>产品复盘</title><script>steal()</script></head><body><h1>结论</h1><p>先验证再扩展。</p></body></html>',
    })
    const result = await importKnowledgeUrl('https://example.com/article#section', fetcher)
    expect(result).toMatchObject({ title: '产品复盘', content: '', article: { excerpt: expect.stringContaining('先验证再扩展。') }, source: { kind: 'url', uri: 'https://example.com/article' } })
    expect(result.snapshot).not.toContain('steal')
  })

  it('extracts a WeChat article from its platform-specific content nodes', async () => {
    const body = await readFile(new URL('./fixtures/wechat-article.html', import.meta.url), 'utf8')
    const fetcher = vi.fn().mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body,
    })
    const result = await importKnowledgeUrl('https://mp.weixin.qq.com/s/example', fetcher)
    expect(result.title).toBe('从对话到知识')
    expect(result.content).toBe('')
    expect(result.snapshot).toContain('把经验变成可复用资产')
    expect(result.snapshot).toContain('作者：JIWEI 测试作者')
    expect(result.snapshot).not.toContain('相关推荐')
    expect(result.snapshot).not.toContain('this content must not be imported')
  })

  it.each(['https://mp.weixin.qq.com/s/video', 'https://example.com/video'])('keeps video position without player text through URL extraction: %s', async url => {
    const before = '视频前的正文讨论了关注和分享的产品设计。'.repeat(8)
    const after = '视频后的正文继续提供文字结论。'.repeat(8)
    const body = `<html><head><title>合成视频文章</title></head><body><article id="js_content"><h1>合成视频文章</h1><p>${before}</p><div class="wx_video_context"><div class="txp_player"><video></video><button>退出全屏</button><button>重播</button><img src="https://example.com/player.jpg"></div></div><p>${after}</p><img src="https://example.com/article.jpg" alt="正文插图"></article></body></html>`
    const fetchImage = vi.fn().mockRejectedValue(new Error('knowledge-image-access'))
    const result = await importKnowledgeUrl(url, vi.fn().mockResolvedValue({ status: 200, headers: { 'content-type': 'text/html' }, body }), undefined, fetchImage)
    expect(result.snapshot).toContain(before)
    expect(result.snapshot).toContain(after)
    expect(result.snapshot?.match(/\[视频内容未解析\]/gu)).toHaveLength(1)
    expect(result.snapshot).not.toMatch(/退出全屏|重播/u)
    expect(result.snapshot!.indexOf('[视频内容未解析]')).toBeGreaterThan(result.snapshot!.indexOf(before))
    expect(result.snapshot!.indexOf('[视频内容未解析]')).toBeLessThan(result.snapshot!.indexOf(after))
    expect(fetchImage).toHaveBeenCalledTimes(1)
    expect(fetchImage).toHaveBeenCalledWith('https://example.com/article.jpg', expect.any(AbortSignal))
    expect(result.article.images).toHaveLength(1)
    expect(result.article.images?.[0].offset).toBe(result.snapshot.length)
  })

  it('reports a WeChat error page instead of saving it as knowledge', async () => {
    const body = await readFile(new URL('./fixtures/wechat-challenge.html', import.meta.url), 'utf8')
    const fetcher = vi.fn().mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body,
    })
    await expect(importKnowledgeUrl('https://mp.weixin.qq.com/s/example', fetcher)).rejects.toThrow(/WeChat article requires browser session/u)
  })

  it('rejects non-HTTPS and credential-bearing URLs before any request', async () => {
    const fetcher = vi.fn()
    await expect(importKnowledgeUrl('http://example.com', fetcher)).rejects.toThrow(/https/u)
    await expect(importKnowledgeUrl('https://user:pass@example.com', fetcher)).rejects.toThrow(/credentials/u)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('revalidates redirect targets and limits redirect depth', async () => {
    const fetcher = vi.fn().mockResolvedValue({ status: 302, headers: { location: '/again' }, body: '' })
    await expect(importKnowledgeUrl('https://example.com/start', fetcher)).rejects.toThrow(/redirected too many/u)
    expect(fetcher).toHaveBeenCalledTimes(4)
  })

  it('rejects private, mapped, link-local, documentation, and carrier-grade addresses', () => {
    for (const address of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '100.64.0.1', '169.254.1.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '::1', 'fc00::1', 'fe80::1', '2001:db8::1', '::ffff:127.0.0.1']) expect(isPublicAddress(address)).toBe(false)
    expect(isPublicAddress('1.1.1.1')).toBe(true)
    expect(isPublicAddress('2606:4700:4700::1111')).toBe(true)
  })

  it('permits proxy fake-IP only for an exact trusted content platform hostname', () => {
    const fakeIp = [{ address: '198.18.0.168', family: 4 as const }]
    expect(selectPinnedAddress('mp.weixin.qq.com', fakeIp)).toEqual(fakeIp[0])
    expect(() => selectPinnedAddress('example.com', fakeIp)).toThrow(/private or unsupported/u)
    expect(() => selectPinnedAddress('mp.weixin.qq.com.example.com', fakeIp)).toThrow(/private or unsupported/u)
  })

  it('preserves article headings, paragraphs, lists, and quotes as safe structured text', async () => {
    const body = await readFile(new URL('./fixtures/wechat-long-article.html', import.meta.url), 'utf8')
    const result = await importKnowledgeUrl('https://mp.weixin.qq.com/s/structured', vi.fn().mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body,
    }))
    expect(result.article).toMatchObject({ author: '合成作者', format: 'markdown', truncated: false })
    expect(result.snapshot).toContain('## 第一部分：原则')
    expect(result.snapshot).toContain('先把来源、摘要和用户笔记分开保存。')
    expect(result.snapshot).toContain('- 保留段落')
    expect(result.snapshot).toContain('> 这是只作为数据展示的引用内容。')
    expect(result.snapshot).not.toContain('doNotImport')
    expect(result.snapshot).not.toContain('onclick')
  })

  it('rejects oversized downloaded pages before projection', async () => {
    const body = `<html><body><article><h1>长文</h1><p>${'复用内容。'.repeat(180_000)}</p></article></body></html>`
    await expect(importKnowledgeUrl('https://example.com/long', vi.fn().mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body,
    }))).rejects.toThrow('too large')
  })
})
