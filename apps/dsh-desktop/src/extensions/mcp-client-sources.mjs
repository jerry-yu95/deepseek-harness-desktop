import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'

import { parseMcpServersJson } from './mcp-config.mjs'

const CLIENTS = Object.freeze([
  {
    clientId: 'workbuddy',
    clientName: 'WorkBuddy',
    candidates: home => [join(home, '.workbuddy', 'mcp.json')],
  },
  {
    clientId: 'codebuddy',
    clientName: 'CodeBuddy',
    candidates: home => [
      join(home, '.codebuddy', '.mcp.json'),
      join(home, '.codebuddy', 'mcp.json'),
      join(home, '.codebuddy.json'),
    ],
  },
  {
    clientId: 'trae',
    clientName: 'TRAE',
    candidates: () => [],
  },
  {
    clientId: 'qoder',
    clientName: 'Qoder',
    candidates: home => [join(home, '.qoder', 'settings.json')],
  },
])

function clientById(clientId) {
  const client = CLIENTS.find(item => item.clientId === clientId)
  if (!client) throw new TypeError(`unsupported MCP client:${String(clientId)}`)
  return client
}

async function firstReadable(paths, reader) {
  for (const path of paths) {
    try {
      return { path, text: await reader(path, 'utf8') }
    } catch (error) {
      if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') throw error
    }
  }
  return undefined
}

function inspectedSource(client, text, scope) {
  const parsed = parseMcpServersJson(text)
  return {
    clientId: client.clientId,
    clientName: client.clientName,
    scope,
    serverCount: parsed.servers.length,
    text,
  }
}

/** Renderer-safe availability metadata. Paths and document values stay private. */
export async function discoverMcpClientSources({ homeDir = homedir(), reader = readFile } = {}) {
  const results = []
  for (const client of CLIENTS) {
    const candidates = client.candidates(homeDir)
    if (candidates.length === 0) {
      results.push({ clientId: client.clientId, clientName: client.clientName, status: 'manual', serverCount: 0, scope: 'selected-file' })
      continue
    }
    let source
    try {
      source = await firstReadable(candidates, reader)
    } catch {
      results.push({ clientId: client.clientId, clientName: client.clientName, status: 'invalid', serverCount: 0, scope: 'user' })
      continue
    }
    if (!source) {
      results.push({ clientId: client.clientId, clientName: client.clientName, status: 'not-found', serverCount: 0, scope: 'user' })
      continue
    }
    try {
      const parsed = parseMcpServersJson(source.text)
      results.push({
        clientId: client.clientId,
        clientName: client.clientName,
        status: parsed.servers.length > 0 ? 'available' : 'empty',
        serverCount: parsed.servers.length,
        scope: 'user',
      })
    } catch {
      results.push({ clientId: client.clientId, clientName: client.clientName, status: 'invalid', serverCount: 0, scope: 'user' })
    }
  }
  return results
}

/** Read one verified user-level source. The caller must keep the returned text in the main process. */
export async function readMcpClientSource(clientId, { homeDir = homedir(), reader = readFile } = {}) {
  const client = clientById(clientId)
  const candidates = client.candidates(homeDir)
  if (candidates.length === 0) throw new Error(`MCP client requires manual source selection:${clientId}`)
  const source = await firstReadable(candidates, reader)
  if (!source) throw new Error(`MCP client configuration was not found:${clientId}`)
  return inspectedSource(client, source.text, 'user')
}

/** Read a user-selected source without returning its local path to the renderer. */
export async function readMcpSourceFile({ clientId, filePath, reader = readFile }) {
  const client = clientById(clientId)
  if (typeof filePath !== 'string' || !isAbsolute(filePath)) throw new TypeError('MCP source file path must be absolute')
  const text = await reader(filePath, 'utf8')
  return inspectedSource(client, text, 'selected-file')
}
