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
    assert.equal((await store.check('local-git')).ok, true)
    assert.match(await readFile(path, 'utf8'), /local-git/)
    await store.remove('local-git')
    assert.deepEqual(await store.list(), [])
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
    assert.equal(fetched, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
