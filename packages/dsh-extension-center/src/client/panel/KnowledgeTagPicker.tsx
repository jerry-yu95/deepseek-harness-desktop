import { useMemo, useRef, useState } from 'react'
import type { KnowledgeItem } from '@harness-design/dsh-knowledge/src/core/types.ts'
import { tt } from '../helpers.ts'
import css from './panel.module.css'

export const KNOWLEDGE_OTHER_TAG = '其他'
export const KNOWLEDGE_MAX_TAGS = 8
export const KNOWLEDGE_MAX_TAG_LENGTH = 32

export function normalizeKnowledgeTag(value: string): string {
  return value.trim().normalize('NFC')
}

export function collectKnowledgeTags(items: ReadonlyArray<Pick<KnowledgeItem, 'status' | 'tags'>>): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  for (const item of items) {
    if (item.status === 'dismissed') continue
    for (const raw of item.tags) {
      const tag = normalizeKnowledgeTag(raw)
      if (!tag || tag === KNOWLEDGE_OTHER_TAG || seen.has(tag)) continue
      seen.add(tag)
      result.push(tag)
    }
  }
  return result.sort((left, right) => left.localeCompare(right, 'zh-Hans'))
}

export interface KnowledgeTagPickerProps {
  selected: string[]
  available: string[]
  suggestions?: string[]
  onChange: (tags: string[]) => void
  label: string
  name?: string
  disabled?: boolean
  onPendingChange?: (value: string) => void
  pending?: string
}

export function mergeKnowledgeTags(selected: ReadonlyArray<string>, pending: string): string[] {
  const values = [...selected, ...pending.split(/[,，]/u)]
  const result: string[] = []
  const seen = new Set<string>()
  for (const raw of values) {
    const tag = normalizeKnowledgeTag(raw)
    if (!tag || seen.has(tag)) continue
    if (tag === KNOWLEDGE_OTHER_TAG || tag.length > KNOWLEDGE_MAX_TAG_LENGTH || tag.includes('..') || !/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(tag)) throw new Error('invalid-tags')
    if (result.length >= KNOWLEDGE_MAX_TAGS) throw new Error('invalid-tags')
    seen.add(tag)
    result.push(tag)
  }
  return result
}

/** A keyboard-friendly exact-match tag editor. “其他” is a virtual group, never a saved tag. */
export function KnowledgeTagPicker({ selected, available, suggestions = [], onChange, label, name = 'tags', disabled = false, onPendingChange, pending }: KnowledgeTagPickerProps) {
  const [localQuery, setQuery] = useState('')
  const query = pending ?? localQuery
  const composing = useRef(false)
  const [warning, setWarning] = useState('')
  const [dismissed, setDismissed] = useState<string[]>([])
  const normalizedSelected = useMemo(() => uniqueTags(selected), [selected])
  const normalizedAvailable = useMemo(() => uniqueTags(available).filter(tag => !normalizedSelected.includes(tag)), [available, normalizedSelected])
  const normalizedSuggestions = useMemo(() => uniqueTags(suggestions).filter(tag => !normalizedSelected.includes(tag) && !dismissed.includes(tag)), [dismissed, normalizedSelected, suggestions])
  const matches = normalizedAvailable.filter(tag => query.trim() === '' || tag.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))

  const add = (raw: string) => {
    const tag = normalizeKnowledgeTag(raw)
    if (!tag) return
    if (tag === KNOWLEDGE_OTHER_TAG) { setWarning(tt('knowledge.tags.otherHint')); return }
    if (tag.length > KNOWLEDGE_MAX_TAG_LENGTH) { setWarning(tt('knowledge.tags.lengthHint')); return }
    try { mergeKnowledgeTags([], tag) } catch { setWarning(tt('article.tagsInvalid')); return }
    if (normalizedSelected.includes(tag)) { setQuery(''); onPendingChange?.(''); setWarning(''); return }
    if (normalizedSelected.length >= KNOWLEDGE_MAX_TAGS) { setWarning(tt('knowledge.tags.limitHint')); return }
    onChange([...normalizedSelected, tag])
    setQuery(''); onPendingChange?.('')
    setWarning('')
  }

  const handleInput = (raw: string) => {
    setQuery(raw); onPendingChange?.(raw); setWarning('')
    if (composing.current || !/[,，]/u.test(raw)) return
    try {
      const next = mergeKnowledgeTags(normalizedSelected, raw)
      onChange(next)
      setQuery(''); onPendingChange?.('')
    } catch {
      setWarning(tt('article.tagsInvalid'))
    }
  }

  return <div className={css.knowledgeTagPicker} data-disabled={disabled ? 'true' : undefined}>
    <div className={css.knowledgeTagInput}>
      {normalizedSelected.map(tag => <span className={css.knowledgeTagChip} data-tag-chip key={tag}>{tag}<button type="button" disabled={disabled} aria-label={tt('knowledge.tags.remove', { tag })} onClick={() => onChange(normalizedSelected.filter(value => value !== tag))}>×</button></span>)}
      <input role="combobox" aria-label={label} aria-expanded={matches.length > 0} aria-controls={`${name}-options`} disabled={disabled} value={query} placeholder={tt('knowledge.tags.placeholder')} onCompositionStart={() => { composing.current = true }} onCompositionEnd={event => { composing.current = false; handleInput(event.currentTarget.value) }} onChange={event => handleInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { if (event.nativeEvent.isComposing || composing.current) return; event.preventDefault(); add(query) } }} />
    </div>
    {matches.length > 0 && <div id={`${name}-options`} className={css.knowledgeTagOptions} role="listbox" aria-label={tt('knowledge.tags.history')}>
      {matches.map(tag => <button type="button" role="option" key={tag} disabled={disabled} onClick={() => add(tag)}>{tag}</button>)}
    </div>}
    {normalizedSuggestions.length > 0 && <div className={css.knowledgeTagSuggestions}><small>{tt('knowledge.tags.suggestions')}</small>{normalizedSuggestions.map(tag => <span className={css.knowledgeTagSuggestion} key={tag}>{tag}<button type="button" disabled={disabled} aria-label={tt('knowledge.tags.accept', { tag })} onClick={() => add(tag)}>+</button><button type="button" disabled={disabled} aria-label={tt('knowledge.tags.dismiss', { tag })} onClick={() => setDismissed([...dismissed, tag])}>×</button></span>)}</div>}
    {warning && <p className={css.knowledgeTagWarning} role="alert">{warning}</p>}
    <input type="hidden" name={name} value={[...normalizedSelected, normalizeKnowledgeTag(query)].filter(Boolean).join(',')} readOnly />
  </div>
}

function uniqueTags(values: ReadonlyArray<string>): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  for (const raw of values) {
    const tag = normalizeKnowledgeTag(raw)
    if (!tag || tag === KNOWLEDGE_OTHER_TAG || seen.has(tag)) continue
    seen.add(tag)
    result.push(tag)
  }
  return result
}
