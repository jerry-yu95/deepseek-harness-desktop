const MAX_TAGS = 8
const MAX_TAG_LENGTH = 32
const OTHER_TAG = '其他'

export interface KnowledgeTagMove {
  from: string | null
  to: string | null
}

/** Pure, exact-match tag move used by both menu and drag/drop callers. */
export function moveTags(tags: ReadonlyArray<string>, move: KnowledgeTagMove): string[] {
  const current = uniqueTags(tags)
  if (move.to === null) return []
  const destination = normalizeTag(move.to)
  if (destination === OTHER_TAG) throw new Error('tag destination is reserved')
  if (!destination) throw new Error('tag destination is required')
  if (destination.length > MAX_TAG_LENGTH) throw new Error('tag destination is too long')
  const source = move.from === null ? null : normalizeTag(move.from)
  const withoutSource = source === null ? current : current.filter(tag => tag !== source)
  if (!withoutSource.includes(destination)) withoutSource.push(destination)
  if (withoutSource.length > MAX_TAGS) throw new Error('knowledge tags cannot exceed 8 values')
  return withoutSource
}

function normalizeTag(value: string): string {
  return value.trim().normalize('NFC')
}

function uniqueTags(values: ReadonlyArray<string>): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  for (const raw of values) {
    const tag = normalizeTag(raw)
    if (!tag || tag === OTHER_TAG || seen.has(tag)) continue
    seen.add(tag)
    result.push(tag)
  }
  return result
}
