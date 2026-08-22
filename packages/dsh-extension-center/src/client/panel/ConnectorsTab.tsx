/**
 * The Connectors tab: the connector registry list, the custom-connector form
 * (kind/transport dependent fields), health checks, and removal. Ports the
 * dock's connector surface; validation is host-side and surfaces via toasts.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  buildConnectorInput,
  connectorEndpoint,
  type ConnectorCheckResult,
  type ConnectorRecord,
  type DesktopBridge,
} from '../bridge.ts'
import { errorMessage, tt } from '../helpers.ts'
import type { PanelToast } from './ExtensionPanel.tsx'
import css from './panel.module.css'

/** Health state per connector id (absent = never checked). */
type HealthMap = Record<string, ConnectorCheckResult>

/** Props for the Connectors tab. */
export interface ConnectorsTabProps {
  bridge: DesktopBridge
  refreshKey: number
  notify: (message: string, error?: boolean) => void
}

/** The Connectors tab component. */
export function ConnectorsTab({ bridge, refreshKey, notify }: ConnectorsTabProps) {
  const [connectors, setConnectors] = useState<ConnectorRecord[] | null>(null)
  const [health, setHealth] = useState<HealthMap>({})
  const [formOpen, setFormOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [kind, setKind] = useState<'mcp' | 'http'>('mcp')
  const [transport, setTransport] = useState<'stdio' | 'streamable-http'>('stdio')

  const mcp = kind === 'mcp'
  const remote = !mcp || transport !== 'stdio'

  const load = useCallback(async (): Promise<void> => {
    try {
      setConnectors(await bridge.listConnectors())
    } catch (error) {
      notify(errorMessage(error), true)
    }
  }, [bridge, notify])

  useEffect(() => { void load() }, [load, refreshKey])

  const onSave = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const form = event.currentTarget
    const values = Object.fromEntries(new FormData(form))
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
      form.reset()
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
      setBusy(false)
    }
  }

  return (
    <div className={css.tabBody}>
      <div className={css.toolbar}>
        <button type="button" className={css.primaryButton} disabled={busy} onClick={() => { setFormOpen((open) => !open) }}>
          {tt('connectors.create')}
        </button>
      </div>

      {formOpen && (
        <form className={css.studioForm} onSubmit={(event) => { void onSave(event) }}>
          <div className={css.formGridThree}>
            <label>
              {tt('connectors.form.id')}
              <input name="id" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder={tt('connectors.form.id.placeholder')} />
            </label>
            <label>
              {tt('connectors.form.name')}
              <input name="name" required placeholder={tt('connectors.form.name.placeholder')} />
            </label>
            <label>
              {tt('connectors.form.kind')}
              <select value={kind} onChange={(event) => { setKind(event.target.value === 'http' ? 'http' : 'mcp') }}>
                <option value="mcp">{tt('connectors.form.kind.mcp')}</option>
                <option value="http">{tt('connectors.form.kind.http')}</option>
              </select>
            </label>
          </div>
          <label>
            {tt('connectors.form.description')}
            <input name="description" placeholder={tt('connectors.form.description.placeholder')} />
          </label>
          {mcp && (
            <label>
              {tt('connectors.form.transport')}
              <select value={transport} onChange={(event) => { setTransport(event.target.value === 'streamable-http' ? 'streamable-http' : 'stdio') }}>
                <option value="stdio">{tt('connectors.form.transport.stdio')}</option>
                <option value="streamable-http">{tt('connectors.form.transport.http')}</option>
              </select>
            </label>
          )}
          {mcp && !remote && (
            <>
              <label>
                {tt('connectors.form.command')}
                <input name="command" placeholder={tt('connectors.form.command.placeholder')} />
              </label>
              <label>
                {tt('connectors.form.args')}
                <textarea name="args" rows={3} placeholder={tt('connectors.form.args.placeholder')} />
              </label>
            </>
          )}
          {remote && (
            <label>
              {tt('connectors.form.url')}
              <input name="url" type="url" required placeholder={tt('connectors.form.url.placeholder')} />
            </label>
          )}
          <div className={css.formGrid}>
            <label>
              {tt('connectors.form.capabilities')}
              <input name="capabilities" placeholder={tt('connectors.form.capabilities.placeholder')} />
            </label>
            <label>
              {tt('connectors.form.secrets')}
              <input name="secretEnvKeys" placeholder={tt('connectors.form.secrets.placeholder')} />
            </label>
          </div>
          <div className={css.formFooter}>
            <span>{tt('connectors.form.hint')}</span>
            <button type="submit" disabled={busy}>{tt('connectors.form.submit')}</button>
          </div>
        </form>
      )}

      {connectors === null ? (
        <p className={css.empty}>{tt('common.loading')}</p>
      ) : connectors.length === 0 ? (
        <p className={css.empty}>{tt('connectors.empty')}</p>
      ) : (
        <div className={css.list} aria-live="polite">
          {connectors.map((connector) => {
            const endpoint = connectorEndpoint(connector)
            const checked = health[connector.id]
            return (
              <article key={connector.id} className={css.item}>
                <div className={css.itemBody}>
                  <div className={css.nameRow}>
                    <span className={css.name}>{connector.name}</span>
                    <span className={css.badge}>
                      {connector.kind === 'mcp'
                        ? tt('connectors.type.mcp', { transport: connector.transport })
                        : tt('connectors.type.http')}
                    </span>
                  </div>
                  <p className={css.description}>{connector.description || endpoint}</p>
                  <p
                    className={css.health}
                    data-error={checked !== undefined && !checked.ok ? 'true' : undefined}
                  >
                    {checked !== undefined ? checked.detail : tt('connectors.unchecked', { endpoint })}
                  </p>
                </div>
                <div className={css.itemActions}>
                  <button type="button" className={css.secondaryButton} disabled={busy} onClick={() => { void onCheck(connector.id) }}>
                    {tt('connectors.check')}
                  </button>
                  <button type="button" className={css.dangerButton} disabled={busy} onClick={() => { void onRemove(connector.id) }}>
                    {tt('connectors.remove')}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
