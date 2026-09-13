import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { registerKnowledgeImportIpc } from '../src/knowledge-import-ipc.mjs'

test('preload progress subscription detaches and routes cancel to the matching request', async () => {
  const calls = [], events = new EventEmitter()
  let api
  runInNewContext(await readFile(new URL('../src/preload.cjs', import.meta.url), 'utf8'), {
    require: () => ({ contextBridge: { exposeInMainWorld: (_name, value) => { api = value } }, ipcRenderer: Object.assign(events, { invoke: (...args) => { calls.push(args); return Promise.resolve() } }) }),
  })
  const received = []
  const detach = api.onKnowledgeImportProgress(value => received.push(value))
  events.emit('knowledge:import-progress', {}, { requestId: 'fixture', stage: 'fetching' })
  detach()
  events.emit('knowledge:import-progress', {}, { requestId: 'fixture', stage: 'structuring' })
  assert.equal(received.length, 1)
  assert.equal(events.listenerCount('knowledge:import-progress'), 0)
  await api.cancelKnowledgeUrlImport('fixture')
  assert.deepEqual(calls, [['knowledge:import-cancel', 'fixture']])
})

function fixture(importer) {
  const handlers = new Map(), sent = []
  const sender = Object.assign(new EventEmitter(), { mainFrame: {}, isDestroyed: () => false, send: (...args) => sent.push(args) })
  const event = { sender, senderFrame: sender.mainFrame }
  const dispose = registerKnowledgeImportIpc({ ipcMain: { handle: (name, fn) => handlers.set(name, fn), removeHandler: name => handlers.delete(name) }, getWindow: () => ({ webContents: sender, isDestroyed: () => false }), importer })
  return { handlers, sent, sender, event, dispose }
}

test('import IPC binds cancellation to sender/frame and suppresses late progress', async () => {
  let options, resolve
  const f = fixture((_url, input) => { options = input; return new Promise(done => { resolve = done }) })
  try {
    const pending = f.handlers.get('knowledge:import-start')(f.event, { requestId: 'request-1', url: 'https://example.com/article' })
    options.onProgress('fetching')
    assert.deepEqual(f.sent, [['knowledge:import-progress', { requestId: 'request-1', stage: 'fetching' }]])
    assert.throws(() => f.handlers.get('knowledge:import-cancel')({ ...f.event, senderFrame: {} }, 'request-1'), /knowledge-import-forbidden/)
    assert.equal(options.signal.aborted, false)
    f.handlers.get('knowledge:import-cancel')(f.event, 'request-1')
    await assert.rejects(pending, /knowledge-cancelled/)
    options.onProgress('structuring')
    resolve({ title: 'late' })
    assert.equal(f.sent.length, 1)
    assert.equal(options.signal.aborted, true)
    assert.equal(f.sender.listenerCount('destroyed'), 0)
  } finally { f.dispose() }
})

test('duplicate starts share an operation, navigation aborts and errors are safe', async () => {
  let calls = 0, signal
  const f = fixture((_url, options) => { calls++; signal = options.signal; return new Promise(() => {}) })
  try {
    const start = () => f.handlers.get('knowledge:import-start')(f.event, { requestId: 'request-2', url: 'https://example.com/article' })
    const first = start(), second = start()
    assert.equal(calls, 1)
    f.sender.emit('did-start-navigation', {}, 'https://example.com', false, true)
    await Promise.all([assert.rejects(first, /knowledge-cancelled/), assert.rejects(second, /knowledge-cancelled/)])
    assert.equal(signal.aborted, true)
  } finally { f.dispose() }
  const failed = fixture(async () => { throw new Error('raw upstream response must not escape') })
  try { await assert.rejects(failed.handlers.get('knowledge:import-start')(failed.event, { requestId: 'request-3', url: 'https://example.com/article' }), /^Error: knowledge-import-failed$/) } finally { failed.dispose() }
})
