import assert from 'node:assert/strict'
import test from 'node:test'

import { buildMcpConnectorImport, createProviderJsonSource, previewMcpJson } from '../src/extensions/mcp-import.mjs'
import { parseMcpServersJson } from '../src/extensions/mcp-config.mjs'

const documentJson = JSON.stringify({
  mcpServers: {
    github: {
      type: 'http',
      url: 'https://api.githubcopilot.com/mcp/',
      headers: { Authorization: 'Bearer ${GITHUB_TOKEN}' },
    },
    local: {
      command: 'npx',
      args: ['-y', '@example/server', '--token', '<YOUR_TOKEN>'],
    },
  },
})

test('MCP import preview exposes transport and placeholder state without secrets', () => {
  const preview = previewMcpJson(documentJson)
  assert.deepEqual(preview.servers.map((server) => server.transport), ['streamable-http', 'stdio'])
  assert.equal(preview.servers[0].secretSlots[0].placeholder, 'GITHUB_TOKEN')
  assert.equal(preview.servers[1].secretSlots[0].location, 'arg')
  assert.equal(preview.servers[1].secretSlots[0].placeholder, 'YOUR_TOKEN')
  assert.doesNotMatch(JSON.stringify(preview), /secret-value|GITHUB_TOKEN_VALUE/)
})

test('MCP import selects entries, stores bindings, and requires explicit conflict behavior', () => {
  const parsed = parseMcpServersJson(documentJson)
  const preview = previewMcpJson(documentJson)
  const githubRef = preview.servers[0].secretSlots[0].credentialRef
  const localRef = preview.servers[1].secretSlots[0].credentialRef
  const imported = buildMcpConnectorImport({
    parsed,
    selectedNames: ['github'],
    secrets: { [githubRef]: 'github-secret' },
    existing: [],
    source: { kind: 'preset', presetId: 'github' },
  })
  assert.equal(imported.connectors.length, 1)
  assert.equal(imported.connectors[0].connector.id, 'github')
  assert.equal(imported.connectors[0].connector.secretBindings[0].location, 'header')
  assert.equal(imported.credentials.get(githubRef), 'github-secret')
  assert.throws(() => buildMcpConnectorImport({ parsed, secrets: { [githubRef]: 'x', [localRef]: 'y' }, existing: [{ id: 'github' }], conflict: 'reject' }), /connector-conflict:github/)
  const renamed = buildMcpConnectorImport({ parsed, selectedNames: ['github'], secrets: { [githubRef]: 'x' }, existing: [{ id: 'github' }], conflict: 'rename' })
  assert.equal(renamed.connectors[0].connector.id, 'github-2')
})

test('provider JSON provenance fingerprint ignores secret values but detects config changes', () => {
  const first = parseMcpServersJson(JSON.stringify({
    mcpServers: {
      tapd: {
        type: 'http',
        url: 'https://provider.example/mcp',
        headers: { Authorization: 'Bearer ${TAPD_TOKEN}' },
      },
    },
  }))
  const second = parseMcpServersJson(JSON.stringify({
    mcpServers: {
      tapd: {
        type: 'http',
        url: 'https://provider.example/mcp',
        headers: { Authorization: 'Bearer ${OTHER_TOKEN}' },
      },
    },
  }))
  const changed = parseMcpServersJson(JSON.stringify({
    mcpServers: {
      tapd: {
        type: 'http',
        url: 'https://provider.example/other-mcp',
        headers: { Authorization: 'Bearer ${TAPD_TOKEN}' },
      },
    },
  }))
  const capturedAt = '2026-08-25T00:00:00.000Z'
  assert.equal(
    createProviderJsonSource({ providerId: 'tapd', parsed: first, capturedAt }).configurationHash,
    createProviderJsonSource({ providerId: 'tapd', parsed: second, capturedAt }).configurationHash,
  )
  assert.notEqual(
    createProviderJsonSource({ providerId: 'tapd', parsed: first, capturedAt }).configurationHash,
    createProviderJsonSource({ providerId: 'tapd', parsed: changed, capturedAt }).configurationHash,
  )
  assert.equal(createProviderJsonSource({ providerId: 'tapd', parsed: first, capturedAt }).capturedAt, capturedAt)
})
