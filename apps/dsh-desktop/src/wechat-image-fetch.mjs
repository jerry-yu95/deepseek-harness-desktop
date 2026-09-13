import { decodeArticleImageResponse } from '@harness-design/dsh-knowledge/article-images'

const IMAGE_HOSTS = new Set(['mmbiz.qpic.cn', 'mmbiz.qlogo.cn', 'wx.qlogo.cn'])
const MAX_BYTES = 5 * 1024 * 1024

export function isWeChatImageUrl(input) {
  try {
    const url = new URL(input)
    return url.protocol === 'https:' && IMAGE_HOSTS.has(url.hostname) && !url.port && !url.username && !url.password
  } catch { return false }
}

/** Trust Chromium's proxy/DNS stack only for fixed HTTPS CDN hosts. Generic
 * images keep the public-IP-pinned transport. Never send session credentials.
 * net.request is intentional: Electron 43 fetch rejects manual redirects.
 */
export function fetchWeChatImage(input, session, signal, requestImage) {
  return new Promise((resolve, reject) => {
    let request, responseStream, timer
    let settled = false
    let redirects = 0
    const finish = (error, bytes) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', cancelled)
      if (error) { reject(error); responseStream?.destroy(); request?.abort() } else resolve(bytes)
    }
    const fail = reason => finish(new Error(`knowledge-image-${reason}`))
    const cancelled = () => finish(new Error('knowledge-cancelled'))
    if (signal.aborted) { cancelled(); return }
    if (!isWeChatImageUrl(input)) { fail('access'); return }
    try {
      request = requestImage({
        url: new URL(input).toString(), session, method: 'GET',
        credentials: 'omit', useSessionCookies: false, redirect: 'manual',
        referrerPolicy: 'no-referrer', bypassCustomProtocolHandlers: true,
        headers: { accept: 'image/png,image/jpeg,image/gif,image/webp', 'cache-control': 'no-store' },
      })
      signal.addEventListener('abort', cancelled, { once: true })
      timer = setTimeout(() => fail('timeout'), 8000)
      request.on('redirect', (_status, method, target) => {
        if (settled) return
        if (method !== 'GET' || ++redirects > 3 || !isWeChatImageUrl(target)) { fail('access'); return }
        request.followRedirect()
      })
      request.on('error', () => fail('network'))
      request.on('response', response => {
        responseStream = response
        if (settled) { response.destroy(); return }
        const header = name => { const value = response.headers[name]; return Array.isArray(value) ? value[0] : value }
        if (response.statusCode < 200 || response.statusCode >= 300) { fail('access'); return }
        if (Number(header('content-length')) > MAX_BYTES) { fail('limit'); return }
        let size = 0
        const chunks = []
        response.on('error', () => fail('network'))
        response.on('aborted', () => fail('network'))
        response.on('data', chunk => {
          if (settled) return
          size += chunk.length
          if (size > MAX_BYTES) { fail('limit'); return }
          chunks.push(Buffer.from(chunk))
        })
        response.on('end', () => {
          if (settled) return
          try { finish(undefined, decodeArticleImageResponse(Buffer.concat(chunks), header('content-type'))) } catch (error) { finish(error) }
        })
      })
      request.end()
    } catch { fail('network') }
  })
}
