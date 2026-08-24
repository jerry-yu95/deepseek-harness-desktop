import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { registerExtensionIpc } from '../src/extension-ipc.mjs'
import { ConnectorSecretStore } from '../src/extensions/connector-secrets.mjs'

function fixture(dshHome, options = {}) {
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
    dialog: options.dialog ?? { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
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
    mcpSourceOptions: options.mcpSourceOptions,
  })
  return { handlers, calls, connectorSecretStore, registration }
}

test('extension IPC discovers and imports an external client source without renderer secret exposure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-extension-source-'))
  const dshHome = join(root, 'dsh')
  const homeDir = join(root, 'home')
  await mkdir(join(homeDir, '.codebuddy'), { recursive: true })
  await writeFile(join(homeDir, '.codebuddy', '.mcp.json'), JSON.stringify({
    mcpServers: {
      privateDocs: {
        type: 'http',
        url: 'https://example.com/mcp',
        headers: { Authorization: 'Bearer codebuddy-literal-secret' },
      },
    },
  }), 'utf8')
  const { handlers, connectorSecretStore, registration } = fixture(dshHome, { mcpSourceOptions: { homeDir } })
  try {
    const sources = await handlers.get('extensions:mcp-source-list')()
    assert.equal(sources.find(item => item.clientId === 'codebuddy').status, 'available')
    assert.doesNotMatch(JSON.stringify(sources), /literal-secret|\.codebuddy/u)

    const staged = await handlers.get('extensions:mcp-source-preview')(null, 'codebuddy')
    assert.match(staged.source.token, /^[0-9a-f-]{36}$/u)
    assert.equal(staged.source.clientId, 'codebuddy')
    assert.equal(staged.preview.servers[0].secretSlots[0].detected, true)
    assert.doesNotMatch(JSON.stringify(staged), /literal-secret|\.codebuddy|mcp\.json/u)

    const imported = await handlers.get('extensions:mcp-source-import')(null, {
      token: staged.source.token,
      selectedNames: ['privateDocs'],
      conflict: 'reject',
      secrets: {},
    })
    assert.equal(imported.imported[0].source.kind, 'external-client')
    assert.equal(imported.imported[0].source.clientId, 'codebuddy')
    assert.equal(imported.imported[0].source.scope, 'user')
    assert.match(Object.values(connectorSecretStore.environment())[0], /literal-secret/u)
    await assert.rejects(handlers.get('extensions:mcp-source-import')(null, {
      token: staged.source.token,
      selectedNames: ['privateDocs'],
      conflict: 'rename',
    }), /source session/u)
  } finally {
    registration()
    await rm(root, { recursive: true, force: true })
  }
})

test('extension IPC imports a manually selected TRAE project source through the same safe preview', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-extension-picked-source-'))
  const selectedPath = join(root, 'trae-project.jsonc')
  await writeFile(selectedPath, `{
    "mcpServers": {
      "project-tools": { "command": "node", "args": ["tools.mjs"], },
    },
  }`, 'utf8')
  const dialog = { showOpenDialog: async () => ({ canceled: false, filePaths: [selectedPath] }) }
  const { handlers, registration } = fixture(join(root, 'dsh'), { dialog, mcpSourceOptions: { homeDir: join(root, 'home') } })
  try {
    const picked = await handlers.get('extensions:mcp-source-pick')(null, 'trae')
    assert.equal(picked.canceled, false)
    assert.equal(picked.source.scope, 'selected-file')
    assert.equal(picked.preview.servers[0].sourceName, 'project-tools')
    assert.equal('path' in picked.source, false)
  } finally {
    registration()
    await rm(root, { recursive: true, force: true })
  }
})

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

test('extension IPC requires explicit local-command trust and can toggle a connector', async () => {
  const dshHome = await mkdtemp(join(tmpdir(), 'dsh-extension-trust-'))
  const { handlers, calls, registration } = fixture(dshHome)
  try {
    const document = JSON.stringify({
      mcpServers: { local: { command: 'npx', args: ['-y', 'provider-mcp'] } },
    })
    await assert.rejects(handlers.get('extensions:mcp-import')(null, {
      text: document,
      selectedNames: ['local'],
      conflict: 'reject',
    }), /local-command-trust-required/u)

    const imported = await handlers.get('extensions:mcp-import')(null, {
      text: document,
      selectedNames: ['local'],
      conflict: 'reject',
      allowLocalCommand: true,
    })
    assert.equal(imported.imported[0].enabled, true)
    const disabled = await handlers.get('extensions:connector-enable')(null, 'local', false)
    assert.equal(disabled.enabled, false)
    assert.equal((await handlers.get('extensions:connector-list')())[0].enabled, false)
    assert.ok(calls.stops >= 2)
    assert.ok(calls.starts >= 2)
  } finally {
    registration()
    await rm(dshHome, { recursive: true, force: true })
  }
})
