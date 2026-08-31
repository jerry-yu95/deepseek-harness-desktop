import assert from 'node:assert/strict'
import test from 'node:test'

import { buildMcpConnectorImport, createProviderJsonSource, inferProviderJsonSources, previewMcpJson } from '../src/extensions/mcp-import.mjs'
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

test('mixed MCP JSON associates TAPD with its official catalog and keeps unknown servers generic', () => {
  const parsed = parseMcpServersJson(JSON.stringify({
    mcpServers: {
      tapd_mcp_http: {
        url: 'https://mcp-oa.tapd.woa.com/mcp/',
        transportType: 'streamable-http',
        headers: { 'X-Tapd-Access-Token': 'test-only-token' },
      },
      iWiki: { url: 'https://example.com/mcp', transportType: 'streamable-http' },
    },
  }))
  const sourcesByName = inferProviderJsonSources(parsed, '2026-08-30T00:00:00.000Z')
  const imported = buildMcpConnectorImport({ parsed, sourcesByName })
  const tapd = imported.connectors.find((item) => item.connector.name === 'tapd_mcp_http')?.connector
  const iwiki = imported.connectors.find((item) => item.connector.name === 'iWiki')?.connector
  assert.equal(tapd?.source.kind, 'provider-json')
  assert.equal(tapd?.source.providerId, 'tapd')
  assert.equal(iwiki?.source.kind, 'json')
})

test('re-importing the same official provider refreshes it without weakening unrelated conflict protection', () => {
  const parsed = parseMcpServersJson(JSON.stringify({
    mcpServers: {
      tapd_mcp_http: {
        url: 'https://mcp-oa.tapd.woa.com/mcp/',
        transportType: 'streamable-http',
        headers: { 'X-Tapd-Access-Token': 'rotated-test-token' },
      },
    },
  }))
  const sourcesByName = inferProviderJsonSources(parsed, '2026-08-31T00:00:00.000Z')
  const existing = [{
    id: 'tapd-mcp-http',
    source: { kind: 'provider-json', providerId: 'tapd', configurationHash: 'old', capturedAt: '2026-08-30T00:00:00.000Z' },
  }]
  const refreshed = buildMcpConnectorImport({ parsed, existing, sourcesByName, conflict: 'reject' })
  assert.equal(refreshed.connectors[0].connector.id, 'tapd-mcp-http')
  assert.equal(refreshed.connectors[0].previous, existing[0])

  assert.throws(
    () => buildMcpConnectorImport({ parsed, existing: [{ id: 'tapd-mcp-http', source: { kind: 'json' } }], sourcesByName, conflict: 'reject' }),
    /connector-conflict:tapd-mcp-http/u,
  )
})

test('an official provider refresh keeps the existing local connector id even when the server name changes', () => {
  const parsed = parseMcpServersJson(JSON.stringify({
    mcpServers: {
      tapd_mcp_http: {
        url: 'https://mcp-oa.tapd.woa.com/mcp/',
        transportType: 'streamable-http',
        headers: { 'X-Tapd-Access-Token': 'rotated-test-token' },
      },
    },
  }))
  const sourcesByName = inferProviderJsonSources(parsed, '2026-08-31T00:00:00.000Z')
  const existing = [{
    id: 'adapted-mcp-http',
    name: 'adapted_mcp_http',
    source: { kind: 'provider-json', providerId: 'tapd', configurationHash: 'old', capturedAt: '2026-08-30T00:00:00.000Z' },
  }]

  const refreshed = buildMcpConnectorImport({ parsed, existing, sourcesByName, conflict: 'reject' })
  assert.equal(refreshed.connectors[0].connector.id, 'adapted-mcp-http')
  assert.equal(refreshed.connectors[0].connector.name, 'tapd_mcp_http')
  assert.equal(refreshed.connectors[0].previous, existing[0])
})
