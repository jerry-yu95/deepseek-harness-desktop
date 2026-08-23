/**
 * Sidebar entry injection (two rows: Skills, Connectors).
 *
 * dsh's sidebar shell exposes no slot an external plugin can register into,
 * so — following the dsh-ssh precedent of DOM-level extension — the rows are
 * injected between the shell's New Session button and the workspace browser.
 * The injection self-heals: a MutationObserver watches the sidebar root and
 * re-inserts the rows whenever a React re-render displaces them (re-insertion
 * happens in the same frame, before paint, so no flicker).
 *
 * The rows are plain DOM (no React tree) so they can never disturb the
 * shell's reconciliation; the panel view they toggle is a separate React root
 * mounted in the center column (see mount.tsx).
 */
import type { ExtensionTab, PanelController } from './panel/controller.ts'
import { tt } from './helpers.ts'
import css from './panel/panel.module.css'

/** Stable data attribute identifying the injected entry rows. */
export const ENTRY_SELECTOR = '[data-dsh-extension-entry]'

/** Inline icons (match the shell's 16px nav-icon look). */
const ICONS: Record<ExtensionTab, string> = {
  // Bookmark ribbon: the skills catalog.
  skills:
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 2.5h7a.5.5 0 0 1 .5.5v10.5L8 11l-4 2.5V3a.5.5 0 0 1 .5-.5z"/></svg>',
  // Plug: the connector center.
  connectors:
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 2v3M10.5 2v3"/><rect x="4" y="5" width="8" height="4" rx="1"/><path d="M8 9v5"/></svg>',
  // Open book: the learning platform.
  learning:
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 3.5h3.2A2.3 2.3 0 0 1 8 5.8v7a2.3 2.3 0 0 0-2.3-2.3H2.5z"/><path d="M13.5 3.5h-3.2A2.3 2.3 0 0 0 8 5.8v7a2.3 2.3 0 0 1 2.3-2.3h3.2z"/></svg>',
}

/** One entry row per tab, with its locale keys. */
const ENTRIES: ReadonlyArray<{ tab: ExtensionTab; labelKey: 'entry.skills.label' | 'entry.connectors.label' | 'entry.learning.label'; tooltipKey: 'entry.skills.tooltip' | 'entry.connectors.tooltip' | 'entry.learning.tooltip' }> = [
  { tab: 'skills', labelKey: 'entry.skills.label', tooltipKey: 'entry.skills.tooltip' },
  { tab: 'connectors', labelKey: 'entry.connectors.label', tooltipKey: 'entry.connectors.tooltip' },
  { tab: 'learning', labelKey: 'entry.learning.label', tooltipKey: 'entry.learning.tooltip' },
]

/** Find the sidebar shell root element, or undefined while not yet mounted. */
function sidebarRoot(): HTMLElement | undefined {
  const column = document.querySelector<HTMLElement>('[data-pane="sidebar"], [class*="sidebarCol"]')
  if (column === null) return undefined
  // Current shells wrap the sidebar UI: column > wrapper > root(logoRow owner).
  // Prefer the element that owns the logo row — the real sidebar UI root —
  // and fall back to the column's first child for legacy shells.
  const logoOwner = column.querySelector<HTMLElement>('[class*="logoRow"]')?.parentElement
  return logoOwner ?? (column.firstElementChild as HTMLElement | undefined)
}

/** The New Session button: nested in the logo row on current shells, a direct child on legacy shells. */
function newSessionButton(root: HTMLElement): HTMLButtonElement | undefined {
  const nested = root.querySelector<HTMLButtonElement>('button[class*="newSession"]')
  if (nested !== null) return nested
  for (const child of root.children) {
    if (child.tagName === 'BUTTON') return child as HTMLButtonElement
  }
  return undefined
}

/** Build one entry row (a detached button; inserted once the shell is up). */
function createEntry(tab: ExtensionTab, controller: PanelController): HTMLButtonElement {
  const entry = document.createElement('button')
  entry.type = 'button'
  entry.dataset.dshExtensionEntry = tab
  entry.className = css.entry
  const definition = ENTRIES.find((item) => item.tab === tab)!
  const label = tt(definition.labelKey)
  entry.setAttribute('aria-label', label)
  entry.setAttribute('title', tt(definition.tooltipKey))
  entry.innerHTML = '<span class="' + css.entryIcon + '">' + ICONS[tab] + '</span><span class="' + css.entryLabel + '">' + label + '</span>'
  entry.addEventListener('click', () => { controller.toggle(tab) })
  return entry
}

/** Re-insert the rows after the New Session row (before the browser region). */
function placeEntries(root: HTMLElement, entries: HTMLButtonElement[]): boolean {
  const button = newSessionButton(root)
  if (button === undefined) return false
  for (const entry of entries) {
    if (entry.parentElement !== root) {
      // Current shells nest the button inside the logo row: insert after that
      // row. Legacy shells keep the button as a direct child: insert after it.
      const row = button.closest('[class*="logoRow"]')
      if (row !== null && row.parentElement === root) {
        root.insertBefore(entry, row.nextElementSibling)
      } else if (button.parentElement === root) {
        root.insertBefore(entry, button.nextElementSibling)
      } else {
        root.appendChild(entry)
      }
    }
  }
  return true
}

/**
 * Mount both sidebar entries, waiting for the shell to render and
 * self-healing on later React re-renders.
 * @param controller - the panel controller the entries toggle.
 * @returns disposer removing the entries and their observers.
 */
export function mountSidebarEntries(controller: PanelController): () => void {
  const entries = ENTRIES.map(({ tab }) => createEntry(tab, controller))
  const byTab = new Map<ExtensionTab, HTMLButtonElement>(ENTRIES.map(({ tab }, index) => [tab, entries[index]]))
  let root: HTMLElement | undefined
  let placed = false

  const tryPlace = (): void => {
    if (placed) return
    if (root !== undefined && !root.isConnected) {
      // The shell re-created the sidebar pane; re-query from scratch.
      rootObserver.disconnect()
      root = undefined
    }
    root ??= sidebarRoot()
    if (root === undefined) return
    placed = placeEntries(root, entries)
    if (placed) rootObserver.observe(root, { childList: true, subtree: true })
  }

  // The shell renders after boot settlement; watch for its arrival.
  const waitObserver = new MutationObserver(() => { tryPlace() })
  waitObserver.observe(document.body, { childList: true, subtree: true })

  // Self-heal: if a React re-render displaces a row, re-insert it in the
  // same frame (microtask before paint -> no visible flicker).
  const rootObserver = new MutationObserver(() => {
    if (root === undefined || !root.isConnected) {
      placed = false
      tryPlace()
      return
    }
    const current = root
    if (entries.some((entry) => !current.contains(entry))) {
      placed = placeEntries(current, entries)
    }
  })

  // Reflect the panel's open state on the matching row (active highlight).
  // removeAttribute on close: assigning undefined to dataset stores the
  // string "undefined", which the presence-matched [data-active] CSS still
  // highlights — every entry would look selected after any panel toggle.
  const applyEntryStates = (): void => {
    const current = controller.getSnapshot()
    for (const [tab, entry] of byTab) {
      if (current.panelOpen && current.tab === tab) entry.setAttribute('data-active', 'true')
      else entry.removeAttribute('data-active')
    }
  }
  const unsubscribe = controller.subscribe(applyEntryStates)

  tryPlace()

  return () => {
    waitObserver.disconnect()
    rootObserver.disconnect()
    unsubscribe()
    for (const entry of entries) entry.remove()
  }
}
