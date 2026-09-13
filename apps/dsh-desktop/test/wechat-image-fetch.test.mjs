import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchWeChatImage } from '../src/wechat-image-fetch.mjs'
import { imageRequestFixture } from './helpers/image-request-fixture.mjs'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
const url = 'https://mmbiz.qpic.cn/fixture.png'
const signal = () => new AbortController().signal
const response = () => new Response(png, { headers: { 'content-type': 'image/png' } })

test('uses the browser proxy transport for a fixed CDN without cookies or referrer', async () => {
  const { calls, requestImage } = imageRequestFixture(response)
  const result = await fetchWeChatImage(url, {}, signal(), requestImage)
  assert.equal(result.mimeType, 'image/png')
  assert.equal(result.byteLength, png.length)
  assert.equal(calls[0].options.credentials, 'omit')
  assert.equal(calls[0].options.redirect, 'manual')
  assert.equal(calls[0].options.referrerPolicy, 'no-referrer')
  assert.equal(calls[0].options.headers['cache-control'], 'no-store')
  assert.equal(calls[0].options.useSessionCookies, false)
})

test('rejects arbitrary hosts, credentials, ports and private targets before transport', async () => {
  let calls = 0
  const requestImage = () => { calls++; throw new Error('unexpected request') }
  for (const input of ['https://example.com/a', 'https://127.0.0.1/a', 'https://mmbiz.qpic.cn.evil.example/a', 'https://user:password@mmbiz.qpic.cn/a', 'https://mmbiz.qpic.cn:8443/a', 'http://mmbiz.qpic.cn/a', 'file:///a']) {
    await assert.rejects(fetchWeChatImage(input, {}, signal(), requestImage), /knowledge-image/u)
  }
  assert.equal(calls, 0)
})

test('validates every redirect before following and bounds redirect loops', async () => {
  let calls = 0
  const blocked = imageRequestFixture(async () => { calls++; return new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/secret' } }) })
  await assert.rejects(fetchWeChatImage(url, {}, signal(), blocked.requestImage), /knowledge-image/u)
  assert.equal(calls, 1)
  calls = 0
  const loop = imageRequestFixture(async () => { calls++; return new Response(null, { status: 302, headers: { location: '/again' } }) })
  await assert.rejects(fetchWeChatImage(url, {}, signal(), loop.requestImage), /knowledge-image/u)
  assert.equal(calls, 4)
})

test('rejects invalid image bytes and stops an oversized stream without consuming the tail', async () => {
  const invalid = imageRequestFixture(async () => new Response('<html>challenge</html>', { headers: { 'content-type': 'image/png' } }))
  await assert.rejects(fetchWeChatImage(url, {}, signal(), invalid.requestImage), /knowledge-image-format/u)
  let cancelled = false
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(5 * 1024 * 1024 + 1)) }, cancel() { cancelled = true } })
  const oversized = imageRequestFixture(async () => new Response(body, { headers: { 'content-type': 'image/png' } }))
  await assert.rejects(fetchWeChatImage(url, {}, signal(), oversized.requestImage), /knowledge-image-limit/u)
  assert.equal(cancelled, true)
})

test('does not publish bytes after cancellation', async () => {
  const controller = new AbortController()
  const fixture = imageRequestFixture(async () => { controller.abort(); return response() })
  await assert.rejects(fetchWeChatImage(url, {}, controller.signal, fixture.requestImage), /knowledge-cancelled/u)
})

test('bounds stalled requests and sanitizes network failures', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const fixture = imageRequestFixture(() => new Promise(() => {}))
  const checked = assert.rejects(fetchWeChatImage(url, {}, signal(), fixture.requestImage), /knowledge-image-timeout/u)
  context.mock.timers.tick(8001)
  await checked
  const failed = imageRequestFixture(async () => { throw new Error('synthetic-private-network-error') })
  await assert.rejects(fetchWeChatImage(url, {}, signal(), failed.requestImage), { message: 'knowledge-image-network' })
})
