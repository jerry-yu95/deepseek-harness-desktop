import assert from 'node:assert/strict'
import test from 'node:test'

import { isClipboardPermissionAllowed } from '../src/clipboard-permissions.mjs'

const mainWebContents = {}
const otherWebContents = {}

function allowed(overrides = {}) {
  return isClipboardPermissionAllowed({
    webContents: mainWebContents,
    mainWebContents,
    permission: 'clipboard-read',
    requestingOrigin: 'http://127.0.0.1:43125',
    isMainFrame: true,
    runtimeOrigin: 'http://127.0.0.1:43125',
    ...overrides,
  })
}

test('allows clipboard permissions only for the active DSH main frame', () => {
  assert.equal(allowed(), true)
  assert.equal(allowed({ permission: 'clipboard-sanitized-write' }), true)
  assert.equal(allowed({ requestingUrl: 'http://127.0.0.1:43125/session/1', requestingOrigin: undefined }), true)
})

test('rejects clipboard access from other origins, windows, frames, and permissions', () => {
  assert.equal(allowed({ requestingOrigin: 'http://127.0.0.1:43126' }), false)
  assert.equal(allowed({ webContents: otherWebContents }), false)
  assert.equal(allowed({ isMainFrame: false }), false)
  assert.equal(allowed({ permission: 'notifications' }), false)
  assert.equal(allowed({ runtimeOrigin: 'file:///tmp/runtime' }), false)
})
