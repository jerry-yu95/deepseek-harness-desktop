import { randomUUID } from 'node:crypto'
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { delimiter, dirname, isAbsolute, join } from 'node:path'

const CONNECTOR_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const CONNECTOR_KINDS = new Set(['mcp', 'http'])
const MCP_TRANSPORTS = new Set(['stdio', 'streamable-http'])
const ENV_KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/

function text(value, field, { required = true, max = 2_000 } = {}) {
  if (!required && (value === undefined || value === null || value === '')) return ''
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${field} is required`)
  const normalized = value.trim()
  if (normalized.length > max) throw new TypeError(`${field} is too long`)
  return normalized
}

function stringList(value, field, maxItems = 64) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > maxItems) throw new TypeError(`${field} must be a string array`)
  return value.map((item) => text(item, field, { max: 500 }))
}

function validateUrl(value, field) {
  const url = new URL(text(value, field))
  if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError(`${field} must use http or https`)
  url.username = ''
  url.password = ''
  return url.toString()
}

export function validateConnectorInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('connector must be an object')
  const id = text(value.id, 'connector id', { max: 64 })
  if (!CONNECTOR_ID_PATTERN.test(id)) throw new TypeError('connector id must be kebab-case')
  const kind = text(value.kind, 'connector kind', { max: 32 })
  if (!CONNECTOR_KINDS.has(kind)) throw new TypeError('unsupported connector kind')
  const secretEnvKeys = stringList(value.secretEnvKeys, 'secret environment keys', 32)
  if (secretEnvKeys.some((key) => !ENV_KEY_PATTERN.test(key))) throw new TypeError('secret environment keys must use shell variable names')
  const base = {
    id,
    name: text(value.name, 'connector name', { max: 100 }),
    description: text(value.description, 'connector description', { required: false, max: 500 }),
    kind,
    enabled: value.enabled !== false,
    capabilities: stringList(value.capabilities, 'capabilities', 32),
    secretEnvKeys,
  }
  if (kind === 'http') {
    return { ...base, transport: 'http', url: validateUrl(value.url, 'connector URL') }
  }
  const transport = text(value.transport ?? 'stdio', 'MCP transport', { max: 32 })
  if (!MCP_TRANSPORTS.has(transport)) throw new TypeError('unsupported MCP transport')
  if (transport === 'stdio') {
    return {
      ...base,
      transport,
      command: text(value.command, 'MCP command', { max: 500 }),
      args: stringList(value.args, 'MCP arguments'),
    }
  }
  return { ...base, transport, url: validateUrl(value.url, 'MCP URL') }
}

function yamlValue(value) {
  return JSON.stringify(value)
}

export function renderMcpConnectorPatch(connectors) {
  const lines = []
  for (const connector of connectors.map(validateConnectorInput).filter((item) => item.enabled && item.kind === 'mcp')) {
    lines.push(`- id: ${yamlValue(`desktop-mcp-${connector.id}`)}`)
    lines.push(`  name: '@deepseek-ai/dsh-mcp-client'`)
    lines.push('  config:')
    lines.push(`    serverName: ${yamlValue(connector.id)}`)
    lines.push(`    transport: ${yamlValue(connector.transport)}`)
    if (connector.transport === 'stdio') {
      lines.push(`    command: ${yamlValue(connector.command)}`)
      if (connector.args.length) lines.push(`    args: ${yamlValue(connector.args)}`)
      if (connector.secretEnvKeys.length) {
        lines.push('    env:')
        for (const key of connector.secretEnvKeys) lines.push(`      ${key}: !!js process.env.${key}`)
      }
    } else {
      lines.push(`    url: ${yamlValue(connector.url)}`)
    }
    lines.push('    failOnStartupError: false')
  }
  return lines.length ? `${lines.join('\n')}\n` : ''
}

async function atomicJsonWrite(path, data) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  await rename(temporary, path)
}

/** Windows resolves bare commands through executable extensions; probe a fixed minimal set (PATHEXT subset). */
const EXECUTABLE_EXTENSIONS = process.platform === 'win32' ? ['', '.exe', '.cmd', '.bat'] : ['']

export async function commandExists(command, env = process.env) {
  const directories = isAbsolute(command)
    ? [dirname(command)]
    : String(env.PATH ?? '').split(delimiter).filter(Boolean)
  for (const directory of directories) {
    for (const extension of EXECUTABLE_EXTENSIONS) {
      try {
        await access(join(directory, `${command}${extension}`))
        return true
      } catch {}
    }
  }
  return false
}

export class ConnectorStore {
  constructor({ path, fetchImpl = globalThis.fetch, env = process.env }) {
    this.path = path
    this.fetchImpl = fetchImpl
    this.env = env
  }

  async list() {
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8'))
      if (!Array.isArray(parsed)) throw new Error('connector registry must be an array')
      return parsed.map(validateConnectorInput)
    } catch (error) {
      if (error?.code === 'ENOENT') return []
      throw error
    }
  }

  async save(input) {
    const connector = validateConnectorInput(input)
    const connectors = await this.list()
    const index = connectors.findIndex((item) => item.id === connector.id)
    if (index >= 0) connectors[index] = connector
    else connectors.push(connector)
    await atomicJsonWrite(this.path, connectors.toSorted((left, right) => left.name.localeCompare(right.name)))
    return connector
  }

  async remove(id) {
    const normalized = text(id, 'connector id', { max: 64 })
    const connectors = await this.list()
    const next = connectors.filter((item) => item.id !== normalized)
    if (next.length === connectors.length) throw new Error(`connector ${normalized} was not found`)
    await atomicJsonWrite(this.path, next)
    return { id: normalized }
  }

  async check(id) {
    const connector = (await this.list()).find((item) => item.id === id)
    if (!connector) throw new Error(`connector ${id} was not found`)
    const missingSecrets = connector.secretEnvKeys.filter((key) => !this.env[key])
    if (missingSecrets.length) {
      return { ok: false, state: 'missing-credentials', detail: `缺少环境变量：${missingSecrets.join(', ')}` }
    }
    if (connector.transport === 'stdio') {
      const ok = await commandExists(connector.command, this.env)
      return { ok, state: ok ? 'ready' : 'command-not-found', detail: ok ? '命令可用，尚未启动进程' : `找不到命令：${connector.command}` }
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5_000)
    try {
      const response = await this.fetchImpl(connector.url, { method: 'HEAD', redirect: 'manual', signal: controller.signal })
      const ok = response.status < 500
      return { ok, state: ok ? 'reachable' : 'server-error', detail: `HTTP ${response.status}` }
    } catch (error) {
      return { ok: false, state: 'unreachable', detail: error.name === 'AbortError' ? '连接超时' : error.message }
    } finally {
      clearTimeout(timer)
    }
  }
}
