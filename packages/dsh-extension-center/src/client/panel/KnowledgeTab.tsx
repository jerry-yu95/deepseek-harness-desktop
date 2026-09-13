import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react'
import type { KnowledgeClientApi } from '@harness-design/dsh-knowledge/src/client/api.ts'
import { KNOWLEDGE_KINDS, type KnowledgeItem, type KnowledgeKind, type KnowledgeUpdate } from '@harness-design/dsh-knowledge/src/core/types.ts'
import { errorMessage, tt } from '../helpers.ts'
import { KnowledgeCaptureDialog, type ArticleApi } from './KnowledgeCaptureDialog.tsx'
import { safeSourceUrl } from './KnowledgeArticleReader.tsx'
import { collectKnowledgeTags, KnowledgeTagPicker, mergeKnowledgeTags } from './KnowledgeTagPicker.tsx'
import css from './panel.module.css'

type KnowledgeWorkspaceApi = ArticleApi & Pick<KnowledgeClientApi, 'list' | 'refine'> & Partial<Pick<KnowledgeClientApi, 'trash' | 'listTrash' | 'restore'>>
type KnowledgeView = 'candidate' | 'confirmed' | 'all' | 'trash'

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
  const [deletedItems, setDeletedItems] = useState<KnowledgeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string>()
  const [view, setView] = useState<KnowledgeView>('all')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [captureOpen, setCaptureOpen] = useState(false)
  const [reading, setReading] = useState<KnowledgeItem | undefined>()
  const [readingTab, setReadingTab] = useState<'original' | 'summary' | 'note'>('original')
  const [editing, setEditing] = useState<KnowledgeItem | null>(null)
  const [refining, setRefining] = useState<KnowledgeItem | null>(null)
  const [draggingId, setDraggingId] = useState<string>()
  const loadSequence = useRef(0)

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current
    const [next, deleted] = await Promise.all([api.list(), api.listTrash?.() ?? []])
    if (sequence === loadSequence.current) {
      setItems(next.filter((item) => item.status !== 'dismissed'))
      setDeletedItems(deleted)
    }
  }, [api])

  useEffect(() => {
    let active = true
    setLoading(true)
    void Promise.all([api.list(), api.listTrash?.() ?? []]).then(([next, deleted]) => { if (active) { setItems(next.filter((item) => item.status !== 'dismissed')); setDeletedItems(deleted) } })
      .catch((error: unknown) => { if (active) notify(tt('knowledge.loadError', { error: errorMessage(error) }), true) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [api, notify, refreshKey])

  const counts = useMemo(() => ({
    candidate: items.filter((item) => item.status === 'candidate').length,
    confirmed: items.filter((item) => item.status === 'confirmed').length,
  }), [items])
  const categories = useMemo(() => [...new Set((view === 'trash' ? deletedItems : items).flatMap((item) => item.category === undefined ? [] : [item.category]))].sort(), [items, deletedItems, view])
  const historicalTags = useMemo(() => collectKnowledgeTags(items), [items])
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return (view === 'trash' ? deletedItems : items).filter((item) => (view === 'all' || view === 'trash' || item.status === view)
      && (category === '' || item.category === category)
      && (tagFilter === '' || (tagFilter === '__other__' ? item.tags.length === 0 : item.tags.includes(tagFilter)))
      && (needle === '' || `${item.title}\n${item.content}\n${item.tags.join(' ')}\n${item.category ?? ''}`.toLocaleLowerCase().includes(needle)))
  }, [category, items, deletedItems, query, tagFilter, view])

  const removeOrRestore = async (item: KnowledgeItem): Promise<void> => {
    const restoring = view === 'trash'
    if (!restoring && !window.confirm(tt('knowledge.delete.confirm', { title: item.title }))) return
    setBusyId(item.id)
    try {
      if (restoring) {
        if (!api.restore) return
        await api.restore(item.id)
        setDeletedItems(current => current.filter(value => value.id !== item.id))
      } else {
        if (!api.trash) return
        await api.trash(item.id, item.updatedAt)
        setItems(current => current.filter(value => value.id !== item.id))
      }
      notify(tt(restoring ? 'knowledge.restore.done' : 'knowledge.delete.done'))
      await load().catch(() => notify(tt('article.refreshFailed'), true))
    } catch (error) {
      notify(errorMessage(error) === 'knowledge-revision-conflict' ? tt('article.conflict') : tt('knowledge.delete.failed'), true)
    } finally { setBusyId(undefined) }
  }

  const transition = async (item: KnowledgeItem, action: 'confirm' | 'dismiss'): Promise<void> => {
    setBusyId(item.id)
    try {
      await api[action](item.id)
      await load()
      notify(tt(action === 'confirm' ? 'knowledge.confirmedToast' : 'knowledge.dismissedToast'))
    } catch (error) { notify(tt('common.error', { error: errorMessage(error) }), true) } finally { setBusyId(undefined) }
  }

  const moveTag = async (item: KnowledgeItem, to: string | null): Promise<void> => {
    if (item.status !== 'confirmed' || api.moveTag === undefined) return
    const from = tagFilter === '' || tagFilter === '__other__' || !item.tags.includes(tagFilter) ? null : tagFilter
    if (to !== null && from === to) return
    if (to === null && !window.confirm(tt('knowledge.tags.moveConfirm'))) return
    try {
      const updated = await api.moveTag(item.id, from, to, item.updatedAt)
      setItems(current => current.map(value => value.id === updated.id ? updated : value))
      notify(tt('knowledge.tags.moveSuccess'))
    } catch (error) {
      const code = errorMessage(error)
      notify(code === 'knowledge-revision-conflict' ? tt('article.conflict') : code === 'knowledge-tag-limit' ? tt('knowledge.tags.overflow') : tt('knowledge.tags.moveFailed'), true)
    }
  }

  const dropOnTag = (event: DragEvent<HTMLButtonElement>, to: string | null) => {
    event.preventDefault(); event.stopPropagation()
    const raw = event.dataTransfer.getData('application/x-jiwei-knowledge-tag')
    setDraggingId(undefined)
    if (to === '__all__') return
    if (!raw) return
    try {
      const payload = JSON.parse(raw) as { id?: unknown }
      if (typeof payload.id !== 'string') return
      const item = items.find(value => value.id === payload.id)
      if (item) void moveTag(item, to)
    } catch { /* Ignore external or malformed drops. */ }
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
            {api.listTrash && <ViewButton active={view === 'trash'} onClick={() => { setView('trash'); setCategory(''); setTagFilter(''); setQuery('') }} label={tt('knowledge.trash')} count={deletedItems.length} />}
          </div>
          <div className={css.knowledgeFilters}>
            <input type="search" value={query} onChange={(event) => { setQuery(event.target.value) }} placeholder={tt('knowledge.search')} aria-label={tt('knowledge.search')} />
            <select value={category} onChange={(event) => { setCategory(event.target.value) }} aria-label={tt('knowledge.category')}><option value="">{tt('knowledge.category.all')}</option>{categories.map((value) => <option key={value} value={value}>{value}</option>)}</select>
          </div>
        </header>
        {view !== 'trash' && <nav className={css.knowledgeTagNav} aria-label={tt('knowledge.tags.history')}>
          <TagFilterButton active={tagFilter === ''} onClick={() => setTagFilter('')} onDrop={event => dropOnTag(event, '__all__')} label={tt('knowledge.tags.all')} count={items.length} />
          {historicalTags.map(tag => <TagFilterButton key={tag} active={tagFilter === tag} onClick={() => setTagFilter(tag)} onDrop={event => dropOnTag(event, tag)} label={tag} count={items.filter(item => item.tags.includes(tag)).length} />)}
          <TagFilterButton active={tagFilter === '__other__'} onClick={() => setTagFilter('__other__')} onDrop={event => dropOnTag(event, null)} label={tt('knowledge.tags.other')} count={items.filter(item => item.tags.length === 0).length} />
        </nav>}
        {view === 'trash' && <p className={css.knowledgePrivacy}>{tt('knowledge.trash.hint')}</p>}
        {visible.length === 0 ? <div className={css.knowledgeEmpty}><strong>{tt('knowledge.filtered.empty.title')}</strong><p>{tt('knowledge.filtered.empty')}</p></div> : (
          <div className={css.knowledgeGrid}>{visible.map((item) => <KnowledgeCard deleted={view === 'trash'} onDelete={api.trash && api.restore ? () => { void removeOrRestore(item) } : undefined} key={item.id} item={item} busy={busyId === item.id} dragging={draggingId === item.id} availableTags={historicalTags} onDragStart={event => { if ((event.target as HTMLElement).closest('input,textarea,select,button,a')) return; event.dataTransfer.setData('application/x-jiwei-knowledge-tag', JSON.stringify({ id: item.id })); event.dataTransfer.effectAllowed = 'move'; setDraggingId(item.id) }} onDragEnd={() => setDraggingId(undefined)} onMove={to => { void moveTag(item, to) }} onRead={(item, tab = 'original') => { setReadingTab(tab); setReading(item) }} onEdit={setEditing} onRefine={setRefining} onTransition={transition} />)}</div>
        )}
      </section>
      {(captureOpen || reading) && <KnowledgeCaptureDialog api={api} initialItem={reading} initialTab={reading ? readingTab : undefined} availableTags={historicalTags} getSessionId={getSessionId} onClose={() => { setCaptureOpen(false); setReading(undefined); void load().catch(() => {}) }} onConfirmed={item => { setItems(current => current.some(value => value.id === item.id) ? current.map(value => value.id === item.id ? item : value) : [...current, item]); setView('confirmed'); setQuery(''); setCategory(''); setTagFilter(''); setCaptureOpen(false); setReading(undefined); notify(tt('knowledge.confirmedToast')); void load().catch(() => notify(tt('article.refreshFailed'), true)) }} onSaved={load} />}
      {editing !== null && <EditDialog item={editing} api={api} availableTags={historicalTags} onClose={() => { setEditing(null) }} onSaved={async () => { setEditing(null); await load(); notify(tt('knowledge.updatedToast')) }} notify={notify} />}
      {refining !== null && <RefineDialog item={refining} api={api} getSessionId={getSessionId} onClose={() => { setRefining(null) }} onSaved={async (model) => { setRefining(null); await load(); notify(tt('knowledge.refine.done', { model })) }} notify={notify} />}
    </div>
  )
}

function ViewButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return <button type="button" role="tab" aria-selected={active} data-active={active ? 'true' : undefined} onClick={onClick}>{label}<span>{count}</span></button>
}

function TagFilterButton({ active, onClick, onDrop, label, count }: { active: boolean; onClick: () => void; onDrop: (event: DragEvent<HTMLButtonElement>) => void; label: string; count: number }) {
  return <button type="button" data-active={active ? 'true' : undefined} aria-pressed={active} onClick={onClick} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }} onDrop={onDrop}>{label}<span>{count}</span></button>
}

function KnowledgeCard({ deleted, onDelete, item, busy, dragging, availableTags, onDragStart, onDragEnd, onMove, onRead, onEdit, onRefine, onTransition }: { deleted: boolean; onDelete: (() => void) | undefined; item: KnowledgeItem; busy: boolean; dragging: boolean; availableTags: string[]; onDragStart: (event: DragEvent<HTMLElement>) => void; onDragEnd: () => void; onMove: (to: string | null) => void; onRead: (item: KnowledgeItem, tab?: 'original' | 'summary' | 'note') => void; onEdit: (item: KnowledgeItem) => void; onRefine: (item: KnowledgeItem) => void; onTransition: (item: KnowledgeItem, action: 'confirm' | 'dismiss') => Promise<void> }) {
  const article = item.article !== undefined || item.source.kind === 'url'
  const source = safeSourceUrl(item.source.uri)
  const movable = !deleted && item.status === 'confirmed'
  return (
    <article className={css.knowledgeCard} draggable={movable} data-draggable={movable ? 'true' : undefined} data-dragging={dragging ? 'true' : undefined} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className={css.knowledgeCardHeader}><div><span className={css.knowledgeKind}>{tt(KIND_KEYS[item.kind])}</span>{item.category !== undefined && <span className={css.knowledgeCategory}>{item.category}</span>}</div>{!article && <span className={css.knowledgeConfidence}>{tt('knowledge.confidence', { value: Math.round(item.confidence * 100) })}</span>}</div>
      <h4>{item.title}</h4>{article && <small>{tt(item.summary ? 'article.summary' : 'article.excerpt')}</small>}<p className={css.articleExcerpt}>{(item.summary?.text.split(/\n\s*\n/u)[0].replace(/^#{1,6}\s+/u, '').replace(/\*\*(.*?)\*\*/gu, '$1') ?? item.article?.excerpt ?? item.content).slice(0, 180)}</p>
      <dl className={css.knowledgeMeta}><div><dt>{tt('knowledge.source')}</dt><dd>{source === undefined ? item.source.label : <a href={source} target="_blank" rel="noreferrer">{item.source.label}</a>}</dd></div>{item.project !== undefined && <div><dt>{tt('knowledge.project')}</dt><dd>{item.project}</dd></div>}</dl>
      <footer className={css.knowledgeCardFooter}>
      <div className={css.knowledgeCardTaxonomy}>{item.tags.length > 0 && <div className={css.knowledgeTags}>{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
      {movable && <div className={css.knowledgeMoveMenu}><select aria-label={tt('knowledge.tags.move')} defaultValue="" disabled={busy} onChange={event => { const value = event.target.value; event.currentTarget.value = ''; if (value) onMove(value === '__other__' ? null : value) }}><option value="">{tt('knowledge.tags.move')}</option>{availableTags.filter(tag => !item.tags.includes(tag)).map(tag => <option key={tag} value={tag}>{tag}</option>)}<option value="__other__">{tt('knowledge.tags.moveOther')}</option></select></div>}</div>
      <div className={css.knowledgeActions}>{!deleted && <><button type="button" className={css.secondaryButton} onClick={() => onRead(item)}>{tt('article.open')}</button><button type="button" className={css.secondaryButton} disabled={busy} onClick={() => { article ? onRead(item, 'note') : onEdit(item) }}>{tt('knowledge.action.edit')}</button><button type="button" className={css.secondaryButton} disabled={busy} onClick={() => { article ? onRead(item, 'summary') : onRefine(item) }}>{tt('knowledge.action.refine')}</button>{item.status === 'candidate' && <><button type="button" className={css.secondaryButton} disabled={busy} onClick={() => { void onTransition(item, 'dismiss') }}>{tt('knowledge.action.dismiss')}</button><button type="button" className={css.primaryButton} disabled={busy} onClick={() => { void onTransition(item, 'confirm') }}>{tt('knowledge.action.confirm')}</button></>}</>}{onDelete && <button type="button" className={css.secondaryButton} disabled={busy} onClick={onDelete}>{tt(deleted ? 'knowledge.restore' : 'knowledge.delete')}</button>}</div>
      </footer>
    </article>
  )
}


function EditDialog({ item, api, availableTags, onClose, onSaved, notify }: { item: KnowledgeItem; api: KnowledgeWorkspaceApi; availableTags: string[]; onClose: () => void; onSaved: () => Promise<void>; notify: KnowledgeTabProps['notify'] }) {
  const [busy, setBusy] = useState(false)
  const [tags, setTags] = useState(item.tags)
  const [pendingTags, setPendingTags] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true)
    const data = new FormData(event.currentTarget)
    try {
      const project = optionalField(data, 'project'); const category = optionalField(data, 'category')
      const update: KnowledgeUpdate = { kind: requiredField(data, 'kind') as KnowledgeKind, title: requiredField(data, 'title'), content: requiredField(data, 'content'), ...(project ? { project } : {}), ...(category ? { category } : {}), tags: mergeKnowledgeTags(tags, pendingTags) }
      await api.update(item.id, update); await onSaved()
    } catch (error) { notify(tt('common.error', { error: errorMessage(error) }), true) } finally { setBusy(false) }
  }
  return <div className={css.connectorOverlay} role="dialog" aria-modal="true" aria-labelledby="knowledge-edit-title"><form className={css.knowledgeDialog} onSubmit={(event) => { void submit(event) }}><header><div><p className={css.knowledgeEyebrow}>{tt('knowledge.edit.eyebrow')}</p><h3 id="knowledge-edit-title">{tt('knowledge.edit.title')}</h3></div><button type="button" className={css.secondaryButton} onClick={onClose}>{tt('common.close')}</button></header><div className={css.knowledgeDialogBody}><label>{tt('knowledge.form.title')}<input name="title" defaultValue={item.title} maxLength={160} required /></label><label>{tt('knowledge.form.content')}<textarea name="content" defaultValue={item.content} rows={10} maxLength={4000} required /></label><label>{tt('knowledge.form.kind')}<select name="kind" defaultValue={item.kind}>{KNOWLEDGE_KINDS.map((kind) => <option key={kind} value={kind}>{tt(KIND_KEYS[kind])}</option>)}</select></label><label>{tt('knowledge.project')}<input name="project" defaultValue={item.project ?? ''} maxLength={240} /></label><label>{tt('knowledge.category')}<input name="category" defaultValue={item.category ?? ''} maxLength={64} /></label><label>{tt('knowledge.form.tags')}<KnowledgeTagPicker selected={tags} available={availableTags} onChange={value => { setTags(value); setPendingTags('') }} onPendingChange={setPendingTags} label={tt('knowledge.form.tags')} /><small>{tt('article.tagsHint')}</small></label><p className={css.knowledgePrivacy}>{tt('knowledge.edit.provenance')}</p></div><footer><button type="submit" className={css.primaryButton} disabled={busy}>{tt('knowledge.edit.submit')}</button></footer></form></div>
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
