import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createGitLabAuthAdapter,
  gitLabCredentialReferences,
  gitLabMcpEndpoint,
  normalizeGitLabUrl,
  registerGitLabClient,
} from '../src/extensions/providers/gitlab-auth.mjs'

test('GitLab URL normalization supports GitLab.com and self-managed instances', () => {
  assert.equal(normalizeGitLabUrl('https://gitlab.com/'), 'https://gitlab.com')
  assert.equal(normalizeGitLabUrl('https://git.example.com/gitlab/'), 'https://git.example.com/gitlab')
  assert.equal(gitLabMcpEndpoint('https://git.example.com/gitlab/'), 'https://git.example.com/gitlab/api/v4/mcp')
  assert.throws(() => normalizeGitLabUrl('ftp://git.example.com'), /http or https/)
})

test('GitLab DCR validates the client response and preserves the official MCP path', async () => {
  const calls = []
  const client = await registerGitLabClient({
    registrationEndpoint: 'https://gitlab.com/oauth/register',
    redirectUri: 'http://127.0.0.1:123/callback',
    fetchImpl: async (url, init) => {
      calls.push([url, init])
      return new Response(JSON.stringify({ client_id: 'gitlab-public-client' }), { status: 201, headers: { 'content-type': 'application/json' } })
    },
  })
  assert.deepEqual(client, { clientId: 'gitlab-public-client' })
  assert.equal(calls[0][0], 'https://gitlab.com/oauth/register')
  assert.equal(JSON.parse(calls[0][1].body).token_endpoint_auth_method, 'none')
})

test('GitLab DCR rate limits expose a retryable diagnostic', async () => {
  await assert.rejects(registerGitLabClient({
    registrationEndpoint: 'https://gitlab.com/oauth/register',
    redirectUri: 'http://127.0.0.1:123/callback',
    fetchImpl: async () => new Response('{}', { status: 429 }),
  }), (error) => error.code === 'gitlab-dcr-rate-limited' && error.retryable === true)
})

test('GitLab prerequisite 404 and authorization errors map to safe states', async () => {
  const adapter = createGitLabAuthAdapter()
  assert.equal(gitLabCredentialReferences.accessToken, 'DSH_CONNECTOR_GITLAB_OAUTH_ACCESS_TOKEN')
  const context = {
    secretStore: { resolveMany: () => ({ [gitLabCredentialReferences.accessToken]: 'secret' }) },
    fetchImpl: async (url) => {
      assert.equal(url, 'https://git.example.com/gitlab/api/v4/mcp')
      return new Response('', { status: 404 })
    },
  }
  const disabled = await adapter.verify(context, { baseUrl: 'https://git.example.com/gitlab' })
  assert.deepEqual(disabled, {
    connectorId: 'gitlab', providerId: 'gitlab', mode: 'oauth', state: 'error', detailKey: 'gitlab.instance-or-group-mcp-disabled',
  })
  context.fetchImpl = async () => new Response('', { status: 401 })
  const expired = await adapter.verify(context, { baseUrl: 'https://git.example.com/gitlab' })
  assert.equal(expired.state, 'reauthorization-required')
})

test('GitLab pre-registered client skips DCR and authorization never invents another MCP path', async () => {
  const calls = []
  const adapter = createGitLabAuthAdapter()
  const result = await adapter.authorize({
    oauth: {
      discoverAuthorizationServer: async (resource) => {
        calls.push(['discover', resource])
        return { issuer: 'https://gitlab.com', authorization_endpoint: 'https://gitlab.com/authorize', token_endpoint: 'https://gitlab.com/token' }
      },
      createAuthorizationRequest: (input) => ({ url: 'https://gitlab.com/authorize', state: 'state', codeVerifier: 'verifier', redirectUri: input.redirectUri }),
      openCallback: async () => ({ redirectUri: 'http://127.0.0.1:123/callback', wait: Promise.resolve({ code: 'code', state: 'state' }), cancel: () => {} }),
      exchangeAuthorizationCode: async () => ({ connectorId: 'gitlab', providerId: 'gitlab', mode: 'oauth', state: 'ready' }),
    },
    openExternal: async () => {},
  }, { baseUrl: 'https://gitlab.com/', clientId: 'pre-registered', redirectHost: 'http://127.0.0.1:123' })
  assert.equal(result.state, 'ready')
  assert.equal(calls[0][1], 'https://gitlab.com/api/v4/mcp')
})
