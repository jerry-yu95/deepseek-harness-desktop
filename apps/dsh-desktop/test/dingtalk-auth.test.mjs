import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildDingTalkCommand,
  createDingTalkAuthAdapter,
  DINGTALK_DEFAULT_PROFILES,
  DINGTALK_PROFILE_CATALOG,
  dingtalkCredentialReferences,
  dingtalkProfilePermissionHints,
  normalizeDingTalkProfiles,
} from '../src/extensions/providers/dingtalk-auth.mjs'

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

test('DingTalk profiles are allowlisted, permission-aware, and read-only by default', () => {
  assert.deepEqual(DINGTALK_DEFAULT_PROFILES, ['dingtalk-contacts'])
  assert.equal(DINGTALK_PROFILE_CATALOG[DINGTALK_DEFAULT_PROFILES[0]].readOnly, true)
  assert.deepEqual(normalizeDingTalkProfiles(), { profiles: ['dingtalk-contacts'], invalid: [] })
  assert.deepEqual(normalizeDingTalkProfiles('dingtalk-contacts,dingtalk-department'), { profiles: ['dingtalk-contacts', 'dingtalk-department'], invalid: [] })
  assert.deepEqual(normalizeDingTalkProfiles('dingtalk-contacts,unknown'), { profiles: [], invalid: ['unknown'] })
  assert.deepEqual(dingtalkProfilePermissionHints(['dingtalk-contacts']), ['qyapi_addresslist_search', 'qyapi_get_member'])
})

test('DingTalk command keeps the exact official env key casing and never uses a shell string', () => {
  const command = buildDingTalkCommand({ clientId: 'client-id', clientSecret: 'client-secret', profiles: ['dingtalk-contacts'] })
  assert.equal(command.command, 'npx')
  assert.deepEqual(command.args, ['-y', 'dingtalk-mcp@latest'])
  assert.deepEqual(command.env, {
    DINGTALK_Client_ID: 'client-id',
    DINGTALK_Client_Secret: 'client-secret',
    ACTIVE_PROFILES: 'dingtalk-contacts',
  })
  assert.equal(Object.hasOwn(command.env, 'DINGTALK_CLIENT_ID'), false)
  assert.equal(Object.hasOwn(command.env, 'DINGTALK_CLIENT_SECRET'), false)
})

test('DingTalk saves credentials privately and rejects unapproved or write-only profile assumptions', async () => {
  const store = secretStore()
  const savedProfiles = []
  const adapter = createDingTalkAuthAdapter()
  const result = await adapter.authorize({ secretStore: store, saveDingTalkProfiles: async (profiles) => savedProfiles.push(profiles) }, {
    clientId: 'client-id', clientSecret: 'client-secret',
  })
  assert.deepEqual(result, { connectorId: 'dingtalk', providerId: 'dingtalk', mode: 'app-credentials', state: 'ready', grantedScopes: ['dingtalk-contacts'] })
  assert.equal(store.values.get(dingtalkCredentialReferences.clientSecret), 'client-secret')
  assert.deepEqual(savedProfiles, [['dingtalk-contacts']])
  const denied = await adapter.authorize({ secretStore: secretStore() }, { clientId: 'client-id', clientSecret: 'secret', profiles: ['not-a-profile'] })
  assert.equal(denied.state, 'missing-permission')
  assert.equal(denied.detailKey, 'dingtalk.profile-not-approved')
  const writeProfile = await adapter.authorize({ secretStore: secretStore() }, { clientId: 'client-id', clientSecret: 'secret', profiles: ['dingtalk-robot-send-message'] })
  assert.equal(writeProfile.state, 'ready')
  assert.deepEqual(writeProfile.grantedScopes, ['dingtalk-robot-send-message'])
})

test('DingTalk verification always probes the read-only contacts profile and maps auth failures', async () => {
  const store = secretStore([[dingtalkCredentialReferences.clientId, 'client-id'], [dingtalkCredentialReferences.clientSecret, 'client-secret']])
  const adapter = createDingTalkAuthAdapter()
  const calls = []
  const expired = await adapter.verify({ secretStore: store, probe: async (request) => { calls.push(request); return { status: 401 } } })
  assert.deepEqual(calls, [{ providerId: 'dingtalk', profile: 'dingtalk-contacts', readOnly: true }])
  assert.equal(expired.state, 'reauthorization-required')
  const restricted = await adapter.verify({ secretStore: store, probe: async () => ({ status: 403, missingPermissions: ['qyapi_get_member'] }) })
  assert.deepEqual(restricted, {
    connectorId: 'dingtalk', providerId: 'dingtalk', mode: 'app-credentials', state: 'missing-permission',
    detailKey: 'dingtalk.permission-denied', missingPermissions: ['qyapi_get_member'],
  })
})
