import { randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { CONNECTOR_LIFECYCLE_STATES } from './connector-lifecycle.mjs'

const STORE_VERSION = 1
const CONNECTOR_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const PROVIDER_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const MODES = new Set(['oauth', 'pat', 'official-cli', 'app-credentials'])
const FAILURE_CATEGORIES = new Set(['invalid', 'revoked', 'missing', 'missing-permission', 'provider-unavailable', 'network', 'timeout', 'unknown'])
const ALLOWED_ENTRY_KEYS = new Set(['connectorId', 'providerId', 'mode', 'state', 'expiresAt', 'lastHealthyAt', 'lastFailureCategory', 'retryAfter', 'checkedAt', 'retryCount'])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertId(value, field, pattern = CONNECTOR_ID_PATTERN) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128 || !pattern.test(value)) throw new TypeError(`invalid ${field}`)
  return value
}

function optionalDate(value, field) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string' || value.length > 64 || Number.isNaN(Date.parse(value))) throw new TypeError(`invalid ${field}`)
  return new Date(value).toISOString()
}

function optionalCategory(value) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string' || !FAILURE_CATEGORIES.has(value)) throw new TypeError('invalid lastFailureCategory')
  return value
}

/** Validate and retain only non-secret lifecycle metadata. */
export function sanitizeConnectorAuthMetadata(input) {
  if (!isRecord(input)) throw new TypeError('connector auth metadata must be an object')
  for (const key of Object.keys(input)) if (!ALLOWED_ENTRY_KEYS.has(key)) throw new TypeError(`connector auth metadata contains unsupported field: ${key}`)
  const connectorId = assertId(input.connectorId, 'connectorId')
  const providerId = assertId(input.providerId, 'providerId', PROVIDER_ID_PATTERN)
  if (typeof input.mode !== 'string' || !MODES.has(input.mode)) throw new TypeError('invalid mode')
  if (typeof input.state !== 'string' || !CONNECTOR_LIFECYCLE_STATES.includes(input.state)) throw new TypeError('invalid state')
  let retryCount = 0
  if (input.retryCount !== undefined) {
    if (!Number.isInteger(input.retryCount) || input.retryCount < 0 || input.retryCount > 8) throw new TypeError('invalid retryCount')
    retryCount = input.retryCount
  }
  const result = {
    connectorId,
    providerId,
    mode: input.mode,
    state: input.state,
    retryCount,
  }
  for (const [key, value] of Object.entries({
    expiresAt: optionalDate(input.expiresAt, 'expiresAt'),
    lastHealthyAt: optionalDate(input.lastHealthyAt, 'lastHealthyAt'),
    retryAfter: optionalDate(input.retryAfter, 'retryAfter'),
    checkedAt: optionalDate(input.checkedAt, 'checkedAt'),
    lastFailureCategory: optionalCategory(input.lastFailureCategory),
  })) {
    if (value !== undefined) result[key] = value
  }
  return result
}

async function atomicJsonWrite(path, data) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`
  try {
    await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    if (process.platform !== 'win32') await chmod(temporary, 0o600)
    await rename(temporary, path)
    if (process.platform !== 'win32') await chmod(path, 0o600)
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

function initialMetadata(connector) {
  const connectorId = assertId(connector?.id, 'connector id')
  return sanitizeConnectorAuthMetadata({
    connectorId,
    providerId: connector?.source?.presetId ?? connectorId,
    mode: connectorId === 'dingtalk' ? 'app-credentials' : connectorId === 'feishu' ? 'official-cli' : 'oauth',
    state: connector?.enabled === false ? 'disabled' : 'not-configured',
  })
}

/** Safe, non-secret metadata store. Credential ciphertext never belongs here. */
export class ConnectorAuthMetadataStore {
  constructor({ path, now = () => new Date() } = {}) {
    if (typeof path !== 'string' || path.length === 0) throw new TypeError('connector auth metadata path is required')
    this.path = path
    this.now = now
    this.entries = new Map()
    this.loaded = false
  }

  async load() {
    if (this.loaded) return this
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8'))
      if (!isRecord(parsed) || parsed.version !== STORE_VERSION || !isRecord(parsed.connectors)) throw new Error('invalid auth metadata shape')
      const entries = new Map()
      for (const [key, value] of Object.entries(parsed.connectors)) {
        const sanitized = sanitizeConnectorAuthMetadata(value)
        if (sanitized.connectorId !== key) throw new Error('auth metadata key mismatch')
        entries.set(key, sanitized)
      }
      this.entries = entries
    } catch (error) {
      if (error?.code !== 'ENOENT') throw new Error(`connector-auth-metadata-corrupt:${error.message}`)
    }
    this.loaded = true
    return this
  }

  async migrate(connectors = []) {
    await this.load()
    if (!Array.isArray(connectors)) throw new TypeError('connectors must be an array')
    let changed = false
    for (const connector of connectors) {
      const entry = initialMetadata(connector)
      if (!this.entries.has(entry.connectorId)) {
        this.entries.set(entry.connectorId, entry)
        changed = true
      }
    }
    if (changed) await this.#persist()
    return this.list()
  }

  async get(connectorId) {
    await this.load()
    const normalized = assertId(connectorId, 'connectorId')
    return this.entries.get(normalized)
  }

  async set(input) {
    await this.load()
    const value = sanitizeConnectorAuthMetadata({ ...input, checkedAt: input.checkedAt ?? this.now().toISOString() })
    this.entries.set(value.connectorId, value)
    await this.#persist()
    return value
  }

  async remove(connectorId) {
    await this.load()
    const normalized = assertId(connectorId, 'connectorId')
    if (!this.entries.delete(normalized)) return false
    await this.#persist()
    return true
  }

  async list() {
    await this.load()
    return [...this.entries.values()].map((item) => ({ ...item })).toSorted((left, right) => left.connectorId.localeCompare(right.connectorId))
  }

  async #persist() {
    const connectors = Object.fromEntries([...this.entries.entries()].toSorted(([left], [right]) => left.localeCompare(right)))
    await atomicJsonWrite(this.path, { version: STORE_VERSION, connectors })
  }
}

export const CONNECTOR_AUTH_METADATA_VERSION = STORE_VERSION
