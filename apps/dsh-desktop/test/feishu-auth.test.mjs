import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildFeishuLoginCommand,
  buildFeishuLogoutCommand,
  createFeishuAuthAdapter,
  FEISHU_DOMAINS,
  feishuCredentialReferences,
  normalizeFeishuDomain,
} from '../src/extensions/providers/feishu-auth.mjs'

function secretStore(initial = []) {
  const values = new Map(initial)
  return {
    values,
    has: (reference) => values.has(reference),
    setMany: async (next) => Object.entries(next).forEach(([key, value]) => values.set(key, value)),
    resolveMany: (references) => Object.fromEntries(references.filter((reference) => values.has(reference)).map((reference) => [reference, values.get(reference)])),
    removeMany: async (references) => references.forEach((reference) => values.delete(reference)),
  }
}

test('Feishu commands use the official CLI argv shape and explicit regional domains', () => {
  assert.equal(normalizeFeishuDomain(), FEISHU_DOMAINS.feishu)
  assert.equal(normalizeFeishuDomain('https://open.larksuite.com/'), FEISHU_DOMAINS.lark)
  assert.throws(() => normalizeFeishuDomain('https://example.com'), /official HTTPS domain/)
  assert.deepEqual(buildFeishuLoginCommand({
    appId: 'cli_app', appSecret: 'secret-value', domain: FEISHU_DOMAINS.lark, scopes: ['docx:document', 'offline_access'],
  }), {
    command: 'npx',
    args: ['-y', '@larksuiteoapi/lark-mcp', 'login', '-a', 'cli_app', '-s', 'secret-value', '-d', FEISHU_DOMAINS.lark, '--scope', 'docx:document,offline_access'],
    timeoutMs: 120_000,
  })
  assert.deepEqual(buildFeishuLogoutCommand({ appId: 'cli_app' }), {
    command: 'npx', args: ['-y', '@larksuiteoapi/lark-mcp', 'logout', '-a', 'cli_app'], timeoutMs: 30_000,
  })
})

test('Feishu App Secret is saved through the private store and never returned', async () => {
  const store = secretStore()
  const calls = []
  const adapter = createFeishuAuthAdapter()
  const result = await adapter.authorize({ secretStore: store, runCommand: async (spec) => { calls.push(spec); return { exitCode: 0 } } }, {
    mode: 'official-cli', appId: 'cli_app', appSecret: 'app-secret', scopes: ['offline_access'],
  })
  assert.deepEqual(result, {
    connectorId: 'feishu', providerId: 'feishu', mode: 'official-cli', state: 'ready', grantedScopes: ['offline_access'],
  })
  assert.equal(store.values.get(feishuCredentialReferences.appSecret), 'app-secret')
  assert.equal(calls[0].command, 'npx')
  assert.deepEqual(calls[0].args.slice(0, 3), ['-y', '@larksuiteoapi/lark-mcp', 'login'])
  assert.doesNotMatch(JSON.stringify(result), /app-secret|cli_app/u)
})

test('Feishu distinguishes unsupported user access, cancellation, and timeout', async () => {
  const adapter = createFeishuAuthAdapter()
  const base = { mode: 'official-cli', appId: 'cli_app', appSecret: 'secret', userAccessToken: true }
  const unsupported = await adapter.authorize({ secretStore: secretStore() }, base)
  assert.deepEqual(unsupported, {
    connectorId: 'feishu', providerId: 'feishu', mode: 'official-cli', state: 'missing-permission',
    detailKey: 'feishu.user-access-cli-unsupported', missingPermissions: ['user_access_token'],
  })
  const canceled = await adapter.authorize({ secretStore: secretStore(), feishuCliCapabilities: { userAccessToken: true }, runCommand: async () => ({ cancelled: true }) }, base)
  assert.equal(canceled.detailKey, 'feishu.login-cancelled')
  const timeout = await adapter.authorize({ secretStore: secretStore(), runCommand: async () => ({ timedOut: true }) }, { ...base, userAccessToken: false })
  assert.equal(timeout.detailKey, 'feishu.login-timeout')
})

test('Feishu logout and verification map lifecycle failures without exposing credentials', async () => {
  const store = secretStore([[feishuCredentialReferences.appId, 'cli_app'], [feishuCredentialReferences.appSecret, 'secret']])
  const calls = []
  const adapter = createFeishuAuthAdapter()
  const expired = await adapter.verify({ secretStore: store, probe: async (request) => { assert.deepEqual(request, { providerId: 'feishu', readOnly: true }); return { status: 401 } } }, { mode: 'app-credentials' })
  assert.deepEqual(expired, { connectorId: 'feishu', providerId: 'feishu', mode: 'app-credentials', state: 'reauthorization-required', detailKey: 'feishu.authorization-expired' })
  const disconnected = await adapter.disconnect({ secretStore: store, runCommand: async (spec) => { calls.push(spec); return { exitCode: 0 } } })
  assert.equal(disconnected.state, 'not-configured')
  assert.deepEqual(calls[0].args, ['-y', '@larksuiteoapi/lark-mcp', 'logout', '-a', 'cli_app'])
  assert.equal(store.values.size, 0)
})
