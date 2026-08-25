import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { commandExists, ConnectorStore, renderMcpConnectorPatch, validateConnectorInput } from '../src/extensions/connectors.mjs'

/** A fake bin directory holding one empty marker file; nothing ever executes. */
async function makeFakeBin(root, name) {
  const bin = join(root, 'bin')
  await mkdir(bin, { recursive: true })
  await writeFile(join(bin, name), '')
  return bin
}

test('connector validation distinguishes MCP transports and HTTP APIs', () => {
  assert.deepEqual(validateConnectorInput({
    id: 'local-git', name: 'Local Git', kind: 'mcp', command: 'git', args: ['status'], capabilities: ['read'],
  }), {
    id: 'local-git', name: 'Local Git', description: '', kind: 'mcp', enabled: true,
    capabilities: ['read'], secretEnvKeys: [], transport: 'stdio', command: 'git', args: ['status'],
  })
  const remote = validateConnectorInput({ id: 'tapd-api', name: 'TAPD', kind: 'http', url: 'https://example.com/api' })
  assert.equal(remote.url, 'https://example.com/api')
  assert.throws(() => validateConnectorInput({ id: '../bad', name: 'bad', kind: 'http', url: 'https://example.com' }), /kebab-case/)
  assert.throws(() => validateConnectorInput({ id: 'bad-url', name: 'bad', kind: 'http', url: 'file:///tmp/x' }), /http or https/)
})

test('connector validation preserves safe external-client provenance', () => {
  const connector = validateConnectorInput({
    id: 'codebuddy-docs',
    name: 'Docs',
    kind: 'mcp',
    command: 'node',
    args: ['docs.mjs'],
    source: { kind: 'external-client', clientId: 'codebuddy', scope: 'user' },
  })
  assert.deepEqual(connector.source, { kind: 'external-client', clientId: 'codebuddy', scope: 'user' })
  assert.throws(() => validateConnectorInput({
    id: 'unsafe-source', name: 'Unsafe', kind: 'mcp', command: 'node', args: [], source: { kind: 'external-client', scope: 'user' },
  }), /client id/u)
})

test('connector validation preserves redacted provider JSON provenance', () => {
  const connector = validateConnectorInput({
    id: 'tapd',
    name: 'TAPD',
    kind: 'mcp',
    command: 'npx',
    args: ['-y', '@example/tapd-mcp'],
    source: {
      kind: 'provider-json',
      providerId: 'tapd',
      configurationHash: 'a'.repeat(64),
      capturedAt: '2026-08-25T00:00:00.000Z',
    },
  })
  assert.deepEqual(connector.source, {
    kind: 'provider-json',
    providerId: 'tapd',
    configurationHash: 'a'.repeat(64),
    capturedAt: '2026-08-25T00:00:00.000Z',
  })
  assert.throws(() => validateConnectorInput({
    id: 'tapd', name: 'TAPD', kind: 'mcp', command: 'npx', args: [], source: {
      kind: 'provider-json', providerId: 'unknown', configurationHash: 'a'.repeat(64), capturedAt: '2026-08-25T00:00:00.000Z',
    },
  }), /provider id/u)
  assert.throws(() => validateConnectorInput({
    id: 'tapd', name: 'TAPD', kind: 'mcp', command: 'npx', args: [], source: {
      kind: 'provider-json', providerId: 'tapd', configurationHash: 'not-a-hash', capturedAt: '2026-08-25T00:00:00.000Z',
    },
  }), /configuration hash/u)
})

test('MCP connectors render as official dsh-mcp-client Cordis entries', () => {
  const patch = renderMcpConnectorPatch([{
    id: 'tapd-tools', name: 'TAPD', kind: 'mcp', command: 'npx', args: ['-y', 'tapd-mcp'], secretEnvKeys: ['TAPD_TOKEN'],
  }, {
    id: 'docs-api', name: 'Docs', kind: 'http', url: 'https://example.com/api',
  }])
  assert.match(patch, /@deepseek-ai\/dsh-mcp-client/)
  assert.match(patch, /serverName: "tapd-tools"/)
  assert.match(patch, /TAPD_TOKEN: !!js process\.env\.TAPD_TOKEN/)
  assert.doesNotMatch(patch, /docs-api/)
})

test('MCP connectors render imported env and streamable HTTP header bindings without secrets', () => {
  const patch = renderMcpConnectorPatch([{
    id: 'tapd', name: 'TAPD', kind: 'mcp', transport: 'stdio', command: 'npx', args: ['-y', 'tapd-mcp'],
    plainEnv: { REGION: 'cn' },
    secretBindings: [{ location: 'env', targetKey: 'TAPD_TOKEN', credentialRef: 'DSH_CONNECTOR_TAPD_TAPD_TOKEN', template: '${secret}' }],
  }, {
    id: 'docs', name: 'Docs', kind: 'mcp', transport: 'streamable-http', url: 'https://example.com/mcp',
    plainHeaders: { 'X-Region': 'cn' },
    secretBindings: [{ location: 'header', targetKey: 'Authorization', credentialRef: 'DSH_CONNECTOR_DOCS_AUTHORIZATION', template: 'Bearer ${secret}' }],
  }])
  assert.match(patch, /REGION: "cn"/)
  assert.match(patch, /TAPD_TOKEN: !!js process\.env\.DSH_CONNECTOR_TAPD_TAPD_TOKEN/)
  assert.match(patch, /"Authorization": !!js '`Bearer \$\{process\.env\.DSH_CONNECTOR_DOCS_AUTHORIZATION\}`'/)
  assert.doesNotMatch(patch, /literal-secret|YOUR_TOKEN|DOCS_TOKEN/)
})

