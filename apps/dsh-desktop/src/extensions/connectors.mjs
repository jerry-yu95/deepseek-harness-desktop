import { randomUUID } from 'node:crypto'
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { delimiter, dirname, isAbsolute, join } from 'node:path'

const CONNECTOR_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const CONNECTOR_KINDS = new Set(['mcp', 'http'])
const MCP_TRANSPORTS = new Set(['stdio', 'streamable-http'])
const ENV_KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/
const CREDENTIAL_REF_PATTERN = /^DSH_CONNECTOR_[A-Z0-9_]+$/
const SECRET_TEMPLATES = new Set(['${secret}', 'Bearer ${secret}'])
const SOURCE_KINDS = new Set(['custom', 'json', 'preset', 'external-client'])
const SOURCE_SCOPES = new Set(['user', 'project', 'selected-file'])

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

function stringRecord(value, field, { keys = 'env' } = {}) {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${field} must be an object`)
  const entries = Object.entries(value)
  if (entries.length > 128) throw new TypeError(`${field} has too many keys`)
  const result = {}
  for (const [key, rawValue] of entries) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw new TypeError(`${field} contains a forbidden prototype key`)
    const normalizedKey = text(key, `${field} key`, { max: 500 })
    if (keys === 'env' && !ENV_KEY_PATTERN.test(normalizedKey)) throw new TypeError(`${field} keys must use shell variable names`)
    if (keys === 'header' && /[\r\n]/u.test(normalizedKey)) throw new TypeError(`${field} keys must not contain newlines`)
    result[normalizedKey] = text(rawValue, `${field}.${normalizedKey}`, { max: 8_192 })
  }
  return result
}

function secretBindings(value) {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > 64) throw new TypeError('secret bindings must be an array')
  return value.map((binding, index) => {
    if (!binding || typeof binding !== 'object' || Array.isArray(binding)) throw new TypeError(`secret binding ${index} must be an object`)
    const location = text(binding.location, `secret binding ${index} location`, { max: 16 })
    if (!['env', 'header', 'arg'].includes(location)) throw new TypeError(`secret binding ${index} has unsupported location`)
    const targetKey = text(binding.targetKey, `secret binding ${index} target`, { max: 500 })
    if (location === 'env' && !ENV_KEY_PATTERN.test(targetKey)) throw new TypeError(`secret binding ${index} environment key is invalid`)
    if (location === 'header' && /[\r\n]/u.test(targetKey)) throw new TypeError(`secret binding ${index} header key is invalid`)
    if (location === 'arg' && !/^\d+$/u.test(targetKey)) throw new TypeError(`secret binding ${index} argument index is invalid`)
    const credentialRef = text(binding.credentialRef, `secret binding ${index} credential reference`, { max: 128 })
    if (!CREDENTIAL_REF_PATTERN.test(credentialRef)) throw new TypeError(`secret binding ${index} credential reference is invalid`)
    const template = text(binding.template, `secret binding ${index} template`, { max: 64 })
    if (!SECRET_TEMPLATES.has(template)) throw new TypeError(`secret binding ${index} template is unsupported`)
    return {
      location,
      targetKey,
      credentialRef,
      template,
      ...(typeof binding.placeholder === 'string' ? { placeholder: text(binding.placeholder, `secret binding ${index} placeholder`, { max: 128 }) } : {}),
    }
  })
}

function source(value) {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('connector source must be an object')
  const kind = text(value.kind, 'connector source kind', { max: 16 })
  if (!SOURCE_KINDS.has(kind)) throw new TypeError('unsupported connector source')
  const presetId = value.presetId === undefined ? undefined : text(value.presetId, 'connector source preset id', { max: 100 })
  if (kind === 'preset' && presetId === undefined) throw new TypeError('preset connector source requires a preset id')
  const clientId = value.clientId === undefined ? undefined : text(value.clientId, 'connector source client id', { max: 64 })
  const scope = value.scope === undefined ? undefined : text(value.scope, 'connector source scope', { max: 32 })
  if (kind === 'external-client') {
    if (clientId === undefined || !CONNECTOR_ID_PATTERN.test(clientId)) throw new TypeError('external connector source requires a valid client id')
    if (scope === undefined || !SOURCE_SCOPES.has(scope)) throw new TypeError('external connector source requires a valid scope')
  }
  return {
    kind,
    ...(presetId ? { presetId } : {}),
    ...(clientId ? { clientId } : {}),
    ...(scope ? { scope } : {}),
  }
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
  const plainEnv = stringRecord(value.plainEnv, 'plain environment', { keys: 'env' })
  const plainHeaders = stringRecord(value.plainHeaders, 'plain headers', { keys: 'header' })
  const bindings = secretBindings(value.secretBindings)
  const connectorSource = source(value.source)
  if (plainEnv !== undefined) base.plainEnv = plainEnv
  if (plainHeaders !== undefined) base.plainHeaders = plainHeaders
  if (bindings !== undefined) base.secretBindings = bindings
  if (connectorSource !== undefined) base.source = connectorSource
  if (kind === 'http') {
    return { ...base, transport: 'http', url: validateUrl(value.url, 'connector URL') }
  }
  const transport = text(value.transport ?? 'stdio', 'MCP transport', { max: 32 })
  if (!MCP_TRANSPORTS.has(transport)) throw new TypeError('unsupported MCP transport')
  if (transport === 'stdio') {
    const args = stringList(value.args, 'MCP arguments')
    const argBindings = (bindings ?? []).filter((binding) => binding.location === 'arg')
    if (argBindings.some((binding) => Number(binding.targetKey) >= args.length)) throw new TypeError('secret binding argument index is out of range')
    return {
      ...base,
      transport,
      command: text(value.command, 'MCP command', { max: 500 }),
      args,
      ...(value.cwd === undefined ? {} : { cwd: text(value.cwd, 'MCP working directory', { max: 2_000 }) }),
    }
  }
  return { ...base, transport, url: validateUrl(value.url, 'MCP URL') }
}

function yamlValue(value) {
  return JSON.stringify(value)
}

export function renderMcpConnectorPatch(connectors) {
  const entries = []
  for (const connector of connectors.map(validateConnectorInput).filter((item) => item.enabled && item.kind === 'mcp')) {
    const lines = []
    lines.push(`  - id: ${yamlValue(`desktop-mcp-${connector.id}`)}`)
    lines.push(`    name: '@deepseek-ai/dsh-mcp-client'`)
    lines.push('    config:')
    lines.push(`      serverName: ${yamlValue(connector.id)}`)
    lines.push(`      transport: ${yamlValue(connector.transport)}`)
    if (connector.transport === 'stdio') {
      lines.push(`      command: ${yamlValue(connector.command)}`)
      const argBindings = new Map((connector.secretBindings ?? [])
        .filter((binding) => binding.location === 'arg')
        .map((binding) => [binding.targetKey, binding]))
      if (connector.args.length) {
        lines.push('      args:')
        for (const [index, argument] of connector.args.entries()) {
          const binding = argBindings.get(String(index))
          lines.push(`        - ${binding ? `!!js process.env.${binding.credentialRef}` : yamlValue(argument)}`)
        }
      }
      if (connector.cwd) lines.push(`      cwd: ${yamlValue(connector.cwd)}`)
      const plainEnv = Object.entries(connector.plainEnv ?? {})
      const envBindings = (connector.secretBindings ?? []).filter((binding) => binding.location === 'env')
      const legacyEnv = connector.secretEnvKeys.map((key) => ({ targetKey: key, credentialRef: key, template: '${secret}' }))
      if (plainEnv.length || envBindings.length || legacyEnv.length) {
        lines.push('      env:')
        for (const [key, value] of plainEnv) lines.push(`        ${key}: ${yamlValue(value)}`)
        for (const binding of [...envBindings, ...legacyEnv]) lines.push(`        ${binding.targetKey}: !!js process.env.${binding.credentialRef}`)
      }
    } else {
      lines.push(`      url: ${yamlValue(connector.url)}`)
      const plainHeaders = Object.entries(connector.plainHeaders ?? {})
      const headerBindings = (connector.secretBindings ?? []).filter((binding) => binding.location === 'header')
      if (plainHeaders.length || headerBindings.length) {
        lines.push('      headers:')
        for (const [key, value] of plainHeaders) lines.push(`        ${yamlValue(key)}: ${yamlValue(value)}`)
        for (const binding of headerBindings) {
          const expression = binding.template === 'Bearer ${secret}'
            ? `!!js '\`Bearer \${process.env.${binding.credentialRef}}\`'`
            : `!!js process.env.${binding.credentialRef}`
          lines.push(`        ${yamlValue(binding.targetKey)}: ${expression}`)
        }
      }
    }
    lines.push('      failOnStartupError: false')
    entries.push(lines.join('\n'))
  }
  return entries.length ? `- insert:\n${entries.join('\n')}\n` : ''
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
  constructor({ path, fetchImpl = globalThis.fetch, env = process.env, environmentProvider = () => env }) {
    this.path = path
    this.fetchImpl = fetchImpl
    this.env = env
    this.environmentProvider = environmentProvider
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
    const env = this.environmentProvider()
    const requiredReferences = [
      ...connector.secretEnvKeys,
      ...(connector.secretBindings ?? []).map((binding) => binding.credentialRef),
    ]
    const uniqueReferences = requiredReferences.filter((key, index, keys) => keys.indexOf(key) === index)
    const missingSecrets = uniqueReferences.filter((key) => !env[key])
    const checks = [
      { id: 'configuration', status: 'pass', detail: '配置结构有效' },
      missingSecrets.length
        ? { id: 'credentials', status: 'fail', detail: `缺少凭证：${missingSecrets.join(', ')}` }
        : { id: 'credentials', status: 'pass', detail: uniqueReferences.length ? '所需凭证已安全保存' : '无需额外凭证' },
    ]
    if (missingSecrets.length) {
      checks.push(
        { id: 'runtime', status: 'skipped', detail: '补齐凭证后再检查运行环境' },
        { id: 'registration', status: connector.enabled ? 'pass' : 'warn', detail: connector.enabled ? '已写入桌面连接器注册表' : '连接器当前已停用' },
      )
      return { ok: false, state: 'missing-credentials', detail: `缺少凭证：${missingSecrets.join(', ')}`, checks }
    }
    if (connector.transport === 'stdio') {
      const ok = await commandExists(connector.command, env)
      checks.push(
        { id: 'runtime', status: ok ? 'pass' : 'fail', detail: ok ? `本地命令可用：${connector.command}` : `找不到本地命令：${connector.command}` },
        { id: 'registration', status: connector.enabled ? 'pass' : 'warn', detail: connector.enabled ? '已写入桌面连接器注册表；保存时已触发 Harness 重载' : '连接器当前已停用' },
      )
      return { ok, state: ok ? 'ready' : 'command-not-found', detail: ok ? '配置、凭证和本地运行环境已就绪' : `找不到命令：${connector.command}`, checks }
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5_000)
    try {
      const response = await this.fetchImpl(connector.url, { method: 'HEAD', redirect: 'manual', signal: controller.signal })
      const serverFailure = response.status >= 500
      const authRequired = response.status === 401 || response.status === 403
      const methodUnsupported = response.status === 405
      const status = serverFailure ? 'fail' : (authRequired || methodUnsupported ? 'warn' : 'pass')
      const runtimeDetail = authRequired
        ? `端点可达（HTTP ${response.status}），服务要求授权；请在实际会话中验证权限`
        : methodUnsupported
          ? '端点可达（HTTP 405），服务不支持轻量 HEAD 探测'
          : `端点响应 HTTP ${response.status}`
      checks.push(
        { id: 'runtime', status, detail: runtimeDetail },
        { id: 'registration', status: connector.enabled ? 'pass' : 'warn', detail: connector.enabled ? '已写入桌面连接器注册表；保存时已触发 Harness 重载' : '连接器当前已停用' },
      )
      return {
        ok: !serverFailure,
        state: serverFailure ? 'server-error' : authRequired ? 'auth-required' : methodUnsupported ? 'method-unsupported' : 'reachable',
        detail: serverFailure ? `服务端错误：HTTP ${response.status}` : runtimeDetail,
        checks,
      }
    } catch (error) {
      const detail = error.name === 'AbortError' ? '连接超时' : error.message
      checks.push(
        { id: 'runtime', status: 'fail', detail },
        { id: 'registration', status: connector.enabled ? 'pass' : 'warn', detail: connector.enabled ? '已写入桌面连接器注册表' : '连接器当前已停用' },
      )
      return { ok: false, state: 'unreachable', detail, checks }
    } finally {
      clearTimeout(timer)
    }
  }
}
