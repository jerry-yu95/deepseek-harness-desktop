const MAX_INPUT_BYTES = 1_048_576
const MAX_SERVERS = 50
const MAX_ARGS = 128
const MAX_RECORD_KEYS = 128
const MAX_SCALAR_LENGTH = 8_192
const ENV_KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/u
const SECRET_KEY_PATTERN = /(?:token|secret|password|api[_-]?key|authorization|credential)/iu
const PLACEHOLDER_PATTERN = /(?:\$\{([A-Z][A-Z0-9_]{0,63})\}|<((?:YOUR[_-])?[A-Z][A-Z0-9_-]{0,63})>)/gu
const PROTOTYPE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const SUPPORTED_TRANSPORTS = new Set(['stdio', 'streamable-http'])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function scanPrototypeKeys(value, path = 'root') {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) scanPrototypeKeys(item, `${path}[${index}]`)
    return
  }
  if (!isRecord(value)) return
  for (const [key, item] of Object.entries(value)) {
    if (PROTOTYPE_KEYS.has(key)) throw new TypeError(`${path}.${key} is a forbidden prototype key`)
    scanPrototypeKeys(item, `${path}.${key}`)
  }
}

function scalar(value, field, { required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (!required) return undefined
    throw new TypeError(`${field} is required`)
  }
  if (typeof value !== 'string') throw new TypeError(`${field} must be a string`)
  if (value.length > MAX_SCALAR_LENGTH) throw new TypeError(`${field} is too long`)
  return value
}

function normalizeId(value, fallback) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
  return normalized || fallback
}

function credentialRef(sourceName, targetKey, usedRefs) {
  const sourcePart = normalizeId(sourceName, 'server').replaceAll('-', '_').toUpperCase()
  const keyPart = targetKey.replace(/[^A-Za-z0-9]+/gu, '_').replace(/^_+|_+$/gu, '').toUpperCase() || 'VALUE'
  const base = `DSH_CONNECTOR_${sourcePart}_${keyPart}`
  let candidate = base
  let suffix = 2
  while (usedRefs.has(candidate)) candidate = `${base}_${suffix++}`
  usedRefs.add(candidate)
  return candidate
}

function headerTemplate(value, field) {
  const trimmed = value.trim()
  const bearer = /^Bearer\s+/iu.test(trimmed)
  const template = bearer ? 'Bearer ${secret}' : '${secret}'
  if (!bearer && trimmed.includes(' ')) throw new TypeError(`${field} has an unsupported secret template`)
  return template
}

function extractSecret(value, { key, location, field, sourceName, usedRefs }) {
  const keyLooksSecret = SECRET_KEY_PATTERN.test(key) || /^(?:x-api-key|proxy-authorization)$/iu.test(key)
  const matches = [...value.matchAll(PLACEHOLDER_PATTERN)]
  const shouldCapturePlaceholder = keyLooksSecret || (matches.length === 1 && matches[0][0] === value.trim())
  if (matches.length > 1) throw new TypeError(`${field} contains multiple secret placeholders`)
  if (!keyLooksSecret && !shouldCapturePlaceholder) return undefined
  const ref = credentialRef(sourceName, key, usedRefs)
  const template = headerTemplate(value, field)
  const placeholder = matches[0]?.[1] ?? matches[0]?.[2]
  return {
    slot: {
      location,
      targetKey: key,
      credentialRef: ref,
      template,
      ...(placeholder ? { placeholder } : {}),
    },
    ...(matches.length === 0 ? { literal: value } : {}),
  }
}

