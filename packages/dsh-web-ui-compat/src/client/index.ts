/**
 * dsh-web-ui compat shim, browser half.
 *
 * The current dsh web shell renders its grid columns without the legacy
 * `data-pane` / `data-dsh-frame` hooks (the columns carry css-module class
 * names such as `*_sidebarCol` / `*_centerCol` / `*_detailsCol`). The
 * dsh-web-ui family plugins (task-board, ssh, aionui-panel, several skins)
 * mount at the DOM level through those legacy selectors, so without them the
 * plugins stay silent even though they load.
 *
 * This shim stamps the expected attributes onto the real shell elements and
 * re-applies them on any DOM mutation (React re-renders that re-create the
 * columns), which restores every DOM-mounting plugin and the skins' column
 * selectors in one place. It only ever WRITES attributes; it never removes
 * nodes and never disturbs React's reconciliation.
 */
import type { Context } from '@deepseek-ai/cordis'

/** Column shims: element selector → attribute to stamp. */
const COLUMN_SHIMS: ReadonlyArray<readonly [selector: string, attribute: string]> = [
  ['[class*="sidebarCol"]', 'data-pane="sidebar"'],
  ['[class*="centerCol"]', 'data-pane="conversation"'],
  ['[class*="detailsCol"]', 'data-pane="details"'],
]

/** Stamp one attribute of the form `name="value"` onto an element, if found. */
function stamp(el: Element | null, attribute: string): void {
  if (el === null) return
  const eq = attribute.indexOf('=')
  const name = attribute.slice(0, eq)
  const value = attribute.slice(eq + 1).replace(/^"|"$/g, '')
  el.setAttribute(name, value)
}

/** One pass over the current DOM. */
function applyShims(): void {
  for (const [selector, attribute] of COLUMN_SHIMS) {
    stamp(document.querySelector(selector), attribute)
  }
  // The frame is the grid item that parents the sidebar column.
  stamp(document.querySelector('[class*="sidebarCol"]')?.parentElement ?? null, 'data-dsh-frame=""')
  installImChannelNotice()
  installModelProviderTestActions()
}

type ModelProviderTestResult = { ok: boolean; category?: string; model?: string; detail: string; latencyMs: number }
type ModelImageInputResult = { ok: boolean; enabled: boolean; model?: string; detail?: string }
type ModelProviderIdentity = { providerId?: string; baseURL?: string; model: string }
type DesktopModelBridge = {
  testModelProvider?: (input: ModelProviderDraft) => Promise<ModelProviderTestResult>
  getModelImageInput?: (input: ModelProviderIdentity) => Promise<ModelImageInputResult>
  setModelImageInput?: (input: ModelProviderIdentity & { enabled: boolean }) => Promise<ModelImageInputResult>
}
type ModelProviderDraft = { providerId?: string; baseURL: string; api: string; apiKey: string; model: string }

const TEST_ACTION = 'data-dsh-model-provider-test'
const FIELD_LABELS = {
  providerId: ['ID', 'Provider ID', '提供方 ID'],
  baseURL: ['Base URL', 'API 地址'],
  api: ['API', 'API 协议'],
  apiKey: ['API key', 'API Key', 'API 密钥'],
  model: ['Model ID', '模型 ID'],
} as const

/** Add a real inference probe to both create and edit provider cards. */
function installModelProviderTestActions(): void {
  const bridge = (window as typeof window & { dshDesktop?: DesktopModelBridge }).dshDesktop
  if (typeof bridge?.testModelProvider !== 'function') return
  for (const keyInput of findInputs(FIELD_LABELS.apiKey)) {
    const editor = closestProviderEditor(keyInput)
    if (
      editor === null ||
      findControl(editor, FIELD_LABELS.api) === null ||
      editor.querySelector(`[${TEST_ACTION}]`)
    ) continue
    const action = document.createElement('button')
    action.type = 'button'
    action.setAttribute(TEST_ACTION, '')
    action.textContent = '测试连接'
    action.style.cssText = 'align-self:flex-start;padding:8px 16px;border:1px solid var(--dsw-border,#d1d5db);border-radius:10px;background:transparent;color:inherit;cursor:pointer;font:inherit;'
    const status = document.createElement('span')
    status.setAttribute('role', 'status')
    status.style.cssText = 'margin-left:10px;font-size:13px;line-height:1.5;'
    action.addEventListener('click', () => { void runProviderTest(editor, action, status, bridge) })
    const row = document.createElement('div')
    row.setAttribute(TEST_ACTION, 'row')
    row.style.cssText = 'display:flex;align-items:center;flex-wrap:wrap;gap:4px;margin:8px 0;'
    row.append(action, status)
    if (typeof bridge.getModelImageInput === 'function' && typeof bridge.setModelImageInput === 'function') {
      row.append(createImageInputControl(editor, bridge))
    }
    const footer = findFooter(editor)
    if (footer === null) editor.append(row)
    else footer.before(row)
  }
}

