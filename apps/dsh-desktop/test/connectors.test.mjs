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

test('connector store associates legacy generic TAPD imports with the official catalog', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-connector-tapd-migration-'))
  try {
    const path = join(root, 'connectors.json')
    await writeFile(path, JSON.stringify([{
      id: 'tapd-mcp-http',
      name: 'tapd_mcp_http',
      kind: 'mcp',
      transport: 'streamable-http',
      url: 'https://mcp-oa.tapd.woa.com/mcp/',
      source: { kind: 'json' },
    }]))
    const [connector] = await new ConnectorStore({ path }).list()
    assert.equal(connector.source.kind, 'provider-json')
    assert.equal(connector.source.providerId, 'tapd')
    assert.match(connector.source.configurationHash, /^[0-9a-f]{64}$/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
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
    assert.equal(challenge.ok, false)
    assert.equal(challenge.state, 'needs-authorization')
    assert.match(challenge.detail, /需要完成授权/u)
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

test('draft MCP diagnostics perform an initialize handshake without persisting the connector', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-connector-draft-'))
  try {
    const requests = []
    const path = join(root, 'connectors.json')
    const store = new ConnectorStore({
      path,
      env: {},
      fetchImpl: async (url, init) => {
        requests.push({ url, init })
        const body = JSON.parse(init.body)
        if (body.method === 'initialize') {
          return {
            status: 200,
            headers: { 'content-type': 'application/json', 'mcp-session-id': 'test-session' },
            text: async () => JSON.stringify({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-03-26', capabilities: {}, serverInfo: { name: 'test', version: '1' } } }),
          }
        }
        if (body.method === 'tools/list') {
          return {
            status: 200,
            headers: { 'content-type': 'application/json' },
            text: async () => JSON.stringify({ jsonrpc: '2.0', id: 2, result: { tools: [{ name: 'get_story', description: 'Read one story', inputSchema: { type: 'object' } }] } }),
          }
        }
        return { status: 202 }
      },
    })
    const result = await store.checkCandidate({
      id: 'tapd-draft', name: 'TAPD Draft', kind: 'mcp', transport: 'streamable-http', url: 'https://example.com/mcp',
      secretBindings: [{ location: 'header', targetKey: 'X-Tapd-Access-Token', credentialRef: 'DSH_CONNECTOR_TAPD_TOKEN', template: '${secret}' }],
    }, { DSH_CONNECTOR_TAPD_TOKEN: 'test-only-token' })

    assert.equal(result.ok, true)
    assert.equal(result.state, 'mcp-ready')
    assert.equal(result.checks.find((item) => item.id === 'registration').status, 'skipped')
    assert.match(result.checks.find((item) => item.id === 'credentials').detail, /不会保存/u)
    assert.equal(requests[0].url, 'https://example.com/mcp')
    assert.equal(requests[0].init.method, 'POST')
    assert.equal(requests[0].init.headers['X-Tapd-Access-Token'], 'test-only-token')
    assert.equal(JSON.parse(requests[0].init.body).method, 'initialize')
    assert.equal(JSON.parse(requests[2].init.body).method, 'tools/list')
    assert.match(result.detail, /1 个工具/u)
    assert.deepEqual(await store.list(), [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('draft MCP diagnostics explain a missing endpoint instead of reporting success', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-connector-404-'))
  try {
    const store = new ConnectorStore({
      path: join(root, 'connectors.json'), env: {}, fetchImpl: async () => ({ status: 404 }),
    })
    const result = await store.checkCandidate({
      id: 'wrong-path', name: 'Wrong path', kind: 'mcp', transport: 'streamable-http', url: 'https://example.com/wrong',
    })
    assert.equal(result.ok, false)
    assert.equal(result.state, 'endpoint-not-found')
    assert.match(result.detail, /404/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('draft MCP diagnostics treat supplied-token 401 as invalid credentials', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-connector-401-token-'))
  try {
    const store = new ConnectorStore({
      path: join(root, 'connectors.json'), env: {}, fetchImpl: async () => ({ status: 401 }),
    })
    const result = await store.checkCandidate({
      id: 'tapd-token', name: 'TAPD', kind: 'mcp', transport: 'streamable-http', url: 'https://example.com/mcp',
      secretBindings: [{ location: 'header', targetKey: 'X-Tapd-Access-Token', credentialRef: 'DSH_CONNECTOR_TAPD_TOKEN', template: '${secret}' }],
    }, { DSH_CONNECTOR_TAPD_TOKEN: 'expired-token' })
    assert.equal(result.ok, false)
    assert.equal(result.state, 'authorization-failed')
    assert.match(result.detail, /凭证无效或已过期/u)
    assert.deepEqual(await store.list(), [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('draft MCP diagnostics retry SSE after initialize method rejection and require an event-stream response', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-connector-sse-'))
  try {
    const requests = []
    const store = new ConnectorStore({
      path: join(root, 'connectors.json'),
      env: {},
      fetchImpl: async (_url, init) => {
        requests.push({ method: init.method, accept: init.headers.accept })
        if (init.method === 'POST') return { status: 405 }
        return { status: 200, headers: { 'content-type': 'text/event-stream' } }
      },
    })
    const result = await store.checkCandidate({
      id: 'legacy-sse', name: 'Legacy SSE', kind: 'mcp', transport: 'streamable-http', url: 'https://example.com/sse',
    })
    assert.equal(result.ok, false)
    assert.equal(result.state, 'mcp-sse-unverified')
    assert.equal(requests[0].method, 'POST')
    assert.equal(requests[1].method, 'GET')
    assert.match(requests[1].accept, /text\/event-stream/u)
    assert.deepEqual(await store.list(), [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('draft MCP diagnostics reject a 302 login redirect instead of reporting success', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-connector-302-'))
  try {
    const store = new ConnectorStore({
      path: join(root, 'connectors.json'),
      env: {},
      fetchImpl: async () => ({ status: 302, headers: { location: 'https://passport.example.com/login' } }),
    })
    const result = await store.checkCandidate({
      id: 'tapd-redirect', name: 'TAPD', kind: 'mcp', transport: 'streamable-http', url: 'https://example.com/mcp',
      secretBindings: [{ location: 'header', targetKey: 'X-Tapd-Access-Token', credentialRef: 'DSH_CONNECTOR_TAPD_TOKEN', template: '${secret}' }],
    }, { DSH_CONNECTOR_TAPD_TOKEN: 'test-only-token' })
    assert.equal(result.ok, false)
    assert.equal(result.state, 'needs-authorization')
    assert.match(result.detail, /未建立可用的 MCP 会话/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('draft MCP diagnostics do not treat a generic GET 200 HTML page as a successful handshake', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-connector-html-'))
  try {
    const store = new ConnectorStore({
      path: join(root, 'connectors.json'),
      env: {},
      fetchImpl: async (_url, init) => {
        if (init.method === 'POST') return { status: 405 }
        return { status: 200, headers: { 'content-type': 'text/html' }, text: async () => '<html>ok</html>' }
      },
    })
    const result = await store.checkCandidate({
      id: 'html-endpoint', name: 'HTML', kind: 'mcp', transport: 'streamable-http', url: 'https://example.com/',
    })
    assert.equal(result.ok, false)
    assert.equal(result.state, 'method-unsupported')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('draft MCP diagnostics fail closed when initialize returns a JSON-RPC error', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-connector-rpc-'))
  try {
    const store = new ConnectorStore({
      path: join(root, 'connectors.json'),
      env: {},
      fetchImpl: async () => ({
        status: 200,
        text: async () => JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'Method not found' } }),
      }),
    })
    const result = await store.checkCandidate({
      id: 'rpc-error', name: 'RPC', kind: 'mcp', transport: 'streamable-http', url: 'https://example.com/mcp',
    })
    assert.equal(result.ok, false)
    assert.equal(result.state, 'protocol-rejected')
    assert.match(result.detail, /JSON-RPC/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
