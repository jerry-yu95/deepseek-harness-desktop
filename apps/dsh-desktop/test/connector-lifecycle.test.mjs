import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CONNECTOR_LIFECYCLE_STATES,
  canTransitionConnectorLifecycle,
  lifecycleActionForState,
  transitionConnectorLifecycle,
} from '../src/extensions/connector-lifecycle.mjs'

test('lifecycle exposes the complete recoverable state contract', () => {
  assert.deepEqual(CONNECTOR_LIFECYCLE_STATES, [
    'not-configured', 'authorizing', 'ready', 'refreshing', 'expiring', 'expired', 'revoked',
    'missing-permission', 'reauthorization-required', 'provider-unavailable', 'disabled', 'error',
  ])
})

test('valid authorization, refresh, disable and outage transitions are explicit', () => {
  let current = transitionConnectorLifecycle('not-configured', 'authorize-start')
  current = transitionConnectorLifecycle(current, 'authorize-succeeded')
  assert.equal(current.state, 'ready')
  current = transitionConnectorLifecycle(current, 'token-expiring')
  current = transitionConnectorLifecycle(current, 'refresh-start')
  current = transitionConnectorLifecycle(current, 'refresh-succeeded', { expiresAt: '2026-08-25T12:00:00.000Z' })
  assert.equal(current.state, 'ready')
  current = transitionConnectorLifecycle(current, 'provider-unavailable')
  assert.equal(current.state, 'provider-unavailable')
  current = transitionConnectorLifecycle(current, 'authorize-succeeded')
  assert.equal(current.state, 'ready')
  current = transitionConnectorLifecycle(current, 'disable')
  assert.equal(current.state, 'disabled')
  assert.equal(transitionConnectorLifecycle(current, 'enable').state, 'ready')
})

test('revocation and expiry require a deliberate recovery action', () => {
  assert.equal(transitionConnectorLifecycle('ready', 'provider-revoked').state, 'revoked')
  assert.equal(transitionConnectorLifecycle('revoked', 'authorize-start').state, 'authorizing')
  assert.equal(transitionConnectorLifecycle('authorizing', 'authorize-succeeded').state, 'ready')
  assert.equal(transitionConnectorLifecycle('expired', 'refresh-start').state, 'refreshing')
  assert.equal(transitionConnectorLifecycle('refreshing', 'authorization-failed').state, 'reauthorization-required')
  assert.throws(() => transitionConnectorLifecycle('not-configured', 'refresh-start'), /invalid connector lifecycle transition/)
})

test('action mapping remains renderer-friendly', () => {
  assert.equal(lifecycleActionForState('authorizing'), 'cancel')
  assert.equal(lifecycleActionForState('ready'), 'disconnect')
  assert.equal(lifecycleActionForState('expired'), 'reauthorize')
  assert.equal(lifecycleActionForState('disabled'), 'enable')
  assert.equal(canTransitionConnectorLifecycle('ready', 'refresh-start'), true)
  assert.equal(canTransitionConnectorLifecycle('not-configured', 'refresh-start'), false)
})