/** Add an explicit modality declaration for saved custom models. */
function createImageInputControl(editor: HTMLElement, bridge: DesktopModelBridge): HTMLElement {
  const label = document.createElement('label')
  label.style.cssText = 'display:inline-flex;align-items:center;gap:6px;margin-left:8px;font-size:13px;line-height:1.5;cursor:pointer;'
  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.disabled = true
  checkbox.setAttribute('aria-label', '允许图片输入')
  const copy = document.createElement('span')
  copy.textContent = '允许图片输入'
  const detail = document.createElement('span')
  detail.setAttribute('role', 'status')
  detail.style.cssText = 'font-size:12px;color:var(--dsw-alias-label-tertiary,#6b7280);'
  label.append(checkbox, copy, detail)

  const identity = (): ModelProviderIdentity | null => readProviderIdentity(editor)
  void (async () => {
    const target = identity()
    if (target === null) {
      detail.textContent = '请先填写并保存模型'
      return
    }
    try {
      const result = await bridge.getModelImageInput!(target)
      checkbox.checked = result.enabled
      checkbox.disabled = !result.ok
      detail.textContent = result.ok ? '' : (result.detail ?? '请先保存提供方')
    } catch (error) {
      detail.textContent = redactProviderText(error instanceof Error ? error.message : String(error))
    }
  })()

  checkbox.addEventListener('change', () => {
    void (async () => {
      const target = identity()
      if (target === null) {
        checkbox.checked = !checkbox.checked
        detail.textContent = '请先保存提供方'
        return
      }
      const requested = checkbox.checked
      checkbox.disabled = true
      detail.textContent = '保存中…'
      try {
        const result = await bridge.setModelImageInput!({ ...target, enabled: requested })
        checkbox.checked = result.enabled
        detail.textContent = result.enabled ? '已启用' : '已关闭'
      } catch (error) {
        checkbox.checked = !requested
        detail.textContent = redactProviderText(error instanceof Error ? error.message : String(error))
      } finally {
        checkbox.disabled = false
      }
    })()
  })
  return label
}

async function runProviderTest(editor: HTMLElement, action: HTMLButtonElement, status: HTMLElement, bridge: DesktopModelBridge): Promise<void> {
  const original = action.textContent
  action.disabled = true
  action.textContent = '测试中…'
  status.textContent = ''
  try {
    const draft = readProviderDraft(editor)
    const result = await bridge.testModelProvider!(draft)
    status.textContent = result.ok
      ? `已连接 · ${result.model || draft.model} · ${result.latencyMs} ms`
      : redactProviderText(result.detail)
    status.style.color = result.ok ? '#15803d' : '#dc2626'
  } catch (error) {
    status.textContent = redactProviderText(error instanceof Error ? error.message : String(error))
    status.style.color = '#dc2626'
  } finally {
    action.disabled = false
    action.textContent = original
  }
}

export function readProviderDraft(editor: ParentNode): ModelProviderDraft {
  const providerControl = findInput(editor, FIELD_LABELS.providerId) ?? findControl(editor, FIELD_LABELS.providerId)
  const providerId = providerControl === null ? undefined : valueOf(providerControl, 'Provider ID')
  const baseURL = valueOf(findInput(editor, FIELD_LABELS.baseURL), 'API 地址')
  const api = valueOf(findControl(editor, FIELD_LABELS.api), 'API 协议')
  const apiKey = valueOf(findInput(editor, FIELD_LABELS.apiKey), 'API 密钥')
  const model = valueOf(findInput(editor, FIELD_LABELS.model) ?? findNumberedModel(editor), '模型 ID')
  return { ...(providerId === undefined ? {} : { providerId }), baseURL, api, apiKey, model }
}

