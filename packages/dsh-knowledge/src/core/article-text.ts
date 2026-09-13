/** Run on a disposable clone before text and image offsets are extracted. */
export function prepareArticleMedia(root: ParentNode): void {
  const selector = 'video,mp-video,mp-common-videosnap,.wx_video_context,.js_video_container,.js_video_channel_container,.js_tx_video_container,.txp_player,.video_iframe,.js_video_iframe,iframe[src*="videoplayer"],iframe[data-src*="videoplayer"]'
  for (const element of Array.from(root.querySelectorAll(selector))) {
    if (!(root as Node).contains(element)) continue
    const placeholder = element.ownerDocument.createElement('p')
    placeholder.textContent = '[视频内容未解析]'
    element.replaceWith(placeholder)
  }
}

/** Pure DOM projection; no HTML or remote resources reach the reading surface. */
export function articleText(root: Node): string {
  function walk(node: Node): string {
    if (node.nodeType === 3) return (node.nodeValue ?? '').replace(/\s+/gu, ' ')
    if (node.nodeType === 11) return Array.from(node.childNodes, walk).join('')
    if (node.nodeType !== 1) return ''
    const tag = (node as Element).tagName.toLowerCase()
    if (['script', 'style', 'noscript', 'svg', 'template', 'iframe', 'object', 'embed'].includes(tag)) return ''
    if (tag === 'br') return '\n'
    const text = Array.from(node.childNodes, walk).join('')
    if (/^h[1-6]$/u.test(tag)) return `\n\n${'#'.repeat(Number(tag[1]))} ${text.trim()}\n\n`
    if (tag === 'li') return `\n- ${text.trim()}\n`
    if (tag === 'blockquote') return `\n\n${text.trim().split('\n').map(line => `> ${line}`).join('\n')}\n\n`
    if (['p', 'div', 'section', 'article', 'main', 'ul', 'ol', 'pre', 'tr'].includes(tag)) return `\n\n${text.trim()}\n\n`
    return text
  }
  return walk(root).replace(/[\t ]+/gu, ' ').replace(/ *\n */gu, '\n').replace(/\n{3,}/gu, '\n\n').trim()
}

export interface ArticleImageCandidate {
  src: string
  alt: string
  order: number
  offset?: number
}

/** Extract image candidates without retaining remote URLs in the knowledge record. */
export function articleImageCandidates(root: ParentNode, baseUrl?: string): ArticleImageCandidate[] {
  const seen = new Set<string>()
  const result: ArticleImageCandidate[] = []
  for (const element of Array.from(root.querySelectorAll('img'))) {
    const raw = ['data-src', 'data-original', 'src'].map(name => element.getAttribute(name)?.trim()).find(Boolean) ?? ''
    if (raw.trim() === '') continue
    let url: URL
    try { url = new URL(raw.trim(), baseUrl) } catch { continue }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue
    url.hash = ''
    const src = url.toString()
    if (seen.has(src)) continue
    seen.add(src)
    const range = element.ownerDocument.createRange()
    range.selectNodeContents(root as Node)
    range.setEndBefore(element)
    const offset = articleText(range.cloneContents()).length
    result.push({ src, alt: (element.getAttribute('alt') ?? '').replace(/\s+/gu, ' ').trim().slice(0, 200), order: result.length, offset })
    if (result.length >= 51) break
  }
  return result
}

export function boundArticleText(text: string, maxBytes = 1_048_576): { text: string; truncated: boolean; originalByteLength: number } {
  const encoder = new TextEncoder()
  const originalByteLength = encoder.encode(text).length
  if (originalByteLength <= maxBytes) return { text, truncated: false, originalByteLength }
  let bytes = 0
  let end = 0
  for (const character of text) {
    bytes += encoder.encode(character).length
    if (bytes > maxBytes) break
    end += character.length
  }
  return { text: text.slice(0, end), truncated: true, originalByteLength }
}
