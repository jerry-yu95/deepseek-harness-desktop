import { createHash, randomUUID } from 'node:crypto'
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { delimiter, dirname, isAbsolute, join } from 'node:path'

const CONNECTOR_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const CONNECTOR_KINDS = new Set(['mcp', 'http'])
const MCP_TRANSPORTS = new Set(['stdio', 'streamable-http'])
const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
const CREDENTIAL_REF_PATTERN = /^DSH_CONNECTOR_[A-Z0-9_]+$/
const SECRET_TEMPLATES = new Set(['${secret}', 'Bearer ${secret}'])
const SOURCE_KINDS = new Set(['custom', 'json', 'preset', 'provider-json', 'external-client'])
const PROVIDER_JSON_IDS = new Set(['tapd', 'tencent-gongfeng'])
const SOURCE_SCOPES = new Set(['user', 'project', 'selected-file'])
const SHA256_PATTERN = /^[a-f0-9]{64}$/
export const CONNECTOR_PROBE_TIMEOUT_MS = 15_000

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
  if (kind === 'provider-json') {
    const providerId = text(value.providerId, 'connector source provider id', { max: 64 })
    if (!PROVIDER_JSON_IDS.has(providerId)) throw new TypeError('unsupported provider id')
    const configurationHash = text(value.configurationHash, 'connector source configuration hash', { max: 128 })
    if (!SHA256_PATTERN.test(configurationHash)) throw new TypeError('connector source configuration hash must be a SHA-256 hex string')
    const capturedAt = text(value.capturedAt, 'connector source captured at', { max: 64 })
    if (Number.isNaN(Date.parse(capturedAt))) throw new TypeError('connector source captured at must be an ISO date')
    return { kind, providerId, configurationHash, capturedAt }
  }
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
  if (isAbsolute(command)) {
    try {
      await access(command)
      return true
    } catch {
      return false
    }
  }
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
      return parsed.map((item) => migrateLegacyProviderSource(validateConnectorInput(item)))
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

  async setEnabled(id, enabled) {
    const normalized = text(id, 'connector id', { max: 64 })
    if (!CONNECTOR_ID_PATTERN.test(normalized)) throw new TypeError('connector id must be kebab-case')
    if (typeof enabled !== 'boolean') throw new TypeError('connector enabled state must be a boolean')
    const connectors = await this.list()
    const index = connectors.findIndex((item) => item.id === normalized)
    if (index < 0) throw new Error(`connector ${normalized} was not found`)
    const connector = validateConnectorInput({ ...connectors[index], enabled })
    connectors[index] = connector
    await atomicJsonWrite(this.path, connectors.toSorted((left, right) => left.name.localeCompare(right.name)))
    return connector
  }

  async check(id) {
    const connector = (await this.list()).find((item) => item.id === id)
    if (!connector) throw new Error(`connector ${id} was not found`)
    return this.checkCandidate(connector, undefined, { registered: true })
  }

  /** Test one validated draft without persisting it or mutating the Harness profile. */
  async checkCandidate(input, credentials, { registered = false } = {}) {
    const connector = validateConnectorInput(input)
    const candidateCredentials = credentials instanceof Map
      ? Object.fromEntries(credentials)
      : (credentials && typeof credentials === 'object' ? credentials : {})
    const env = { ...this.environmentProvider(), ...candidateCredentials }
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
        : {
            id: 'credentials',
            status: 'pass',
            detail: uniqueReferences.length
              ? (registered ? '所需凭证已安全保存' : '已提供测试所需凭证；本次测试不会保存')
              : '无需额外凭证',
          },
    ]
    if (missingSecrets.length) {
      checks.push(
        { id: 'runtime', status: 'skipped', detail: '补齐凭证后再检查运行环境' },
        registrationCheck(connector, registered),
      )
      return { ok: false, state: 'missing-credentials', detail: `缺少凭证：${missingSecrets.join(', ')}`, checks }
    }
    if (connector.transport === 'stdio') {
      const ok = await commandExists(connector.command, env)
      checks.push(
        { id: 'runtime', status: ok ? 'pass' : 'fail', detail: ok ? `本地命令可用：${connector.command}` : `找不到本地命令：${connector.command}` },
        registrationCheck(connector, registered),
      )
      return { ok, state: ok ? 'ready' : 'command-not-found', detail: ok ? '配置、凭证和本地运行环境已就绪' : `找不到命令：${connector.command}`, checks }
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), CONNECTOR_PROBE_TIMEOUT_MS)
    try {
      const probe = await probeRemoteConnector(connector, env, this.fetchImpl, controller.signal, uniqueReferences)
      checks.push(
        { id: 'runtime', status: probe.runtimeStatus, detail: probe.detail },
        registrationCheck(connector, registered),
      )
      return { ok: probe.ok, state: probe.state, detail: probe.detail, checks }
    } catch (error) {
      const detail = error.name === 'AbortError' ? '连接超时' : error.message
      checks.push(
        { id: 'runtime', status: 'fail', detail },
        registrationCheck(connector, registered),
      )
      return { ok: false, state: 'unreachable', detail, checks }
    } finally {
      clearTimeout(timer)
    }
  }
}

