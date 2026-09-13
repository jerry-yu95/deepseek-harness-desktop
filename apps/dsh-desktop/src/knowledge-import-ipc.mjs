import { randomUUID } from 'node:crypto'

const CHANNELS = ['knowledge:url-import', 'knowledge:import-start', 'knowledge:import-cancel']
const STAGES = new Set(['fetching', 'structuring', 'verification'])
const SAFE_ERRORS = new Set(['knowledge-cancelled', 'knowledge-fetch-timeout', 'knowledge-import-unavailable'])

/** Only the current application's top-level frame may control browser imports. */
export function registerKnowledgeImportIpc({ ipcMain, getWindow, importer }) {
  const operations = new Map()
  const authorize = event => {
    const window = getWindow?.()
    if (!window || window.isDestroyed() || !event?.sender || event.sender !== window.webContents || !event.senderFrame || event.senderFrame !== event.sender.mainFrame) throw new Error('knowledge-import-forbidden')
    return event.sender
  }
  const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/u.test(id)
  const start = (event, input) => {
    const sender = authorize(event)
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['requestId', 'url'].includes(key)) || !validId(input.requestId) || typeof input.url !== 'string' || input.url.length > 8192) throw new Error('knowledge-import-invalid')
    const existing = operations.get(input.requestId)
    if (existing) {
      if (existing.sender !== sender || existing.url !== input.url) throw new Error('knowledge-import-conflict')
      return existing.promise
    }
    if (operations.size !== 0) throw new Error('knowledge-import-busy')
    const controller = new AbortController()
    const abort = () => controller.abort()
    const navigation = (_event, _url, _inPlace, mainFrame) => { if (mainFrame) abort() }
    sender.once('destroyed', abort)
    sender.on('did-start-navigation', navigation)
    let rejectAbort
    const interrupted = new Promise((_resolve, reject) => { rejectAbort = reject })
    const cancel = () => rejectAbort(new Error('knowledge-cancelled'))
    controller.signal.addEventListener('abort', cancel, { once: true })
    const operation = { sender, url: input.url, controller, promise: undefined }
    operations.set(input.requestId, operation)
    const cleanup = () => {
      sender.removeListener('destroyed', abort)
      sender.removeListener('did-start-navigation', navigation)
      controller.signal.removeEventListener('abort', cancel)
      if (operations.get(input.requestId) === operation) operations.delete(input.requestId)
      controller.abort()
    }
    let work
    try {
      if (typeof importer !== 'function') throw new Error('knowledge-import-unavailable')
      work = importer(input.url, {
        signal: controller.signal,
        onProgress: stage => {
          if (!controller.signal.aborted && !sender.isDestroyed() && operations.get(input.requestId) === operation && STAGES.has(stage)) sender.send('knowledge:import-progress', { requestId: input.requestId, stage })
        },
      })
    } catch (error) { work = Promise.reject(error) }
    operation.promise = Promise.race([work, interrupted]).catch(error => {
      throw new Error(SAFE_ERRORS.has(error?.message) ? error.message : 'knowledge-import-failed')
    }).finally(cleanup)
    return operation.promise
  }
  for (const channel of CHANNELS) ipcMain.removeHandler(channel)
  ipcMain.handle('knowledge:import-start', start)
  ipcMain.handle('knowledge:url-import', (event, url) => start(event, { url, requestId: randomUUID() }))
  ipcMain.handle('knowledge:import-cancel', (event, requestId) => {
    const sender = authorize(event)
    if (!validId(requestId)) throw new Error('knowledge-import-invalid')
    const operation = operations.get(requestId)
    if (operation && operation.sender !== sender) throw new Error('knowledge-import-forbidden')
    operation?.controller.abort()
    return { cancelled: Boolean(operation) }
  })
  return () => {
    for (const operation of operations.values()) operation.controller.abort()
    for (const channel of CHANNELS) ipcMain.removeHandler(channel)
  }
}
