import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  OAuthFlowManager,
  createPkceChallenge,
  createPkceVerifier,
  discoverAuthorizationServer,
  redactOAuthError,
  validateDynamicClientRegistrationResponse,
  validateOAuthEndpoint,
} from '../src/extensions/oauth-flow.mjs'
import { ConnectorSecretStore, oauthCredentialReferences } from '../src/extensions/connector-secrets.mjs'

function cryptoBackend() {
  return {
    isEncryptionAvailable: () => true,
    encrypt: (value) => Buffer.from(`encrypted:${value}`, 'utf8'),
    decrypt: (value) => Buffer.from(value).toString('utf8').slice('encrypted:'.length),
  }
}

async function withServer(handler) {
  const server = createServer(handler)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const baseUrl = `http://127.0.0.1:${address.port}`
  return {
    baseUrl,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  }
}

test('PKCE uses S256 and authorization requests never persist verifier material', async () => {
  const verifier = createPkceVerifier()
  const challenge = createPkceChallenge(verifier)
  assert.match(verifier, /^[A-Za-z0-9_-]{43}$/)
  assert.match(challenge, /^[A-Za-z0-9_-]{43}$/)
  assert.notEqual(verifier, challenge)

  const manager = new OAuthFlowManager({ secretStore: { setMany: async () => {} } })
  const request = manager.createAuthorizationRequest({
    authorizationEndpoint: 'https://provider.example/authorize',
    clientId: 'public-client',
    redirectUri: 'http://127.0.0.1:45678/callback',
    scope: ['repo', 'read:user'],
  })
  assert.match(request.url, /code_challenge_method=S256/)
  assert.equal(request.url.includes(request.codeVerifier), false)
  assert.equal(request.url.includes(request.state), true)
})

test('OAuth endpoint validation requires HTTPS except explicit loopback test servers', () => {
  assert.equal(validateOAuthEndpoint('https://provider.example/token').href, 'https://provider.example/token')
  assert.throws(() => validateOAuthEndpoint('http://provider.example/token', { allowInsecureLoopback: true }), /https/)
  assert.equal(validateOAuthEndpoint('http://127.0.0.1:1234/token', { allowInsecureLoopback: true }).hostname, '127.0.0.1')
  assert.throws(() => validateOAuthEndpoint('http://127.0.0.1:1234/token'), /https/)
})

test('discovers protected-resource and authorization-server metadata', async () => {
  const server = await withServer((request, response) => {
    response.setHeader('content-type', 'application/json')
    if (request.url === '/resource') {
      response.end(JSON.stringify({ authorization_servers: [`${server.baseUrl}/issuer`] }))
      return
    }
    if (request.url === '/issuer/.well-known/oauth-authorization-server') {
      response.end(JSON.stringify({
        issuer: `${server.baseUrl}/issuer`,
        authorization_endpoint: `${server.baseUrl}/authorize`,
        token_endpoint: `${server.baseUrl}/token`,
        registration_endpoint: `${server.baseUrl}/register`,
      }))
      return
    }
    response.statusCode = 404
    response.end('{}')
  })
  try {
    const metadata = await discoverAuthorizationServer(`${server.baseUrl}/resource`, {
      allowInsecureLoopback: true,
    })
    assert.equal(metadata.authorization_endpoint, `${server.baseUrl}/authorize`)
    assert.equal(metadata.token_endpoint, `${server.baseUrl}/token`)
  } finally {
    await server.close()
  }
})

test('callback rejects state mismatch, times out, and supports browser-close cancellation', async () => {
  const manager = new OAuthFlowManager({ secretStore: { setMany: async () => {} } })

  const mismatch = await manager.openCallback({ expectedState: 'expected', timeoutMs: 500 })
  const mismatchWait = assert.rejects(mismatch.wait, /state-mismatch/)
  await fetch(`${mismatch.redirectUri}?code=code-value&state=wrong`)
  await mismatchWait

  const timeout = await manager.openCallback({ expectedState: 'expected', timeoutMs: 20 })
  const timeoutWait = assert.rejects(timeout.wait, /callback-timeout/)
  await timeoutWait

  const canceled = await manager.openCallback({ expectedState: 'expected', timeoutMs: 500 })
  const canceledWait = assert.rejects(canceled.wait, /browser-closed/)
  canceled.cancel('browser-closed')
  await canceledWait
})

test('DCR responses require a public client id and never expose client secrets', () => {
  assert.deepEqual(validateDynamicClientRegistrationResponse({ client_id: 'client-123' }), { clientId: 'client-123' })
  assert.throws(() => validateDynamicClientRegistrationResponse({ client_secret: 'secret' }), /client_id/)
  assert.throws(() => validateDynamicClientRegistrationResponse({ client_id: 'client', client_secret: '' }), /client_secret/)
})

