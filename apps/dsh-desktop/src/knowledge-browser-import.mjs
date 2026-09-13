import { createHash } from 'node:crypto'
import { articleText, articleImageCandidates, boundArticleText, prepareArticleMedia } from '@harness-design/dsh-knowledge/article-text'
import { cacheArticleImages, fetchArticleImage } from '@harness-design/dsh-knowledge/article-images'
import { fetchWeChatImage, isWeChatImageUrl } from './wechat-image-fetch.mjs'

const WECHAT_HOST = 'mp.weixin.qq.com'
const ALLOWED_RESOURCE_HOSTS = new Set([
  WECHAT_HOST,
  'res.wx.qq.com',
  'mmbiz.qpic.cn',
  'mmbiz.qlogo.cn',
  'wx.qlogo.cn',
  'weixin110.qq.com',
])
const BROWSER_WAIT_MS = 90_000

export const EXTRACT_SCRIPT = `(() => {
  const clean = value => String(value || '').replace(/\\s+/g, ' ').trim()
  const root = document.querySelector('#js_content')
  const pageText = clean(document.body && document.body.innerText)
  if (!root) return { kind: 'blocked', detail: pageText.slice(0, 240) }
  const clone = root.cloneNode(true)
  for (const node of clone.querySelectorAll('script,style,noscript,svg,template')) node.remove()
  const prepareMedia = ${prepareArticleMedia.toString()}
  prepareMedia(clone)
  const articleText = ${articleText.toString()}
  const images = (${articleImageCandidates.toString()})(clone, location.href)
  return {
    kind: 'article',
    title: clean((document.querySelector('#activity-name') || {}).textContent || document.querySelector('meta[property="og:title"]')?.content || document.title),
    author: clean((document.querySelector('#js_name') || {}).textContent || document.querySelector('meta[name="author"]')?.content),
    text: articleText(clone),
    images,
  }
})()`

export function normalizeWeChatArticleUrl(input) {
  let url
  try { url = new URL(String(input).trim()) } catch { throw new TypeError('knowledge URL is invalid') }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase().replace(/\.$/u, '') !== WECHAT_HOST) throw new TypeError('knowledge browser import only supports WeChat article links')
  if (url.username || url.password) throw new TypeError('knowledge URL must not contain credentials')
  if (url.pathname !== '/s' && !url.pathname.startsWith('/s/')) throw new TypeError('knowledge browser import only supports WeChat article links')
  url.hash = ''
  return url
}

export function isAllowedWeChatResource(input) {
  let url
  try { url = new URL(input) } catch { return false }
  return url.protocol === 'https:' && ALLOWED_RESOURCE_HOSTS.has(url.hostname.toLowerCase().replace(/\.$/u, ''))
}

export function projectWeChatArticle(article, url) {
  const title = String(article?.title ?? '').replace(/\s+/gu, ' ').trim().slice(0, 160)
  const author = String(article?.author ?? '').replace(/\s+/gu, ' ').trim().slice(0, 160)
  const text = String(article?.text ?? '').replace(/\r\n?/gu, '\n').replace(/[\t\f ]+/gu, ' ').replace(/ *\n */gu, '\n').replace(/\n{3,}/gu, '\n\n').trim()
  if (title === '' || text.length < 20) throw new Error('knowledge WeChat article did not contain readable content')
  const bounded = boundArticleText(author === '' ? text : `\u4f5c\u8005\uff1a${author}\n\n${text}`)
  const snapshot = bounded.text
  const prefixLength = author === '' ? 0 : `作者：${author}\n\n`.length
  const images = normalizeImageCandidates(article?.images, url).filter(image => image.offset === undefined || image.offset + prefixLength <= snapshot.length).map(image => ({ ...image, ...(image.offset === undefined ? {} : { offset: image.offset + prefixLength }) }))
  const metadata = images.map(image => imageMetadata(image))
  const articleResources = images.flatMap(image => image.data === undefined ? [] : [{ ...imageMetadata(image), status: 'ready', mimeType: image.mimeType, byteLength: image.byteLength, data: image.data }])
  return {
    title,
    content: '',
    snapshot,
    article: { ...(author ? { author } : {}), format: 'markdown', truncated: bounded.truncated, originalByteLength: bounded.originalByteLength, excerpt: snapshot.slice(0, 180), ...(metadata.length ? { images: metadata } : {}), ...(article.imagesTruncated ? { imagesTruncated: true } : {}) },
    ...(articleResources.length ? { articleResources } : {}),
    source: {
      kind: 'url',
      label: `${title} \u00b7 ${WECHAT_HOST}`,
      uri: url.toString(),
      mimeType: 'text/html',
    },
  }
}