function migrateLegacyProviderSource(connector) {
  if (connector.source?.kind !== 'json' || connector.kind !== 'mcp') return connector
  const nameMatches = /(?:^|[^a-z0-9])tapd(?:[^a-z0-9]|$)/iu.test(connector.name)
  let hostMatches = false
  if (connector.transport === 'streamable-http') {
    try { hostMatches = new URL(connector.url).hostname.toLowerCase() === 'mcp-oa.tapd.woa.com' } catch { hostMatches = false }
  }
  if (!nameMatches && !hostMatches) return connector
  const configurationHash = createHash('sha256').update(JSON.stringify({
    name: connector.name,
    transport: connector.transport,
    url: connector.url,
    plainHeaders: connector.plainHeaders ?? {},
    secretBindings: (connector.secretBindings ?? []).map(({ location, targetKey, template }) => ({ location, targetKey, template })),
  })).digest('hex')
  return validateConnectorInput({
    ...connector,
    source: { kind: 'provider-json', providerId: 'tapd', configurationHash, capturedAt: '1970-01-01T00:00:00.000Z' },
  })
}

function registrationCheck(connector, registered) {
  if (!registered) return { id: 'registration', status: 'skipped', detail: '当前仅测试草稿；测试通过后保存才会注册并重载 Harness' }
  return { id: 'registration', status: connector.enabled ? 'pass' : 'warn', detail: connector.enabled ? '已写入桌面连接器注册表' : '连接器当前已停用' }
}

function resolveConnectorHeaders(connector, env) {
  const headers = { ...(connector.plainHeaders ?? {}) }
  for (const binding of (connector.secretBindings ?? []).filter(item => item.location === 'header')) {
    const secret = env[binding.credentialRef]
    if (!secret) continue
    headers[binding.targetKey] = binding.template === 'Bearer ${secret}' ? `Bearer ${secret}` : secret
  }
  return headers
}

async function probeRemoteConnector(connector, env, fetchImpl, signal, uniqueReferences) {
  const headers = resolveConnectorHeaders(connector, env)
  const isMcp = connector.kind === 'mcp' && connector.transport === 'streamable-http'
  if (!isMcp) {
    const response = await fetchImpl(connector.url, { method: 'HEAD', redirect: 'manual', signal, headers })
    return classifyRemoteResponse(response, { isMcp: false, uniqueReferences })
  }
  const response = await fetchImpl(connector.url, {
    method: 'POST',
    redirect: 'manual',
    signal,
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'dsh-desktop-connector-test', version: '1' } },
    }),
  })
  if (response.status === 405 || response.status === 406) {
    const sse = await probeMcpSse(fetchImpl, connector.url, headers, signal, uniqueReferences)
    if (sse !== undefined) return sse
  }
  if (response.status >= 200 && response.status < 300) {
    const initialized = await readMcpRpcResponse(response)
    if (initialized?.error !== undefined || initialized?.result === undefined) {
      return {
        ok: false,
        state: 'protocol-rejected',
        runtimeStatus: 'fail',
        detail: initialized?.error !== undefined
          ? 'MCP initialize 返回 JSON-RPC 错误'
          : '端点没有返回有效的 MCP initialize 结果',
      }
    }
    return probeMcpTools(fetchImpl, connector.url, headers, response, signal, uniqueReferences)
  }
  return classifyRemoteResponse(response, { isMcp: true, uniqueReferences })
}

async function probeMcpTools(fetchImpl, url, headers, initializeResponse, signal, uniqueReferences) {
  const sessionId = headerOf(initializeResponse, 'mcp-session-id')
  const requestHeaders = {
    accept: 'application/json, text/event-stream',
    'content-type': 'application/json',
    ...headers,
    ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
  }
  await fetchImpl(url, {
    method: 'POST',
    redirect: 'manual',
    signal,
    headers: requestHeaders,
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  })
  const response = await fetchImpl(url, {
    method: 'POST',
    redirect: 'manual',
    signal,
    headers: requestHeaders,
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
  })
  if (response.status < 200 || response.status >= 300) return classifyRemoteResponse(response, { isMcp: true, uniqueReferences })
  const payload = await readMcpRpcResponse(response)
  const tools = payload?.result?.tools
  if (!Array.isArray(tools)) {
    return { ok: false, state: 'tools-unavailable', runtimeStatus: 'fail', detail: 'MCP 已初始化，但 tools/list 未返回可注册的工具列表' }
  }
  if (tools.length === 0) {
    return { ok: false, state: 'tools-empty', runtimeStatus: 'fail', detail: 'MCP 已初始化，但服务没有提供任何工具' }
  }
  return { ok: true, state: 'mcp-ready', runtimeStatus: 'pass', detail: `MCP 握手成功，可注册 ${tools.length} 个工具` }
}

