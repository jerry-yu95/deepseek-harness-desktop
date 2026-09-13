/** Register a bounded, authenticated, loopback-only Connection-compatible channel. */
export function registerLocalRpc(ctx, channel, handler) {
  if (!/^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(channel) || channel === '/api') throw new TypeError('invalid local RPC channel')
  return ctx.webServer.register({
    kind: 'prefix',
    path: channel,
    async handler(req, res) {
      const send = (status, value) => {
        res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
        res.end(JSON.stringify(value))
      }
      if (!isLocalRequest(req)) return send(403, { error: 'forbidden' })
      const rejection = ctx.connection.requestRejection(req)
      if (rejection !== undefined) return send(rejection, { error: 'unauthorized' })
      if (req.method !== 'POST') return send(405, { error: 'method-not-allowed' })
      if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) return send(415, { error: 'unsupported-media-type' })
      const pathname = new URL(req.url, 'http://localhost').pathname
      const endpoint = pathname.startsWith(`${channel}/`) ? pathname.slice(channel.length + 1) : ''
      if (!endpoint || endpoint.includes('/')) return send(404, { error: 'not-found' })
      const abort = new AbortController()
      res.once('close', () => abort.abort())
      let rpcId
      try {
        const chunks = []
        let size = 0
        for await (const chunk of req) {
          size += chunk.length
          if (size > 32 * 1024 * 1024) return send(413, { error: 'body-too-large' })
          chunks.push(chunk)
        }
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (body?.type !== 'client-request' || typeof body.rpcId !== 'string' || !body.rpcId || body.rpcId.length > 200 || body.method !== endpoint) return send(400, { error: 'invalid-envelope' })
        rpcId = body.rpcId
        const result = await handler(endpoint, body.payload, abort.signal)
        if (!abort.signal.aborted) send(200, { type: 'server-response', rpcId, result })
      } catch {
        if (!abort.signal.aborted) send(rpcId ? 200 : 400, rpcId ? {
          type: 'server-response', rpcId,
          result: { ok: false, error: { code: 'internal', message: 'Local operation failed', details: {} } },
        } : { error: 'invalid-request' })
      }
    },
  })
}

/** Socket, Host and Origin must all stay local; forwarded headers grant no authority. */
export function isLocalRequest(req) {
  const address = req.socket?.remoteAddress
  if (!(address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1')) return false
  try {
    const host = req.headers.host
    if (typeof host !== 'string' || !host) return false
    const url = new URL(`http://${host}`)
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.host !== host || url.username || url.password) return false
    const origin = req.headers.origin
    if (origin !== undefined && (typeof origin !== 'string' || new URL(origin).host !== host || !['http:', 'https:'].includes(new URL(origin).protocol))) return false
    const site = req.headers['sec-fetch-site']
    return site === undefined || site === 'same-origin' || site === 'none'
  } catch { return false }
}
