import { CONNECTOR_LIFECYCLE_STATES, transitionConnectorLifecycle } from './connector-lifecycle.mjs'

const CONNECTOR_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const AUTHORIZATION_FAILURES = new Set(['invalid_grant', 'reauthorization-required', 'revoked', 'invalid-credential'])

function assertConnectorId(value) {
  if (typeof value !== 'string' || !CONNECTOR_ID_PATTERN.test(value)) throw new TypeError('invalid connector id')
  return value
}

function isAuthorizationFailure(error) {
  return AUTHORIZATION_FAILURES.has(error?.code) || error?.status === 401
}

function isProviderUnavailable(error) {
  return error?.code === 'provider-unavailable' || error?.code === 'network' || error?.code === 'timeout' || error?.name === 'AbortError'
}

function statusFor(connectorId, state, details = {}) {
  if (!CONNECTOR_LIFECYCLE_STATES.includes(state)) throw new TypeError('invalid connector lifecycle state')
  return { connectorId, state, ...details }
}

/**
 * Main-process coordinator for token refresh and reconnect operations.
 * It never exposes credential values. The injected refresh operation is the
 * only code allowed to read provider secrets and may return a private
 * `credentials` map for the injected secret store to commit atomically.
 */
export class ConnectorSessionManager {
  constructor({ metadataStore, secretStore, now = () => Date.now(), random = Math.random, maxAttempts = 2, baseDelayMs = 250 } = {}) {
    this.metadataStore = metadataStore
    this.secretStore = secretStore
    this.now = now
    this.random = random
    this.maxAttempts = Number.isInteger(maxAttempts) && maxAttempts >= 1 && maxAttempts <= 4 ? maxAttempts : 2
    this.baseDelayMs = Number.isInteger(baseDelayMs) && baseDelayMs >= 0 ? baseDelayMs : 250
    this.inFlight = new Map()
    this.states = new Map()
    this.timers = new Set()
    this.controllers = new Set()
    this.closed = false
  }

  state(connectorId) {
    return this.states.get(assertConnectorId(connectorId))
  }

