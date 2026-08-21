import assert from 'node:assert/strict'
import test from 'node:test'

import { buildNativeImagePasteScript } from '../src/native-image-paste.mjs'

test('builds a main-world paste carrying a PNG File', () => {
  const script = buildNativeImagePasteScript(Buffer.from([137, 80, 78, 71]))
  assert.match(script, /new DataTransfer\(\)/)
  assert.match(script, /new File\(/)
  assert.match(script, /new ClipboardEvent\('paste'/)
  assert.match(script, /iVBORw==/)
})

test('rejects empty and oversized native images', () => {
  assert.equal(buildNativeImagePasteScript(Buffer.alloc(0)), undefined)
  assert.equal(buildNativeImagePasteScript(Buffer.alloc(20 * 1024 * 1024 + 1)), undefined)
})
