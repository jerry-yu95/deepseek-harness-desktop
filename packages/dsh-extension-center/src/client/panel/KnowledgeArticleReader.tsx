import { useEffect, useRef, useState } from 'react'
import type { KnowledgeClientApi } from '@harness-design/dsh-knowledge/src/client/api.ts'
import type { KnowledgeArticleDetail } from '@harness-design/dsh-knowledge/src/core/store.ts'
import type { KnowledgeArticleImageMetadata, KnowledgeArticleResource, KnowledgeItem } from '@harness-design/dsh-knowledge/src/core/types.ts'
import { tt } from '../helpers.ts'
import { KnowledgeTagPicker, mergeKnowledgeTags } from './KnowledgeTagPicker.tsx'
import { articleTextBlocks } from './article-text-blocks.tsx'
import css from './panel.module.css'
import { SummaryBlockEditor } from './SummaryBlockEditor.tsx'

export type ArticleTab = 'original' | 'summary' | 'note'

export function safeSourceUrl(value?: string): string | undefined {
  try { const url = new URL(value ?? ''); return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : undefined } catch { return undefined }
}

export function formatArticleDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

/** Restricted text and validated cache resources; never execute source HTML. */
export function ArticleBlocks({ text, images = [], reflow = false, sourceUrl }: { text: string; images?: Array<KnowledgeArticleImageMetadata | KnowledgeArticleResource>; reflow?: boolean; sourceUrl?: string }) {
  const blocks = (value: string, key: string) => articleTextBlocks(value, key, reflow, safeSourceUrl(sourceUrl))
  let cursor = 0
  const parts = images.flatMap(image => {
    const offset = Math.max(cursor, Math.min(text.length, image.offset ?? text.length))
    const before = blocks(text.slice(cursor, offset), image.id)
    cursor = offset
    return [...before, <ArticleImage key={image.id} image={image} />]
  })
  return <>{parts}{blocks(text.slice(cursor), 'tail')}</>
}

function ArticleImage({ image }: { image: KnowledgeArticleImageMetadata | KnowledgeArticleResource }) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const ready = !failed && image.status === 'ready' && 'data' in image && ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(image.mimeType ?? '')
  return <figure className={css.articleImage}>{ready ? <><img src={`data:${image.mimeType};base64,${(image as KnowledgeArticleResource).data}`} alt={image.alt || tt('article.imageUnavailable')} loading="lazy" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />{!loaded && <span role="status">{tt('article.imageLoading')}</span>}<figcaption>{image.alt}</figcaption></> : <div className={css.articleImagePlaceholder} role="img" aria-label={`${tt('article.imageUnavailable')}${image.alt ? `: ${image.alt}` : ''}`}><svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1.5" /><path d="m4 17 5-5 4 4 3-3 4 4" /></svg><span>{tt('article.imageUnavailable')}<small>{tt(`article.imageReason.${failed ? 'format' : image.failureReason ?? 'unknown'}`)}</small></span></div>}</figure>
}

