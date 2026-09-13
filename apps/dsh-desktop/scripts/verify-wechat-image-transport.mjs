// Run with Electron. All responses and TLS certificates belong to this fixture;
// no request reaches WeChat, the system proxy or an existing user profile.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer as httpServer } from 'node:http'
import { createServer as httpsServer } from 'node:https'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { app, session, net } from 'electron'
import { fetchWeChatImage } from '../src/wechat-image-fetch.mjs'

async function main() {
  const temporary = await mkdtemp(join(tmpdir(), 'jiwei-image-transport-'))
  app.setPath('userData', join(temporary, 'profile'))
  const sockets = new Set()
  let origin, proxy, network
  let passed = false
  const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
  const track = socket => { sockets.add(socket); socket.on('error', () => {}); socket.on('close', () => sockets.delete(socket)); return socket }
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(temporary, 'key.pem'), '-out', join(temporary, 'cert.pem'), '-days', '1', '-subj', '/CN=mmbiz.qpic.cn'], { stdio: 'ignore' })
    const cert = await readFile(join(temporary, 'cert.pem'), 'utf8')
    const key = await readFile(join(temporary, 'key.pem'))
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
    const requests = []
    const tunnels = []
    origin = httpsServer({ cert, key }, (request, response) => {
      requests.push({ path: request.url, headers: request.headers })
      if (request.url === '/redirect') { response.writeHead(302, { location: '/image' }); response.end(); return }
      if (request.url === '/blocked') { response.writeHead(302, { location: 'https://127.0.0.1/private' }); response.end(); return }
      response.writeHead(200, { 'content-type': 'image/png', 'set-cookie': 'response_fixture=synthetic; Secure; SameSite=None' })
      response.end(png)
    })
    origin.on('connection', track)
    const originPort = await listen(origin)
    proxy = httpServer((_request, response) => { response.writeHead(502); response.end() })
    proxy.on('connection', track)
    proxy.on('connect', (request, client, head) => {
      tunnels.push(request.url)
      if (request.url !== 'mmbiz.qpic.cn:443') { client.destroy(); return }
      const upstream = track(connect(originPort, '127.0.0.1', () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        if (head.length) upstream.write(head)
        upstream.pipe(client); client.pipe(upstream)
      }))
      client.on('close', () => upstream.destroy())
    })
    const proxyPort = await listen(proxy)
    await app.whenReady()
    network = session.fromPartition('jiwei-synthetic-image-transport', { cache: false })
    network.setCertificateVerifyProc((request, callback) => callback(request.hostname === 'mmbiz.qpic.cn' && request.certificate.data.trim() === cert.trim() ? 0 : -2))
    await network.setProxy({ mode: 'fixed_servers', proxyRules: `http://127.0.0.1:${proxyPort}`, proxyBypassRules: '<-loopback>' })
    await network.cookies.set({ url: 'https://mmbiz.qpic.cn', name: 'request_fixture', value: 'synthetic', secure: true })
    const result = await fetchWeChatImage('https://mmbiz.qpic.cn/redirect', network, new AbortController().signal, options => net.request(options))
    assert.equal(result.data, png.toString('base64'))
    assert.deepEqual(requests.map(request => request.path), ['/redirect', '/image'])
    for (const { headers } of requests) {
      assert.equal(headers.cookie, undefined)
      assert.equal(headers.authorization, undefined)
      assert.equal(headers.referer, undefined)
    }
    assert.equal((await network.cookies.get({ name: 'response_fixture' })).length, 0)
    console.log('PASS Chromium proxy transport receives validated bytes without sending or accepting cookies')
    await assert.rejects(fetchWeChatImage('https://mmbiz.qpic.cn/blocked', network, new AbortController().signal, options => net.request(options)), /knowledge-image-access/u)
    assert.deepEqual(requests.map(request => request.path), ['/redirect', '/image', '/blocked'])
    assert.ok(tunnels.length > 0 && tunnels.every(target => target === 'mmbiz.qpic.cn:443'))
    console.log('PASS Chromium manual redirects never follow a rejected destination')
    passed = true
  } catch (error) {
    console.error(error)
  } finally {
    await network?.closeAllConnections()
    network?.setCertificateVerifyProc(null)
    for (const socket of sockets) socket.destroy()
    for (const server of [proxy, origin]) if (server?.listening) await new Promise(resolve => server.close(resolve))
    await rm(temporary, { recursive: true, force: true })
    app.exit(passed ? 0 : 1)
  }
}
void main().catch(error => { console.error(error); app.exit(1) })
