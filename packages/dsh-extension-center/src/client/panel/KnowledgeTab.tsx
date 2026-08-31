import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { KnowledgeClientApi } from '@harness-design/dsh-knowledge/src/client/api.ts'
import { KNOWLEDGE_KINDS, type KnowledgeItem, type KnowledgeKind, type KnowledgeProposal, type KnowledgeUpdate } from '@harness-design/dsh-knowledge/src/core/types.ts'
import { errorMessage, tt } from '../helpers.ts'
import { getDesktopBridge } from '../bridge.ts'
import css from './panel.module.css'

type KnowledgeWorkspaceApi = Pick<KnowledgeClientApi, 'list' | 'confirm' | 'dismiss' | 'create' | 'update' | 'importUrl' | 'refine'>
type KnowledgeView = 'candidate' | 'confirmed' | 'all'
type CaptureMode = 'manual' | 'url'

export interface KnowledgeTabProps {
  api: KnowledgeWorkspaceApi
  refreshKey: number
  notify: (message: string, error?: boolean) => void
  getSessionId?: () => string | undefined
}

const KIND_KEYS: Record<KnowledgeKind, 'knowledge.kind.decision' | 'knowledge.kind.lesson' | 'knowledge.kind.method' | 'knowledge.kind.fact' | 'knowledge.kind.preference'> = {
  decision: 'knowledge.kind.decision', lesson: 'knowledge.kind.lesson', method: 'knowledge.kind.method', fact: 'knowledge.kind.fact', preference: 'knowledge.kind.preference',
}

/** Searchable single-workspace knowledge inbox and library. */
export function KnowledgeTab({ api, refreshKey, notify, getSessionId = () => undefined }: KnowledgeTabProps) {
  const [items, setItems] = useState<KnowledgeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string>()
  const [view, setView] = useState<KnowledgeView>('all')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [captureOpen, setCaptureOpen] = useState(false)
  const [editing, setEditing] = useState<KnowledgeItem | null>(null)
  const [refining, setRefining] = useState<KnowledgeItem | null>(null)

  const load = useCallback(async () => {
    const next = await api.list()
    setItems(next.filter((item) => item.status !== 'dismissed'))
  }, [api])

  useEffect(() => {
    let active = true
    setLoading(true)
    void api.list().then((next) => { if (active) setItems(next.filter((item) => item.status !== 'dismissed')) })
      .catch((error: unknown) => { if (active) notify(tt('knowledge.loadError', { error: errorMessage(error) }), true) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [api, notify, refreshKey])

  const counts = useMemo(() => ({
    candidate: items.filter((item) => item.status === 'candidate').length,
    confirmed: items.filter((item) => item.status === 'confirmed').length,
  }), [items])
  const categories = useMemo(() => [...new Set(items.flatMap((item) => item.category === undefined ? [] : [item.category]))].sort(), [items])
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return items.filter((item) => (view === 'all' || item.status === view)
      && (category === '' || item.category === category)
      && (needle === '' || `${item.title}\n${item.content}\n${item.tags.join(' ')}\n${item.category ?? ''}`.toLocaleLowerCase().includes(needle)))
  }, [category, items, query, view])

  const transition = async (item: KnowledgeItem, action: 'confirm' | 'dismiss'): Promise<void> => {
    setBusyId(item.id)
    try {
      await api[action](item.id)
      await load()
      notify(tt(action === 'confirm' ? 'knowledge.confirmedToast' : 'knowledge.dismissedToast'))
    } catch (error) { notify(tt('common.error', { error: errorMessage(error) }), true) } finally { setBusyId(undefined) }
  }

  if (loading) return <div className={css.knowledgeEmpty}>{tt('common.loading')}</div>

  return (
    <div className={`${css.tabBody} ${css.knowledgeBody}`}>
      <section className={css.knowledgeHero}>
        <div><p className={css.knowledgeEyebrow}>{tt('knowledge.eyebrow')}</p><h3>{tt('knowledge.title')}</h3><p>{tt('knowledge.subtitle')}</p></div>
        <button type="button" className={css.primaryButton} onClick={() => { setCaptureOpen(true) }}>{tt('knowledge.capture.open')}</button>
      </section>
      <section className={css.knowledgeWorkspace}>
        <header className={css.knowledgeWorkspaceHeader}>
          <div className={css.knowledgeTabs} role="tablist" aria-label={tt('knowledge.views')}>
            <ViewButton active={view === 'all'} onClick={() => { setView('all') }} label={tt('knowledge.view.all')} count={items.length} />
            <ViewButton active={view === 'candidate'} onClick={() => { setView('candidate') }} label={tt('knowledge.pending')} count={counts.candidate} />
            <ViewButton active={view === 'confirmed'} onClick={() => { setView('confirmed') }} label={tt('knowledge.confirmed')} count={counts.confirmed} />
          </div>
          <div className={css.knowledgeFilters}>
            <input type="search" value={query} onChange={(event) => { setQuery(event.target.value) }} placeholder={tt('knowledge.search')} aria-label={tt('knowledge.search')} />
            <select value={category} onChange={(event) => { setCategory(event.target.value) }} aria-label={tt('knowledge.category')}><option value="">{tt('knowledge.category.all')}</option>{categories.map((value) => <option key={value} value={value}>{value}</option>)}</select>
          </div>
        </header>
        {visible.length === 0 ? <div className={css.knowledgeEmpty}><strong>{tt('knowledge.filtered.empty.title')}</strong><p>{tt('knowledge.filtered.empty')}</p></div> : (
          <div className={css.knowledgeGrid}>{visible.map((item) => <KnowledgeCard key={item.id} item={item} busy={busyId === item.id} onEdit={setEditing} onRefine={setRefining} onTransition={transition} />)}</div>
        )}
      </section>
      {captureOpen && <CaptureDialog api={api} onClose={() => { setCaptureOpen(false) }} onSaved={async () => { setCaptureOpen(false); await load(); notify(tt('knowledge.createdToast')) }} notify={notify} />}
      {editing !== null && <EditDialog item={editing} api={api} onClose={() => { setEditing(null) }} onSaved={async () => { setEditing(null); await load(); notify(tt('knowledge.updatedToast')) }} notify={notify} />}
      {refining !== null && <RefineDialog item={refining} api={api} getSessionId={getSessionId} onClose={() => { setRefining(null) }} onSaved={async (model) => { setRefining(null); await load(); notify(tt('knowledge.refine.done', { model })) }} notify={notify} />}
    </div>
  )
}

function ViewButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return <button type="button" role="tab" aria-selected={active} data-active={active ? 'true' : undefined} onClick={onClick}>{label}<span>{count}</span></button>
}

