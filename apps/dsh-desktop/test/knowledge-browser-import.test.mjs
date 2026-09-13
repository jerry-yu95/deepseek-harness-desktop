import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'
import { imageRequestFixture } from './helpers/image-request-fixture.mjs'

import { EXTRACT_SCRIPT, createKnowledgeBrowserImporter, isAllowedWeChatResource, normalizeWeChatArticleUrl, projectWeChatArticle } from '../src/knowledge-browser-import.mjs'

function browserFixture(load = async () => {}, configure = () => {}, netRequest) {
  const windows = []
  class BrowserWindow extends EventEmitter {
    constructor() {
      super()
      this.destroyed = false
      this.webContents = Object.assign(new EventEmitter(), {
        setWindowOpenHandler() {}, isDestroyed: () => this.destroyed,
        session: { on() {}, webRequest: { onBeforeRequest() {} } },
        executeJavaScript: async () => ({ kind: 'article', title: '合成文章', text: '合成正文用于测试取消与解析，不访问任何真实文章。' }),
      })
      windows.push(this)
      configure(this)
    }
    loadURL() { return load() }
    isDestroyed() { return this.destroyed }
    destroy() { if (!this.destroyed) { this.destroyed = true; this.emit('closed') } }
    show() {}
  }
  return { windows, run: createKnowledgeBrowserImporter({ BrowserWindow, netRequest }) }
}

test('default importer uses its browser session for CDN images and carries safe failures to metadata', async () => {
  const data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
  const { calls, requestImage } = imageRequestFixture(async url => url.endsWith('/ok.png') ? new Response(Buffer.from(data, 'base64'), { headers: { 'content-type': 'image/png' } }) : new Response(null, { status: 403 }))
  const { run } = browserFixture(undefined, window => {
    window.webContents.executeJavaScript = async () => ({ kind: 'article', title: '合成图片文章', text: '合成文章内容用于验证默认浏览器图片下载路径。', images: [{ src: 'https://mmbiz.qpic.cn/ok.png', alt: '成功', order: 0 }, { src: 'https://mmbiz.qpic.cn/fail.png', alt: '失败', order: 1 }] })
  }, requestImage)
  const result = await run('https://mp.weixin.qq.com/s/fixture')
  assert.equal(calls.length, 2)
  assert.ok(calls.every(call => call.options.credentials === 'omit'))
  assert.equal(result.article.images[0].status, 'ready')
  assert.equal(result.article.images[1].failureReason, 'access')
  assert.equal(result.articleResources[0].data, data)
  assert.doesNotMatch(JSON.stringify(result.article), /qpic|fail.png/)
})

test('invalid input does not permanently lock browser imports', async () => {
  const { run, windows } = browserFixture()
  await assert.rejects(run('invalid'), /invalid/)
  const phases = []
  const result = await run('https://mp.weixin.qq.com/s/fixture', { onProgress: stage => phases.push(stage) })
  assert.equal(result.title, '合成文章')
  assert.deepEqual(phases, ['fetching', 'structuring'])
  assert.equal(windows[0].isDestroyed(), true)
})

test('cancellation destroys a stalled window, rejects promptly and permits a new request', async () => {
  let resolveLoad
  let first = true
  const { run, windows } = browserFixture(() => first ? (first = false, new Promise(resolve => { resolveLoad = resolve })) : Promise.resolve())
  const controller = new AbortController()
  const pending = run('https://mp.weixin.qq.com/s/fixture', { signal: controller.signal })
  controller.abort()
  await assert.rejects(pending, /knowledge-cancelled/)
  assert.equal(windows[0].isDestroyed(), true)
  assert.equal((await run('https://mp.weixin.qq.com/s/fixture')).title, '合成文章')
  resolveLoad()
  assert.equal(windows.length, 2)
})

test('test-profile fixture importer reports real stages and cancels without leaving an active request', async () => {
  let release
  const run = createKnowledgeBrowserImporter({
    BrowserWindow: class {},
    testFixture: () => new Promise(resolve => { release = resolve }),
  })
  const controller = new AbortController()
  const stages = []
  const pending = run('https://mp.weixin.qq.com/s/fixture', { signal: controller.signal, onProgress: stage => stages.push(stage) })
  assert.deepEqual(stages, ['fetching'])
  controller.abort()
  await assert.rejects(pending, /knowledge-cancelled/)
  release({ title: '迟到合成文章', text: '这是一段长度足够的合成正文，用来验证取消后的结果不会落入界面。' })
  await Promise.resolve()
  assert.deepEqual(stages, ['fetching'])
})

const { JSDOM } = createRequire(import.meta.resolve('@harness-design/dsh-knowledge/package.json'))('jsdom')

test('video player UI becomes one positioned placeholder without swallowing real prose or images', () => {
  const dom = new JSDOM('<h1 id="activity-name">合成视频文章</h1><div id="js_content"><p>正文也会提到关注和分享。</p><div class="wx_video_context"><div class="txp_player"><video></video><span>已关注 重播 分享 退出全屏</span><img src="https://mmbiz.qpic.cn/player.png"></div></div><p>真实后文</p><img src="https://mmbiz.qpic.cn/article.png" alt="正文配图"></div>', { url: 'https://mp.weixin.qq.com/s/fixture', runScripts: 'outside-only' })
  try {
    const value = dom.window.eval(EXTRACT_SCRIPT)
    assert.equal(value.text, '正文也会提到关注和分享。\n\n[视频内容未解析]\n\n真实后文')
    assert.equal(value.images.length, 1)
    assert.equal(value.images[0].alt, '正文配图')
    assert.equal(value.images[0].offset, value.text.length)
  } finally { dom.window.close() }
})