test('authorization code exchange persists encrypted tokens and returns metadata only', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-oauth-flow-'))
  const server = await withServer((request, response) => {
    response.setHeader('content-type', 'application/json')
    if (request.url === '/token') {
      response.end(JSON.stringify({ access_token: 'access-secret', refresh_token: 'refresh-secret', expires_in: 3600, scope: 'repo read:user' }))
      return
    }
    response.statusCode = 404
    response.end('{}')
  })
  try {
    const secretStore = new ConnectorSecretStore({ path: join(root, 'secrets.json'), ...cryptoBackend() })
    await secretStore.load()
    const manager = new OAuthFlowManager({ secretStore, metadataPath: join(root, 'metadata.json') })
    const result = await manager.exchangeAuthorizationCode({
      providerId: 'github',
      tokenEndpoint: `${server.baseUrl}/token`,
      allowInsecureLoopback: true,
      code: 'one-time-code',
      clientId: 'public-client',
      redirectUri: 'http://127.0.0.1:45678/callback',
      codeVerifier: createPkceVerifier(),
    })
    assert.equal(result.state, 'ready')
    assert.deepEqual(result.grantedScopes, ['repo', 'read:user'])
    assert.equal('accessToken' in result, false)
    assert.deepEqual(secretStore.environment(), {
      [oauthCredentialReferences('github').accessToken]: 'access-secret',
      [oauthCredentialReferences('github').refreshToken]: 'refresh-secret',
    })
  } finally {
    await server.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('refresh replaces access and refresh tokens and collapses concurrent refreshes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-oauth-refresh-'))
  let calls = 0
  const server = await withServer(async (request, response) => {
    if (request.url !== '/token') return response.end('{}')
    calls += 1
    await new Promise((resolve) => setTimeout(resolve, 10))
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ access_token: 'access-2', refresh_token: 'refresh-2', expires_in: 900, scope: 'repo' }))
  })
  try {
    const secretStore = new ConnectorSecretStore({ path: join(root, 'secrets.json'), ...cryptoBackend() })
    await secretStore.load()
    await secretStore.setMany({ [oauthCredentialReferences('github').refreshToken]: 'refresh-1' })
    const manager = new OAuthFlowManager({ secretStore, metadataPath: join(root, 'metadata.json') })
    const [first, second] = await Promise.all([
      manager.refreshAccessToken({ providerId: 'github', tokenEndpoint: `${server.baseUrl}/token`, allowInsecureLoopback: true, clientId: 'client' }),
      manager.refreshAccessToken({ providerId: 'github', tokenEndpoint: `${server.baseUrl}/token`, allowInsecureLoopback: true, clientId: 'client' }),
    ])
    assert.equal(calls, 1)
    assert.deepEqual(first, second)
    assert.deepEqual(secretStore.environment(), {
      [oauthCredentialReferences('github').accessToken]: 'access-2',
      [oauthCredentialReferences('github').refreshToken]: 'refresh-2',
    })
  } finally {
    await server.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('invalid_grant and unauthorized responses map to reauthorization-required', async () => {
  const server = await withServer((request, response) => {
    response.statusCode = request.url === '/unauthorized' ? 401 : 400
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ error: 'invalid_grant', error_description: 'refresh-token-secret' }))
  })
  try {
    const secretStore = { resolveMany: () => ({ [oauthCredentialReferences('github').refreshToken]: 'refresh' }), setMany: async () => {} }
    const manager = new OAuthFlowManager({ secretStore })
    await assert.rejects(manager.refreshAccessToken({ providerId: 'github', tokenEndpoint: `${server.baseUrl}/token`, allowInsecureLoopback: true, clientId: 'client' }), (error) => error.code === 'reauthorization-required' && !error.message.includes('refresh-token-secret'))
    await assert.rejects(manager.refreshAccessToken({ providerId: 'github', tokenEndpoint: `${server.baseUrl}/unauthorized`, allowInsecureLoopback: true, clientId: 'client' }), (error) => error.code === 'reauthorization-required')
  } finally {
    await server.close()
  }
})

test('OAuth errors redact codes, tokens, secrets, and query strings', () => {
  const safe = redactOAuthError(new Error('https://app/callback?code=one&state=two&access_token=three Authorization: Bearer four client_secret=five'))
  assert.doesNotMatch(safe, /one|two|three|four|five/)
  assert.doesNotMatch(safe, /\?code=/)
})
