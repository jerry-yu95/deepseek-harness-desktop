import assert from 'node:assert/strict'
import test from 'node:test'

import { DESKTOP_METADATA } from '../src/main.mjs'

test('desktop metadata is stable and identifies the embedded DSH surface', () => {
  assert.deepEqual(DESKTOP_METADATA, {
    appId: 'studio.harness.design.desktop',
    productName: 'JIWEI',
    version: '0.1.44',
    profile: 'desktop',
    protocol: 'dsh',
  })
})
