import { unzipSync } from 'fflate'

const OFFICE_EXTENSIONS = new Set(['docx', 'xlsx', 'pptx'])

/** Extract bounded plain text from Open XML Office files without executing macros. */
export async function extractOfficeText(name: string, data: Uint8Array, maxChars: number): Promise<string> {
  const extension = name.split('.').pop()?.toLowerCase() ?? ''
  if (!OFFICE_EXTENSIONS.has(extension)) throw new Error('unsupported Office attachment')
  let archive: Record<string, Uint8Array>
  try {
    archive = unzipSync(data, { filter: file => wantedXml(extension, file.name) })
  } catch {
    throw new Error('Office attachment is not a valid Open XML document')
  }
  const names = Object.keys(archive).sort(naturalCompare)
  const sections: string[] = []
  let remaining = maxChars
  for (const path of names) {
    if (remaining <= 0) break
    const bytes = archive[path]
    if (bytes === undefined || bytes.byteLength > 8 * 1024 * 1024) continue
    const xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    const text = xmlToText(xml).trim()
    if (text === '') continue
    const heading = officeHeading(extension, path)
    const chunk = `${heading}\n${text}`.slice(0, remaining)
    sections.push(chunk)
    remaining -= chunk.length + 2
  }
  if (sections.length === 0) throw new Error('Office attachment contains no readable text')
  return sections.join('\n\n')
}

function wantedXml(extension: string, path: string): boolean {
  if (extension === 'docx') return path === 'word/document.xml' || /^word\/(?:footnotes|endnotes|comments)\.xml$/u.test(path)
  if (extension === 'xlsx') return path === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/u.test(path)
  return /^ppt\/slides\/slide\d+\.xml$/u.test(path) || /^ppt\/notesSlides\/notesSlide\d+\.xml$/u.test(path)
}

function xmlToText(xml: string): string {
  return decodeEntities(xml
    .replace(/<w:tab\b[^>]*\/>/gu, '\t')
    .replace(/<w:br\b[^>]*\/>/gu, '\n')
    .replace(/<a:br\b[^>]*\/>/gu, '\n')
    .replace(/<\/w:p>/gu, '\n')
    .replace(/<\/a:p>/gu, '\n')
    .replace(/<\/row>/gu, '\n')
    .replace(/<\/c>/gu, '\t')
    .replace(/<[^>]+>/gu, ''))
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/gu, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/giu, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
}

function officeHeading(extension: string, path: string): string {
  if (extension === 'docx') return `[Word: ${path.split('/').pop()}]`
  if (extension === 'xlsx') return `[Excel: ${path.split('/').pop()}]`
  return `[PowerPoint: ${path.split('/').pop()}]`
}

function naturalCompare(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true })
}