  #setState(connectorId, current, event, details = {}) {
    let next
    try {
      next = transitionConnectorLifecycle(current ?? 'not-configured', event, details)
    } catch (error) {
      // A late provider error must not overwrite a disconnected state.
      if (current?.state === 'not-configured' && event !== 'reset') return current
      throw error
    }
    this.states.set(connectorId, next)
    return next
  }

  async #metadata(value) {
    if (this.metadataStore && typeof this.metadataStore.set === 'function') await this.metadataStore.set(value)
  }

  async #commit(credentials) {
    if (credentials === undefined) return
    if (!this.secretStore || typeof this.secretStore.setMany !== 'function') throw new Error('secure-storage-unavailable')
    await this.secretStore.setMany(credentials)
  }

  #delay(attempt) {
    const jitter = 0.75 + this.random() * 0.5
    const delay = Math.min(15_000, Math.round(this.baseDelayMs * 2 ** attempt * jitter))
    return new Promise((resolve, reject) => {
      if (this.closed) { reject(new Error('connector-session-manager-closed')); return }
      const timer = setTimeout(() => { this.timers.delete(timer); resolve() }, delay)
      this.timers.add(timer)
    })
  }

  /** Refresh once for a connector; concurrent callers share one promise. */
  refresh(connectorId, refreshOperation, { expiresAt, leewayMs = 60_000, maxAttempts = this.maxAttempts } = {}) {
    const id = assertConnectorId(connectorId)
    if (this.closed) return Promise.reject(new Error('connector-session-manager-closed'))
    if (this.inFlight.has(id)) return this.inFlight.get(id)
    if (typeof refreshOperation !== 'function') return Promise.reject(new TypeError('refresh operation is required'))
    if (expiresAt !== undefined && Date.parse(expiresAt) - this.now() > leewayMs) {
      const ready = Promise.resolve(statusFor(id, 'ready', { skipped: true }))
      return ready
    }
    const current = this.state(id) ?? statusFor(id, expiresAt && Date.parse(expiresAt) <= this.now() ? 'expired' : 'expiring')
    const controller = new AbortController()
    this.controllers.add(controller)
    const task = (async () => {
      this.#setState(id, current, 'refresh-start')
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
          if (this.closed || controller.signal.aborted) throw new Error('connector-session-manager-closed')
          const result = await refreshOperation({ connectorId: id, attempt, signal: controller.signal })
          if (this.closed || controller.signal.aborted) throw new Error('connector-session-manager-closed')
          if (!result || typeof result !== 'object') throw new Error('invalid-refresh-result')
          await this.#commit(result.credentials)
          const next = this.#setState(id, this.state(id), 'refresh-succeeded', {
            expiresAt: result.expiresAt,
            lastHealthyAt: new Date(this.now()).toISOString(),
            lastFailureCategory: undefined,
            retryCount: 0,
          })
          await this.#metadata({ connectorId: id, providerId: result.providerId ?? id, mode: result.mode ?? 'oauth', state: next.state, expiresAt: result.expiresAt, lastHealthyAt: next.lastHealthyAt, checkedAt: new Date(this.now()).toISOString(), retryCount: 0 })
          return statusFor(id, next.state, { ...result, credentials: undefined })
        } catch (error) {
          if (this.closed || controller.signal.aborted || error?.message === 'connector-session-manager-closed') throw new Error('connector-session-manager-closed')
          if (isAuthorizationFailure(error)) {
            const next = this.#setState(id, this.state(id), 'authorization-failed')
            await this.#metadata({ connectorId: id, providerId: error.providerId ?? id, mode: error.mode ?? 'oauth', state: next.state, lastFailureCategory: error.code === 'revoked' ? 'revoked' : 'invalid', checkedAt: new Date(this.now()).toISOString(), retryCount: 0 })
            return statusFor(id, next.state, { detailKey: 'connector.reauthorization-required' })
          }
          if (!isProviderUnavailable(error) || attempt + 1 >= maxAttempts) {
            const next = this.#setState(id, this.state(id), 'provider-unavailable')
            await this.#metadata({ connectorId: id, providerId: error.providerId ?? id, mode: error.mode ?? 'oauth', state: next.state, lastFailureCategory: isProviderUnavailable(error) ? 'provider-unavailable' : 'unknown', checkedAt: new Date(this.now()).toISOString(), retryCount: attempt + 1 })
            return statusFor(id, next.state, { detailKey: isProviderUnavailable(error) ? 'connector.provider-unavailable' : 'connector.refresh-failed' })
          }
          await this.#delay(attempt)
        }
      }
      return statusFor(id, 'provider-unavailable', { detailKey: 'connector.provider-unavailable' })
    })().finally(() => {
      this.inFlight.delete(id)
      this.controllers.delete(controller)
    })
    this.inFlight.set(id, task)
    return task
  }

  /** Execute a request, refresh at most once after a clear 401/unauthorized response. */
  async runWithRefresh(connectorId, execute, refreshOperation, options = {}) {
    const id = assertConnectorId(connectorId)
    if (typeof execute !== 'function') throw new TypeError('execute operation is required')
    try {
      return await execute({ connectorId: id, attempt: 0 })
    } catch (error) {
      if (!isAuthorizationFailure(error)) throw error
      const refreshed = await this.refresh(id, refreshOperation, options)
      if (refreshed.state !== 'ready') return refreshed
      try {
        return await execute({ connectorId: id, attempt: 1 })
      } catch (retryError) {
        if (!isAuthorizationFailure(retryError)) throw retryError
        const next = this.#setState(id, this.state(id), 'provider-revoked')
        await this.#metadata({ connectorId: id, providerId: retryError.providerId ?? id, mode: retryError.mode ?? 'oauth', state: next.state, lastFailureCategory: 'revoked', checkedAt: new Date(this.now()).toISOString() })
        return statusFor(id, 'reauthorization-required', { detailKey: 'connector.authorization-revoked' })
      }
    }
  }

  /** Replace auth atomically; failed authorization leaves the old config inactive. */
  async reconnect(connectorId, authorizeOperation, commitOperation = async () => {}) {
    const id = assertConnectorId(connectorId)
    if (typeof authorizeOperation !== 'function' || typeof commitOperation !== 'function') throw new TypeError('reconnect operations are required')
    const result = await authorizeOperation({ connectorId: id })
    if (!result || typeof result !== 'object' || result.state !== 'ready') {
      const next = statusFor(id, 'reauthorization-required', { detailKey: 'connector.reconnect-failed' })
      this.states.set(id, next)
      return next
    }
    await commitOperation(result)
    const next = statusFor(id, 'ready', { lastHealthyAt: new Date(this.now()).toISOString() })
    this.states.set(id, next)
    return next
  }

  shutdown() {
    this.closed = true
    for (const timer of this.timers) clearTimeout(timer)
    this.timers.clear()
    for (const controller of this.controllers) controller.abort()
    this.controllers.clear()
    this.inFlight.clear()
  }
}