function KnowledgeCard({ item, busy, onEdit, onRefine, onTransition }: { item: KnowledgeItem; busy: boolean; onEdit: (item: KnowledgeItem) => void; onRefine: (item: KnowledgeItem) => void; onTransition: (item: KnowledgeItem, action: 'confirm' | 'dismiss') => Promise<void> }) {
  return (
    <article className={css.knowledgeCard}>
      <div className={css.knowledgeCardHeader}><div><span className={css.knowledgeKind}>{tt(KIND_KEYS[item.kind])}</span>{item.category !== undefined && <span className={css.knowledgeCategory}>{item.category}</span>}</div><span className={css.knowledgeConfidence}>{tt('knowledge.confidence', { value: Math.round(item.confidence * 100) })}</span></div>
      <h4>{item.title}</h4><p>{item.content}</p>
      <dl className={css.knowledgeMeta}><div><dt>{tt('knowledge.source')}</dt><dd>{item.source.uri === undefined ? item.source.label : <a href={item.source.uri} target="_blank" rel="noreferrer">{item.source.label}</a>}</dd></div>{item.project !== undefined && <div><dt>{tt('knowledge.project')}</dt><dd>{item.project}</dd></div>}</dl>
      {item.tags.length > 0 && <div className={css.knowledgeTags}>{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
      <div className={css.knowledgeActions}><button type="button" className={css.secondaryButton} disabled={busy} onClick={() => { onEdit(item) }}>{tt('knowledge.action.edit')}</button><button type="button" className={css.secondaryButton} disabled={busy} onClick={() => { onRefine(item) }}>{tt('knowledge.action.refine')}</button>{item.status === 'candidate' && <><button type="button" className={css.secondaryButton} disabled={busy} onClick={() => { void onTransition(item, 'dismiss') }}>{tt('knowledge.action.dismiss')}</button><button type="button" className={css.primaryButton} disabled={busy} onClick={() => { void onTransition(item, 'confirm') }}>{tt('knowledge.action.confirm')}</button></>}</div>
    </article>
  )
}

function CaptureDialog({ api, onClose, onSaved, notify }: { api: KnowledgeWorkspaceApi; onClose: () => void; onSaved: () => Promise<void>; notify: KnowledgeTabProps['notify'] }) {
  const [mode, setMode] = useState<CaptureMode>('manual')
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true)
    const data = new FormData(event.currentTarget)
    try {
      const category = optionalField(data, 'category'); const tags = tagsField(data)
      if (mode === 'url') {
        const url = requiredField(data, 'url')
        const desktop = getDesktopBridge()
        if (isWeChatArticleUrl(url) && desktop?.importKnowledgeUrl !== undefined) {
          const imported = await desktop.importKnowledgeUrl(url)
          await api.create({ kind: 'fact', title: imported.title, content: imported.content, ...(category ? { category } : {}), ...(tags.length ? { tags } : {}), confidence: 0.6, source: imported.source }, imported.snapshot)
        } else await api.importUrl({ url, ...(category ? { category } : {}), ...(tags.length ? { tags } : {}) })
      }
      else {
        const title = requiredField(data, 'title'); const content = requiredField(data, 'content')
        const proposal: KnowledgeProposal = { kind: requiredField(data, 'kind') as KnowledgeKind, title, content, ...(category ? { category } : {}), ...(tags.length ? { tags } : {}), confidence: 1, source: { kind: 'manual', label: title } }
        await api.create(proposal, content)
      }
      await onSaved()
    } catch (error) { notify(tt('common.error', { error: errorMessage(error) }), true) } finally { setBusy(false) }
  }
  return <div className={css.connectorOverlay} role="dialog" aria-modal="true" aria-labelledby="knowledge-capture-title"><form className={css.knowledgeDialog} onSubmit={(event) => { void submit(event) }}><header><div><p className={css.knowledgeEyebrow}>{tt('knowledge.capture.eyebrow')}</p><h3 id="knowledge-capture-title">{tt('knowledge.capture.title')}</h3></div><button type="button" className={css.secondaryButton} onClick={onClose}>{tt('common.close')}</button></header><div className={css.knowledgeCaptureModes}><button type="button" data-active={mode === 'manual' ? 'true' : undefined} onClick={() => { setMode('manual') }}>{tt('knowledge.capture.manual')}</button><button type="button" data-active={mode === 'url' ? 'true' : undefined} onClick={() => { setMode('url') }}>{tt('knowledge.capture.url')}</button></div><div className={css.knowledgeDialogBody}>{mode === 'manual' ? <><label>{tt('knowledge.form.title')}<input name="title" maxLength={160} required /></label><label>{tt('knowledge.form.content')}<textarea name="content" rows={10} maxLength={4000} required /></label><label>{tt('knowledge.form.kind')}<select name="kind" defaultValue="fact">{KNOWLEDGE_KINDS.map((kind) => <option key={kind} value={kind}>{tt(KIND_KEYS[kind])}</option>)}</select></label></> : <label>{tt('knowledge.form.url')}<input name="url" type="url" inputMode="url" placeholder="https://" required /></label>}<label>{tt('knowledge.category')}<input name="category" maxLength={64} placeholder={tt('knowledge.category.placeholder')} /></label><label>{tt('knowledge.form.tags')}<input name="tags" placeholder={tt('knowledge.form.tags.placeholder')} /></label><p className={css.knowledgePrivacy}>{tt('knowledge.capture.localOnly')}</p></div><footer><button type="submit" className={css.primaryButton} disabled={busy}>{tt('knowledge.capture.submit')}</button></footer></form></div>
}

