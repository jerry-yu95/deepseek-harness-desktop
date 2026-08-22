/**
 * Connector catalog and registry. The normal path is provider JSON preview ->
 * replace only missing credentials -> encrypted desktop import. The old
 * low-level form remains under the explicit advanced button.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  buildConnectorInput,
  connectorEndpoint,
  type ConnectorCheckResult,
  type ConnectorRecord,
  type DesktopBridge,
  type McpJsonImportInput,
  type McpJsonPreview,
} from '../bridge.ts'
import { CONNECTOR_PRESETS, type ConnectorPreset } from '../catalog.ts'
import { errorMessage, tt } from '../helpers.ts'
import css from './panel.module.css'

type HealthMap = Record<string, ConnectorCheckResult>
type ImportSource = NonNullable<McpJsonImportInput['source']>

export interface ConnectorsTabProps {
  bridge: DesktopBridge
  refreshKey: number
  notify: (message: string, error?: boolean) => void
}

export function ConnectorsTab({ bridge, refreshKey, notify }: ConnectorsTabProps) {
  const [connectors, setConnectors] = useState<ConnectorRecord[] | null>(null)
  const [health, setHealth] = useState<HealthMap>({})
  const [catalogOpen, setCatalogOpen] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const [preview, setPreview] = useState<McpJsonPreview | null>(null)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [secretValues, setSecretValues] = useState<Record<string, string>>({})
  const [conflict, setConflict] = useState<'reject' | 'replace' | 'rename'>('reject')
  const [importSource, setImportSource] = useState<ImportSource>({ kind: 'json' })
  const [busy, setBusy] = useState(false)
  const [kind, setKind] = useState<'mcp' | 'http'>('mcp')
  const [transport, setTransport] = useState<'stdio' | 'streamable-http'>('stdio')

  const mcp = kind === 'mcp'
  const remote = !mcp || transport !== 'stdio'
  const canImportJson = typeof bridge.previewMcpJson === 'function' && typeof bridge.importMcpJson === 'function'

  const load = useCallback(async (): Promise<void> => {
    try {
      setConnectors(await bridge.listConnectors())
    } catch (error) {
      notify(errorMessage(error), true)
    }
  }, [bridge, notify])

  useEffect(() => { void load() }, [load, refreshKey])

  const previewJson = useCallback(async (text: string, source: ImportSource = { kind: 'json' }): Promise<void> => {
    if (!canImportJson || bridge.previewMcpJson === undefined) {
      notify(tt('connectors.import.desktopRequired'), true)
      return
    }
    setImportSource(source)
    setJsonText(text)
    setImportOpen(true)
    setPreview(null)
    setSecretValues({})
    setBusy(true)
    try {
      const result = await bridge.previewMcpJson(text)
      setPreview(result)
      setSelected(Object.fromEntries(result.servers.map((server) => [server.sourceName, true])))
    } catch (error) {
      notify(errorMessage(error), true)
    } finally {
      setBusy(false)
    }
  }, [bridge, canImportJson, notify])

  const onPreviewSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    await previewJson(jsonText, importSource)
  }

  const onImport = async (): Promise<void> => {
    if (preview === null || bridge.importMcpJson === undefined) return
    const selectedNames = preview.servers.filter((server) => selected[server.sourceName]).map((server) => server.sourceName)
    if (selectedNames.length === 0) {
      notify(tt('connectors.import.selectOne'), true)
      return
    }
    const missing = preview.servers
      .filter((server) => selected[server.sourceName])
      .flatMap((server) => server.secretSlots)
      .filter((slot) => !slot.detected && !(secretValues[slot.credentialRef] ?? '').trim())
    if (missing.length > 0) {
      notify(tt('connectors.import.missingSecret', { name: missing[0].credentialRef }), true)
      return
    }
    setBusy(true)
    try {
      const result = await bridge.importMcpJson({
        text: jsonText,
        selectedNames,
        conflict,
        secrets: Object.fromEntries(Object.entries(secretValues).filter(([, value]) => value.trim().length > 0)),
        source: importSource,
      })
      notify(tt('connectors.imported', { count: result.imported.length }))
      setImportOpen(false)
      setJsonText('')
      setPreview(null)
      setSelected({})
      setSecretValues({})
      await load()
    } catch (error) {
      notify(errorMessage(error), true)
    } finally {
      setBusy(false)
    }
  }

  const onSave = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget))
    setBusy(true)
    try {
      const connector = await bridge.saveConnector(buildConnectorInput({
        id: String(values.id ?? ''),
        name: String(values.name ?? ''),
        description: String(values.description ?? ''),
        kind,
        transport,
        url: String(values.url ?? ''),
        command: String(values.command ?? ''),
        args: String(values.args ?? ''),
        capabilities: String(values.capabilities ?? ''),
        secretEnvKeys: String(values.secretEnvKeys ?? ''),
      }))
      notify(tt('connectors.saved', { name: connector.name }))
      event.currentTarget.reset()
      setKind('mcp')
      setTransport('stdio')
      setFormOpen(false)
      await load()
    } catch (error) {
      notify(errorMessage(error), true)
    } finally {
      setBusy(false)
    }
  }

  const onCheck = async (id: string): Promise<void> => {
    setBusy(true)
    try {
      const result = await bridge.checkConnector(id)
      setHealth((map) => ({ ...map, [id]: result }))
    } catch (error) {
      notify(errorMessage(error), true)
    } finally {
      setBusy(false)
    }
  }

  const onRemove = async (id: string): Promise<void> => {
    setBusy(true)
    try {
      await bridge.removeConnector(id)
      notify(tt('connectors.removed'))
      setHealth((map) => {
        const next = { ...map }
        delete next[id]
        return next
      })
      await load()
    } catch (error) {
      notify(errorMessage(error), true)
    } finally {
      setBusy(false)
    }
  }

  const renderPreset = (preset: ConnectorPreset) => (
    <article key={preset.id} className={css.catalogItem}>
      <div className={css.catalogBody}>
        <div className={css.nameRow}>
          <span className={css.name}>{preset.name}</span>
          <span className={css.badge}>{preset.status === 'ready' ? tt('connectors.catalog.official') : tt('connectors.catalog.pending')}</span>
        </div>
        <p className={css.description}>{preset.description}</p>
        <a className={css.catalogLink} href={preset.docsUrl} target="_blank" rel="noreferrer">{tt('connectors.catalog.docs')}</a>
      </div>
      {preset.json === undefined ? (
        <span className={css.catalogPending}>{tt('connectors.catalog.waiting')}</span>
      ) : (
        <button type="button" className={css.secondaryButton} disabled={busy || !canImportJson} onClick={() => { void previewJson(preset.json!, { kind: 'preset', presetId: preset.id }) }}>
          {tt('connectors.catalog.use')}
        </button>
      )}
    </article>
  )

  return (
    <div className={css.tabBody}>
      <div className={css.toolbar}>
        <button type="button" className={css.primaryButton} disabled={busy} onClick={() => { setCatalogOpen((open) => !open) }}>{tt('connectors.catalog.title')}</button>
        <button type="button" className={css.secondaryButton} disabled={busy || !canImportJson} onClick={() => { setImportSource({ kind: 'json' }); setJsonText(''); setPreview(null); setImportOpen(true) }}>{tt('connectors.import.open')}</button>
        <button type="button" className={css.secondaryButton} disabled={busy} onClick={() => { setFormOpen((open) => !open) }}>{tt('connectors.create')}</button>
      </div>

      {catalogOpen && <section className={css.catalog}><h3 className={css.sectionTitle}>{tt('connectors.catalog.title')}</h3>{CONNECTOR_PRESETS.map(renderPreset)}</section>}

      {importOpen && (
        <section className={css.studioForm}>
          <div className={css.formHeader}>
            <div><h3 className={css.sectionTitle}>{tt('connectors.import.title')}</h3><p className={css.formHint}>{tt('connectors.import.hint')}</p></div>
            <button type="button" className={css.secondaryButton} disabled={busy} onClick={() => { setImportOpen(false) }}>{tt('common.close')}</button>
          </div>
          <form onSubmit={(event) => { void onPreviewSubmit(event) }}>
            <label>{tt('connectors.import.jsonLabel')}<textarea value={jsonText} onChange={(event) => { setJsonText(event.target.value); setPreview(null) }} rows={8} placeholder={tt('connectors.import.jsonPlaceholder')} /></label>
            <div className={css.formFooter}><span>{tt('connectors.import.noSecret')}</span><button type="submit" disabled={busy || jsonText.trim().length === 0}>{tt('connectors.import.preview')}</button></div>
          </form>
          {preview !== null && (
            <div className={css.importPreview}>
              <div className={css.formHeader}><strong>{tt('connectors.import.servers', { count: preview.servers.length })}</strong><label className={css.inlineLabel}><input type="checkbox" checked={preview.servers.every((server) => selected[server.sourceName])} onChange={(event) => { setSelected(Object.fromEntries(preview.servers.map((server) => [server.sourceName, event.target.checked]))) }} /> {tt('connectors.import.selectAll')}</label></div>
              {preview.servers.map((server) => (
                <div key={server.sourceName} className={css.importServer}>
                  <label className={css.importServerHeader}><input type="checkbox" checked={Boolean(selected[server.sourceName])} onChange={(event) => { setSelected((items) => ({ ...items, [server.sourceName]: event.target.checked })) }} /><strong>{server.sourceName}</strong><span className={css.badge}>{server.transport}</span><span className={css.description}>{server.command ? connectorEndpoint({ kind: 'mcp', transport: 'stdio', command: server.command, args: server.args }) : server.url}</span></label>
                  {selected[server.sourceName] && server.secretSlots.map((slot) => (
                    <label key={slot.credentialRef} className={css.secretRow}>
                      {slot.detected ? <span>{tt('connectors.import.detected', { name: slot.credentialRef })}</span> : <><span>{tt('connectors.import.secret', { name: slot.placeholder ?? slot.credentialRef })}</span><input type="password" autoComplete="off" value={secretValues[slot.credentialRef] ?? ''} onChange={(event) => { setSecretValues((values) => ({ ...values, [slot.credentialRef]: event.target.value })) }} /></>}
                    </label>
                  ))}
                </div>
              ))}
              <div className={css.formFooter}><label>{tt('connectors.import.conflict')} <select value={conflict} onChange={(event) => { setConflict(event.target.value as typeof conflict) }}><option value="reject">{tt('connectors.import.conflict.reject')}</option><option value="replace">{tt('connectors.import.conflict.replace')}</option><option value="rename">{tt('connectors.import.conflict.rename')}</option></select></label><button type="button" className={css.primaryButton} disabled={busy} onClick={() => { void onImport() }}>{tt('connectors.import.submit')}</button></div>
            </div>
          )}
        </section>
      )}

      {formOpen && (
        <form className={css.studioForm} onSubmit={(event) => { void onSave(event) }}>
          <p className={css.studioSummary}>{tt('connectors.advanced.title')}</p>
          <div className={css.formGridThree}><label>{tt('connectors.form.id')}<input name="id" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder={tt('connectors.form.id.placeholder')} /></label><label>{tt('connectors.form.name')}<input name="name" required placeholder={tt('connectors.form.name.placeholder')} /></label><label>{tt('connectors.form.kind')}<select value={kind} onChange={(event) => { setKind(event.target.value === 'http' ? 'http' : 'mcp') }}><option value="mcp">{tt('connectors.form.kind.mcp')}</option><option value="http">{tt('connectors.form.kind.http')}</option></select></label></div>
          <label>{tt('connectors.form.description')}<input name="description" placeholder={tt('connectors.form.description.placeholder')} /></label>
          {mcp && <label>{tt('connectors.form.transport')}<select value={transport} onChange={(event) => { setTransport(event.target.value === 'streamable-http' ? 'streamable-http' : 'stdio') }}><option value="stdio">{tt('connectors.form.transport.stdio')}</option><option value="streamable-http">{tt('connectors.form.transport.http')}</option></select></label>}
          {mcp && !remote && <><label>{tt('connectors.form.command')}<input name="command" placeholder={tt('connectors.form.command.placeholder')} /></label><label>{tt('connectors.form.args')}<textarea name="args" rows={3} placeholder={tt('connectors.form.args.placeholder')} /></label></>}
          {remote && <label>{tt('connectors.form.url')}<input name="url" type="url" required placeholder={tt('connectors.form.url.placeholder')} /></label>}
          <div className={css.formGrid}><label>{tt('connectors.form.capabilities')}<input name="capabilities" placeholder={tt('connectors.form.capabilities.placeholder')} /></label><label>{tt('connectors.form.secrets')}<input name="secretEnvKeys" placeholder={tt('connectors.form.secrets.placeholder')} /></label></div>
          <div className={css.formFooter}><span>{tt('connectors.form.hint')}</span><button type="submit" disabled={busy}>{tt('connectors.form.submit')}</button></div>
        </form>
      )}

      {connectors === null ? <p className={css.empty}>{tt('common.loading')}</p> : connectors.length === 0 ? <p className={css.empty}>{tt('connectors.empty')}</p> : <div className={css.list} aria-live="polite">
        {connectors.map((connector) => {
          const endpoint = connectorEndpoint(connector)
          const checked = health[connector.id]
          return <article key={connector.id} className={css.item}><div className={css.itemBody}><div className={css.nameRow}><span className={css.name}>{connector.name}</span><span className={css.badge}>{connector.kind === 'mcp' ? tt('connectors.type.mcp', { transport: connector.transport }) : tt('connectors.type.http')}</span></div><p className={css.description}>{connector.description || endpoint}</p><p className={css.health} data-error={checked !== undefined && !checked.ok ? 'true' : undefined}>{checked !== undefined ? checked.detail : tt('connectors.unchecked', { endpoint })}</p></div><div className={css.itemActions}><button type="button" className={css.secondaryButton} disabled={busy} onClick={() => { void onCheck(connector.id) }}>{tt('connectors.check')}</button><button type="button" className={css.dangerButton} disabled={busy} onClick={() => { void onRemove(connector.id) }}>{tt('connectors.remove')}</button></div></article>
        })}
      </div>}
    </div>
  )
}
