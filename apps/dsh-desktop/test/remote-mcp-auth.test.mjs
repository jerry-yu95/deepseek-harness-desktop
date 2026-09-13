import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { RemoteMcpAuth } from '../src/extensions/remote-mcp-auth.mjs'

test('remote OAuth performs discovery, DCR, state and PKCE exchange using the MCP SDK', { timeout: 10000 }, async () => {
  let origin
  let challenge
  let registered
  let exchanged = false
  const server = createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const raw = Buffer.concat(chunks).toString()
    const respond = data => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(data)) }
    if (req.url.startsWith('/.well-known/oauth-protected-resource')) return respond({ resource: `${origin}/mcp`, authorization_servers: [origin] })
    if (req.url === '/.well-known/oauth-authorization-server') return respond({ issuer: origin, authorization_endpoint: `${origin}/authorize`, token_endpoint: `${origin}/token`, registration_endpoint: `${origin}/register`, response_types_supported: ['code'], code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'] })
    if (req.url === '/register') { registered = JSON.parse(raw); return respond({ ...registered, client_id: 'fixture-client' }) }
    if (req.url === '/token') {
      const params = new URLSearchParams(raw)
      exchanged = params.get('code') === 'fixture-code' && createHash('sha256').update(params.get('code_verifier')).digest('base64url') === challenge
      return respond({ access_token: 'synthetic-oauth-access', token_type: 'Bearer', expires_in: 3600 })
    }
    res.writeHead(404); res.end()
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${server.address().port}`
  const flow = new RemoteMcpAuth({
    secretStore: { setMany: async () => assert.fail('must not persist before handshake') },
    allowInsecureLoopback: true,
    openExternal: async raw => {
      const url = new URL(raw)
      assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
      challenge = url.searchParams.get('code_challenge')
      const callback = new URL(url.searchParams.get('redirect_uri'))
      assert.equal(callback.href, registered.redirect_uris[0])
      callback.searchParams.set('state', url.searchParams.get('state'))
      callback.searchParams.set('code', 'fixture-code')
      await fetch(callback)
    },
  })
  try {
    const result = await flow.authorize({ id: 'fixture', kind: 'mcp', transport: 'streamable-http', url: `${origin}/mcp` })
    assert.equal(result.accessToken, 'synthetic-oauth-access')
    assert.match(result.reference, /^DSH_CONNECTOR_REMOTE_[A-F0-9]{64}$/)
    assert.equal(exchanged, true)
    assert.equal(flow.pending.size, 0)
  } finally { flow.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
})

test('cancelled remote OAuth clears pending flow and hides provider errors', { timeout: 5000 }, async () => {
  const flow = new RemoteMcpAuth({
    secretStore: { setMany: async () => {} }, openExternal: async () => {},
    authImpl: async provider => {
      flow.cancel('fixture')
      throw new Error('provider response must not appear')
    },
  })
  await assert.rejects(flow.authorize({ id: 'fixture', kind: 'mcp', transport: 'streamable-http', url: 'https://example.com/mcp' }), error => error.message === 'remote-oauth-cancelled')
  assert.equal(flow.pending.size, 0)
})