test('compiled browser extraction script runs standalone and strips executable HTML', () => {
  const dom = new JSDOM('<h1 id="activity-name">合成文章</h1><div id="js_content"><section><h2>章节</h2><p>段落甲</p><p>段落乙<span>不重复</span></p><img data-src="https://mmbiz.qpic.cn/fixture.png" src="/placeholder.png" alt="示例图"><ul><li>条目</li></ul><blockquote>引用</blockquote><script>window.bad = true</script><iframe src="https://example.com"></iframe><a href="javascript:bad()" onclick="bad()">链接文本</a></section></div>', { url: 'https://mp.weixin.qq.com/s/example', runScripts: 'outside-only' })
  try {
    const result = dom.window.eval(EXTRACT_SCRIPT)
    assert.equal(result.kind, 'article')
    assert.match(result.text, /## 章节\n\n段落甲\n\n段落乙不重复/)
    assert.match(result.text, /- 条目/)
    assert.match(result.text, /> 引用/)
    assert.equal(result.text.split('不重复').length, 2)
    assert.doesNotMatch(result.text, /window.bad|iframe|onclick|javascript:/)
    assert.equal(dom.window.bad, undefined)
    assert.equal(result.author, '')
    assert.deepEqual(JSON.parse(JSON.stringify(result.images)), [{ src: 'https://mmbiz.qpic.cn/fixture.png', alt: '示例图', order: 0, offset: result.text.indexOf('段落乙不重复') + '段落乙不重复'.length }])
  } finally { dom.window.close() }
})

test('knowledge browser import accepts only exact HTTPS WeChat article links', () => {
  assert.equal(normalizeWeChatArticleUrl('https://mp.weixin.qq.com/s/example#comments').toString(), 'https://mp.weixin.qq.com/s/example')
  assert.throws(() => normalizeWeChatArticleUrl('https://mp.weixin.qq.com.example.com/s/example'), /only supports/u)
  assert.throws(() => normalizeWeChatArticleUrl('http://mp.weixin.qq.com/s/example'), /only supports/u)
  assert.throws(() => normalizeWeChatArticleUrl('https://mp.weixin.qq.com/cgi-bin/home'), /only supports/u)
})

test('knowledge browser import request policy blocks arbitrary and non-HTTPS resources', () => {
  assert.equal(isAllowedWeChatResource('https://mp.weixin.qq.com/s/example'), true)
  assert.equal(isAllowedWeChatResource('https://res.wx.qq.com/app.js'), true)
  assert.equal(isAllowedWeChatResource('https://mmbiz.qpic.cn/image'), true)
  assert.equal(isAllowedWeChatResource('http://mp.weixin.qq.com/s/example'), false)
  assert.equal(isAllowedWeChatResource('https://127.0.0.1/private'), false)
  assert.equal(isAllowedWeChatResource('https://evil.example/resource'), false)
})

test('knowledge browser import returns a bounded provenance-backed snapshot', () => {
  const url = new URL('https://mp.weixin.qq.com/s/example')
  const result = projectWeChatArticle({ title: ' Agent \n 知识库 ', author: ' Datawhale ', text: '原始轨迹、持久知识与可执行技能构成三层架构。' }, url)
  assert.equal(result.title, 'Agent 知识库')
  assert.match(result.snapshot, /^作者：Datawhale/u)
  assert.equal(result.source.uri, url.toString())
  assert.equal(result.source.mimeType, 'text/html')
  assert.deepEqual(result.article, { author: 'Datawhale', format: 'markdown', truncated: false, originalByteLength: result.article.originalByteLength, excerpt: result.snapshot })
})

test('knowledge browser import bounds long article snapshots before persistence', () => {
  const url = new URL('https://mp.weixin.qq.com/s/example')
  const result = projectWeChatArticle({ title: '长文章', text: '可复用内容。'.repeat(80_000) }, url)
  assert.ok(Buffer.byteLength(result.snapshot, 'utf8') <= 1_048_576)
  assert.equal(result.content, '')
  assert.equal(result.article.excerpt.length, 180)
  assert.equal(result.article.truncated, true)
  assert.ok(result.article.originalByteLength > result.snapshot.length)
})

test('knowledge browser projection keeps safe block structure and removes executable content', () => {
  const url = new URL('https://mp.weixin.qq.com/s/example')
  const result = projectWeChatArticle({ title: '结构', author: '作者', text: '## 小节\n\n正文\n\n- 一\n- 二\n\n> 引用\n\n脚本不应出现' }, url)
  assert.match(result.snapshot, /## 小节\n\n正文/u)
  assert.match(result.snapshot, /- 一\n- 二/u)
  assert.match(result.snapshot, /> 引用/u)
})

test('knowledge browser import caches allowlisted image bytes without persisting source URLs', async () => {
  const data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
  const run = createKnowledgeBrowserImporter({
    BrowserWindow: class {},
    testFixture: async () => ({ title: '含图文章', text: '这是一段长度足够的合成正文，用于验证图片资源会被单独缓存。', images: [{ src: 'https://mmbiz.qpic.cn/fixture.png', alt: '示例图', order: 0 }, { src: 'https://evil.example/private.png', alt: '不应请求', order: 1 }] }),
    fetchImage: async candidate => candidate.src.includes('mmbiz.qpic.cn') ? { mimeType: 'image/png', byteLength: Buffer.from(data, 'base64').byteLength, data } : undefined,
  })
  const result = await run('https://mp.weixin.qq.com/s/fixture')
  assert.equal(result.article.images[0].status, 'ready')
  assert.equal(result.article.images[1].status, 'unavailable')
  assert.equal(result.articleResources.length, 1)
  assert.equal(result.articleResources[0].data, data)
  assert.doesNotMatch(JSON.stringify(result.article), /mmbiz|evil/u)
})
