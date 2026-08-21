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
