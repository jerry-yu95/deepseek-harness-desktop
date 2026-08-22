import assert from 'node:assert/strict'
import test from 'node:test'

import { buildMcpConnectorImport, previewMcpJson } from '../src/extensions/mcp-import.mjs'
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
