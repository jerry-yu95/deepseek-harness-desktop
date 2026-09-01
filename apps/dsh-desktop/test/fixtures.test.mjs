import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

import { createFakeMcpServer } from './helpers/fake-mcp-server.mjs'

const ROOT = new URL('./', import.meta.url)
const fixture = name => new URL(`./fixtures/${name}`, ROOT)

test('MCP and WeChat fixtures are synthetic and contain no credential-shaped values', async () => {
  const paths = [
    fixture('mcp/mixed-provider.json'),
    fixture('mcp/tapd-redirect.json'),
    new URL('../../../packages/dsh-knowledge/tests/fixtures/wechat-article.html', ROOT),
    new URL('../../../packages/dsh-knowledge/tests/fixtures/wechat-challenge.html', ROOT),
  ]
  const contents = await Promise.all(paths.map(path => readFile(path, 'utf8')))
  const combined = contents.join('\n')
  assert.doesNotMatch(combined, /(?:Bearer\s+)?[A-Za-z0-9_-]{32,}/u)
  assert.doesNotMatch(combined, /(?:Cookie|Authorization)\s*:/iu)
  assert.doesNotMatch(combined, /\/Users\/|\/home\/|192\.168\.|10\.\d+\.|172\.(?:1[6-9]|2\d|3[01])\./u)
  assert.match(contents[0], /"tapd_mcp_http"/u)
  assert.match(contents[0], /\$\{TAPD_TOKEN\}/u)
  assert.match(contents[2], /id="js_content"/u)
  assert.match(contents[3], /参数错误/u)
})

for (const mode of ['success', 'redirect', 'unauthorized', 'empty-tools', 'malformed-json-rpc']) {
  test(`fake MCP server supports the ${mode} diagnostic fixture`, async () => {
    const server = await createFakeMcpServer(mode)
    try {
      assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+\/mcp$/u)
      const response = await fetch(server.url, { method: 'POST', redirect: 'manual', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) })
      if (mode === 'success' || mode === 'empty-tools') assert.equal(response.status, 200)
      if (mode === 'redirect') assert.equal(response.status, 302)
      if (mode === 'unauthorized') assert.equal(response.status, 401)
      if (mode === 'malformed-json-rpc') assert.equal((await response.json()).error.code, -32601)
      assert.equal(server.requests[0].body.method, 'initialize')
    } finally {
      await server.close()
    }
  })
}

test('fake MCP timeout fixture never reaches an external address', async () => {
  const server = await createFakeMcpServer('timeout')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30)
  try {
    await assert.rejects(fetch(server.url, { method: 'POST', body: '{}', signal: controller.signal }), error => error?.name === 'AbortError')
    assert.equal(server.requests[0].url, '/mcp')
  } finally {
    clearTimeout(timer)
    await server.close()
  }
})
