/**
 * Provider-neutral connector authorization lifecycle.
 *
 * This module is deliberately side-effect free. Network calls, secret storage,
 * Harness reloads, and UI notifications belong to the session/IPC layers.
 */

export const CONNECTOR_LIFECYCLE_STATES = Object.freeze([
  'not-configured',
  'authorizing',
  'ready',
  'refreshing',
  'expiring',
  'expired',
  'revoked',
  'missing-permission',
  'reauthorization-required',
  'provider-unavailable',
  'disabled',
  'error',
])

export const CONNECTOR_LIFECYCLE_EVENTS = Object.freeze([
  'configure',
  'authorize-start',
  'authorize-succeeded',
  'refresh-start',
  'refresh-succeeded',
  'token-expiring',
  'token-expired',
  'provider-revoked',
  'missing-permission',
  'provider-unavailable',
  'disable',
  'enable',
  'disconnect',
  'authorization-failed',
  'reset',
])

const TRANSITIONS = Object.freeze({
  'not-configured': Object.freeze({ configure: 'authorizing', 'authorize-start': 'authorizing', reset: 'not-configured' }),
  authorizing: Object.freeze({
    'authorize-succeeded': 'ready',
    'authorization-failed': 'error',
    disconnect: 'not-configured',
    reset: 'not-configured',
  }),
  ready: Object.freeze({
    'refresh-start': 'refreshing',
    'token-expiring': 'expiring',
    'token-expired': 'expired',
    'provider-revoked': 'revoked',
    'missing-permission': 'missing-permission',
    'provider-unavailable': 'provider-unavailable',
    disable: 'disabled',
    disconnect: 'not-configured',
    reset: 'not-configured',
  }),
  refreshing: Object.freeze({
    'refresh-succeeded': 'ready',
    'authorization-failed': 'reauthorization-required',
    'provider-revoked': 'revoked',
    'provider-unavailable': 'provider-unavailable',
    disconnect: 'not-configured',
  }),
  expiring: Object.freeze({
    'refresh-start': 'refreshing',
    'token-expired': 'expired',
    'refresh-succeeded': 'ready',
    'authorization-failed': 'reauthorization-required',
    'provider-revoked': 'revoked',
    'provider-unavailable': 'provider-unavailable',
    disable: 'disabled',
    disconnect: 'not-configured',
  }),
  expired: Object.freeze({
    'authorize-start': 'authorizing',
    'refresh-start': 'refreshing',
    'provider-revoked': 'revoked',
    'authorization-failed': 'reauthorization-required',
    disconnect: 'not-configured',
    reset: 'not-configured',
  }),
  revoked: Object.freeze({
    'authorize-start': 'authorizing',
    disconnect: 'not-configured',
    reset: 'not-configured',
  }),
  'missing-permission': Object.freeze({
    'authorize-start': 'authorizing',
    'authorize-succeeded': 'ready',
    disconnect: 'not-configured',
    disable: 'disabled',
  }),
  'reauthorization-required': Object.freeze({
    'authorize-start': 'authorizing',
    disconnect: 'not-configured',
    reset: 'not-configured',
  }),
  'provider-unavailable': Object.freeze({
    'refresh-start': 'refreshing',
    'authorize-start': 'authorizing',
    'authorize-succeeded': 'ready',
    'provider-unavailable': 'provider-unavailable',
    disable: 'disabled',
    disconnect: 'not-configured',
  }),
  disabled: Object.freeze({
    enable: 'ready',
    disconnect: 'not-configured',
    reset: 'not-configured',
  }),
  error: Object.freeze({
    'authorize-start': 'authorizing',
    'refresh-start': 'refreshing',
    disconnect: 'not-configured',
    reset: 'not-configured',
  }),
})

function assertState(state) {
  if (!CONNECTOR_LIFECYCLE_STATES.includes(state)) throw new TypeError(`invalid connector lifecycle state: ${state}`)
  return state
}

function assertEvent(event) {
  if (!CONNECTOR_LIFECYCLE_EVENTS.includes(event)) throw new TypeError(`invalid connector lifecycle event: ${event}`)
  return event
}

export function createConnectorLifecycleState(state = 'not-configured', details = {}) {
  assertState(state)
  if (details === null || typeof details !== 'object' || Array.isArray(details)) throw new TypeError('lifecycle details must be an object')
  return Object.freeze({ state, ...details })
}

/**
 * Apply one event. An impossible transition is rejected instead of silently
 * changing state; this prevents a stale provider response from reviving a
 * disconnected connector.
 */
export function transitionConnectorLifecycle(current, event, details = {}) {
  const state = typeof current === 'string' ? current : current?.state
  assertState(state)
  assertEvent(event)
  const next = TRANSITIONS[state]?.[event]
  if (next === undefined) throw new Error(`invalid connector lifecycle transition: ${state} -> ${event}`)
  if (details === null || typeof details !== 'object' || Array.isArray(details)) throw new TypeError('lifecycle details must be an object')
  return createConnectorLifecycleState(next, { ...(typeof current === 'object' ? current : {}), ...details, state: next, event })
}

export function canTransitionConnectorLifecycle(current, event) {
  const state = typeof current === 'string' ? current : current?.state
  if (!CONNECTOR_LIFECYCLE_STATES.includes(state) || !CONNECTOR_LIFECYCLE_EVENTS.includes(event)) return false
  return TRANSITIONS[state]?.[event] !== undefined
}

export function lifecycleActionForState(state) {
  assertState(state)
  if (state === 'disabled') return 'enable'
  if (['ready', 'expiring', 'refreshing', 'provider-unavailable'].includes(state)) return 'disconnect'
  if (['expired', 'revoked', 'reauthorization-required', 'missing-permission', 'error'].includes(state)) return 'reauthorize'
  if (state === 'authorizing') return 'cancel'
  return 'authorize'
}
