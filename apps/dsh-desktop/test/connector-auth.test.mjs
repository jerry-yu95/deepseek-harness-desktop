import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AUTH_MODES,
  AUTH_PROVIDERS,
  AUTH_STATES,
  ConnectorAuthManager,
  sanitizeAuthorizationStatus,
} from '../src/extensions/connector-auth.mjs'

test('authorization constants expose the supported public state contract', () => {
  assert.deepEqual(AUTH_STATES, [
    'not-configured',
    'authorizing',
    'ready',
    'missing-permission',
    'reauthorization-required',
    'error',
  ])
  assert.deepEqual(AUTH_PROVIDERS, ['github', 'feishu', 'gitlab', 'dingtalk'])
  assert.deepEqual(AUTH_MODES, ['oauth', 'pat', 'official-cli', 'app-credentials'])
})

test('sanitizes authorization status and strips credential-shaped fields', () => {
  const safe = sanitizeAuthorizationStatus({
    connectorId: 'github',
    providerId: 'github',
    mode: 'oauth',
    state: 'ready',
    expiresAt: '2026-08-24T12:00:00.000Z',
    grantedScopes: ['repo', 'read:user', 'repo'],
    missingPermissions: [],
    detailKey: 'auth.ready',
    checkedAt: '2026-08-24T12:01:00.000Z',
    accessToken: 'ghs_live_secret',
    refreshToken: 'refresh_live_secret',
    clientSecret: 'client-secret',
    headers: { Authorization: 'Bearer live-secret' },
    nested: { token: 'should-not-survive' },
  })

  assert.deepEqual(safe, {
    connectorId: 'github',
    providerId: 'github',
    mode: 'oauth',
    state: 'ready',
    expiresAt: '2026-08-24T12:00:00.000Z',
    grantedScopes: ['repo', 'read:user'],
    missingPermissions: [],
    detailKey: 'auth.ready',
    checkedAt: '2026-08-24T12:01:00.000Z',
  })
  assert.doesNotMatch(JSON.stringify(safe), /secret|token|Bearer/i)
})

test('rejects invalid provider, mode, state, and unsafe metadata', () => {
  assert.throws(() => sanitizeAuthorizationStatus({
    connectorId: 'github', providerId: 'unknown', mode: 'oauth', state: 'ready',
  }), /providerId/)
  assert.throws(() => sanitizeAuthorizationStatus({
    connectorId: 'github', providerId: 'github', mode: 'client-secret', state: 'ready',
  }), /mode/)
  assert.throws(() => sanitizeAuthorizationStatus({
    connectorId: 'github', providerId: 'github', mode: 'oauth', state: 'connected',
  }), /state/)
  assert.throws(() => sanitizeAuthorizationStatus({
    connectorId: 'not kebab', providerId: 'github', mode: 'oauth', state: 'ready',
  }), /connectorId/)
  assert.throws(() => sanitizeAuthorizationStatus({
    connectorId: 'github', providerId: 'github', mode: 'oauth', state: 'ready', detailKey: 'Bearer secret',
  }), /detailKey/)
})

test('authorization manager exposes only sanitized adapter results', async () => {
  const calls = []
  const manager = new ConnectorAuthManager({
    adapters: [{
      id: 'github',
      modes: ['oauth', 'pat'],
      async authorize(context, input) {
        calls.push(['authorize', context, input])
        return { connectorId: 'github', providerId: 'github', mode: 'oauth', state: 'ready', accessToken: 'secret' }
      },
      async status() {
        return { connectorId: 'github', providerId: 'github', mode: 'oauth', state: 'ready', clientSecret: 'secret' }
      },
      async disconnect() {
        return { connectorId: 'github', providerId: 'github', mode: 'oauth', state: 'not-configured', refreshToken: 'secret' }
      },
      async verify() {
        return { connectorId: 'github', providerId: 'github', mode: 'oauth', state: 'ready', headers: { Authorization: 'secret' } }
      },
    }],
    context: { secretStore: { setMany: async () => {} } },
  })

  assert.deepEqual(await manager.authorize('github', { account: 'disposable' }), {
    connectorId: 'github', providerId: 'github', mode: 'oauth', state: 'ready',
  })
  assert.deepEqual(await manager.status('github'), {
    connectorId: 'github', providerId: 'github', mode: 'oauth', state: 'ready',
  })
  assert.deepEqual(await manager.disconnect('github'), {
    connectorId: 'github', providerId: 'github', mode: 'oauth', state: 'not-configured',
  })
  assert.deepEqual(await manager.verify('github'), {
    connectorId: 'github', providerId: 'github', mode: 'oauth', state: 'ready',
  })
  assert.equal(calls[0][0], 'authorize')
  assert.deepEqual(calls[0][2], { account: 'disposable' })
})

test('authorization manager validates adapter capabilities and provider lookup', async () => {
  assert.throws(() => new ConnectorAuthManager({ adapters: [{ id: 'github', modes: [] }] }), /authorize/)
  const manager = new ConnectorAuthManager({ adapters: [] })
  await assert.rejects(manager.status('github'), /adapter.*github/i)
  await assert.rejects(manager.authorize('github', {}), /adapter.*github/i)
  assert.throws(() => new ConnectorAuthManager({ adapters: [{
    id: 'github', modes: ['oauth'], authorize: async () => ({}), status: async () => ({}), disconnect: async () => ({}), verify: async () => ({}),
  }], context: null }), /context/)
})
