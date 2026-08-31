const WECHAT_HOST = 'mp.weixin.qq.com'
const ALLOWED_RESOURCE_HOSTS = new Set([
  WECHAT_HOST,
  'res.wx.qq.com',
  'mmbiz.qpic.cn',
  'mmbiz.qlogo.cn',
  'wx.qlogo.cn',
  'weixin110.qq.com',
])
const MAX_SNAPSHOT_CHARS = 200_000
const BROWSER_WAIT_MS = 90_000

const EXTRACT_SCRIPT = `(() => {
  const clean = value => String(value || '').replace(/\\s+/g, ' ').trim()
  const root = document.querySelector('#js_content')
  const pageText = clean(document.body && document.body.innerText)
  if (!root) return { kind: 'blocked', detail: pageText.slice(0, 240) }
  const clone = root.cloneNode(true)
  for (const node of clone.querySelectorAll('script,style,noscript,svg,template')) node.remove()
  return {
    kind: 'article',
    title: clean((document.querySelector('#activity-name') || {}).textContent || document.querySelector('meta[property="og:title"]')?.content || document.title),
    author: clean((document.querySelector('#js_name') || {}).textContent || document.querySelector('meta[name="author"]')?.content),
    text: clean(clone.innerText || clone.textContent),
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
  const text = String(article?.text ?? '').replace(/\r\n?/gu, '\n').replace(/[\t\f ]+/gu, ' ').replace(/ *\n */gu, '\n').replace(/\n{3,}/gu, '\n\n').trim().slice(0, MAX_SNAPSHOT_CHARS)
  if (title === '' || text.length < 20) throw new Error('knowledge WeChat article did not contain readable content')
  const snapshot = author === '' ? text : `\u4f5c\u8005\uff1a${author}\n\n${text}`
  return {
    title,
    content: snapshot.slice(0, 4_000),
    snapshot,
    source: {
      kind: 'url',
      label: `${title} \u00b7 ${WECHAT_HOST}`,
      uri: url.toString(),
      mimeType: 'text/html',
    },
  }
}

export function createKnowledgeBrowserImporter({ BrowserWindow, getParent, dialog }) {
  let requestPolicyInstalled = false
  let active = false

  return async function importKnowledgeUrl(input) {
    if (active) throw new Error('knowledge browser import is already running')
    active = true
    const url = normalizeWeChatArticleUrl(input)
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
      await withTimeout(window.loadURL(url.toString()), 25_000, 'knowledge WeChat article timed out')
      let article = await readArticle(window)
      if (article?.kind !== 'article') {
        await dialog?.showMessageBox(getParent?.(), {
          type: 'info',
          title: '\u5fae\u4fe1文章需要验证',
          message: '\u8bf7在即将打开的隔离窗口中完成微信验证。',
          detail: '\u9a8c证成功并显示文章正文后，导入会自动继续。如果页面显示“参数错误”，请从微信中重新复制完整文章链接。',
        })
        window.show()
        article = await waitForArticle(window, BROWSER_WAIT_MS)
      }
      if (article?.kind !== 'article') throw new Error('knowledge WeChat article requires a valid browser session or complete link')
      return projectWeChatArticle(article, url)
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

function waitForArticle(window, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      clearInterval(interval)
      clearTimeout(timeout)
      window.removeListener('closed', onClosed)
      resolve(value)
    }
    const inspect = () => { void readArticle(window).then(value => { if (value?.kind === 'article') finish(value) }) }
    const onClosed = () => finish(undefined)
    const interval = setInterval(inspect, 1_000)
    const timeout = setTimeout(() => finish(undefined), timeoutMs)
    window.once('closed', onClosed)
    inspect()
  })
}

function withTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    promise.then(value => { clearTimeout(timer); resolve(value) }, error => { clearTimeout(timer); reject(error) })
  })
}
