import { createHash } from 'node:crypto'

import { parseMcpServersJson } from './mcp-config.mjs'
import { validateConnectorInput } from './connectors.mjs'

const CONFLICTS = new Set(['reject', 'replace', 'rename'])
const PROVIDER_JSON_IDS = new Set(['tapd', 'tencent-gongfeng'])

function ownRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function allocateId(base, usedIds, conflict) {
  if (!usedIds.has(base)) {
    usedIds.add(base)
    return base
  }
  if (conflict === 'reject') throw new Error(`connector-conflict:${base}`)
  if (conflict === 'replace') return base
  let suffix = 2
  let candidate = `${base}-${suffix}`
  while (usedIds.has(candidate)) candidate = `${base}-${++suffix}`
  usedIds.add(candidate)
  return candidate
}

function credentialInput(input) {
  if (input === undefined) return {}
  if (!ownRecord(input)) throw new TypeError('connector secrets must be an object')
  const result = Object.create(null)
  for (const [reference, value] of Object.entries(input)) {
    if (typeof value !== 'string' || value.length === 0) throw new TypeError(`credential value for ${reference} must be a non-empty string`)
    if (value.length > 8_192) throw new TypeError(`credential value for ${reference} is too long`)
    result[reference] = value
  }
  return result
}

function sortedRecord(value) {
  return Object.fromEntries(Object.entries(value ?? {}).sort(([left], [right]) => left.localeCompare(right)))
}

function canonicalProviderJson(parsed) {
  return parsed.servers
    .map((server) => ({
      sourceName: server.sourceName,
      transport: server.transport,
      ...(server.command !== undefined ? { command: server.command, args: [...server.args] } : { url: server.url }),
      ...(server.cwd !== undefined ? { cwd: server.cwd } : {}),
      plainEnv: sortedRecord(server.plainEnv),
      plainHeaders: sortedRecord(server.plainHeaders),
      secretSlots: server.secretSlots
        .map(({ location, targetKey, template }) => ({
          location,
          targetKey,
          template,
        }))
        .toSorted((left, right) => `${left.location}:${left.targetKey}`.localeCompare(`${right.location}:${right.targetKey}`)),
    }))
    .toSorted((left, right) => left.sourceName.localeCompare(right.sourceName))
}

/**
 * Create a stable, redacted provenance record for a provider-supplied JSON
 * document. Parsed credential values are deliberately excluded from the
 * fingerprint so rotating a token does not create a false configuration
 * change. The main process is responsible for supplying capturedAt.
 */
export function createProviderJsonSource({ providerId, parsed, capturedAt = new Date().toISOString() }) {
  if (typeof providerId !== 'string' || !PROVIDER_JSON_IDS.has(providerId)) throw new TypeError('unsupported provider id')
  if (!parsed || !Array.isArray(parsed.servers)) throw new TypeError('invalid parsed MCP configuration')
  const configurationHash = createHash('sha256')
    .update(JSON.stringify(canonicalProviderJson(parsed)))
    .digest('hex')
  return { kind: 'provider-json', providerId, configurationHash, capturedAt }
}

/**
 * Parse and return a renderer-safe preview. Credential values are represented
 * only by `detected: true`; the actual values stay in the main process.
 */
export function previewMcpJson(input) {
  const parsed = parseMcpServersJson(input)
  return {
    servers: parsed.servers.map((server) => ({
      sourceName: server.sourceName,
      suggestedId: server.suggestedId,
      transport: server.transport,
      ...(server.command !== undefined ? { command: server.command, args: server.args } : { url: server.url }),
      ...(server.cwd !== undefined ? { cwd: server.cwd } : {}),
      plainEnv: { ...server.plainEnv },
      plainHeaders: { ...server.plainHeaders },
      secretSlots: server.secretSlots.map((slot) => ({
        location: slot.location,
        targetKey: slot.targetKey,
        credentialRef: slot.credentialRef,
        template: slot.template,
        ...(slot.placeholder ? { placeholder: slot.placeholder } : {}),
        detected: parsed.credentials.has(slot.credentialRef),
      })),
    })),
  }
}

/**
 * Turn selected normalized servers into ConnectorStore records. This function
 * returns credential values separately so callers can encrypt them before the
 * connector records are committed.
 */
export function buildMcpConnectorImport({ parsed, existing = [], selectedNames, conflict = 'reject', secrets, source = { kind: 'json' }, descriptions = {} }) {
  if (!parsed || !Array.isArray(parsed.servers) || !(parsed.credentials instanceof Map)) throw new TypeError('invalid parsed MCP configuration')
  if (!CONFLICTS.has(conflict)) throw new TypeError(`unsupported connector conflict mode:${conflict}`)
  if (!Array.isArray(existing)) throw new TypeError('existing connectors must be an array')
  const requested = selectedNames === undefined ? parsed.servers.map((server) => server.sourceName) : selectedNames
  if (!Array.isArray(requested) || requested.length === 0) throw new Error('no MCP servers selected')
  const selected = parsed.servers.filter((server) => requested.includes(server.sourceName))
  if (selected.length !== requested.length) throw new Error('selected MCP server was not found')
  const supplied = credentialInput(secrets)
  const existingIds = new Set(existing.map((connector) => connector.id))
  const usedIds = new Set(existingIds)
  const connectors = []
  const credentials = new Map()

  for (const server of selected) {
    const id = allocateId(server.suggestedId, usedIds, conflict)
    const previous = existing.find((connector) => connector.id === id)
    for (const slot of server.secretSlots) {
      const value = parsed.credentials.get(slot.credentialRef) ?? supplied[slot.credentialRef]
      if (value === undefined) throw new Error(`missing-credential:${slot.credentialRef}`)
      credentials.set(slot.credentialRef, value)
    }
    const connector = validateConnectorInput({
      id,
      name: server.sourceName,
      description: descriptions[server.sourceName] ?? `Imported MCP server · ${server.transport}`,
      kind: 'mcp',
      transport: server.transport,
      ...(server.command !== undefined ? { command: server.command, args: server.args, ...(server.cwd ? { cwd: server.cwd } : {}) } : { url: server.url }),
      ...(Object.keys(server.plainEnv).length ? { plainEnv: server.plainEnv } : {}),
      ...(Object.keys(server.plainHeaders).length ? { plainHeaders: server.plainHeaders } : {}),
      ...(server.secretSlots.length ? { secretBindings: server.secretSlots } : {}),
      source,
      enabled: true,
    })
    connectors.push({ connector, previous })
  }
  return { connectors, credentials }
}
