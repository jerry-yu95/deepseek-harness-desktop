type Bridge = {
  getModelProviderDefault?: (input: { providerId: string }) => Promise<{ baseURL: string | null }>
  revealSavedModelKey?: (input: { providerId: string }) => Promise<{ value: string | null; reason?: string }>
}
const controls = new Map<HTMLInputElement, { cleanup: () => void; route: () => string; initialRoute: string }>()
const keySelector = 'input[aria-label="API key"],input[aria-label="API Key"],input[aria-label="API 密钥"]'
const baseSelector = 'input[aria-label="Base URL"],input[aria-label="API 地址"]'
const buttonStyle = 'border:1px solid var(--dsw-border,#d1d5db);border-radius:8px;background:transparent;color:inherit;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;'

/** Isolated additions to the upstream provider form; never write a saved key into its React draft. */
export function installModelDisplay(): void {
  for (const [input, state] of controls) {
    if (!input.isConnected || state.route() !== state.initialRoute) { state.cleanup(); controls.delete(input) }
  }
  const bridge = (window as typeof window & { dshDesktop?: Bridge }).dshDesktop
  for (const input of document.querySelectorAll<HTMLInputElement>(keySelector)) {
    if (controls.has(input)) continue
    const editor = input.closest<HTMLElement>('[class*="_editor"],[class*="_addBlock"]')
    if (!editor || !input.parentElement) continue
    const route = () => editor.querySelector<HTMLInputElement | HTMLSelectElement>('input[aria-label="ID"],select[aria-label="Provider ID"],input[aria-label="Provider ID"],input[aria-label="提供方 ID"]')?.value.trim()
      || editor.closest('[class*="_addCard"]')?.querySelector<HTMLSelectElement>('select[aria-label="提供方"],select[aria-label="Provider"]')?.value.trim()
      || editor.querySelector('[class*="editorRoute"]')?.textContent?.trim()
      || editor.querySelector('[class*="editorTitle"]')?.textContent?.trim() || ''
    const initialRoute = route()
    const field = input.parentElement
    const oldPosition = field.style.position, oldPadding = input.style.paddingRight
    field.style.position = 'relative'
    input.style.paddingRight = '46px'
    const row = document.createElement('div')
    row.dataset.jiweiModelDisplay = ''
    row.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;'
    const button = document.createElement('button')
    button.type = 'button'; button.style.cssText = buttonStyle + 'position:absolute;right:8px;border-color:transparent;'
    button.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>'
    const status = document.createElement('span')
    status.setAttribute('role', 'status')
    status.style.cssText = 'font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#6b7280);'
    const revealed = document.createElement('input')
    revealed.type = 'text'; revealed.readOnly = true; revealed.hidden = true
    revealed.autocomplete = 'off'; revealed.spellcheck = false
    revealed.setAttribute('aria-label', '临时显示的已保存密钥')
    revealed.style.cssText = 'width:100%;font:13px ui-monospace,monospace;padding:8px;border:1px solid var(--dsw-border,#d1d5db);border-radius:8px;background:transparent;color:inherit;'
    let shown = false, generation = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const hide = () => {
      generation++; shown = false; clearTimeout(timer)
      input.type = 'password'; revealed.value = ''; revealed.hidden = true
      button.disabled = false; button.title = '显示 API 密钥'; button.setAttribute('aria-label', '显示 API 密钥'); button.setAttribute('aria-pressed', 'false')
      status.textContent = ''
    }
    hide()
    button.addEventListener('click', () => { void (async () => {
      if (shown) { hide(); return }
      const turn = ++generation, requestedRoute = route()
      button.disabled = true
      try {
        if (input.value) input.type = 'text'
        else {
          if (!bridge?.revealSavedModelKey || !requestedRoute) { status.textContent = '填写密钥后可查看'; return }
          const result = await bridge.revealSavedModelKey({ providerId: requestedRoute })
          if (generation !== turn || !input.isConnected || route() !== requestedRoute || input.value) return
          if (!result.value) { status.textContent = result.reason === 'environment' ? '密钥由环境提供，请在原配置处查看' : '没有可展示的本地已保存密钥'; return }
          revealed.value = result.value; revealed.hidden = false
        }
        shown = true; button.title = '隐藏 API 密钥'; button.setAttribute('aria-label', '隐藏 API 密钥'); button.setAttribute('aria-pressed', 'true')
        status.textContent = revealed.hidden ? '正在显示输入内容' : '已保存密钥 · 仅临时展示，不会覆盖输入内容'
        timer = setTimeout(hide, 30_000)
      } catch { if (generation === turn) status.textContent = '暂时无法读取密钥，请重试' }
      finally { if (generation === turn) button.disabled = false }
    })() })
    row.append(button, status, revealed)
    input.after(row)
    const placeEye = () => {
      const box = input.getBoundingClientRect(), parent = field.getBoundingClientRect()
      button.style.top = Math.max(0, box.top - parent.top + field.scrollTop - field.clientTop + (box.height - 32) / 2) + 'px'
    }
    placeEye()
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(placeEye) : undefined
    resize?.observe(field); resize?.observe(input)
    input.addEventListener('input', hide)
    const visibility = () => { if (document.hidden) hide() }
    window.addEventListener('blur', hide); document.addEventListener('visibilitychange', visibility)
    // Applying/cancelling is also a boundary, even if the upstream editor stays mounted.
    const boundary = (event: Event) => {
      const target = event.target as Element
      if (!row.contains(target) && target.closest('button')) hide()
    }
    editor.addEventListener('click', boundary, true)

    const base = editor.querySelector<HTMLInputElement>(baseSelector)
    const hint = document.createElement('small')
    hint.style.cssText = 'display:block;margin-top:6px;font-size:12px;line-height:1.6;overflow-wrap:anywhere;color:var(--dsw-alias-label-tertiary,#6b7280);'
    let defaultURL: string | null = null
    const declaring = editor.querySelector('input[aria-label="ID"],input[aria-label="Provider ID"],input[aria-label="提供方 ID"]') !== null
    const inherited = !declaring && base?.placeholder.startsWith('http') ? base.placeholder : null
    const updateAddress = () => {
      if (!base) return
      const fallback = inherited ?? defaultURL
      hint.textContent = base.value.trim() ? '自定义 API 地址：' + base.value.trim() + '（编辑后需保存）' : fallback ? '留空使用默认地址：' + fallback : '此提供方未返回默认地址，请在高级设置中填写服务商提供的 API 地址'
    }
    if (base) {
      row.after(hint); base.addEventListener('input', updateAddress)
      if (bridge?.getModelProviderDefault && /^[a-zA-Z][a-zA-Z0-9._-]{0,127}$/u.test(initialRoute) && !declaring) {
        void bridge.getModelProviderDefault({ providerId: initialRoute }).then(result => {
          if (!input.isConnected || route() !== initialRoute || !hint.isConnected) return
          defaultURL = result.baseURL
          updateAddress()
        }).catch(() => { if (hint.isConnected) { hint.textContent = '默认地址暂时无法读取；可填写服务商提供的地址' } })
      } else updateAddress()
    }
    const identityHost = editor.closest('[class*="_addCard"]') ?? editor
    const identityChanged = () => { if (route() !== initialRoute) installModelDisplay() }
    identityHost.addEventListener('input', identityChanged)
    identityHost.addEventListener('change', identityChanged)
    controls.set(input, { route, initialRoute, cleanup: () => {
      hide(); row.remove(); hint.remove(); input.removeEventListener('input', hide)
      resize?.disconnect(); field.style.position = oldPosition; input.style.paddingRight = oldPadding
      base?.removeEventListener('input', updateAddress); window.removeEventListener('blur', hide)
      document.removeEventListener('visibilitychange', visibility); editor.removeEventListener('click', boundary, true)
      identityHost.removeEventListener('input', identityChanged); identityHost.removeEventListener('change', identityChanged)
    } })
  }
}

export function disposeModelDisplay(): void {
  for (const value of controls.values()) value.cleanup()
  controls.clear()
}
