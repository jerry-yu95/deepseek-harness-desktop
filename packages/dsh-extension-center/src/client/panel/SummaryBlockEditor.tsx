import { useLayoutEffect, useRef, useState } from 'react'
import { tt } from '../helpers.ts'
import { readableParagraphs } from './article-text-blocks.tsx'
import css from './panel.module.css'

type SummaryBlock = { prefix: string; text: string }

export function summaryEditBlocks(text: string): SummaryBlock[] {
  const blocks: SummaryBlock[] = []
  let paragraph: string[] = []
  const flush = () => {
    if (!paragraph.length) return
    for (const text of readableParagraphs(paragraph.join('\n'))) blocks.push({ prefix: '', text })
    paragraph = []
  }
  for (const line of text.replace(/\r\n?/gu, '\n').split('\n')) {
    const structured = /^(#{1,6}\s+|\s*[-*]\s+|\s*\d+[.)]\s+|>\s?)(.*)$/u.exec(line)
    if (!line.trim()) flush()
    else if (structured) { flush(); blocks.push({ prefix: structured[1], text: structured[2] }) }
    else paragraph.push(line)
  }
  flush()
  return blocks.length ? blocks : [{ prefix: '', text: '' }]
}

export function summaryEditText(blocks: SummaryBlock[]): string {
  return blocks.map((block, index) => {
    const list = /^\s*(?:[-*]|\d+[.)])\s/u.test(block.prefix)
    const previousList = index > 0 && /^\s*(?:[-*]|\d+[.)])\s/u.test(blocks[index - 1].prefix)
    return `${index ? list && previousList ? '\n' : '\n\n' : ''}${block.prefix}${block.text}`
  }).join('')
}

function BlockInput({ block, label, disabled, onChange }: { block: SummaryBlock; label: string; disabled: boolean; onChange: (text: string) => void }) {
  const input = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    if (!input.current) return
    input.current.style.height = 'auto'
    input.current.style.height = `${Math.min(440, input.current.scrollHeight + 2)}px`
  }, [block.text])
  return <textarea ref={input} aria-label={label} value={block.text} disabled={disabled} rows={block.prefix.startsWith('#') ? 1 : 3} maxLength={4000} onChange={event => onChange(event.target.value)} />
}

export function SummaryBlockEditor({ text, disabled, onChange }: { text: string; disabled: boolean; onChange: (value: string) => void }) {
  const [blocks, setBlocks] = useState(() => summaryEditBlocks(text))
  const [changed, setChanged] = useState(false)
  const value = changed ? summaryEditText(blocks) : text
  const change = (next: SummaryBlock[]) => { setBlocks(next); setChanged(true); onChange(summaryEditText(next)) }
  return <div className={css.articleSummaryEditor} role="group" aria-label={tt('article.blockEditor')}>
    <p className={css.summaryEditorHint}>{tt('article.summaryEditorHint')}</p>
    {blocks.map((block, index) => <div className={css.summaryBlock} data-kind={block.prefix.startsWith('#') ? 'heading' : block.prefix ? 'point' : 'paragraph'} key={index}>
      <div className={css.summaryBlockHeader}><span>{tt(block.prefix.startsWith('#') ? 'article.blockHeading' : block.prefix ? 'article.blockPoint' : 'article.blockParagraph')} {index + 1}</span><button type="button" disabled={disabled} aria-label={tt('article.removeBlock', { index: index + 1 })} onClick={() => change(blocks.length === 1 ? [{ prefix: '', text: '' }] : blocks.filter((_, i) => i !== index))}>{tt('article.remove')}</button></div>
      <BlockInput block={block} label={index === 0 ? tt('article.summary') : tt('article.blockContent', { index: index + 1 })} disabled={disabled} onChange={value => change(blocks.map((entry, i) => i === index ? { ...entry, text: value } : entry))} />
    </div>)}
    <button type="button" className={css.secondaryButton} disabled={disabled || value.length >= 3998} onClick={() => change([...blocks, { prefix: '', text: '' }])}>{tt('article.addParagraph')}</button>
    {changed && (!value.trim() || value.length > 4000) && <p role="alert">{tt('article.summaryLength')}</p>}
    <small>{value.length} / 4000 · {tt('article.summaryEditNotice')}</small>
  </div>
}
