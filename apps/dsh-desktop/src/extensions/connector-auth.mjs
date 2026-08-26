import { CONNECTOR_LIFECYCLE_STATES } from './connector-lifecycle.mjs'

/**
 * Provider-neutral connector authorization boundary.
 *
 * Adapters own provider-specific OAuth/CLI/app-credential details. This
 * module owns the stable state contract and the only renderer-safe projection
 * that may cross the desktop bridge. Credential material must remain in the
 * main process and is deliberately ignored by the sanitizer.
 */

export const AUTH_STATES = CONNECTOR_LIFECYCLE_STATES

export const AUTH_PROVIDERS = Object.freeze(['github', 'feishu', 'gitlab', 'dingtalk'])

export const AUTH_MODES = Object.freeze(['oauth', 'pat', 'official-cli', 'app-credentials'])

const CONNECTOR_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const DETAIL_KEY_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/i
const MAX_STRING_LENGTH = 256
const FAILURE_CATEGORIES = new Set(['invalid', 'revoked', 'missing', 'missing-permission', 'provider-unavailable', 'network', 'timeout', 'unknown'])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertString(value, field, { pattern, maxLength = MAX_STRING_LENGTH } = {}) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    throw new TypeError(`invalid ${field}`)
  }
  if (pattern && !pattern.test(value)) throw new TypeError(`invalid ${field}`)
  return value
}

function assertEnum(value, field, values) {
  if (!values.includes(value)) throw new TypeError(`invalid ${field}`)
  return value
}

function optionalIsoDate(value, field) {
  if (value === undefined) return undefined
  assertString(value, field, { maxLength: 64 })
  if (Number.isNaN(Date.parse(value))) throw new TypeError(`invalid ${field}`)
  return value
}

function optionalStringList(value, field) {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > 128) throw new TypeError(`invalid ${field}`)
  const result = []
  for (const item of value) {
    assertString(item, field, { maxLength: 128 })
    if (!result.includes(item)) result.push(item)
  }
  return result
}

/**
 * Return only metadata that is safe for a renderer or remote UI to consume.
 * Unknown keys are intentionally not copied, so future adapter responses do
 * not accidentally widen the secret-bearing bridge surface.
 */
export function sanitizeAuthorizationStatus(input) {
  if (!isRecord(input)) throw new TypeError('authorization status must be an object')

  const connectorId = assertString(input.connectorId, 'connectorId', {
    pattern: CONNECTOR_ID_PATTERN,
    maxLength: 64,
  })
  const providerId = assertEnum(input.providerId, 'providerId', AUTH_PROVIDERS)
  const mode = assertEnum(input.mode, 'mode', AUTH_MODES)
  const state = assertEnum(input.state, 'state', AUTH_STATES)
  const expiresAt = optionalIsoDate(input.expiresAt, 'expiresAt')
  const lastHealthyAt = optionalIsoDate(input.lastHealthyAt, 'lastHealthyAt')
  const retryAfter = optionalIsoDate(input.retryAfter, 'retryAfter')
  const checkedAt = optionalIsoDate(input.checkedAt, 'checkedAt')
  const grantedScopes = optionalStringList(input.grantedScopes, 'grantedScopes')
  const missingPermissions = optionalStringList(input.missingPermissions, 'missingPermissions')
  let lastFailureCategory
  if (input.lastFailureCategory !== undefined) {
    lastFailureCategory = assertString(input.lastFailureCategory, 'lastFailureCategory', { maxLength: 32 })
    if (!FAILURE_CATEGORIES.has(lastFailureCategory)) throw new TypeError('invalid lastFailureCategory')
  }

  let detailKey
  if (input.detailKey !== undefined) {
    detailKey = assertString(input.detailKey, 'detailKey', {
      pattern: DETAIL_KEY_PATTERN,
      maxLength: 128,
    })
  }

  return {
    connectorId,
    providerId,
    mode,
    state,
    ...(expiresAt === undefined ? {} : { expiresAt }),
    ...(lastHealthyAt === undefined ? {} : { lastHealthyAt }),
    ...(retryAfter === undefined ? {} : { retryAfter }),
    ...(lastFailureCategory === undefined ? {} : { lastFailureCategory }),
    ...(grantedScopes === undefined ? {} : { grantedScopes }),
    ...(missingPermissions === undefined ? {} : { missingPermissions }),
    ...(detailKey === undefined ? {} : { detailKey }),
    ...(checkedAt === undefined ? {} : { checkedAt }),
  }
}

function requireFunction(adapter, method) {
  if (typeof adapter?.[method] !== 'function') {
    throw new TypeError(`connector auth adapter ${adapter?.id ?? 'unknown'} must implement ${method}`)
  }
}

/**
 * Provider-neutral adapter registry. Adapter methods receive the private
 * desktop context first and their operation input second. Their results are
 * sanitized before being returned to callers.
 */
export class ConnectorAuthManager {
  #adapters
  #context

  constructor({ adapters = [], context } = {}) {
    if (!Array.isArray(adapters)) throw new TypeError('connector auth adapters must be an array')

    const ids = new Set()
    this.#adapters = adapters.map((adapter) => {
      if (!isRecord(adapter)) throw new TypeError('connector auth adapter must be an object')
      const id = assertEnum(adapter.id, 'adapter id', AUTH_PROVIDERS)
      if (ids.has(id)) throw new TypeError(`duplicate connector auth adapter ${id}`)
      ids.add(id)

      for (const method of ['authorize', 'status', 'disconnect', 'verify']) {
        requireFunction(adapter, method)
      }
      if (!Array.isArray(adapter.modes) || adapter.modes.length === 0) {
        throw new TypeError(`connector auth adapter ${id} must declare modes`)
      }
      for (const mode of adapter.modes) assertEnum(mode, `adapter ${id} mode`, AUTH_MODES)

      return { ...adapter, id, modes: [...new Set(adapter.modes)] }
    })
    if (!isRecord(context) && adapters.length > 0) {
      throw new TypeError('connector auth context is required')
    }
    this.#context = isRecord(context) ? context : {}
  }

  #adapter(providerId) {
    assertEnum(providerId, 'providerId', AUTH_PROVIDERS)
    const adapter = this.#adapters.find((candidate) => candidate.id === providerId)
    if (!adapter) throw new Error(`connector auth adapter not found: ${providerId}`)
    return adapter
  }

  async #call(providerId, method, input) {
    const adapter = this.#adapter(providerId)
    const result = await adapter[method](this.#context, input)
    return sanitizeAuthorizationStatus(result)
  }

  authorize(providerId, input) {
    return this.#call(providerId, 'authorize', input)
  }

  status(providerId, connector) {
    return this.#call(providerId, 'status', connector)
  }

  disconnect(providerId, connector) {
    return this.#call(providerId, 'disconnect', connector)
  }

  verify(providerId, connector) {
    return this.#call(providerId, 'verify', connector)
  }
}
