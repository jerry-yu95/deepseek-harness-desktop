import { createElement, type ReactNode } from 'react'
import { tt } from '../helpers.ts'
import css from './panel.module.css'

// A deliberately small text renderer: source HTML, links and images stay inert.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*)/u).map((part, index) => /^\*\*[^*\n]+\*\*$/u.test(part) ? <strong key={index}>{part.slice(2, -2)}</strong> : part)
}

export function readableParagraphs(text: string): string[] {
  if (text.length <= 260 || text.includes('\n')) return [text]
  const sentences = text.match(/[^。！？!?]+[。！？!?]+[”’」』]?|[^。！？!?]+$/gu) ?? [text]
  const groups: string[] = []
  let group = ''
  for (const sentence of sentences) {
    group += sentence
    if (group.length >= 150) { groups.push(group); group = '' }
  }
  if (group) groups.push(group)
  return groups
}

export function articleTextBlocks(text: string, key: string, reflow = false, sourceUrl?: string): ReactNode[] {
  const lines = text.trim().replace(/\r\n?/gu, '\n').split('\n')
  const result: ReactNode[] = []
  let paragraph: string[] = []
  const flush = () => {
    if (!paragraph.length) return
    const text = paragraph.join('\n')
    for (const part of reflow ? readableParagraphs(text) : [text]) result.push(<p key={`${key}-${result.length}`}>{inline(part)}</p>)
    paragraph = []
  }
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const heading = /^(#{1,6})\s+(.+)$/u.exec(line)
    const list = /^\s*(?:([-*])\s+|(\d+)[.)]\s+)(.+)$/u.exec(line)
    if (!line.trim()) { flush(); continue }
    if (line.trim() === '[视频内容未解析]') {
      flush()
      result.push(<figure key={`${key}-${result.length}`} className={css.articleVideo} aria-label={tt('article.video')}><svg aria-hidden="true" width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="18" cy="18" r="16" /><path d="m15 11 10 7-10 7z" /></svg><strong>{tt('article.video')}</strong><p>{tt('article.videoUnsupported')}</p>{sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer">{tt('article.videoSource')}</a>}</figure>)
    } else if (heading) {
      flush()
      result.push(createElement(`h${heading[1].length}`, { key: `${key}-${result.length}` }, inline(heading[2])))
    } else if (list) {
      flush()
      const ordered = Boolean(list[2])
      const items: ReactNode[] = []
      let current: RegExpExecArray | null = list
      while (current && Boolean(current[2]) === ordered) {
        items.push(<li key={items.length}>{inline(current[3])}</li>)
        current = /^\s*(?:([-*])\s+|(\d+)[.)]\s+)(.+)$/u.exec(lines[index + 1] ?? '')
        if (current && Boolean(current[2]) === ordered) index++
        else break
      }
      result.push(createElement(ordered ? 'ol' : 'ul', { key: `${key}-${result.length}`, ...(ordered ? { start: Number(list[2]) } : {}) }, items))
    } else if (/^>\s?/u.test(line)) {
      flush()
      const quote = [line.replace(/^>\s?/u, '')]
      while (/^>\s?/u.test(lines[index + 1] ?? '')) quote.push(lines[++index].replace(/^>\s?/u, ''))
      result.push(<blockquote key={`${key}-${result.length}`}>{inline(quote.join('\n'))}</blockquote>)
    } else paragraph.push(line)
  }
  flush()
  return result
}
