/**
 * Extension-center panel controller: the single owner of the panel's
 * open/closed state and the active tab.
 *
 * Framework-free (dsh-ssh PanelController style) so the DOM mounts and the
 * React panel share one tiny subscription surface. The state lives only for
 * the browser session (no persistence).
 */

/** The two center tabs; each also owns one sidebar entry. */
export type ExtensionTab = 'skills' | 'connectors'

/** Immutable controller snapshot for UI subscriptions. */
export interface PanelControllerSnapshot {
  panelOpen: boolean
  tab: ExtensionTab
}

/** The panel state owner the sidebar entries toggle and the view renders from. */
export class PanelController {
  private panelOpen = false
  private tab: ExtensionTab = 'skills'
  private listeners = new Set<() => void>()
  /** Cached snapshot: useSyncExternalStore requires a stable reference between state changes. */
  private snapshot: PanelControllerSnapshot = { panelOpen: false, tab: 'skills' }

  /** Stable callback for React useSyncExternalStore (must retain this instance). */
  getSnapshot = (): PanelControllerSnapshot => {
    return this.snapshot
  }

  /** Stable callback for React useSyncExternalStore (must retain this instance). */
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  /** Open the panel on a tab (reopening on the same tab is a no-op). */
  open(tab: ExtensionTab): void {
    const changed = !this.panelOpen || this.tab !== tab
    if (!changed) return
    this.panelOpen = true
    this.tab = tab
    this.notify()
  }

  close(): void {
    if (!this.panelOpen) return
    this.panelOpen = false
    this.notify()
  }

  /** Toggle from an entry click: open on its tab, or close when already there. */
  toggle(tab: ExtensionTab): void {
    if (this.panelOpen && this.tab === tab) this.close()
    else this.open(tab)
  }

  private notify(): void {
    this.snapshot = { panelOpen: this.panelOpen, tab: this.tab }
    for (const fn of [...this.listeners]) fn()
  }
}
