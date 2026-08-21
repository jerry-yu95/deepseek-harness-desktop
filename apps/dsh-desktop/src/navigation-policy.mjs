export function classifyNavigation(target, runtimeOrigin) {
  let url
  try {
    url = new URL(target)
  } catch {
    return 'deny'
  }
  if (runtimeOrigin && url.origin === runtimeOrigin) return 'allow'
  if (url.protocol === 'https:') return 'external'
  return 'deny'
}

export function installNavigationPolicy({ webContents, getRuntimeOrigin, openExternal }) {
  webContents.on('will-navigate', (event, target) => {
    const decision = classifyNavigation(target, getRuntimeOrigin())
    if (decision === 'allow') return
    event.preventDefault()
    if (decision === 'external') void openExternal(target)
  })
  webContents.on('will-attach-webview', (event) => event.preventDefault())
  webContents.setWindowOpenHandler(({ url }) => {
    if (classifyNavigation(url, getRuntimeOrigin()) === 'external') void openExternal(url)
    return { action: 'deny' }
  })
}
