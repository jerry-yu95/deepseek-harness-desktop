/**
 * Panel view mounting.
 *
 * The `conversation` slot is single-occupant (ui-conversation) and external
 * plugins cannot declare slots, so the panel takes over the center column at
 * the DOM level: a container is appended inside the [data-pane="conversation"]
 * grid item (an extra trailing child React never manages), and a stylesheet
 * rule hides the conversation content while the panel is active. Toggling is
 * a data attribute on <html> — no React involvement, so the conversation
 * subtree underneath stays mounted and stateful. (dsh-ssh takeover pattern.)
 */
import { createRoot, type Root } from 'react-dom/client'
import type { DesktopBridge } from './bridge.ts'
import type { PanelController } from './panel/controller.ts'
import { ExtensionPanel } from './panel/ExtensionPanel.tsx'
import css from './panel/panel.module.css'

/** The injected panel container (kept in the DOM, hidden when inactive). */
export const PANEL_VIEW_SELECTOR = '[data-dsh-extension-view]'

const CONVERSATION_COLUMN_SELECTOR = '[data-pane="conversation"]'
const ACTIVE_ATTR = 'data-dsh-extension-active'

/** Find the center column, or undefined while the frame is not mounted. */
function conversationColumn(): HTMLElement | undefined {
  return document.querySelector<HTMLElement>(CONVERSATION_COLUMN_SELECTOR) ?? undefined
}

/**
 * Mount the panel React tree into the center column and bind its visibility
 * to the controller's panelOpen state.
 * @param controller - the panel controller driving the view.
 * @param bridge - the desktop IPC bridge (undefined in plain browser sessions).
 * @returns disposer unmounting the tree and restoring the column.
 */
export function mountPanel(controller: PanelController, bridge: DesktopBridge | undefined): () => void {
  let root: Root | undefined
  let container: HTMLDivElement | undefined

  const ensure = (): void => {
    if (container !== undefined) {
      if (container.isConnected) return
      // The conversation pane was replaced; drop the stale tree and remount.
      root?.unmount()
      root = undefined
      container.remove()
      container = undefined
    }
    const column = conversationColumn()
    if (column === undefined) return
    container = document.createElement('div')
    container.dataset.dshExtensionView = ''
    container.className = css.view
    column.appendChild(container)
    root = createRoot(container)
    root.render(<ExtensionPanel controller={controller} bridge={bridge} />)
  }

  // The frame mounts after boot settlement; watch for the column's arrival.
  const waitObserver = new MutationObserver(() => { ensure() })
  waitObserver.observe(document.body, { childList: true, subtree: true })

  const applyActive = (): void => {
    if (controller.getSnapshot().panelOpen) {
      document.documentElement.setAttribute(ACTIVE_ATTR, '')
    } else {
      document.documentElement.removeAttribute(ACTIVE_ATTR)
    }
  }
  const unsubscribe = controller.subscribe(applyActive)
  applyActive()
  ensure()

  return () => {
    waitObserver.disconnect()
    unsubscribe()
    document.documentElement.removeAttribute(ACTIVE_ATTR)
    root?.unmount()
    root = undefined
    container?.remove()
    container = undefined
  }
}
