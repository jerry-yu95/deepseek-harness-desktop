import { readFile } from 'node:fs/promises'
import { homedir, platform as currentPlatform } from 'node:os'
import { isAbsolute, join } from 'node:path'

import { parseMcpServersJson } from './mcp-config.mjs'

function candidate(path, scope = 'user') {
  return { path, scope }
}

function defaultAppData(home, platform) {
  if (platform === 'darwin') return join(home, 'Library', 'Application Support')
  if (platform === 'win32') return process.env.APPDATA || join(home, 'AppData', 'Roaming')
  return process.env.XDG_CONFIG_HOME || join(home, '.config')
}

const CLIENTS = Object.freeze([
  {
    clientId: 'workbuddy',
    clientName: 'WorkBuddy',
    candidates: ({ home, project }) => [
      ...(project ? [candidate(join(project, '.workbuddy', '.mcp.json'), 'project'), candidate(join(project, '.workbuddy', 'mcp.json'), 'project')] : []),
      candidate(join(home, '.workbuddy', '.mcp.json')),
      candidate(join(home, '.workbuddy', 'mcp.json')),
    ],
  },
  {
    clientId: 'codebuddy',
    clientName: 'CodeBuddy',
    candidates: ({ home, project }) => [
      ...(project ? [
        candidate(join(project, '.mcp.json'), 'project'),
        candidate(join(project, 'mcp.json'), 'project'),
        candidate(join(project, '.codebuddy', '.mcp.json'), 'project'),
        candidate(join(project, '.codebuddy', 'mcp.json'), 'project'),
      ] : []),
      candidate(join(home, '.codebuddy', '.mcp.json')),
      candidate(join(home, '.codebuddy', 'mcp.json')),
      candidate(join(home, '.codebuddy.json')),
    ],
  },
  {
    clientId: 'trae',
    clientName: 'TRAE',
    candidates: ({ home, project, appData }) => [
      ...(project ? [candidate(join(project, '.trae', 'mcp.json'), 'project'), candidate(join(project, '.trae', '.mcp.json'), 'project'), candidate(join(project, '.mcp.json'), 'project')] : []),
      candidate(join(home, '.trae', 'mcp.json')),
      candidate(join(home, '.trae', '.mcp.json')),
      candidate(join(appData, 'Trae CN', 'User', 'mcp.json')),
      candidate(join(appData, 'Trae', 'User', 'mcp.json')),
    ],
  },
  {
    clientId: 'qoder',
    clientName: 'Qoder',
    candidates: ({ home, project }) => [
      ...(project ? [
        candidate(join(project, '.qoder', 'settings.local.json'), 'project'),
        candidate(join(project, '.qoder', 'settings.json'), 'project'),
        candidate(join(project, '.mcp.json'), 'project'),
      ] : []),
      candidate(join(home, '.qoder', 'settings.json')),
    ],
  },
])

function clientById(clientId) {
  const client = CLIENTS.find(item => item.clientId === clientId)
  if (!client) throw new TypeError(`unsupported MCP client:${String(clientId)}`)
  return client
}

async function inspectCandidates(candidates, reader) {
  let empty
  let invalid
  for (const item of candidates) {
    try {
      const text = await reader(item.path, 'utf8')
      try {
        const parsed = parseMcpServersJson(text)
        const source = { ...item, text, serverCount: parsed.servers.length }
        if (source.serverCount > 0) return { status: 'available', source }
        empty ??= source
      } catch (error) {
        invalid ??= { ...item, error }
      }
    } catch (error) {
      if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') throw error
    }
  }
  if (empty) return { status: 'empty', source: empty }
  if (invalid) return { status: 'invalid', source: invalid }
  return { status: 'not-found' }
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
function sourceContext({ homeDir = homedir(), projectRoot, appDataDir, platform = currentPlatform() } = {}) {
  return { home: homeDir, project: projectRoot, appData: appDataDir ?? defaultAppData(homeDir, platform) }
}

export async function discoverMcpClientSources({ homeDir = homedir(), projectRoot, appDataDir, platform = currentPlatform(), reader = readFile } = {}) {
  const context = sourceContext({ homeDir, projectRoot, appDataDir, platform })
  const results = []
  for (const client of CLIENTS) {
    try {
      const inspected = await inspectCandidates(client.candidates(context), reader)
      results.push({
        clientId: client.clientId,
        clientName: client.clientName,
        status: inspected.status,
        serverCount: inspected.source?.serverCount ?? 0,
        scope: inspected.source?.scope ?? 'user',
      })
    } catch {
      results.push({ clientId: client.clientId, clientName: client.clientName, status: 'invalid', serverCount: 0, scope: 'user' })
    }
  }
  return results
}

/** Read one verified user-level source. The caller must keep the returned text in the main process. */
export async function readMcpClientSource(clientId, { homeDir = homedir(), projectRoot, appDataDir, platform = currentPlatform(), reader = readFile } = {}) {
  const client = clientById(clientId)
  const context = sourceContext({ homeDir, projectRoot, appDataDir, platform })
  const inspected = await inspectCandidates(client.candidates(context), reader)
  if (inspected.status !== 'available' || !inspected.source) throw new Error(`MCP client configuration was not found or contains no services:${clientId}`)
  return inspectedSource(client, inspected.source.text, inspected.source.scope)
}

/** Read a user-selected source without returning its local path to the renderer. */
export async function readMcpSourceFile({ clientId, filePath, reader = readFile }) {
  const client = clientById(clientId)
  if (typeof filePath !== 'string' || !isAbsolute(filePath)) throw new TypeError('MCP source file path must be absolute')
  const text = await reader(filePath, 'utf8')
  return inspectedSource(client, text, 'selected-file')
}