function normalizeImageCandidates(input, baseUrl) {
  if (!Array.isArray(input)) return []
  const seen = new Set()
  const result = []
  for (const entry of input.slice(0, 50)) {
    let source
    try {
      source = new URL(String(entry?.src ?? '').trim(), baseUrl)
      if (source.protocol !== 'https:' || source.username || source.password) continue
      source.hash = ''
    } catch { continue }
    const src = source.toString()
    if (seen.has(src)) continue
    seen.add(src)
    const mimeType = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(entry?.mimeType) ? entry.mimeType : undefined
    const byteLength = Number.isSafeInteger(entry?.byteLength) && entry.byteLength > 0 && entry.byteLength <= 5 * 1024 * 1024 ? entry.byteLength : undefined
    const data = typeof entry?.data === 'string' && mimeType !== undefined && byteLength !== undefined ? entry.data : undefined
    const failureReason = ['access', 'format', 'limit', 'timeout', 'network', 'cache', 'unknown'].includes(entry?.failureReason) ? entry.failureReason : undefined
    result.push({ src, alt: String(entry?.alt ?? '').replace(/\s+/gu, ' ').trim().slice(0, 200), order: result.length, ...(Number.isSafeInteger(entry?.offset) && entry.offset >= 0 ? { offset: entry.offset } : {}), ...(mimeType === undefined ? {} : { mimeType }), ...(byteLength === undefined ? {} : { byteLength }), ...(data === undefined ? {} : { data }), ...(failureReason === undefined ? {} : { failureReason }) })
  }
  return result
}

function imageMetadata(image) {
  const id = `image_${createHash('sha256').update(image.src).digest('hex').slice(0, 32)}`
  const position = image.offset === undefined ? {} : { offset: image.offset }
  return image.data === undefined
    ? { id, alt: image.alt, order: image.order, ...position, status: 'unavailable', ...(image.failureReason ? { failureReason: image.failureReason } : {}) }
    : { id, alt: image.alt, order: image.order, ...position, status: 'ready', mimeType: image.mimeType, byteLength: image.byteLength }
}

async function hydrateArticleImages(window, article, fetchImage, signal) {
  if (!Array.isArray(article?.images) || article.images.length === 0) return article
  const cached = await cacheArticleImages(article.images, signal ?? new AbortController().signal, async (src, active) => {
    if (!isAllowedWeChatResource(src)) throw new Error('knowledge-image-unavailable')
    return fetchImage({ src }, window, active)
  })
  const resources = new Map(cached.resources.map(resource => [resource.id, resource]))
  const images = article.images.slice(0, 50).map((candidate, index) => ({ ...candidate, ...cached.images[index], ...resources.get(cached.images[index].id) }))
  return { ...article, images, imagesTruncated: cached.imagesTruncated }
}

async function fetchPublicImage(candidate, window, signal, netRequest) {
  if (isWeChatImageUrl(candidate.src) && window?.webContents.session && netRequest) {
    return fetchWeChatImage(candidate.src, window.webContents.session, signal, netRequest)
  }
  return fetchArticleImage(candidate.src, signal)
}

