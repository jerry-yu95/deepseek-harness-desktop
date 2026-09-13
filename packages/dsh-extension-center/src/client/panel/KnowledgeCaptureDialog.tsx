import { useEffect, useReducer, useRef, useState, type FormEvent } from 'react'
import type { KnowledgeClientApi } from '@harness-design/dsh-knowledge/src/client/api.ts'
import type { KnowledgeItem } from '@harness-design/dsh-knowledge/src/core/types.ts'
import { KNOWLEDGE_KINDS, type KnowledgeKind } from '@harness-design/dsh-knowledge/src/core/types.ts'
import type { KnowledgeArticleDetail } from '@harness-design/dsh-knowledge/src/core/store.ts'
import type { KnowledgeModelDirectory } from '@harness-design/dsh-knowledge/src/wire.ts'
import { getDesktopBridge, type DesktopBridge } from '../bridge.ts'
import { tt } from '../helpers.ts'
import { initialImportState, knowledgeImportReducer } from './knowledge-import-state.ts'
import { KnowledgeArticleReader, type ArticleTab } from './KnowledgeArticleReader.tsx'
import { KnowledgeTagPicker, mergeKnowledgeTags } from './KnowledgeTagPicker.tsx'
import css from './panel.module.css'

export type ArticleApi = Pick<KnowledgeClientApi, 'create' | 'importUrl' | 'detail' | 'modelRoutes' | 'summarize' | 'update' | 'editSummary' | 'confirm' | 'dismiss'> & Partial<Pick<KnowledgeClientApi, 'moveTag'>>
type Operation = { id: number; requestId: string; controller: AbortController; desktop?: DesktopBridge }

