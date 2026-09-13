import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { registerLocalRpc, isLocalRequest } from '../src/index.mjs'

const local = { socket: { remoteAddress: '127.0.0.1' }, headers: { host: '127.0.0.1:43125' } }
test('socket, Host, Origin and browser fetch metadata must all remain local', () => {
  assert.equal(isLocalRequest(local), true)
  for (const override of [
    { socket: { remoteAddress: '192.0.2.1' } },
    { headers: { host: 'attacker.example:43125' } },
    { headers: { ...local.headers, origin: 'https://attacker.example' } },
    { headers: { ...local.headers, origin: 'http://127.0.0.1:5555' } },
    { headers: { ...local.headers, 'sec-fetch-site': 'cross-site' } },
    { socket: { remoteAddress: '192.0.2.1' }, headers: { ...local.headers, 'x-forwarded-for': '127.0.0.1' } },
  ]) assert.equal(isLocalRequest({ ...local, ...override }), false)
})

async function request({ rejection, method = 'POST', url = '/fixture/read', body, headers = {}, handler = async () => ({ ok: true, value: 'fixture' }) } = {}) {
  let route, called = false
  registerLocalRpc({
    webServer: { register(value) { route = value; return () => {} } },
    connection: { requestRejection: () => rejection },
  }, '/fixture', async (...args) => { called = true; return handler(...args) })
  const req = Readable.from([Buffer.from(body ?? JSON.stringify({ type: 'client-request', rpcId: 'fixture-id', method: 'read', payload: {} }))])
  Object.assign(req, local, { method, url, headers: { ...local.headers, 'content-type': 'application/json', ...headers } })
  const res = new EventEmitter()
  res.writeHead = status => { res.status = status }
  res.end = text => { res.body = JSON.parse(text) }
  await route.handler(req, res)
  return { status: res.status, body: res.body, called }
}

test('authentication rejects before invoking a local RPC operation', async () => {
  for (const rejection of [401, 403]) {
    const result = await request({ rejection })
    assert.equal(result.status, rejection)
    assert.equal(result.called, false)
  }
  assert.deepEqual(await request(), { status: 200, called: true, body: {
    type: 'server-response', rpcId: 'fixture-id', result: { ok: true, value: 'fixture' },
  } })
})

test('invalid routes, methods and envelopes cannot invoke operations', async () => {
  for (const [options, status] of [
    [{ method: 'GET' }, 405], [{ url: '/fixture/read/nested' }, 404],
    [{ headers: { 'content-type': 'text/plain' } }, 415], [{ body: 'bad json' }, 400],
    [{ body: JSON.stringify({ type: 'client-request', rpcId: 'fixture', method: 'delete' }) }, 400],
    [{ body: ' '.repeat(32 * 1024 * 1024 + 1) }, 413],
  ]) {
    const result = await request(options)
    assert.equal(result.status, status)
    assert.equal(result.called, false)
  }
})

test('handler errors do not disclose credentials or local paths', async () => {
  const result = await request({ handler: async () => { throw new Error('synthetic-secret /private/fixture') } })
  assert.equal(result.body.result.ok, false)
  assert.ok(!JSON.stringify(result).includes('synthetic-secret'))
})