export function KnowledgeArticleReader({ detail, api, availableTags = [], suggestions = [], busy, onChanged, onBusy, onCancelAvailable, onSaveAvailable, onConfirmed, onDirty, initialTab = 'original', onSummaryDirty }: {
  initialTab?: ArticleTab
  onSummaryDirty?: (dirty: boolean) => void
  detail: KnowledgeArticleDetail
  api: Pick<KnowledgeClientApi, 'update' | 'editSummary' | 'confirm'>
  availableTags?: string[]
  suggestions?: string[]
  busy: boolean
  onChanged: (item: KnowledgeItem) => void
  onBusy: (busy: boolean) => void
  onCancelAvailable?: (cancel: (() => void) | undefined) => void
  onSaveAvailable?: (save: (() => Promise<boolean>) | undefined) => void
  onConfirmed?: (item: KnowledgeItem) => void
  onDirty?: (dirty: boolean) => void
}) {
  const [tab, setTab] = useState<ArticleTab>(initialTab)
  const [draft, setDraft] = useState<{ title: string; content: string; tags: string[] }>()
  const [pendingTags, setPendingTags] = useState('')
  const [summary, setSummary] = useState<string>()
  const [summaryEditing, setSummaryEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const scroll = useRef<HTMLDivElement>(null)
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = 0 }, [tab])
  const saveController = useRef<AbortController>()
  const mounted = useRef(true)
  const { item } = detail
  const values = draft ?? { title: item.title, content: item.content, tags: item.tags }
  const disabled = busy || saving
  const dirty = (draft !== undefined && (draft.title !== item.title || draft.content !== item.content || JSON.stringify(draft.tags) !== JSON.stringify(item.tags))) || pendingTags.trim() !== '' || (summary !== undefined && summary !== item.summary?.text)
  useEffect(() => { onDirty?.(dirty) }, [dirty, onDirty])
  const summaryInvalid = summary !== undefined && (!summary.trim() || summary.length > 4000)
  useEffect(() => { onSummaryDirty?.(summary !== undefined && summary !== item.summary?.text) }, [summary, item.summary?.text, onSummaryDirty])
  const previousSummary = useRef(item.summary)
  useEffect(() => {
    if (item.summary && item.summary !== previousSummary.current && item.summary.generatedAt !== previousSummary.current?.generatedAt) setTab('summary')
    previousSummary.current = item.summary
  }, [item.summary])
  useEffect(() => {
    onCancelAvailable?.(() => { saveController.current?.abort(); saveController.current = undefined; setSaving(false); onBusy(false) })
    return () => onCancelAvailable?.(undefined)
  }, [onCancelAvailable])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; saveController.current?.abort() } }, [])
  const change = (key: 'title' | 'content', value: string) => setDraft({ ...values, [key]: value })
  const save = async (confirm: boolean): Promise<boolean> => {
    if (busy || saveController.current || summaryInvalid) return false
    const controller = new AbortController()
    saveController.current = controller
    setSaving(true); onBusy(true); setError(false)
    let current = item
    const active = () => mounted.current && !controller.signal.aborted && saveController.current === controller
    try {
      const tags = mergeKnowledgeTags(values.tags, pendingTags)
      if (draft || pendingTags.trim() !== '') {
        current = await api.update(current.id, { kind: current.kind, title: values.title, content: values.content, tags, category: current.category, project: current.project }, controller.signal)
        if (!active()) return false
        onChanged(current); setDraft(undefined)
        setPendingTags('')
      }
      if (summary !== undefined && current.summary && summary !== current.summary.text) {
        current = await api.editSummary({ id: current.id, text: summary, expectedUpdatedAt: current.updatedAt }, controller.signal)
        if (!active()) return false
        onChanged(current); setSummary(undefined); setSummaryEditing(false)
      } else if (summary !== undefined) {
        setSummary(undefined); setSummaryEditing(false)
      }
      if (confirm && current.status === 'candidate') {
        current = await api.confirm(current.id, controller.signal)
        if (!active()) return false
        if (onConfirmed) onConfirmed(current); else onChanged(current)
      }
      return true
    } catch { if (active()) setError(true); return false } finally { if (active()) { setSaving(false); onBusy(false) }; if (saveController.current === controller) saveController.current = undefined }
  }
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => { onSaveAvailable?.(() => saveRef.current(false)); return () => onSaveAvailable?.(undefined) }, [onSaveAvailable])
  const source = safeSourceUrl(item.source.uri)
  return <>
    <div className={css.articleTabs} role="tablist" aria-label={tt('article.open')}>{(['original', 'summary', 'note'] as const).map(value => <button type="button" role="tab" aria-selected={tab === value} key={value} onClick={() => setTab(value)}>{tt(`article.${value}`)}</button>)}</div>
    <div ref={scroll} className={css.articleScroll} tabIndex={0} role="tabpanel" aria-label={tt(`article.${tab}`)}>
      <header className={css.articleIntro}><h1>{item.title}</h1>
      <div className={css.articleByline}>{item.article?.author && <span>{item.article.author}</span>}<time dateTime={item.source.capturedAt}>{formatArticleDate(item.source.capturedAt)}</time>{source ? <a href={source} target="_blank" rel="noreferrer">{item.source.label}</a> : <span>{item.source.label}</span>}</div>
      </header>
      {detail.bodyKind !== 'article' && <p className={css.knowledgePrivacy}>{tt(detail.bodyKind === 'legacy-excerpt' ? 'article.legacy' : 'article.oldSnapshot')}</p>}
      {item.article?.truncated && <p className={css.knowledgePrivacy}>{tt('article.truncated')}</p>}
      {item.article?.imagesTruncated && <p className={css.knowledgePrivacy}>{tt('article.imagesTruncated')}</p>}
      {tab === 'original' && <div className={css.articleProse}><ArticleBlocks text={detail.body} images={detail.images ?? item.article?.images} sourceUrl={source} /></div>}
      {tab === 'summary' && (item.summary ? <section className={css.articleSummaryPanel}>
        <div className={css.articleSummaryToolbar}><div><span className={css.articleSectionLabel}>{tt(summaryEditing ? 'article.editSummary' : 'article.summary')}</span><p className={css.articleSummaryMeta}>{item.summary.provider} / {item.summary.model} · {formatArticleDate(item.summary.generatedAt)}{item.summary.editedByUser && ` · ${tt('article.edited')}`}</p></div><button type="button" className={css.secondaryButton} disabled={disabled} onClick={() => { setSummaryEditing(value => !value); setSummary(undefined) }}>{summaryEditing ? tt('article.cancelEdit') : tt('article.editSummary')}</button></div>
        {item.summary.sourceTruncated && <p className={css.knowledgePrivacy}>{tt('article.partialSummary')}</p>}
        {summaryEditing ? <SummaryBlockEditor text={summary ?? item.summary.text} disabled={disabled} onChange={setSummary} /> : <div className={css.articleSummaryPreview}><ArticleBlocks text={summary ?? item.summary.text} reflow /></div>}
      </section> : <p className={css.articleSummaryEmpty}>{tt('article.noSummary')}</p>)}
      <div hidden={tab !== 'note'} className={css.knowledgeDialogBody}><label>{tt('knowledge.form.title')}<input disabled={disabled} value={values.title} maxLength={160} onChange={event => change('title', event.target.value)} /></label><label>{tt('knowledge.form.tags')}<KnowledgeTagPicker selected={values.tags} pending={pendingTags} available={availableTags} suggestions={suggestions} disabled={disabled} onChange={tags => { setDraft({ ...values, tags }); setPendingTags('') }} onPendingChange={setPendingTags} label={tt('knowledge.form.tags')} /><small>{tt('article.tagsHint')}</small></label><label>{tt('article.note')}<textarea disabled={disabled} value={values.content} maxLength={4000} rows={12} onChange={event => change('content', event.target.value)} /></label></div>
    </div>
    <footer className={css.articleFooter}>{error && <span role="alert">{tt('article.saveError')}</span>}{saving && <span role="status">{tt('article.saving')}</span>}<button type="button" className={css.secondaryButton} disabled={disabled || !dirty || summaryInvalid} onClick={() => void save(false)}>{tt('article.save')}</button>{item.status === 'candidate' ? <button type="button" className={css.primaryButton} disabled={disabled || summaryInvalid} onClick={() => void save(true)}>{tt('knowledge.action.confirm')}</button> : <span>{tt('knowledge.confirmed')}</span>}</footer>
  </>
}
