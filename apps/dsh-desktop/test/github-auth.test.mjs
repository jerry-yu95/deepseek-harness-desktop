import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createGitHubAuthAdapter,
  GITHUB_AUTH_SCOPES,
  githubCredentialReferences,
} from '../src/extensions/providers/github-auth.mjs'

test('GitHub exposes OAuth with a fine-grained PAT fallback and approved scopes', async () => {
  const adapter = createGitHubAuthAdapter()
  assert.deepEqual(GITHUB_AUTH_SCOPES, ['repo', 'read:user', 'user:email'])
  assert.deepEqual(await adapter.authorize({ oauth: {
    discoverAuthorizationServer: async () => { throw new Error('oauth-server-metadata-failed') },
  } }, { mode: 'oauth' }), {
    connectorId: 'github', providerId: 'github', mode: 'pat', state: 'missing-permission',
    detailKey: 'github.oauth-unavailable-pat-fallback',
    missingPermissions: ['oauth'],
  })
  const denied = await adapter.authorize({ oauth: {} }, { mode: 'pat', token: 'pat-secret', scopes: ['admin:org'] })
  assert.equal(denied.state, 'missing-permission')
  assert.equal(denied.detailKey, 'github.scope-not-approved')
})

test('GitHub PAT is encrypted through the main-process secret store and never returned', async () => {
  const saved = []
  const adapter = createGitHubAuthAdapter()
  const result = await adapter.authorize({ secretStore: { setMany: async (values) => saved.push(values) } }, {
    mode: 'pat', token: 'ghp_live_secret', scopes: ['repo', 'read:user'],
  })
  assert.deepEqual(result, {
    connectorId: 'github', providerId: 'github', mode: 'pat', state: 'ready',
    grantedScopes: ['repo', 'read:user'],
  })
  assert.deepEqual(saved, [{ [githubCredentialReferences.pat]: 'ghp_live_secret' }])
  assert.doesNotMatch(JSON.stringify(result), /ghp_live_secret|token/i)
})

test('GitHub verification maps 401 to reauthorization and 403 to missing permission', async () => {
  const adapter = createGitHubAuthAdapter()
  const context = {
    secretStore: { resolveMany: () => ({ [githubCredentialReferences.pat]: 'secret' }) },
    fetchImpl: async (_url, init) => {
      assert.match(init.headers.Authorization, /^Bearer /u)
      return new Response('', { status: 401 })
    },
  }
  const expired = await adapter.verify(context, { mode: 'pat' })
  assert.deepEqual(expired, {
    connectorId: 'github', providerId: 'github', mode: 'pat', state: 'reauthorization-required', detailKey: 'github.authorization-expired',
  })
  context.fetchImpl = async () => new Response('', { status: 403 })
  const restricted = await adapter.verify(context, { mode: 'pat' })
  assert.deepEqual(restricted, {
    connectorId: 'github', providerId: 'github', mode: 'pat', state: 'missing-permission', detailKey: 'github.permission-denied',
  })
})

test('GitHub OAuth uses discovered metadata and keeps browser/callback orchestration outside the adapter', async () => {
  const calls = []
  const adapter = createGitHubAuthAdapter()
  const result = await adapter.authorize({
    oauth: {
      discoverAuthorizationServer: async (resourceEndpoint) => {
        calls.push(['discover', resourceEndpoint])
        return { issuer: 'https://github.example', authorization_endpoint: 'https://github.example/authorize', token_endpoint: 'https://github.example/token' }
      },
      createAuthorizationRequest: (input) => {
        calls.push(['request', input])
        return { url: 'https://github.example/authorize?state=state', state: 'state', codeVerifier: 'verifier', redirectUri: input.redirectUri }
      },
      openCallback: async ({ expectedState }) => ({ redirectUri: 'http://127.0.0.1:123/callback', wait: Promise.resolve({ code: 'code', state: expectedState }), cancel: () => {} }),
      exchangeAuthorizationCode: async (input) => {
        calls.push(['exchange', input])
        return { connectorId: 'github', providerId: 'github', mode: 'oauth', state: 'ready', grantedScopes: ['repo'] }
      },
    },
    openExternal: async (url) => calls.push(['browser', url]),
  }, { mode: 'oauth', clientId: 'public-client', scopes: ['repo'], redirectHost: 'http://127.0.0.1:123' })
  assert.equal(result.state, 'ready')
  assert.equal(calls[0][0], 'discover')
  assert.equal(calls.some(([kind]) => kind === 'browser'), true)
  assert.equal(calls.find(([kind]) => kind === 'exchange')[1].code, 'code')
})

test('GitHub disconnect removes both PAT and OAuth credential references', async () => {
  const removed = []
  const adapter = createGitHubAuthAdapter()
  const result = await adapter.disconnect({ secretStore: { removeMany: async (refs) => removed.push(refs) } })
  assert.deepEqual(result, { connectorId: 'github', providerId: 'github', mode: 'oauth', state: 'not-configured' })
  assert.deepEqual(removed[0].toSorted(), [githubCredentialReferences.pat, githubCredentialReferences.accessToken, githubCredentialReferences.refreshToken].toSorted())
})