function EditDialog({ item, api, onClose, onSaved, notify }: { item: KnowledgeItem; api: KnowledgeWorkspaceApi; onClose: () => void; onSaved: () => Promise<void>; notify: KnowledgeTabProps['notify'] }) {
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true)
    const data = new FormData(event.currentTarget)
    try {
      const project = optionalField(data, 'project'); const category = optionalField(data, 'category')
      const update: KnowledgeUpdate = { kind: requiredField(data, 'kind') as KnowledgeKind, title: requiredField(data, 'title'), content: requiredField(data, 'content'), ...(project ? { project } : {}), ...(category ? { category } : {}), tags: tagsField(data) }
      await api.update(item.id, update); await onSaved()
    } catch (error) { notify(tt('common.error', { error: errorMessage(error) }), true) } finally { setBusy(false) }
  }
  return <div className={css.connectorOverlay} role="dialog" aria-modal="true" aria-labelledby="knowledge-edit-title"><form className={css.knowledgeDialog} onSubmit={(event) => { void submit(event) }}><header><div><p className={css.knowledgeEyebrow}>{tt('knowledge.edit.eyebrow')}</p><h3 id="knowledge-edit-title">{tt('knowledge.edit.title')}</h3></div><button type="button" className={css.secondaryButton} onClick={onClose}>{tt('common.close')}</button></header><div className={css.knowledgeDialogBody}><label>{tt('knowledge.form.title')}<input name="title" defaultValue={item.title} maxLength={160} required /></label><label>{tt('knowledge.form.content')}<textarea name="content" defaultValue={item.content} rows={10} maxLength={4000} required /></label><label>{tt('knowledge.form.kind')}<select name="kind" defaultValue={item.kind}>{KNOWLEDGE_KINDS.map((kind) => <option key={kind} value={kind}>{tt(KIND_KEYS[kind])}</option>)}</select></label><label>{tt('knowledge.project')}<input name="project" defaultValue={item.project ?? ''} maxLength={240} /></label><label>{tt('knowledge.category')}<input name="category" defaultValue={item.category ?? ''} maxLength={64} /></label><label>{tt('knowledge.form.tags')}<input name="tags" defaultValue={item.tags.join(', ')} /></label><p className={css.knowledgePrivacy}>{tt('knowledge.edit.provenance')}</p></div><footer><button type="submit" className={css.primaryButton} disabled={busy}>{tt('knowledge.edit.submit')}</button></footer></form></div>
}