function parseStringMap(value, field, { location, sourceName, usedRefs }) {
  if (value === undefined) return { plain: {}, slots: [], credentials: new Map() }
  if (!isRecord(value)) throw new TypeError(`${field} must be an object`)
  const entries = Object.entries(value)
  if (entries.length > MAX_RECORD_KEYS) throw new TypeError(`${field} has too many keys`)
  const plain = {}
  const slots = []
  const credentials = new Map()
  for (const [key, rawValue] of entries) {
    const normalizedKey = scalar(key, `${field} key`)
    if (location === 'env' && !ENV_KEY_PATTERN.test(normalizedKey)) throw new TypeError(`${field} keys must use shell variable names`)
    if (location === 'header' && /[\r\n]/u.test(normalizedKey)) throw new TypeError(`${field} keys must not contain newlines`)
    const normalizedValue = scalar(rawValue, `${field}.${normalizedKey}`)
    const secret = extractSecret(normalizedValue, {
      key: normalizedKey,
      location,
      field: `${field}.${normalizedKey}`,
      sourceName,
      usedRefs,
    })
    if (secret === undefined) plain[normalizedKey] = normalizedValue
    else {
      slots.push(secret.slot)
      if (secret.literal !== undefined) credentials.set(secret.slot.credentialRef, secret.literal)
    }
  }
  return { plain, slots, credentials }
}

function parseTransport(server, sourceName) {
  const declared = server.type ?? server.transport
  const transport = declared === undefined ? (server.url === undefined ? 'stdio' : 'streamable-http') : String(declared).trim().toLowerCase()
  if (!SUPPORTED_TRANSPORTS.has(transport)) throw new TypeError(`unsupported-mcp-transport:${transport || sourceName}`)
  return transport
}

function parseUrl(value, field) {
  const raw = scalar(value, field)
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    throw new TypeError(`${field} must be a valid URL`)
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new TypeError(`${field} must use http or https`)
  return parsed.toString()
}

/**
 * Parse an official-style mcpServers JSON document without evaluating code.
 * Secret values are returned only in the transient Map and never in servers.
 */
export function parseMcpServersJson(input) {
  if (typeof input !== 'string') throw new TypeError('MCP JSON must be a string')
  if (Buffer.byteLength(input, 'utf8') > MAX_INPUT_BYTES) throw new TypeError('MCP JSON is too large')
  let root
  try {
    root = JSON.parse(input)
  } catch (error) {
    throw new TypeError(`invalid MCP JSON: ${error.message}`)
  }
  if (!isRecord(root)) throw new TypeError('MCP JSON root must be an object')
  scanPrototypeKeys(root)
  if (!isRecord(root.mcpServers)) throw new TypeError('mcpServers must be an object')
  const entries = Object.entries(root.mcpServers)
  if (entries.length > MAX_SERVERS) throw new TypeError(`mcpServers has too many servers (maximum ${MAX_SERVERS})`)

  const servers = []
  const credentials = new Map()
  for (const [index, [sourceName, server]] of entries.entries()) {
    if (!isRecord(server)) throw new TypeError(`mcpServers.${sourceName} must be an object`)
    const transport = parseTransport(server, sourceName)
    const usedRefs = new Set()
    const env = parseStringMap(server.env, `mcpServers.${sourceName}.env`, { location: 'env', sourceName, usedRefs })
    const headers = parseStringMap(server.headers, `mcpServers.${sourceName}.headers`, { location: 'header', sourceName, usedRefs })
    const result = {
      sourceName,
      suggestedId: normalizeId(sourceName, `server-${index + 1}`),
      transport,
      plainEnv: env.plain,
      plainHeaders: headers.plain,
      secretSlots: [...env.slots, ...headers.slots],
    }
    if (transport === 'stdio') {
      const command = scalar(server.command, `mcpServers.${sourceName}.command`)
      const args = server.args === undefined ? [] : server.args
      if (!Array.isArray(args)) throw new TypeError(`mcpServers.${sourceName}.args must be an array`)
      if (args.length > MAX_ARGS) throw new TypeError(`mcpServers.${sourceName}.args has too many arguments`)
      if (args.length === 0 && /\s/u.test(command.trim())) throw new TypeError(`mcpServers.${sourceName}.command must use an args array`)
      result.command = command
      result.args = args.map((item, argIndex) => scalar(item, `mcpServers.${sourceName}.args[${argIndex}]`))
      const cwd = scalar(server.cwd, `mcpServers.${sourceName}.cwd`, { required: false })
      if (cwd !== undefined) result.cwd = cwd
    } else {
      result.url = parseUrl(server.url, `mcpServers.${sourceName}.url`)
    }
    for (const [ref, secret] of [...env.credentials, ...headers.credentials]) credentials.set(ref, secret)
    servers.push(result)
  }
  return { servers, credentials }
}
