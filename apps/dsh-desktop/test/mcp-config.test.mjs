import assert from 'node:assert/strict'
import test from 'node:test'

import { parseMcpServersJson } from '../src/extensions/mcp-config.mjs'

test('MCP JSON parser preserves safe configuration and hides literal secrets', () => {
  const parsed = parseMcpServersJson(JSON.stringify({
    mcpServers: {
      tapd: {
        command: 'npx',
        args: ['-y', '@vendor/tapd-mcp'],
        env: { TAPD_TOKEN: '<YOUR_TOKEN>', REGION: 'cn' },
      },
      docs: {
        type: 'streamable-http',
        url: 'https://example.com/mcp',
        headers: { Authorization: 'Bearer ${DOCS_TOKEN}', 'X-Region': 'cn' },
      },
      literal: {
        command: 'node',
        args: ['server.mjs'],
        env: { API_KEY: 'literal-secret-value' },
      },
    },
  }))

  assert.deepEqual(parsed.servers.map((server) => server.sourceName), ['tapd', 'docs', 'literal'])
  assert.equal(parsed.servers[0].plainEnv.REGION, 'cn')
  assert.equal(parsed.servers[0].secretSlots[0].targetKey, 'TAPD_TOKEN')
  assert.equal(parsed.servers[0].secretSlots[0].template, '${secret}')
  assert.equal(parsed.servers[1].plainHeaders['X-Region'], 'cn')
  assert.equal(parsed.servers[1].secretSlots[0].template, 'Bearer ${secret}')
  assert.equal(parsed.credentials.get('DSH_CONNECTOR_LITERAL_API_KEY'), 'literal-secret-value')
  assert.doesNotMatch(JSON.stringify(parsed.servers), /literal-secret-value/)
})

test('MCP JSON parser accepts only supported stdio and streamable HTTP configurations', () => {
  assert.throws(() => parseMcpServersJson(JSON.stringify({ mcpServers: [] })), /mcpServers must be an object/)
  assert.throws(() => parseMcpServersJson(JSON.stringify({ mcpServers: { bad: { command: 'npx -y server' } } })), /args array/)
  assert.throws(() => parseMcpServersJson(JSON.stringify({ mcpServers: { bad: { type: 'sse', url: 'https://example.com' } } })), /unsupported-mcp-transport:sse/)
  assert.throws(() => parseMcpServersJson('{"__proto__": {}}'), /prototype key/)
  assert.throws(() => parseMcpServersJson('{"mcpServers":{"constructor":{"command":"node","args":[]}}}'), /prototype key/)
  assert.throws(() => parseMcpServersJson(JSON.stringify({ mcpServers: { bad: { command: 'node', args: Array.from({ length: 129 }, () => 'x') } } })), /too many arguments/)
})

test('MCP JSON parser rejects oversized input and invalid roots', () => {
  assert.throws(() => parseMcpServersJson('[]'), /root must be an object/)
  assert.throws(() => parseMcpServersJson(JSON.stringify({})), /mcpServers must be an object/)
  assert.throws(() => parseMcpServersJson('x'.repeat(1_048_577)), /too large/)
})