function RefineDialog({ item, api, getSessionId, onClose, onSaved, notify }: { item: KnowledgeItem; api: KnowledgeWorkspaceApi; getSessionId: () => string | undefined; onClose: () => void; onSaved: (model: string) => Promise<void>; notify: KnowledgeTabProps['notify'] }) {
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    const sessionId = getSessionId()
    if (sessionId === undefined) { notify(tt('knowledge.refine.noSession'), true); return }
    setBusy(true)
    try {
      const result = await api.refine(item.id, sessionId, true)
      await onSaved(result.model)
    } catch (error) { notify(tt('common.error', { error: errorMessage(error) }), true) } finally { setBusy(false) }
  }
  return <div className={css.connectorOverlay} role="dialog" aria-modal="true" aria-labelledby="knowledge-refine-title"><div className={css.knowledgeDialog}><header><div><p className={css.knowledgeEyebrow}>{tt('knowledge.refine.eyebrow')}</p><h3 id="knowledge-refine-title">{tt('knowledge.refine.title')}</h3></div><button type="button" className={css.secondaryButton} onClick={onClose}>{tt('common.close')}</button></header><div className={css.knowledgeDialogBody}><p>{tt('knowledge.refine.disclosure')}</p><p className={css.knowledgePrivacy}>{tt('knowledge.refine.privacy')}</p></div><footer><button type="button" className={css.primaryButton} disabled={busy} onClick={() => { void submit() }}>{busy ? tt('knowledge.refine.running') : tt('knowledge.refine.confirm')}</button></footer></div></div>
}

function requiredField(data: FormData, name: string): string { const value = data.get(name); if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} is required`); return value.trim() }
function optionalField(data: FormData, name: string): string | undefined { const value = data.get(name); return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined }
function tagsField(data: FormData): string[] { return (optionalField(data, 'tags') ?? '').split(/[,，]/u).map((value) => value.trim()).filter(Boolean).slice(0, 8) }

function isWeChatArticleUrl(input: string): boolean {
  try {
    const url = new URL(input)
    return url.protocol === 'https:' && url.hostname.toLowerCase().replace(/\.$/u, '') === 'mp.weixin.qq.com' && (url.pathname === '/s' || url.pathname.startsWith('/s/'))
  } catch { return false }
}
