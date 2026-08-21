import assert from 'node:assert/strict'
import test from 'node:test'

import { serializeClipboardImage } from '../src/clipboard-image.mjs'

test('clipboard image serialization rejects an empty native image', () => {
  assert.equal(serializeClipboardImage({ isEmpty: () => true, toPNG: () => Buffer.from([1]) }), null)
})

test('clipboard image serialization exposes only PNG bytes and safe metadata', () => {
  const payload = serializeClipboardImage({
    isEmpty: () => false,
    toPNG: () => Buffer.from([137, 80, 78, 71]),
  }, 'describe this image')
  assert.deepEqual({ ...payload, data: [...payload.data] }, {
    data: [137, 80, 78, 71],
    type: 'image/png',
    name: 'pasted-image.png',
    text: 'describe this image',
  })
})