test('connector store persists, updates, removes and checks without executing MCP commands', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-connectors-'))
  try {
    const path = join(root, 'connectors.json')
    const bin = await makeFakeBin(root, process.platform === 'win32' ? 'git.exe' : 'git')
    const store = new ConnectorStore({ path, env: { PATH: bin, TAPD_TOKEN: 'present' } })
    await store.save({
      id: 'local-git', name: 'Git', kind: 'mcp', command: 'git', args: ['status'], secretEnvKeys: ['TAPD_TOKEN'],
    })
    await store.save({ id: 'local-git', name: 'Local Git', kind: 'mcp', command: 'git', args: [] })
    assert.equal((await store.list()).length, 1)
    assert.equal((await store.list())[0].name, 'Local Git')
    const checked = await store.check('local-git')
    assert.equal(checked.ok, true)
    assert.deepEqual(checked.checks.map(({ id, status }) => ({ id, status })), [
      { id: 'configuration', status: 'pass' },
      { id: 'credentials', status: 'pass' },
      { id: 'runtime', status: 'pass' },
      { id: 'registration', status: 'pass' },
    ])
    assert.match(await readFile(path, 'utf8'), /local-git/)
    await store.remove('local-git')
    assert.deepEqual(await store.list(), [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('connector store toggles registration without losing configuration or provenance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-connectors-toggle-'))
  try {
    const store = new ConnectorStore({ path: join(root, 'connectors.json'), env: {} })
    await store.save({
      id: 'dingtalk', name: 'DingTalk', kind: 'mcp', command: 'npx', args: ['-y', 'dingtalk-mcp@latest'],
      plainEnv: { ACTIVE_PROFILES: 'dingtalk-contacts' },
      secretBindings: [{
        location: 'env', targetKey: 'DINGTALK_Client_ID', credentialRef: 'DSH_CONNECTOR_DINGTALK_CLIENT_ID', template: '${secret}',
      }],
      source: { kind: 'preset', presetId: 'dingtalk' },
    })
    const disabled = await store.setEnabled('dingtalk', false)
    assert.equal(disabled.enabled, false)
    assert.equal(disabled.source.presetId, 'dingtalk')
    assert.equal(disabled.secretBindings[0].targetKey, 'DINGTALK_Client_ID')
    assert.doesNotMatch(renderMcpConnectorPatch(await store.list()), /desktop-mcp-dingtalk/u)

    const enabled = await store.setEnabled('dingtalk', true)
    assert.equal(enabled.enabled, true)
    assert.match(renderMcpConnectorPatch(await store.list()), /desktop-mcp-dingtalk/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('command probing resolves Windows executable extensions only where they apply', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-connectors-bin-'))
  try {
    const bin = await makeFakeBin(root, 'tool.exe')
    // The CI matrix covers both sides: the windows job resolves the .exe
    // probe; the macOS jobs confirm a bare miss stays a miss.
    assert.equal(await commandExists('tool', { PATH: bin }), process.platform === 'win32')
    assert.equal(await commandExists('missing-tool', { PATH: bin }), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('connector health reports missing credentials before network access', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-connectors-'))
  try {
    let fetched = false
    const store = new ConnectorStore({
      path: join(root, 'connectors.json'), env: {}, fetchImpl: async () => { fetched = true; return { status: 200 } },
    })
    await store.save({ id: 'private-api', name: 'Private', kind: 'http', url: 'https://example.com', secretEnvKeys: ['API_TOKEN'] })
    const result = await store.check('private-api')
    assert.equal(result.state, 'missing-credentials')
    assert.equal(result.checks.find((item) => item.id === 'credentials').status, 'fail')
    assert.equal(result.checks.find((item) => item.id === 'runtime').status, 'skipped')
    assert.equal(fetched, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('remote diagnostics distinguish reachable auth challenges from server failures', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-connector-http-'))
  try {
    const path = join(root, 'connectors.json')
    let status = 401
    const store = new ConnectorStore({ path, fetchImpl: async () => ({ status }), env: {} })
    await store.save({ id: 'remote-mcp', name: 'Remote', kind: 'mcp', transport: 'streamable-http', url: 'https://example.com/mcp' })
    const challenge = await store.check('remote-mcp')
    assert.equal(challenge.ok, true)
    assert.equal(challenge.state, 'auth-required')
    assert.equal(challenge.checks.find((item) => item.id === 'runtime').status, 'warn')

    status = 503
    const failed = await store.check('remote-mcp')
    assert.equal(failed.ok, false)
    assert.equal(failed.state, 'server-error')
    assert.equal(failed.checks.find((item) => item.id === 'runtime').status, 'fail')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