export function createKnowledgeBrowserImporter({ BrowserWindow, getParent, dialog, testFixture, netRequest, fetchImage = (candidate, window, signal) => fetchPublicImage(candidate, window, signal, netRequest) }) {
  let requestPolicyInstalled = false
  let active = false

  return async function importKnowledgeUrl(input, { signal, onProgress } = {}) {
    if (active) throw new Error('knowledge browser import is already running')
    const url = normalizeWeChatArticleUrl(input)
    if (signal?.aborted) throw new Error('knowledge-cancelled')
    if (testFixture !== undefined) {
      active = true
      const check = () => { if (signal?.aborted) throw new Error('knowledge-cancelled') }
      try {
        check()
        onProgress?.('fetching')
        const article = await withTimeout(Promise.resolve(testFixture({ url, signal })), 5_000, 'knowledge-fetch-timeout', signal)
        check()
        onProgress?.('structuring')
        check()
        return projectWeChatArticle(await hydrateArticleImages(undefined, article, fetchImage, signal), url)
      } finally {
        active = false
      }
    }
    const window = new BrowserWindow({
      width: 920,
      height: 760,
      minWidth: 640,
      minHeight: 520,
      show: false,
      parent: getParent?.(),
      title: '\u5fae\u4fe1文章导入',
      webPreferences: {
        partition: 'persist:harness-knowledge-wechat',
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        spellcheck: false,
      },
    })
    active = true
    const check = () => { if (signal?.aborted) throw new Error('knowledge-cancelled') }
    const progress = stage => { check(); onProgress?.(stage) }
    try {
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      window.webContents.on('will-navigate', (event, target) => {
        if (!isAllowedWeChatResource(target)) event.preventDefault()
      })
      if (!requestPolicyInstalled) {
        window.webContents.session.on('will-download', event => event.preventDefault())
        window.webContents.session.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
          callback({ cancel: !isAllowedWeChatResource(details.url) })
        })
        requestPolicyInstalled = true
      }
      progress('fetching')
      await withTimeout(window.loadURL(url.toString()), 25_000, 'knowledge-fetch-timeout', signal)
      progress('structuring')
      let article = await withTimeout(readArticle(window), 25_000, 'knowledge-fetch-timeout', signal)
      check()
      if (article?.kind !== 'article') {
        progress('verification')
        await withTimeout(Promise.resolve(dialog?.showMessageBox(window, {
          type: 'info',
          title: '\u5fae\u4fe1文章需要验证',
          message: '\u8bf7在即将打开的隔离窗口中完成微信验证。',
          detail: '\u9a8c证成功并显示文章正文后，导入会自动继续。如果页面显示“参数错误”，请从微信中重新复制完整文章链接。',
        })), BROWSER_WAIT_MS, 'knowledge-fetch-timeout', signal)
        check()
        window.show()
        article = await waitForArticle(window, BROWSER_WAIT_MS, signal)
      }
      check()
      if (article?.kind !== 'article') throw new Error('knowledge WeChat article requires a valid browser session or complete link')
      return projectWeChatArticle(await hydrateArticleImages(window, article, fetchImage, signal), url)
    } finally {
      active = false
      if (!window.isDestroyed()) window.destroy()
    }
  }
}

async function readArticle(window) {
  if (window.isDestroyed() || window.webContents.isDestroyed()) return undefined
  try { return await window.webContents.executeJavaScript(EXTRACT_SCRIPT, true) } catch { return undefined }
}

function waitForArticle(window, timeoutMs, signal) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      clearInterval(interval)
      clearTimeout(timeout)
      window.removeListener('closed', onClosed)
      signal?.removeEventListener('abort', onClosed)
      resolve(value)
    }
    const inspect = () => { void readArticle(window).then(value => { if (value?.kind === 'article') finish(value) }) }
    const onClosed = () => finish(undefined)
    const interval = setInterval(inspect, 1_000)
    const timeout = setTimeout(() => finish(undefined), timeoutMs)
    window.once('closed', onClosed)
    signal?.addEventListener('abort', onClosed, { once: true })
    if (signal?.aborted) onClosed()
    inspect()
  })
}

function withTimeout(promise, timeoutMs, message, signal) {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
    const abort = () => { cleanup(); reject(new Error('knowledge-cancelled')) }
    const timer = setTimeout(() => { cleanup(); reject(new Error(message)) }, timeoutMs)
    signal?.addEventListener('abort', abort, { once: true })
    promise.then(value => { cleanup(); resolve(value) }, error => { cleanup(); reject(error) })
    if (signal?.aborted) abort()
  })
}
