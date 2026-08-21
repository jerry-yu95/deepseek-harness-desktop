import assert from 'node:assert/strict'
import test from 'node:test'

import { classifyNavigation } from '../src/navigation-policy.mjs'

test('navigation policy keeps the renderer on the active DSH origin', () => {
  const runtimeOrigin = 'http://127.0.0.1:43125'
  assert.equal(classifyNavigation('http://127.0.0.1:43125/session/1', runtimeOrigin), 'allow')
  assert.equal(classifyNavigation('https://github.com/example/repo', runtimeOrigin), 'external')
  assert.equal(classifyNavigation('http://127.0.0.1:43126', runtimeOrigin), 'deny')
  assert.equal(classifyNavigation('file:///C:/Windows/System32/calc.exe', runtimeOrigin), 'deny')
  assert.equal(classifyNavigation('javascript:alert(1)', runtimeOrigin), 'deny')
  assert.equal(classifyNavigation('not a url', runtimeOrigin), 'deny')
})
