import assert from 'node:assert/strict'
import test from 'node:test'

import { DESKTOP_METADATA } from '../src/main.mjs'

test('desktop metadata is stable and identifies the embedded DSH surface', () => {
  assert.deepEqual(DESKTOP_METADATA, {
    appId: 'studio.harness.design.desktop',
    productName: 'Harness Design Desktop',
    profile: 'desktop',
    protocol: 'dsh',
  })
})
