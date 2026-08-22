import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { registerExtensionIpc } from '../src/extension-ipc.mjs'
import { ConnectorSecretStore } from '../src/extensions/connector-secrets.mjs'

function fixture(dshHome) {
  const handlers = new Map()
  const calls = { stops: 0, starts: 0, profiles: 0 }
  const ipcMain = {
    handle(channel, callback) { handlers.set(channel, callback) },
    removeHandler(channel) { handlers.delete(channel) },
  }
  const connectorSecretStore = new ConnectorSecretStore({
    path: join(dshHome, 'desktop', 'connector-secrets.json'),
    isEncryptionAvailable: () => true,
    encrypt: value => Buffer.from(`cipher:${value}`, 'utf8'),
    decrypt: value => Buffer.from(value).toString('utf8').replace(/^cipher:/u, ''),
  })
  const registration = registerExtensionIpc({
    ipcMain,
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    shell: { openPath: async () => '' },
    getWindow: () => ({ isDestroyed: () => false }),
    pluginManager: {
      inventory: async () => ({ plugins: [], diagnostics: [] }),
      install: async () => {},
      remove: async () => {},
    },
    controller: {
      stop: async () => { calls.stops += 1 },
      start: async () => { calls.starts += 1 },
    },
    ensureProfile: async () => { calls.profiles += 1 },
    projectRoot: dshHome,
    dshHome,
    agentsHome: undefined,
    connectorSecretStore,
  })
  return { handlers, calls, connectorSecretStore, registration }
}

test('extension IPC imports official MCP JSON with encrypted credentials and removes them cleanly', async () => {
  const dshHome = await mkdtemp(join(tmpdir(), 'dsh-extension-ipc-'))
  const { handlers, calls, connectorSecretStore, registration } = fixture(dshHome)
  try {
    const document = JSON.stringify({
      mcpServers: {
        github: {
          type: 'http',
          url: 'https://api.githubcopilot.com/mcp/',
          headers: { Authorization: 'Bearer ${GITHUB_TOKEN}' },
        },
      },
    })
    const preview = await handlers.get('extensions:mcp-preview')(null, document)
    const reference = preview.servers[0].secretSlots[0].credentialRef
    assert.equal(preview.servers[0].secretSlots[0].detected, false)

    const imported = await handlers.get('extensions:mcp-import')(null, {
      text: document,
      selectedNames: ['github'],
      conflict: 'reject',
      secrets: { [reference]: 'github-secret' },
      source: { kind: 'preset', presetId: 'github' },
    })
    assert.equal(imported.imported.length, 1)
    assert.equal(imported.imported[0].id, 'github')
    assert.equal(imported.imported[0].source.presetId, 'github')

    const records = JSON.parse(await readFile(join(dshHome, 'desktop', 'connectors.json'), 'utf8'))
    const secureStore = JSON.parse(await readFile(join(dshHome, 'desktop', 'connector-secrets.json'), 'utf8'))
    assert.doesNotMatch(JSON.stringify(records), /github-secret/u)
    assert.doesNotMatch(JSON.stringify(secureStore), /github-secret/u)
    assert.deepEqual(Object.keys(secureStore.entries), [reference])
    assert.deepEqual(connectorSecretStore.environment(), { [reference]: 'github-secret' })

    const listed = await handlers.get('extensions:connector-list')()
    assert.equal(listed[0].id, 'github')
    assert.equal(listed[0].secretBindings[0].credentialRef, reference)

    await handlers.get('extensions:connector-remove')(null, 'github')
    assert.deepEqual(await handlers.get('extensions:connector-list')(), [])
    const afterRemove = JSON.parse(await readFile(join(dshHome, 'desktop', 'connector-secrets.json'), 'utf8'))
    assert.deepEqual(afterRemove.entries, {})
    assert.deepEqual(connectorSecretStore.environment(), {})
    assert.ok(calls.stops >= 2)
    assert.ok(calls.starts >= 2)
    assert.ok(calls.profiles >= 2)
  } finally {
    registration()
    await rm(dshHome, { recursive: true, force: true })
  }
})