export function KnowledgeCaptureDialog({ api, onClose, onSaved, onConfirmed, getSessionId, initialItem, initialTab, availableTags = [] }: {
  api: ArticleApi; onClose: () => void; onSaved: () => void | Promise<void>; onConfirmed?: (item: KnowledgeItem) => void; getSessionId?: () => string | undefined; initialItem?: KnowledgeItem; initialTab?: ArticleTab; availableTags?: string[]
}) {
  const [state, dispatch] = useReducer(knowledgeImportReducer, initialImportState)
  const [mode, setMode] = useState<'manual' | 'url'>('manual')
  const [directory, setDirectory] = useState<KnowledgeModelDirectory>({ routes: [] })
  const [routeId, setRouteId] = useState('')
  const [modelDirectoryError, setModelDirectoryError] = useState(false)
  const [directoryLoading, setDirectoryLoading] = useState(true)
  const [directoryAttempt, setDirectoryAttempt] = useState(0)
  const [consent, setConsent] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [readerBusy, setReaderBusy] = useState(false)
  const [exitError, setExitError] = useState(false)
  const exiting = useRef(false)
  const [coarse, setCoarse] = useState(true)
  const [capturedItem, setCapturedItem] = useState<KnowledgeItem | undefined>(initialItem)
  const [captureTags, setCaptureTags] = useState<string[]>([])
  const [capturePendingTags, setCapturePendingTags] = useState('')
  const [readerDirty, setReaderDirty] = useState(false)
  const [summaryDirty, setSummaryDirty] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const sequence = useRef(0), operation = useRef<Operation>(), mounted = useRef(true), autoSummaryAttempt = useRef<string>()
  const apiRef = useRef(api), readerCancel = useRef<(() => void) | undefined>()
  const readerSave = useRef<(() => Promise<boolean>) | undefined>()
  apiRef.current = api
  const dialog = useRef<HTMLDivElement>(null)
  const busy = ['fetching', 'structuring', 'verification', 'summarizing', 'saving'].includes(state.stage)
  const refresh = () => { void Promise.resolve(onSaved()).catch(() => {}) }
  const valid = (op: Operation) => mounted.current && operation.current === op && !op.controller.signal.aborted
  const cancel = () => {
    const op = operation.current
    if (!op) return
    operation.current = undefined
    op.controller.abort()
    void op.desktop?.cancelKnowledgeUrlImport?.(op.requestId).catch(() => {})
    if (mounted.current) dispatch({ type: 'cancel', attemptId: op.id })
  }
  const begin = (type: 'start' | 'summarize') => {
    const op: Operation = { id: ++sequence.current, requestId: crypto.randomUUID(), controller: new AbortController() }
    operation.current = op
    dispatch(type === 'start' ? { type, attemptId: op.id, requestId: op.requestId } : { type, attemptId: op.id })
    return op
  }
  const fail = (op: Operation, error: unknown) => {
    const code = error instanceof Error ? error.message : ''
    const safe = ['invalid-tags', 'knowledge-model-timeout', 'knowledge-fetch-timeout', 'knowledge-revision-conflict', 'knowledge-model-output-truncated', 'knowledge-model-failed', 'knowledge-model-response-invalid', 'knowledge-model-unavailable', 'knowledge-model-route-unavailable', 'knowledge-model-directory-unavailable'].includes(code) ? code : 'knowledge-operation-failed'
    if (valid(op)) dispatch({ type: 'failed', attemptId: op.id, error: safe })
  }
  const loadDetail = async (item: KnowledgeItem) => {
    if (operation.current) return
    const op = begin('start')
    try {
      const detail = await apiRef.current.detail(item.id, op.controller.signal)
      if (valid(op)) dispatch({ type: 'captured', attemptId: op.id, detail })
    } catch (error) { fail(op, error) } finally { if (operation.current === op) operation.current = undefined }
  }
  const summarize = async (detail: KnowledgeArticleDetail, explicitlyRequested = false) => {
    if ((!consent && !explicitlyRequested) || !routeId || operation.current || readerBusy || summaryDirty) return
    autoSummaryAttempt.current = detail.item.id
    const op = begin('summarize')
    try {
      const sessionId = getSessionId?.()
      const result = await apiRef.current.summarize({ id: detail.item.id, routeId, ...(sessionId ? { sessionId } : {}), confirmed: true, expectedUpdatedAt: detail.item.updatedAt }, op.controller.signal)
      if (valid(op)) { dispatch({ type: 'summarized', attemptId: op.id, ...result }); refresh() }
    } catch (error) { fail(op, error) } finally { if (operation.current === op) operation.current = undefined }
  }
  useEffect(() => {
    mounted.current = true
    const before = document.activeElement as HTMLElement | null
    dialog.current?.querySelector<HTMLElement>('input,button')?.focus()
    return () => { mounted.current = false; cancel(); before?.focus() }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    setDirectoryLoading(true); setModelDirectoryError(false)
    void Promise.resolve().then(() => apiRef.current.modelRoutes?.(getSessionId?.(), controller.signal) ?? { routes: [] }).then(value => {
      if (!controller.signal.aborted && mounted.current) { setDirectory(value); setRouteId(current => value.routes.some(route => route.id === current) ? current : value.selectedRouteId ?? '') }
    }).catch(() => { if (!controller.signal.aborted && mounted.current) setModelDirectoryError(true) })
      .finally(() => { if (!controller.signal.aborted && mounted.current) setDirectoryLoading(false) })
    return () => controller.abort()
  }, [directoryAttempt])
  useEffect(() => {
    if (!initialItem) return
    void loadDetail(initialItem)
  }, [initialItem?.id])
  useEffect(() => {
    if (!busy) return
    const start = Date.now(); setSeconds(0)
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [busy, state.attemptId])
  useEffect(() => {
    const detail = state.detail
    if (!detail || state.stage !== 'preview' || !consent || !routeId || detail.item.summary || autoSummaryAttempt.current === detail.item.id) return
    autoSummaryAttempt.current = detail.item.id
    void summarize(detail)
  }, [state.detail, state.stage, consent, routeId])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (operation.current || busy) return
    const data = new FormData(event.currentTarget)
    const op = begin('start')
    let unsubscribe: (() => void) | undefined
    try {
      const category = String(data.get('category') ?? '').trim()
      const tags = mergeKnowledgeTags(captureTags, capturePendingTags)
      if (tags.length > 8 || tags.some(tag => tag.length > 32 || tag === '其他')) throw new Error('invalid-tags')
      let item: KnowledgeItem
      if (mode === 'url') {
        const url = String(data.get('url') ?? '').trim()
        const desktop = getDesktopBridge()
        const parsed = new URL(url)
        if (parsed.protocol !== 'https:') throw new Error('invalid-url')
        if (parsed.hostname === 'mp.weixin.qq.com' && desktop?.startKnowledgeUrlImport && desktop.cancelKnowledgeUrlImport && desktop.onKnowledgeImportProgress) {
          op.desktop = desktop; setCoarse(false)
          unsubscribe = desktop.onKnowledgeImportProgress(progress => {
            if (valid(op) && progress.requestId === op.requestId) dispatch({ type: 'progress', attemptId: op.id, stage: progress.stage })
          })
          const imported = await desktop.startKnowledgeUrlImport({ url, requestId: op.requestId })
          if (!valid(op)) return
          item = await api.create({ kind: 'fact', title: imported.title, content: imported.content, category: category || undefined, tags, confidence: 0.6, source: imported.source }, imported.snapshot, op.controller.signal, { article: imported.article, articleResources: imported.articleResources, requestId: op.requestId })
        } else {
          setCoarse(true)
          item = await api.importUrl({ url, category: category || undefined, tags, requestId: op.requestId }, op.controller.signal)
        }
      } else {
        const title = String(data.get('title') ?? '').trim(), content = String(data.get('content') ?? '').trim()
        item = await api.create({ kind: String(data.get('kind') ?? 'fact') as KnowledgeKind, title, content, category: category || undefined, tags, confidence: 1, source: { kind: 'manual', label: title } }, content, op.controller.signal, { requestId: op.requestId })
      }
      refresh() // A candidate committed before cancellation remains recoverable in the inbox.
      if (!valid(op)) return
      setCapturedItem(item)
      const detail = await api.detail(item.id, op.controller.signal)
      if (!valid(op)) return
      dispatch({ type: 'captured', attemptId: op.id, detail })
      operation.current = undefined
    } catch (error) { fail(op, error) } finally { unsubscribe?.(); if (operation.current === op) operation.current = undefined }
  }
  const close = () => { if (!busy && !readerBusy && !readerDirty) { onClose(); return } setLeaving(true) }
  const saveAndClose = async () => {
    if (exiting.current || busy || readerBusy) return
    exiting.current = true
    try { if (await readerSave.current?.() && mounted.current) onClose(); else if (mounted.current) setLeaving(false) }
    finally { exiting.current = false }
  }
  const leave = async (discard: boolean) => {
    if (exiting.current) return
    exiting.current = true
    readerCancel.current?.()
    cancel()
    const current = state.detail?.item ?? capturedItem
    try { if (discard && current?.status === 'candidate') await api.dismiss(current.id); if (mounted.current) { refresh(); onClose() } } catch { if (mounted.current) { setExitError(true); setLeaving(false) } } finally { exiting.current = false }
  }
  const modelControls = <div className={css.articleModel}>
    <label>{tt('article.model')}<select disabled={busy || readerBusy || directoryLoading || modelDirectoryError} value={routeId} onChange={event => setRouteId(event.target.value)}><option value="">{tt(directoryLoading ? 'article.modelsLoading' : modelDirectoryError ? 'article.modelsFailed' : directory.routes.length ? 'article.chooseModel' : 'article.noModel')}</option>{directory.routes.map(route => <option key={route.id} value={route.id}>{route.displayName}</option>)}</select></label>
    {modelDirectoryError && <><p className={css.articleError} role="alert">{tt('article.modelDirectoryFailed')}</p><button type="button" disabled={busy || readerBusy} onClick={() => setDirectoryAttempt(value => value + 1)}>{tt('article.retryModels')}</button></>}
    {state.detail ? <><span>{tt('article.generateNotice')}</span><button type="button" disabled={busy || readerBusy || !routeId || summaryDirty} onClick={() => void summarize(state.detail!, true)}>{tt('article.generate')}</button>{summaryDirty && <small role="status">{tt('article.saveSummaryFirst')}</small>}</> : <label><input type="checkbox" checked={consent} disabled={busy || readerBusy || !routeId} onChange={event => setConsent(event.target.checked)} />{tt('article.consent')}</label>}
  </div>
  return <div className={`${css.connectorOverlay} ${css.articleOverlay}`}>
    <div ref={dialog} className={css.articleDialog} data-view={state.detail || initialItem ? 'reader' : 'capture'} role="dialog" aria-modal="true" aria-label={tt(state.detail || initialItem ? 'article.readerTitle' : 'knowledge.capture.title')} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); close() }
      if (event.key === 'Tab') {
        const nodes = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]') ?? [])].filter(node => !node.closest('[hidden]'))
        const first = nodes[0], last = nodes[nodes.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }}>
      <header className={css.articleHeader}><h3>{tt(state.detail || initialItem ? 'article.readerTitle' : 'knowledge.capture.title')}</h3><button type="button" className={css.secondaryButton} onClick={close}>{tt('common.close')}</button></header>
      {exitError && <p role="alert">{tt('article.saveError')}</p>}
      {busy && <div className={css.articleProgress} role="status" data-stage={state.stage}><span className={css.articleSpinner} />{tt(state.stage === 'fetching' && coarse ? 'article.coarse' : `article.${state.stage as 'fetching' | 'structuring' | 'verification' | 'summarizing' | 'saving'}`)} · {tt('article.elapsed', { seconds })}<button type="button" onClick={cancel}>{tt('article.cancel')}</button></div>}
      {state.stage === 'cancelled' && <p role="status">{tt('article.cancelled')}</p>}
      {state.stage === 'error' && <p className={css.articleError} role="alert">{tt(state.error === 'invalid-tags' ? 'article.tagsInvalid' : state.error?.includes('timeout') ? 'article.timeout' : state.error === 'knowledge-revision-conflict' ? 'article.conflict' : state.error === 'knowledge-model-output-truncated' ? 'article.modelOutputTruncated' : state.error === 'knowledge-model-response-invalid' ? 'article.modelResponseInvalid' : state.error === 'knowledge-model-failed' ? 'article.modelFailed' : state.error === 'knowledge-model-route-unavailable' ? 'article.modelRouteUnavailable' : state.error === 'knowledge-model-directory-unavailable' ? 'article.modelDirectoryFailed' : state.error === 'knowledge-model-unavailable' ? 'article.modelUnavailable' : 'article.error')}</p>}
      {leaving && <div className={css.articleExit} role="alert"><p>{tt(busy || readerBusy ? 'article.leaveBusy' : 'article.leave')}</p><button type="button" onClick={() => setLeaving(false)}>{tt('article.stay')}</button>{readerDirty && !busy && !readerBusy && <button type="button" onClick={() => void saveAndClose()}>{tt('article.saveClose')}</button>}<button type="button" onClick={() => void leave(false)}>{tt(busy || readerBusy ? 'article.cancelClose' : readerDirty ? 'article.discardEdits' : 'article.keep')}</button></div>}
      {state.detail ? <>{modelControls}<KnowledgeArticleReader key={state.detail.item.id} detail={state.detail} initialTab={initialTab} onSummaryDirty={setSummaryDirty} api={api} availableTags={availableTags} suggestions={state.suggestedTags} busy={busy} onBusy={setReaderBusy} onDirty={setReaderDirty} onSaveAvailable={save => { readerSave.current = save }} onCancelAvailable={cancel => { readerCancel.current = cancel }} onConfirmed={item => { if (onConfirmed) onConfirmed(item); else onClose() }} onChanged={item => { dispatch({ type: 'edited', attemptId: state.attemptId, item }); refresh() }} /></> : capturedItem ? <div className={css.articleScroll}><button type="button" disabled={busy || leaving} onClick={() => void loadDetail(capturedItem)}>{tt('article.retryDetail')}</button></div> : <form className={css.articleForm} onSubmit={event => void submit(event)}>
        <div className={css.knowledgeCaptureModes}><button type="button" data-active={mode === 'manual' || undefined} disabled={busy || Boolean(initialItem)} onClick={() => setMode('manual')}>{tt('knowledge.capture.manual')}</button><button type="button" data-active={mode === 'url' || undefined} disabled={busy || Boolean(initialItem)} onClick={() => setMode('url')}>{tt('knowledge.capture.url')}</button></div>
        <div className={`${css.knowledgeDialogBody} ${css.articleScroll}`}><fieldset disabled={busy || leaving}>{mode === 'url' ? <label>{tt('knowledge.form.url')}<input name="url" type="url" required /></label> : <><label>{tt('knowledge.form.title')}<input name="title" maxLength={160} required /></label><label>{tt('knowledge.form.content')}<textarea name="content" rows={6} maxLength={4000} required /></label><label>{tt('knowledge.form.kind')}<select name="kind" defaultValue="fact">{KNOWLEDGE_KINDS.map(kind => <option key={kind} value={kind}>{tt(`knowledge.kind.${kind}`)}</option>)}</select></label></>}<label>{tt('knowledge.category')}<input name="category" maxLength={64} /></label><label>{tt('knowledge.form.tags')}<KnowledgeTagPicker selected={captureTags} available={availableTags} onChange={setCaptureTags} onPendingChange={setCapturePendingTags} label={tt('knowledge.form.tags')} /><small>{tt('article.tagsHint')}</small></label></fieldset>{modelControls}</div>
        <footer className={css.articleFooter}><button type="submit" className={css.primaryButton} disabled={busy || leaving || Boolean(initialItem)}>{mode === 'url' ? tt('article.start') : tt('knowledge.capture.submit')}</button></footer>
      </form>}
    </div>
  </div>
}