async function probeMcpSse(fetchImpl, url, headers, signal, uniqueReferences) {
  const response = await fetchImpl(url, {
    method: 'GET',
    redirect: 'manual',
    signal,
    headers: { accept: 'text/event-stream', ...headers },
  })
  if (response.status === 401 || response.status === 403 || response.status === 404 || response.status >= 500) {
    return classifyRemoteResponse(response, { isMcp: true, uniqueReferences })
  }
  const type = contentTypeOf(response)
  if (response.status >= 200 && response.status < 300 && /text\/event-stream/i.test(type)) {
    return { ok: false, state: 'mcp-sse-unverified', runtimeStatus: 'warn', detail: '端点提供 SSE 响应，但尚未验证 tools/list；不会标记为可用' }
  }
  return undefined
}

async function classifyRemoteResponse(response, { isMcp, uniqueReferences }) {
  const status = response.status
  const redirect = status >= 300 && status < 400
  const authRequired = status === 401 || status === 403
  const endpointMissing = status === 404
  const serverFailure = status >= 500
  const methodUnsupported = status === 405 || status === 406
  const { json, text } = await readFetchBody(response)
  const rpcError = isMcp && json !== undefined && typeof json === 'object' && json !== null && json.error !== undefined
  const nonJsonSuccess = isMcp && status >= 200 && status < 300 && text.length > 0 && json === undefined
    && !/text\/event-stream/i.test(contentTypeOf(response))
  const protocolRejected = isMcp && (rpcError || nonJsonSuccess
    || (status >= 400 && !authRequired && !endpointMissing && !methodUnsupported && !serverFailure))
  if (authRequired) {
    const needsAuth = uniqueReferences.length === 0
    return {
      ok: false,
      state: needsAuth ? 'needs-authorization' : 'authorization-failed',
      runtimeStatus: 'warn',
      detail: needsAuth
        ? '需要完成授权后才能完成握手；可以先保存再授权。'
        : `凭证无效或已过期（HTTP ${status}）`,
    }
  }
  if (redirect) {
    const location = headerOf(response, 'location')
    const loginRedirect = /(?:login|passport|oauth|sso)/iu.test(location)
    return {
      ok: false,
      state: loginRedirect ? 'needs-authorization' : 'redirected',
      runtimeStatus: 'warn',
      detail: loginRedirect
        ? `MCP 端点重定向到登录/授权页面（HTTP ${status}），当前凭证未建立可用的 MCP 会话`
        : `MCP 端点返回重定向（HTTP ${status}），未完成 initialize 与 tools/list`,
    }
  }
  if (endpointMissing) {
    return { ok: false, state: 'endpoint-not-found', runtimeStatus: 'fail', detail: '服务返回 HTTP 404；请检查 MCP URL 路径是否完整' }
  }
  if (serverFailure) {
    return { ok: false, state: 'server-error', runtimeStatus: 'fail', detail: `服务端错误：HTTP ${status}` }
  }
  if (methodUnsupported) {
    return {
      ok: false,
      state: 'method-unsupported',
      runtimeStatus: 'warn',
      detail: `端点可达（HTTP ${status}），但不接受 MCP initialize 或 SSE 握手`,
    }
  }
  if (protocolRejected) {
    return {
      ok: false,
      state: 'protocol-rejected',
      runtimeStatus: 'fail',
      detail: rpcError
        ? 'MCP 初始化或能力发现失败：服务返回了 JSON-RPC 错误'
        : `MCP 握手被拒绝（HTTP ${status}）；请检查传输协议与服务配置`,
    }
  }
  return {
    ok: true,
    state: isMcp ? 'mcp-ready' : 'reachable',
    runtimeStatus: 'pass',
    detail: isMcp ? `MCP initialize 已响应（HTTP ${status}）` : `端点响应 HTTP ${status}`,
  }
}

function headerOf(response, name) {
  if (typeof response?.headers?.get === 'function') return String(response.headers.get(name) ?? '')
  if (response?.headers && typeof response.headers === 'object') {
    const entry = Object.entries(response.headers).find(([key]) => key.toLowerCase() === name.toLowerCase())
    return String(entry?.[1] ?? '')
  }
  return ''
}

async function readMcpRpcResponse(response) {
  const { json, text } = await readFetchBody(response)
  if (json !== undefined) return json
  if (/text\/event-stream/i.test(contentTypeOf(response))) {
    for (const line of text.split(/\r?\n/gu)) {
      if (!line.startsWith('data:')) continue
      try { return JSON.parse(line.slice(5).trim()) } catch { /* keep scanning */ }
    }
  }
  return undefined
}

function contentTypeOf(response) {
  if (typeof response?.headers?.get === 'function') return String(response.headers.get('content-type') ?? '')
  if (response?.headers && typeof response.headers === 'object') return String(response.headers['content-type'] ?? '')
  return ''
}

async function readFetchBody(response) {
  let text = ''
  try {
    if (typeof response?.clone === 'function') text = await response.clone().text()
    else if (typeof response?.text === 'function') text = await response.text()
    else if (typeof response?.json === 'function') return { json: await response.json(), text: '' }
  } catch {
    return { json: undefined, text: '' }
  }
  if (!text) return { json: undefined, text: '' }
  try { return { json: JSON.parse(text), text } } catch { return { json: undefined, text } }
}
