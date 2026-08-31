import { describe, expect, it, vi } from 'vitest'

import { importKnowledgeUrl, isPublicAddress, selectPinnedAddress } from '../src/core/url-import.ts'

describe('knowledge URL import', () => {
  it('extracts readable text and provenance without executing page content', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: '<html><head><title>产品复盘</title><script>steal()</script></head><body><h1>结论</h1><p>先验证再扩展。</p></body></html>',
    })
    const result = await importKnowledgeUrl('https://example.com/article#section', fetcher)
    expect(result).toMatchObject({ title: '产品复盘', content: expect.stringContaining('先验证再扩展。'), source: { kind: 'url', uri: 'https://example.com/article' } })
    expect(result.snapshot).not.toContain('steal')
  })

  it('extracts a WeChat article from its platform-specific content nodes', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: '<html><head><title>微信公众平台</title></head><body><h1 id="activity-name">Agent 知识库</h1><span id="js_name">Datawhale</span><div id="js_content"><h2>三层架构</h2><p>原始轨迹、持久知识与可执行技能。</p><script>steal()</script></div><div>留言与推荐</div></body></html>',
    })
    const result = await importKnowledgeUrl('https://mp.weixin.qq.com/s/example', fetcher)
    expect(result.title).toBe('Agent 知识库')
    expect(result.content).toContain('原始轨迹、持久知识与可执行技能。')
    expect(result.snapshot).toContain('作者：Datawhale')
    expect(result.snapshot).not.toContain('留言与推荐')
    expect(result.snapshot).not.toContain('steal')
  })

  it('reports a WeChat error page instead of saving it as knowledge', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: '<html><head><title>微信公众平台</title></head><body><div class="weui-msg__title warn">参数错误</div></body></html>',
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
})
