import { useState, type FormEvent } from 'react'
import type { ConnectorEditorDraft, DesktopBridge } from '../bridge.ts'
import { tt } from '../helpers.ts'
import css from './panel.module.css'

export function ConnectorEditor({ draft, bridge, onClose, onSaved }: {
  draft: ConnectorEditorDraft
  bridge: DesktopBridge
  onClose: () => void
  onSaved: () => void
}) {
  const [configuration, setConfiguration] = useState(JSON.stringify(draft.configuration, null, 2))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setBusy(true)
    setError('')
    try {
      const parsed: unknown = JSON.parse(configuration)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('connector-edit-invalid')
      const credentials = Object.fromEntries(draft.credentials.map(item => [item.slot, String(data.get(`credential-${item.slot}`) ?? '')]))
      await bridge.updateConnectorConfiguration!(draft.id, { revision: draft.revision, configuration: parsed as Record<string, unknown>, credentials })
      form.reset()
      onSaved()
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : ''
      setError(tt(message.includes('connector-edit-stale') ? 'connectors.edit.stale' : message.includes('connector-edit-reenter-credentials') ? 'connectors.edit.reenter' : 'connectors.edit.failed'))
    } finally { setBusy(false) }
  }
  return <div className={css.connectorOverlay} role="dialog" aria-modal="true" aria-labelledby="connector-editor-title">
    <form className={`${css.connectorDialog} ${css.studioForm}`} onSubmit={event => { void save(event) }}>
      <header className={css.connectorDialogHeader}>
        <h3 id="connector-editor-title">{tt('connectors.edit.title')}</h3>
        <button type="button" className={css.secondaryButton} disabled={busy} onClick={onClose}>{tt('common.close')}</button>
      </header>
      <div className={css.connectorDialogBody}>
        <p className={css.formHint}>{tt('connectors.edit.hint')}</p>
        <label>{tt('connectors.edit.configuration')}<textarea rows={12} value={configuration} disabled={busy} onChange={event => setConfiguration(event.target.value)} spellCheck={false} /></label>
        {draft.credentials.map(item => <label key={item.slot}>{item.label} — {tt(item.configured ? 'connectors.edit.keep' : 'connectors.edit.missing')}
          <input name={`credential-${item.slot}`} type="password" autoComplete="new-password" disabled={busy} />
        </label>)}
        {error && <p role="alert" className={css.health} data-error="true">{error}</p>}
      </div>
      <footer className={css.connectorDialogFooter}><button type="submit" className={css.primaryButton} disabled={busy}>{tt('connectors.edit.save')}</button></footer>
    </form>
  </div>
}
