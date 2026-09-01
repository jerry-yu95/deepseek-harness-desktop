import { createServer } from 'node:http'

const INITIALIZE_RESULT = {
  protocolVersion: '2025-03-26',
  capabilities: { tools: {} },
  serverInfo: { name: 'JIWEI fixture MCP', version: '0.0.0-test' },
}

const TOOL = {
  name: 'fixture_lookup',
  description: 'Returns deterministic fixture data.',
  inputSchema: { type: 'object', properties: {} },
}

/**
 * Start a local-only MCP endpoint for connector tests.
 * No external hosts, credentials, or user data are involved.
 */
export async function createFakeMcpServer(mode = 'success') {
  const requests = []
  const server = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const rawBody = Buffer.concat(chunks).toString('utf8')
    let body
    try { body = rawBody === '' ? undefined : JSON.parse(rawBody) } catch { body = undefined }
    requests.push({ method: request.method, url: request.url, body })

    if (mode === 'timeout') return
    if (mode === 'redirect') {
      response.writeHead(302, { location: 'https://login.example.test/sso' })
      response.end()
      return
    }
    if (mode === 'unauthorized') {
      response.writeHead(401, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'fixture unauthorized' }))
      return
    }
    if (mode === 'malformed-json-rpc') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ jsonrpc: '2.0', id: body?.id ?? 1, error: { code: -32601, message: 'fixture method rejected' } }))
      return
    }

    response.setHeader('content-type', 'application/json')
    if (body?.method === 'initialize') {
      response.setHeader('mcp-session-id', 'fixture-session')
      response.writeHead(200)
      response.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: INITIALIZE_RESULT }))
      return
    }
    if (body?.method === 'notifications/initialized') {
      response.writeHead(202)
      response.end()
      return
    }
    if (body?.method === 'tools/list') {
      response.writeHead(200)
      response.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { tools: mode === 'empty-tools' ? [] : [TOOL] } }))
      return
    }
    response.writeHead(200)
    response.end(JSON.stringify({ jsonrpc: '2.0', id: body?.id ?? 1, result: {} }))
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') {
    await closeFakeMcpServer(server)
    throw new Error('fake MCP server did not receive an ephemeral port')
  }
  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    requests,
    close: () => closeFakeMcpServer(server),
  }
}

async function closeFakeMcpServer(server) {
  if (!server.listening) return
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
}
