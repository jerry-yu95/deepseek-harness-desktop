/**
 * The extension-center panel shell: header, tab bar, desktop-only notice,
 * and toast host. The tab state lives in the PanelController (shared with
 * the sidebar entries) so both surfaces always agree.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { DesktopBridge } from '../bridge.ts'
import { tt } from '../helpers.ts'
import type { ExtensionTab, PanelController } from './controller.ts'
import { SkillsTab } from './SkillsTab.tsx'
import { ConnectorsTab } from './ConnectorsTab.tsx'
import css from './panel.module.css'

/** Toast message shown at the panel bottom; auto-clears after 4s. */
export interface PanelToast {
  message: string
  error: boolean
}

/** Props for the panel shell. */
export interface ExtensionPanelProps {
  controller: PanelController
  bridge: DesktopBridge | undefined
}

/** The panel shell component. */
export function ExtensionPanel({ controller, bridge }: ExtensionPanelProps) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const [toast, setToast] = useState<PanelToast | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>()

  const notify = useCallback((message: string, error = false) => {
    setToast({ message, error })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => { setToast(null) }, 4_000)
  }, [])

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const tabs: ReadonlyArray<{ id: ExtensionTab; label: () => string }> = [
    { id: 'skills', label: () => tt('tab.skills') },
    { id: 'connectors', label: () => tt('tab.connectors') },
  ]

  return (
    <div className={css.panel}>
      <header className={css.panelHeader}>
        <h2 className={css.panelTitle}>{tt('panel.title')}</h2>
        <div className={css.headerActions}>
          {bridge !== undefined && (
            <button type="button" className={css.secondaryButton} onClick={() => { setRefreshKey((key) => key + 1) }}>
              {tt('common.refresh')}
            </button>
          )}
          <button type="button" className={css.secondaryButton} onClick={() => { controller.close() }}>
            {tt('common.close')}
          </button>
        </div>
      </header>

      <nav className={css.tabBar}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={css.tab}
            data-active={snapshot.panelOpen && snapshot.tab === tab.id ? 'true' : undefined}
            onClick={() => { controller.open(tab.id) }}
          >
            {tab.label()}
          </button>
        ))}
      </nav>

      <div className={css.panelContent}>
        {bridge === undefined ? (
          <section className={css.notice}>
            <h3>{tt('desktopOnly.title')}</h3>
            <p>{tt('desktopOnly.body')}</p>
          </section>
        ) : snapshot.tab === 'skills' ? (
          <SkillsTab bridge={bridge} refreshKey={refreshKey} notify={notify} />
        ) : (
          <ConnectorsTab bridge={bridge} refreshKey={refreshKey} notify={notify} />
        )}
      </div>

      {toast !== null && (
        <div className={css.toast} data-error={toast.error ? 'true' : undefined} role={toast.error ? 'alert' : 'status'}>
          {toast.message}
        </div>
      )}
    </div>
  )
}
