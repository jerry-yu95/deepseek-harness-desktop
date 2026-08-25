/**
 * Connector catalog and registry. The normal path is provider template or
 * official JSON -> preview -> fill only missing credentials -> encrypted
 * desktop import. Low-level fields remain available under Custom connector.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  buildConnectorInput,
  canPreviewMcpClientSource,
  connectorAuthAction,
  connectorAuthProvider,
  connectorEndpoint,
  mcpCredentialLabel,
  missingMcpCredentials,
  selectedMcpRequiresLocalExecution,
  selectedMcpServerNames,
  type ConnectorCheckResult,
  type ConnectorAuthorizationStatus,
  type ConnectorRecord,
  type DesktopBridge,
  type McpJsonImportInput,
  type McpJsonPreview,
  type McpClientSourceStatus,
  type McpClientSourceStage,
  type McpClientSourceSummary,
  splitComma,
} from '../bridge.ts'
import { CONNECTOR_PRESETS, type ConnectorPreset } from '../catalog.ts'
import { errorMessage, tt } from '../helpers.ts'
import css from './panel.module.css'

type HealthMap = Record<string, ConnectorCheckResult>
type ImportSource = NonNullable<McpJsonImportInput['source']>
type AuthForm = { mode: 'oauth' | 'pat' | 'official-cli' | 'app-credentials'; token: string; appId: string; appSecret: string; domain: string; profiles: string; baseUrl: string; clientId: string; scopes: string }

const CLIENT_NAMES: Record<string, string> = {
  workbuddy: 'WorkBuddy',
  codebuddy: 'CodeBuddy',
  trae: 'TRAE',
  qoder: 'Qoder',
}

function sourceStatusText(status: McpClientSourceStatus, count: number): string {
  if (status === 'available') return tt('connectors.sources.status.available', { count })
  if (status === 'empty') return tt('connectors.sources.status.empty')
  if (status === 'invalid') return tt('connectors.sources.status.invalid')
  if (status === 'manual') return tt('connectors.sources.status.manual')
  return tt('connectors.sources.status.notFound')
}

function sourceDescription(clientId: string): string {
  if (clientId === 'workbuddy') return tt('connectors.sources.workbuddy')
  if (clientId === 'codebuddy') return tt('connectors.sources.codebuddy')
  if (clientId === 'trae') return tt('connectors.sources.trae')
  return tt('connectors.sources.qoder')
}

function diagnosticLabel(id: NonNullable<ConnectorCheckResult['checks']>[number]['id']): string {
  if (id === 'configuration') return tt('connectors.diagnostics.configuration')
  if (id === 'credentials') return tt('connectors.diagnostics.credentials')
  if (id === 'runtime') return tt('connectors.diagnostics.runtime')
  return tt('connectors.diagnostics.registration')
}

export interface ConnectorsTabProps {
  bridge: DesktopBridge
  refreshKey: number
  notify: (message: string, error?: boolean) => void
}

function friendlyImportError(error: unknown): string {
  const message = errorMessage(error)
  if (message.includes('local-command-trust-required')) return tt('connectors.import.localTrustRequired')
  if (message.startsWith('connector-conflict:')) {
    return tt('connectors.import.conflictError', { name: message.slice('connector-conflict:'.length) })
  }
  return message
}

export function ConnectorsTab({ bridge, refreshKey, notify }: ConnectorsTabProps) {
  const [connectors, setConnectors] = useState<ConnectorRecord[] | null>(null)
  const [health, setHealth] = useState<HealthMap>({})
  const [authStatuses, setAuthStatuses] = useState<Record<string, ConnectorAuthorizationStatus>>({})
  const [authConnector, setAuthConnector] = useState<ConnectorRecord | null>(null)
  const [authForm, setAuthForm] = useState<AuthForm>({ mode: 'oauth', token: '', appId: '', appSecret: '', domain: 'https://open.feishu.cn', profiles: 'dingtalk-contacts', baseUrl: 'https://gitlab.com', clientId: '', scopes: '' })
  const [catalogOpen, setCatalogOpen] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false)
  const [clientSources, setClientSources] = useState<McpClientSourceSummary[] | null>(null)
  const [stagedSource, setStagedSource] = useState<McpClientSourceStage | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const [preview, setPreview] = useState<McpJsonPreview | null>(null)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [secretValues, setSecretValues] = useState<Record<string, string>>({})
  const [conflict, setConflict] = useState<'reject' | 'replace' | 'rename'>('reject')
  const [importSource, setImportSource] = useState<ImportSource>({ kind: 'json' })
  const [importError, setImportError] = useState<string | null>(null)
  const [localCommandTrusted, setLocalCommandTrusted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [kind, setKind] = useState<'mcp' | 'http'>('mcp')
  const [transport, setTransport] = useState<'stdio' | 'streamable-http'>('stdio')
  const secretInputs = useRef<Record<string, HTMLInputElement | null>>({})

  const mcp = kind === 'mcp'
  const remote = !mcp || transport !== 'stdio'
  const canImportJson = typeof bridge.previewMcpJson === 'function' && typeof bridge.importMcpJson === 'function'
  const canImportClientSource = typeof bridge.listMcpClientSources === 'function'
    && typeof bridge.previewMcpClientSource === 'function'
    && typeof bridge.pickMcpClientSource === 'function'
    && typeof bridge.importMcpClientSource === 'function'
  const selectedNames = preview === null ? [] : selectedMcpServerNames(preview, selected)
  const missingSecrets = preview === null ? [] : missingMcpCredentials(preview, selected, secretValues)
  const requiresLocalExecution = preview !== null && selectedMcpRequiresLocalExecution(preview, selected)

  const load = useCallback(async (): Promise<void> => {
    try {
      const next = await bridge.listConnectors()
      setConnectors(next)
      if (bridge.getConnectorAuthorizationStatus !== undefined) {
        const statuses = await Promise.all(next.filter((item) => connectorAuthProvider(item) !== undefined).map(async (item) => {
          try { return [item.id, await bridge.getConnectorAuthorizationStatus!(item.id)] as const } catch { return null }
        }))
        setAuthStatuses((current) => ({ ...current, ...Object.fromEntries(statuses.filter((item): item is Exclude<typeof item, null> => item !== null)) }))
      }
    } catch (error) {
      notify(errorMessage(error), true)
    }
  }, [bridge, notify])

  const refreshAuthStatus = useCallback(async (connector: ConnectorRecord): Promise<ConnectorAuthorizationStatus | undefined> => {
    if (bridge.getConnectorAuthorizationStatus === undefined || connectorAuthProvider(connector) === undefined) return undefined
    try {
      const status = await bridge.getConnectorAuthorizationStatus(connector.id)
      setAuthStatuses((current) => ({ ...current, [connector.id]: status }))
      return status
    } catch (error) {
      notify(errorMessage(error), true)
      return undefined
    }
  }, [bridge, notify])

  const openAuthorization = (connector: ConnectorRecord): void => {
    const provider = connectorAuthProvider(connector)
    if (provider === undefined || bridge.authorizeConnector === undefined) {
      notify(tt('connectors.auth.desktopRequired'), true)
      return
    }
    const mode = provider === 'github' || provider === 'gitlab' ? 'oauth' : provider === 'feishu' ? 'official-cli' : 'app-credentials'
    setAuthForm((current) => ({ ...current, mode, token: '', appId: '', appSecret: '', profiles: 'dingtalk-contacts' }))
    setAuthConnector(connector)
  }

  const onAuthorize = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (authConnector === null || bridge.authorizeConnector === undefined) return
    const provider = connectorAuthProvider(authConnector)
    if (provider === undefined) return
    setBusy(true)
    setAuthStatuses((current) => ({ ...current, [authConnector.id]: { connectorId: authConnector.id, providerId: provider, mode: authForm.mode, state: 'authorizing' } }))
    try {
      const input = {
        mode: authForm.mode,
        ...(authForm.token ? { token: authForm.token } : {}),
        ...(authForm.appId ? { appId: authForm.appId } : {}),
        ...(authForm.appSecret ? { appSecret: authForm.appSecret } : {}),
        ...(authForm.domain ? { domain: authForm.domain } : {}),
        ...(authForm.profiles ? { profiles: splitComma(authForm.profiles) } : {}),
        ...(authForm.baseUrl ? { baseUrl: authForm.baseUrl } : {}),
        ...(authForm.clientId ? { clientId: authForm.clientId } : {}),
        ...(authForm.scopes ? { scopes: splitComma(authForm.scopes) } : {}),
      }
      const status = await bridge.authorizeConnector(authConnector.id, input)
      setAuthStatuses((current) => ({ ...current, [authConnector.id]: status }))
      if (status.state === 'ready') {
        notify(tt('connectors.auth.ready'))
        setAuthConnector(null)
      } else notify(tt('connectors.auth.failed', { detail: status.detailKey ?? status.state }), true)
    } catch (error) {
      notify(errorMessage(error), true)
      await refreshAuthStatus(authConnector)
    } finally {
      setBusy(false)
    }
  }

  const onAuthAction = async (connector: ConnectorRecord): Promise<void> => {
    const status = authStatuses[connector.id]
    const action = connectorAuthAction(status?.state)
    if (action === 'cancel') {
      if (bridge.cancelConnectorAuthorization === undefined) return
      setBusy(true)
      try {
        const next = await bridge.cancelConnectorAuthorization(connector.id)
        setAuthStatuses((current) => ({ ...current, [connector.id]: next }))
      } catch (error) { notify(errorMessage(error), true) } finally { setBusy(false) }
      return
    }
    if (action === 'disconnect') {
      if (bridge.disconnectConnector === undefined) return
      setBusy(true)
      try {
        const next = await bridge.disconnectConnector(connector.id)
        setAuthStatuses((current) => ({ ...current, [connector.id]: next }))
        notify(tt('connectors.auth.disconnected'))
      } catch (error) { notify(errorMessage(error), true) } finally { setBusy(false) }
      return
    }
    if (action === 'reauthorize' || action === 'authorize') openAuthorization(connector)
  }

  const onVerifyAuth = async (connector: ConnectorRecord): Promise<void> => {
    if (bridge.verifyConnectorAuthorization === undefined) return
    setBusy(true)
    try {
      const status = await bridge.verifyConnectorAuthorization(connector.id)
      setAuthStatuses((current) => ({ ...current, [connector.id]: status }))
      notify(status.state === 'ready' ? tt('connectors.auth.verified') : tt('connectors.auth.failed', { detail: status.detailKey ?? status.state }), status.state !== 'ready')
    } catch (error) { notify(errorMessage(error), true) } finally { setBusy(false) }
  }

  useEffect(() => { void load() }, [load, refreshKey])

  const closeImport = useCallback(() => {
    setImportOpen(false)
    setJsonText('')
    setPreview(null)
    setSelected({})
    setSecretValues({})
    setConflict('reject')
    setImportSource({ kind: 'json' })
    setStagedSource(null)
    setImportError(null)
    setLocalCommandTrusted(false)
    secretInputs.current = {}
  }, [])

  const openSourcePicker = useCallback(async (): Promise<void> => {
    if (!canImportClientSource || bridge.listMcpClientSources === undefined) {
      notify(tt('connectors.sources.desktopRequired'), true)
      return
    }
    setSourcePickerOpen(true)
    setClientSources(null)
    setImportError(null)
    setLocalCommandTrusted(false)
    setBusy(true)
    try {
      setClientSources(await bridge.listMcpClientSources())
    } catch (error) {
      setSourcePickerOpen(false)
      notify(errorMessage(error), true)
    } finally {
      setBusy(false)
    }
  }, [bridge, canImportClientSource, notify])

  const stageClientSource = useCallback((source: McpClientSourceStage): void => {
    setStagedSource(source)
    setJsonText('')
    setImportSource({ kind: 'json' })
    setPreview(source.preview)
    setSelected(Object.fromEntries(source.preview.servers.map((server) => [server.sourceName, true])))
    setSecretValues({})
    setConflict('reject')
    setImportError(null)
    setLocalCommandTrusted(false)
    setSourcePickerOpen(false)
    setImportOpen(true)
  }, [])

  const selectClientSource = useCallback(async (source: McpClientSourceSummary): Promise<void> => {
    if (bridge.previewMcpClientSource === undefined || bridge.pickMcpClientSource === undefined) return
    setBusy(true)
    setImportError(null)
    try {
      if (canPreviewMcpClientSource(source)) {
        stageClientSource(await bridge.previewMcpClientSource(source.clientId))
      } else {
        const picked = await bridge.pickMcpClientSource(source.clientId)
        if (!picked.canceled && picked.source !== undefined && picked.preview !== undefined) {
          stageClientSource(picked as McpClientSourceStage)
        }
      }
    } catch (error) {
      notify(friendlyImportError(error), true)
    } finally {
      setBusy(false)
    }
  }, [bridge, notify, stageClientSource])

  const openJsonImport = useCallback((source: ImportSource = { kind: 'json' }, replaceExisting = false) => {
    setImportSource(source)
    setJsonText('')
    setPreview(null)
    setSelected({})
    setSecretValues({})
    setImportError(null)
    setLocalCommandTrusted(false)
    setConflict(replaceExisting ? 'replace' : 'reject')
    setImportOpen(true)
  }, [])

  const previewJson = useCallback(async (text: string, source: ImportSource = { kind: 'json' }, replaceExisting = false): Promise<void> => {
    if (!canImportJson || bridge.previewMcpJson === undefined) {
      notify(tt('connectors.import.desktopRequired'), true)
      return
    }
    setImportSource(source)
    setJsonText(text)
    setImportOpen(true)
    setPreview(null)
    setSecretValues({})
    setImportError(null)
    setLocalCommandTrusted(false)
    setConflict(replaceExisting ? 'replace' : 'reject')
    setBusy(true)
    try {
      const result = await bridge.previewMcpJson(text)
      setPreview(result)
      setSelected(Object.fromEntries(result.servers.map((server) => [server.sourceName, true])))
    } catch (error) {
      setImportError(friendlyImportError(error))
    } finally {
      setBusy(false)
    }
  }, [bridge, canImportJson, notify])

  const onPreviewSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    await previewJson(jsonText, importSource, conflict === 'replace')
  }

  const onImport = async (): Promise<void> => {
    if (preview === null) return
    if (stagedSource === null && bridge.importMcpJson === undefined) return
    if (stagedSource !== null && bridge.importMcpClientSource === undefined) return
    if (selectedNames.length === 0) {
      setImportError(tt('connectors.import.selectOne'))
      return
    }
    if (missingSecrets.length > 0) {
      const first = missingSecrets[0]
      setImportError(tt('connectors.import.missingSecret', { name: mcpCredentialLabel(first) }))
      requestAnimationFrame(() => { secretInputs.current[first.credentialRef]?.focus() })
      return
    }
    if (requiresLocalExecution && !localCommandTrusted) {
      setImportError(tt('connectors.import.localTrustRequired'))
      return
    }
    setImportError(null)
    setBusy(true)
    try {
      const importOptions = {
        selectedNames,
        conflict,
        secrets: Object.fromEntries(Object.entries(secretValues).filter(([, value]) => value.trim().length > 0)),
        allowLocalCommand: localCommandTrusted,
      }
      const result = stagedSource === null
        ? await bridge.importMcpJson!({ text: jsonText, ...importOptions, source: importSource })
        : await bridge.importMcpClientSource!({ token: stagedSource.source.token, ...importOptions })
      await load()
      const checks = await Promise.all(result.imported.map(async (connector) => {
        try {
          return [connector.id, await bridge.checkConnector(connector.id)] as const
        } catch {
          return null
        }
      }))
      const completedChecks = checks.filter((check): check is Exclude<typeof check, null> => check !== null)
      if (completedChecks.length > 0) {
        setHealth((current) => ({ ...current, ...Object.fromEntries(completedChecks) }))
      }
      notify(tt('connectors.imported', { count: result.imported.length }))
      closeImport()
    } catch (error) {
      setImportError(friendlyImportError(error))
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

  const onToggleEnabled = async (connector: ConnectorRecord): Promise<void> => {
    if (bridge.setConnectorEnabled === undefined) return
    setBusy(true)
    try {
      const updated = await bridge.setConnectorEnabled(connector.id, connector.enabled === false)
      notify(updated.enabled ? tt('connectors.enabled', { name: updated.name }) : tt('connectors.disabled', { name: updated.name }))
      setHealth((map) => {
        const next = { ...map }
        delete next[connector.id]
        return next
      })
      await load()
    } catch (error) {
      notify(errorMessage(error), true)
    } finally {
      setBusy(false)
    }
  }

  const renderPreset = (preset: ConnectorPreset) => {
    const installed = connectors?.some((connector) => connector.source?.kind === 'preset' && connector.source.presetId === preset.id) ?? false
    const typeLabel = preset.integration === 'mcp-template'
      ? tt('connectors.catalog.official')
      : preset.integration === 'provider-json'
        ? tt('connectors.catalog.providerJson')
        : tt('connectors.catalog.officialSkill')
    const docsLabel = preset.documentation === 'official-mcp'
      ? tt('connectors.catalog.docsOfficialMcp')
      : preset.documentation === 'provider-config'
        ? tt('connectors.catalog.docsProviderConfig')
        : preset.documentation === 'official-skill'
          ? tt('connectors.catalog.docsOfficialSkill')
          : tt('connectors.catalog.docsOfficialApi')
    const verification = preset.integration === 'mcp-template'
      ? tt('connectors.catalog.verifiedTemplate')
      : preset.integration === 'provider-json'
        ? tt('connectors.catalog.verifiedProvider')
        : tt('connectors.catalog.verifiedSkill')
    return (
      <article key={preset.id} className={css.catalogItem}>
        <div className={css.catalogBody}>
          <div className={css.nameRow}>
            <span className={css.name}>{preset.name}</span>
            <span className={css.badge}>{typeLabel}</span>
            {installed && <span className={css.badge} data-success="true">{tt('connectors.catalog.installed')}</span>}
          </div>
          <p className={css.description}>{preset.description}</p>
          <div className={css.capabilityRow}>{preset.capabilities.map((capability) => <span key={capability}>{capability}</span>)}</div>
          <p className={css.providerLine}>{tt('connectors.catalog.provider', { provider: preset.provider })} · <a className={css.catalogLink} href={preset.docsUrl} target="_blank" rel="noreferrer">{docsLabel}</a></p>
          <p className={css.verificationLine}>{verification}</p>
        </div>
        {preset.integration === 'official-skill' ? (
          <a className={css.secondaryButton} href={preset.docsUrl} target="_blank" rel="noreferrer">{tt('connectors.catalog.openSkill')}</a>
        ) : preset.json === undefined ? (
          <button type="button" className={css.secondaryButton} disabled={busy || !canImportJson} onClick={() => { openJsonImport({ kind: 'preset', presetId: preset.id }, installed) }}>
            {installed ? tt('connectors.catalog.reconfigure') : tt('connectors.catalog.paste')}
          </button>
        ) : (
          <button type="button" className={css.secondaryButton} disabled={busy || !canImportJson} onClick={() => { void previewJson(preset.json!, { kind: 'preset', presetId: preset.id }, installed) }}>
            {installed ? tt('connectors.catalog.reconfigure') : tt('connectors.catalog.use')}
          </button>
        )}
      </article>
    )
  }

  return (
    <div className={css.tabBody}>
      <div className={css.toolbar}>
        <button type="button" className={css.primaryButton} disabled={busy} onClick={() => { setCatalogOpen((open) => !open) }}>{tt('connectors.catalog.title')}</button>
        <button type="button" className={css.secondaryButton} disabled={busy || !canImportClientSource} onClick={() => { void openSourcePicker() }}>{tt('connectors.sources.open')}</button>
        <button type="button" className={css.secondaryButton} disabled={busy || !canImportJson} onClick={() => { openJsonImport() }}>{tt('connectors.import.open')}</button>
        <button type="button" className={css.secondaryButton} disabled={busy} onClick={() => { setFormOpen((open) => !open) }}>{tt('connectors.create')}</button>
      </div>

      {catalogOpen && <section className={css.catalog}><h3 className={css.sectionTitle}>{tt('connectors.catalog.title')}</h3>{CONNECTOR_PRESETS.map(renderPreset)}</section>}

      {sourcePickerOpen && (
        <div className={css.connectorOverlay} role="dialog" aria-modal="true" aria-labelledby="mcp-source-title">
          <section className={`${css.connectorDialog} ${css.sourceDialog}`}>
            <header className={css.connectorDialogHeader}>
              <div>
                <p className={css.dialogStep}>{tt('connectors.sources.step')}</p>
                <h3 id="mcp-source-title" className={css.dialogTitle}>{tt('connectors.sources.title')}</h3>
                <p className={css.formHint}>{tt('connectors.sources.hint')}</p>
              </div>
              <button type="button" className={css.secondaryButton} disabled={busy} onClick={() => { setSourcePickerOpen(false) }}>{tt('common.close')}</button>
            </header>
            <div className={css.connectorDialogBody}>
              {clientSources === null ? <p className={css.empty}>{tt('common.loading')}</p> : (
                <div className={css.sourceGrid}>
                  {clientSources.map((source) => (
                    <article key={source.clientId} className={css.sourceCard} data-status={source.status}>
                      <div className={css.sourceMark} aria-hidden="true">{source.clientName.slice(0, 1)}</div>
                      <div className={css.sourceBody}>
                        <div className={css.nameRow}>
                          <strong className={css.name}>{source.clientName}</strong>
                          <span className={css.badge}>{sourceStatusText(source.status, source.serverCount)}</span>
                        </div>
                        <p className={css.description}>{sourceDescription(source.clientId)}</p>
                      </div>
                      <button type="button" className={canPreviewMcpClientSource(source) ? css.primaryButton : css.secondaryButton} disabled={busy} onClick={() => { void selectClientSource(source) }}>
                        {canPreviewMcpClientSource(source) ? tt('connectors.sources.preview') : tt('connectors.sources.pick')}
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </div>
            <footer className={css.connectorDialogFooter}>
              <div className={css.dialogFooterStatus}>{tt('connectors.sources.security')}</div>
            </footer>
          </section>
        </div>
      )}

      {importOpen && (
        <div className={css.connectorOverlay} role="dialog" aria-modal="true" aria-labelledby="mcp-import-title">
          <section className={css.connectorDialog}>
            <header className={css.connectorDialogHeader}>
              <div>
                <p className={css.dialogStep}>{preview === null ? tt('connectors.import.step.json') : tt('connectors.import.step.review')}</p>
                <h3 id="mcp-import-title" className={css.dialogTitle}>{stagedSource === null ? tt('connectors.import.title') : tt('connectors.sources.reviewTitle', { client: stagedSource.source.clientName })}</h3>
                <p className={css.formHint}>{stagedSource === null ? tt('connectors.import.hint') : tt('connectors.sources.reviewHint')}</p>
              </div>
              <button type="button" className={css.secondaryButton} disabled={busy} onClick={closeImport}>{tt('common.close')}</button>
            </header>

            <div className={css.connectorDialogBody}>
              {preview === null ? (
                <form id="mcp-json-import-form" onSubmit={(event) => { void onPreviewSubmit(event) }}>
                  <label className={css.dialogField}>
                    <span>{tt('connectors.import.jsonLabel')}</span>
                    <textarea className={css.jsonEditor} value={jsonText} onChange={(event) => { setJsonText(event.target.value); setImportError(null) }} placeholder={tt('connectors.import.jsonPlaceholder')} autoFocus />
                  </label>
                </form>
              ) : (
                <div className={css.importPreview}>
                  <div className={css.formHeader}>
                    <strong>{tt('connectors.import.servers', { count: preview.servers.length })}</strong>
                    <label className={css.inlineLabel}><input type="checkbox" checked={preview.servers.every((server) => selected[server.sourceName])} onChange={(event) => { setImportError(null); setLocalCommandTrusted(false); setSelected(Object.fromEntries(preview.servers.map((server) => [server.sourceName, event.target.checked]))) }} /> {tt('connectors.import.selectAll')}</label>
                  </div>
                  {preview.servers.map((server) => (
                    <div key={server.sourceName} className={css.importServer}>
                      <label className={css.importServerHeader}>
                        <input type="checkbox" checked={Boolean(selected[server.sourceName])} onChange={(event) => { setImportError(null); setLocalCommandTrusted(false); setSelected((items) => ({ ...items, [server.sourceName]: event.target.checked })) }} />
                        <strong>{server.sourceName}</strong>
                        <span className={css.badge}>{server.transport}</span>
                        <span className={css.description}>{server.command ? connectorEndpoint({ kind: 'mcp', transport: 'stdio', command: server.command, args: server.args }) : server.url}</span>
                      </label>
                      {selected[server.sourceName] && server.secretSlots.map((slot) => (
                        <label key={slot.credentialRef} className={css.secretRow}>
                          {slot.detected ? (
                            <span>{tt('connectors.import.detected', { name: mcpCredentialLabel(slot) })}</span>
                          ) : (
                            <>
                              <span>{mcpCredentialLabel(slot)}</span>
                              <input
                                ref={(node) => { secretInputs.current[slot.credentialRef] = node }}
                                type="password"
                                autoComplete="off"
                                required
                                aria-invalid={missingSecrets.some((missing) => missing.credentialRef === slot.credentialRef) && importError !== null}
                                placeholder={tt('connectors.import.credentialPlaceholder')}
                                value={secretValues[slot.credentialRef] ?? ''}
                                onChange={(event) => { setImportError(null); setSecretValues((values) => ({ ...values, [slot.credentialRef]: event.target.value })) }}
                              />
                            </>
                          )}
                        </label>
                      ))}
                    </div>
                  ))}
                  {requiresLocalExecution && <label className={css.trustBox}>
                    <input type="checkbox" checked={localCommandTrusted} onChange={(event) => { setLocalCommandTrusted(event.target.checked); setImportError(null) }} />
                    <span><strong>{tt('connectors.import.localTrustTitle')}</strong>{tt('connectors.import.localTrustBody')}</span>
                  </label>}
                </div>
              )}
            </div>

            <footer className={css.connectorDialogFooter}>
              <div
                className={css.dialogFooterStatus}
                data-error={importError !== null ? 'true' : undefined}
                data-ready={importError === null && preview !== null && selectedNames.length > 0 && missingSecrets.length === 0 && (!requiresLocalExecution || localCommandTrusted) ? 'true' : undefined}
                role={importError !== null ? 'alert' : 'status'}
              >
                {importError ?? (preview === null
                  ? tt('connectors.import.noSecret')
                  : selectedNames.length === 0
                    ? tt('connectors.import.selectOne')
                    : missingSecrets.length > 0
                      ? tt('connectors.import.missingCount', { count: missingSecrets.length })
                      : requiresLocalExecution && !localCommandTrusted
                        ? tt('connectors.import.localTrustRequired')
                      : tt('connectors.import.ready'))}
              </div>
              <div className={css.connectorDialogActions}>
                {preview !== null && (
                  <>
                    <button type="button" className={css.secondaryButton} disabled={busy} onClick={() => {
                      if (stagedSource === null) {
                        setPreview(null)
                        setImportError(null)
                        setLocalCommandTrusted(false)
                      } else {
                        closeImport()
                        setSourcePickerOpen(true)
                      }
                    }}>{stagedSource === null ? tt('connectors.import.edit') : tt('connectors.sources.reselect')}</button>
                    <label className={css.conflictField}>{tt('connectors.import.conflict')} <select value={conflict} onChange={(event) => { setConflict(event.target.value as typeof conflict); setImportError(null) }}><option value="reject">{tt('connectors.import.conflict.reject')}</option><option value="replace">{tt('connectors.import.conflict.replace')}</option><option value="rename">{tt('connectors.import.conflict.rename')}</option></select></label>
                  </>
                )}
                <button
                  type={preview === null ? 'submit' : 'button'}
                  form={preview === null ? 'mcp-json-import-form' : undefined}
                  className={css.primaryButton}
                  disabled={busy || (preview === null ? jsonText.trim().length === 0 : selectedNames.length === 0)}
                  onClick={preview === null ? undefined : () => { void onImport() }}
                >
                  {preview === null ? tt('connectors.import.preview') : tt('connectors.import.submit')}
                </button>
              </div>
            </footer>
          </section>
        </div>
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

      {authConnector !== null && (
        <div className={css.connectorOverlay} role="dialog" aria-modal="true" aria-labelledby="connector-auth-title">
          <form className={css.connectorDialog} onSubmit={(event) => { void onAuthorize(event) }}>
            <header className={css.connectorDialogHeader}>
              <div>
                <p className={css.dialogStep}>{tt('connectors.auth.step')}</p>
                <h3 id="connector-auth-title" className={css.dialogTitle}>{tt('connectors.auth.title', { name: authConnector.name })}</h3>
                <p className={css.formHint}>{tt('connectors.auth.hint')}</p>
              </div>
              <button type="button" className={css.secondaryButton} disabled={busy} onClick={() => { setAuthConnector(null); setAuthForm((current) => ({ ...current, token: '', appSecret: '' })) }}>{tt('common.close')}</button>
            </header>
            <div className={css.connectorDialogBody}>
              {connectorAuthProvider(authConnector) === 'github' && <>
                <label className={css.dialogField}><span>{tt('connectors.auth.mode')}</span><select value={authForm.mode} onChange={(event) => { setAuthForm((current) => ({ ...current, mode: event.target.value as AuthForm['mode'] })) }}><option value="oauth">OAuth（浏览器授权）</option><option value="pat">Fine-grained PAT</option></select></label>
                {authForm.mode === 'pat' && <label className={css.dialogField}><span>Personal Access Token</span><input type="password" autoComplete="off" value={authForm.token} onChange={(event) => { setAuthForm((current) => ({ ...current, token: event.target.value })) }} required /></label>}
              </>}
              {connectorAuthProvider(authConnector) === 'gitlab' && <>
                <label className={css.dialogField}><span>{tt('connectors.auth.gitlabBaseUrl')}</span><input type="url" value={authForm.baseUrl} onChange={(event) => { setAuthForm((current) => ({ ...current, baseUrl: event.target.value })) }} required /></label>
                <label className={css.dialogField}><span>{tt('connectors.auth.gitlabClientId')}</span><input value={authForm.clientId} onChange={(event) => { setAuthForm((current) => ({ ...current, clientId: event.target.value })) }} placeholder={tt('connectors.auth.gitlabClientPlaceholder')} /></label>
              </>}
              {connectorAuthProvider(authConnector) === 'feishu' && <>
                <label className={css.dialogField}><span>App ID</span><input value={authForm.appId} onChange={(event) => { setAuthForm((current) => ({ ...current, appId: event.target.value })) }} required /></label>
                <label className={css.dialogField}><span>App Secret</span><input type="password" autoComplete="off" value={authForm.appSecret} onChange={(event) => { setAuthForm((current) => ({ ...current, appSecret: event.target.value })) }} required /></label>
                <label className={css.dialogField}><span>{tt('connectors.auth.feishuDomain')}</span><select value={authForm.domain} onChange={(event) => { setAuthForm((current) => ({ ...current, domain: event.target.value })) }}><option value="https://open.feishu.cn">飞书（中国大陆）</option><option value="https://open.larksuite.com">Lark（国际版）</option></select></label>
              </>}
              {connectorAuthProvider(authConnector) === 'dingtalk' && <>
                <label className={css.dialogField}><span>Client ID</span><input value={authForm.clientId} onChange={(event) => { setAuthForm((current) => ({ ...current, clientId: event.target.value })) }} required /></label>
                <label className={css.dialogField}><span>Client Secret</span><input type="password" autoComplete="off" value={authForm.appSecret} onChange={(event) => { setAuthForm((current) => ({ ...current, appSecret: event.target.value })) }} required /></label>
                <label className={css.dialogField}><span>{tt('connectors.auth.dingtalkProfiles')}</span><input value={authForm.profiles} onChange={(event) => { setAuthForm((current) => ({ ...current, profiles: event.target.value })) }} /></label>
              </>}
            </div>
            <footer className={css.connectorDialogFooter}>
              <div className={css.dialogFooterStatus}>{tt('connectors.auth.security')}</div>
              <div className={css.connectorDialogActions}><button type="submit" className={css.primaryButton} disabled={busy}>{tt('connectors.auth.submit')}</button></div>
            </footer>
          </form>
        </div>
      )}

      {connectors === null ? <p className={css.empty}>{tt('common.loading')}</p> : connectors.length === 0 ? <p className={css.empty}>{tt('connectors.empty')}</p> : <div className={css.list} aria-live="polite">
        {connectors.map((connector) => {
          const endpoint = connectorEndpoint(connector)
          const checked = health[connector.id]
          const authStatus = authStatuses[connector.id]
          return <article key={connector.id} className={css.item}>
            <div className={css.itemBody}>
              <div className={css.nameRow}><span className={css.name}>{connector.name}</span><span className={css.badge}>{connector.kind === 'mcp' ? tt('connectors.type.mcp', { transport: connector.transport }) : tt('connectors.type.http')}</span><span className={css.badge} data-success={connector.enabled === false ? undefined : 'true'}>{connector.enabled === false ? tt('connectors.state.disabled') : tt('connectors.state.enabled')}</span>{connector.source?.kind === 'external-client' && <span className={css.badge}>{tt('connectors.source.external', { client: CLIENT_NAMES[connector.source.clientId ?? ''] ?? connector.source.clientId ?? tt('connectors.source.unknown') })}</span>}</div>
              <p className={css.description}>{connector.description || endpoint}</p>
              <p className={css.health} data-error={checked !== undefined && !checked.ok ? 'true' : undefined}>{checked !== undefined ? checked.detail : tt('connectors.unchecked', { endpoint })}</p>
              {authStatus !== undefined && <p className={css.authStatus} data-state={authStatus.state}>
                {tt(`connectors.auth.state.${authStatus.state}`)}
                {authStatus.grantedScopes?.length ? ` · ${authStatus.grantedScopes.join(', ')}` : ''}
                {authStatus.missingPermissions?.length ? ` · ${tt('connectors.auth.missing', { permissions: authStatus.missingPermissions.join(', ') })}` : ''}
              </p>}
              {checked?.checks !== undefined && <section className={css.diagnostics} aria-label={tt('connectors.diagnostics.title')}>
                {checked.checks.map((check) => <div key={check.id} className={css.diagnosticRow} data-status={check.status}>
                  <span className={css.diagnosticDot} aria-hidden="true" />
                  <strong>{diagnosticLabel(check.id)}</strong>
                  <span>{check.detail}</span>
                </div>)}
              </section>}
            </div>
            <div className={css.itemActions}>{connectorAuthProvider(connector) !== undefined && bridge.authorizeConnector !== undefined && <><button type="button" className={css.secondaryButton} disabled={busy} onClick={() => { void onAuthAction(connector) }}>{connectorAuthAction(authStatuses[connector.id]?.state) === 'cancel' ? tt('connectors.auth.cancel') : connectorAuthAction(authStatuses[connector.id]?.state) === 'disconnect' ? tt('connectors.auth.disconnect') : authStatuses[connector.id]?.state === 'reauthorization-required' || authStatuses[connector.id]?.state === 'error' ? tt('connectors.auth.reauthorize') : tt('connectors.auth.authorize')}</button>{(authStatuses[connector.id]?.state === 'ready' || authStatuses[connector.id]?.state === 'missing-permission') && bridge.verifyConnectorAuthorization !== undefined && <button type="button" className={css.secondaryButton} disabled={busy} onClick={() => { void onVerifyAuth(connector) }}>{tt('connectors.auth.verify')}</button>}</>} {bridge.setConnectorEnabled !== undefined && <button type="button" className={css.secondaryButton} disabled={busy} onClick={() => { void onToggleEnabled(connector) }}>{connector.enabled === false ? tt('connectors.enable') : tt('connectors.disable')}</button>}<button type="button" className={css.secondaryButton} disabled={busy} onClick={() => { void onCheck(connector.id) }}>{tt('connectors.check')}</button><button type="button" className={css.dangerButton} disabled={busy} onClick={() => { void onRemove(connector.id) }}>{tt('connectors.remove')}</button></div>
          </article>
        })}
      </div>}
    </div>
  )
}