export function readProviderIdentity(editor: ParentNode): ModelProviderIdentity | null {
  const providerControl = findInput(editor, FIELD_LABELS.providerId) ?? findControl(editor, FIELD_LABELS.providerId)
  const routeText = editor.querySelector<HTMLElement>('[class*="editorRoute"]')?.textContent?.trim()
  const providerId = providerControl === null ? (routeText || undefined) : (providerControl.value.trim() || undefined)
  const baseURL = findInput(editor, FIELD_LABELS.baseURL)?.value.trim() || undefined
  const model = (findInput(editor, FIELD_LABELS.model) ?? findNumberedModel(editor))?.value.trim() ?? ''
  if (model.length === 0 || (providerId === undefined && baseURL === undefined)) return null
  return { ...(providerId === undefined ? {} : { providerId }), ...(baseURL === undefined ? {} : { baseURL }), model }
}

function findNumberedModel(root: ParentNode): HTMLInputElement | null {
  return [...root.querySelectorAll<HTMLInputElement>('input[aria-label]')].find((input) => {
    const label = input.getAttribute('aria-label') ?? ''
    return /^(?:Model ID|模型 ID)(?:\s+\d+)?$/u.test(label)
  }) ?? null
}

function redactProviderText(value: string): string {
  return value
    .replace(/Bearer\s+\S+/giu, 'Bearer [REDACTED]')
    .replace(/(authorization)\s*[:=]\s*[^\s,;]+/giu, '$1=[REDACTED]')
    .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/giu, '$1=[REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]+\b/gu, '[REDACTED]')
}

function closestProviderEditor(input: HTMLInputElement): HTMLElement | null {
  let current = input.parentElement
  while (current !== null && current !== document.body) {
    if (findInput(current, FIELD_LABELS.baseURL) !== null && findFooter(current) !== null) return current
    current = current.parentElement
  }
  return null
}

function findFooter(root: ParentNode): HTMLElement | null {
  const labels = ['创建提供方', 'Create provider', '应用', 'Apply', '保存', 'Save']
  return [...root.querySelectorAll<HTMLButtonElement>('button')]
    .find(button => labels.some(label => button.textContent?.trim() === label))?.parentElement ?? null
}

function findInputs(labels: readonly string[]): HTMLInputElement[] {
  return labels.flatMap(label => [...document.querySelectorAll<HTMLInputElement>(`input[aria-label="${label}"]`)])
}

function findInput(root: ParentNode, labels: readonly string[]): HTMLInputElement | null {
  for (const label of labels) {
    const exact = root.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)
    if (exact !== null) return exact
    const numbered = [...root.querySelectorAll<HTMLInputElement>('input[aria-label]')].find(input => input.getAttribute('aria-label')?.startsWith(`${label} `))
    if (numbered !== undefined) return numbered
  }
  return null
}

function findControl(root: ParentNode, labels: readonly string[]): HTMLInputElement | HTMLSelectElement | null {
  for (const label of labels) {
    const control = root.querySelector<HTMLInputElement | HTMLSelectElement>(`input[aria-label="${label}"],select[aria-label="${label}"]`)
    if (control !== null) return control
  }
  return null
}

function valueOf(control: HTMLInputElement | HTMLSelectElement | null, label: string): string {
  const value = control?.value.trim() ?? ''
  if (value === '') throw new Error(`请填写${label}后再测试`)
  return value
}

/** Make the bundled community IM adapter's ownership and WeChat conflict visible. */
function installImChannelNotice(): void {
  if (document.querySelector('[data-dsh-im-community-notice]')) return
  const tab = [...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'IM机器人')
  if (!tab?.parentElement) return
  const notice = document.createElement('span')
  notice.dataset.dshImCommunityNotice = ''
  notice.textContent = '第三方消息渠道 · 微信绑定可能替换现有 OpenClaw 连接'
  notice.title = '@xmanrui/dsh-im 社区插件与移动端远程控制互相独立；微信 iLink 同一账号通常只能保持一个连接。'
  notice.style.cssText = 'margin-left:12px;color:#b45309;font-size:12px;line-height:1.4;'
  tab.parentElement.append(notice)
}

/** Required services: none — the shim must run before any DOM mount waits. */
export const inject = [] as const

/**
 * Register the shim for the page lifetime.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    applyShims()
    // The shell renders after boot settlement and React can re-create the
    // columns on re-render; re-stamp on any DOM mutation. Idempotent: writes
    // only the same attribute values, so this never fights React.
    const observer = new MutationObserver(applyShims)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => { observer.disconnect() }
  })
}
