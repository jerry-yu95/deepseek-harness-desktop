import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeWindowState } from '../src/window-state.mjs'

const displays = [
  { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 } },
  { bounds: { x: 1920, y: 0, width: 1280, height: 1024 }, workArea: { x: 1920, y: 0, width: 1280, height: 984 } },
]

test('window state preserves visible geometry and clamps size', () => {
  assert.deepEqual(
    normalizeWindowState({ x: 2000, y: 30, width: 300, height: 200, maximized: true }, displays),
    { x: 2000, y: 30, width: 900, height: 640, maximized: true },
  )
})

test('window state recenters geometry that is outside every display', () => {
  assert.deepEqual(
    normalizeWindowState({ x: -9000, y: 9000, width: 1200, height: 800 }, displays),
    { x: 360, y: 120, width: 1200, height: 800, maximized: false },
  )
})
