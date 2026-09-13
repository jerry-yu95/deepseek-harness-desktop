import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'

export function imageRequestFixture(respond) {
  const calls = []
  const requestImage = options => {
    const request = new EventEmitter()
    let stopped = false, stream, current = options.url, next
    request.abort = () => { stopped = true; stream?.destroy(); request.emit('close') }
    request.followRedirect = () => { current = next; queueMicrotask(send) }
    const send = async () => {
      if (stopped) return
      calls.push({ url: current, options, request })
      try {
        const value = await respond(current, request)
        if (stopped) { await value.body?.cancel(); return }
        if (value.status >= 300 && value.status < 400) {
          next = new URL(value.headers.get('location'), current).toString()
          request.emit('redirect', value.status, 'GET', next, {})
          return
        }
        stream = value.body ? Readable.fromWeb(value.body) : Readable.from([])
        stream.statusCode = value.status
        stream.headers = Object.fromEntries(value.headers)
        request.emit('response', stream)
      } catch (error) { if (!stopped) request.emit('error', error) }
    }
    request.end = () => queueMicrotask(send)
    return request
  }
  return { requestImage, calls }
}
