import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { KnowledgeArticleImageMetadata, KnowledgeArticleMetadata, KnowledgeArticleResource, KnowledgeItem, KnowledgeProposal, KnowledgeStatus, KnowledgeSummary, KnowledgeUpdate } from './types.ts'
import { decodeArticleImageData, normalizeArticleMetadata, normalizeArticleResources, normalizeKnowledgeSummary, normalizeKnowledgeUpdate, normalizeProposal, validateKnowledgeItem } from './validate.ts'
import { assertActive } from './cancellation.ts'
import { moveTags, type KnowledgeTagMove } from './tags.ts'

const ID_PATTERN = /^knowledge_[0-9a-f]{32}$/u
const MAX_SNAPSHOT_BYTES = 1_048_576

export interface KnowledgeListOptions {
  status?: KnowledgeStatus
}

export interface KnowledgeOperationOptions {
  now?: string
  id?: string
  snapshot?: string
  article?: KnowledgeArticleMetadata
  articleResources?: KnowledgeArticleResource[]
  signal?: AbortSignal
}

export interface KnowledgeArticleDetail {
  item: KnowledgeItem
  body: string
  bodyKind: 'article' | 'legacy-snapshot' | 'legacy-excerpt'
  images?: Array<KnowledgeArticleImageMetadata | KnowledgeArticleResource>
}

export class KnowledgeStore {
  readonly root: string
  private readonly transitions = new Map<string, Promise<unknown>>()

  constructor(root = join(process.env.DSH_HOME?.trim() || join(homedir(), '.dsh'), 'desktop', 'knowledge', 'v1')) {
    this.root = root
  }

  async propose(input: KnowledgeProposal, options: KnowledgeOperationOptions = {}): Promise<KnowledgeItem> {
    assertActive(options.signal)
    const article = normalizeArticleMetadata(options.article)
    const articleResources = normalizeArticleResources(options.articleResources)
    assertArticleResources(article, articleResources)
    let item = normalizeProposal(input, {
      id: options.id ?? `knowledge_${randomUUID().replaceAll('-', '')}`,
      now: options.now ?? new Date().toISOString(),
      allowEmptyContent: article !== undefined,
    })
    if (options.snapshot !== undefined) {
      await this.writeSnapshot(item.id, options.snapshot, options.signal)
      item = validateKnowledgeItem({
        ...item,
        source: { ...item.source, hasSnapshot: true },
        ...(article === undefined ? {} : { article }),
      })
    } else if (article !== undefined) {
      throw new TypeError('article snapshot is required')
    }
    try {
      if (articleResources !== undefined) await this.writeArticleResources(item.id, articleResources, options.signal)
      await this.write(item, options.signal)
    } catch (error) {
      // No item was committed: remove only this proposal's orphan source.
      const committed = await stat(this.itemPath(item.id)).then(() => true, (failure: NodeJS.ErrnoException) => {
        if (failure.code === 'ENOENT') return false
        throw failure
      })
      if (!committed && options.snapshot !== undefined) await unlink(this.snapshotPath(item.id)).catch(() => {})
      if (!committed && articleResources !== undefined) await rm(this.resourceDirectory(item.id), { recursive: true, force: true }).catch(() => {})
      throw error
    }
    return item
  }

  async proposeOnce(requestId: string, input: KnowledgeProposal, options: KnowledgeOperationOptions = {}): Promise<KnowledgeItem> {
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/u.test(requestId)) throw new Error('knowledge-invalid-request')
    const id = `knowledge_${createHash('sha256').update(`article-import:${requestId}`).digest('hex').slice(0, 32)}`
    return this.withTransitionLock(id, async () => {
      assertActive(options.signal)
      if (await stat(this.trashPath(id)).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error })) throw new Error('knowledge-deleted')
      try { return await this.read(id) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      return this.propose(input, { ...options, id })
    })
  }

  async list(options: KnowledgeListOptions = {}, deleted = false): Promise<KnowledgeItem[]> {
    const directory = deleted ? join(this.root, 'trash') : this.itemsDirectory()
    const entries = await readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return []
      throw error
    })
    const items: KnowledgeItem[] = []
    for (const entry of entries) {
      if (!entry.isFile() || !/^knowledge_[0-9a-f]{32}\.json$/u.test(entry.name)) continue
      try {
        const item = validateKnowledgeItem(JSON.parse(await readFile(join(directory, entry.name), 'utf8')))
        if (options.status === undefined || item.status === options.status) items.push(item)
      } catch {
        // A damaged record is isolated rather than taking down the knowledge view.
      }
    }
    return items.sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
  }

  async read(id: string): Promise<KnowledgeItem> {
    assertId(id)
    return validateKnowledgeItem(JSON.parse(await readFile(this.itemPath(id), 'utf8')))
  }

  async confirm(id: string, options: KnowledgeOperationOptions = {}): Promise<KnowledgeItem> {
    return this.transition(id, 'confirmed', options)
  }

  async dismiss(id: string, options: KnowledgeOperationOptions = {}): Promise<KnowledgeItem> {
    return this.transition(id, 'dismissed', options)
  }

  /** Atomically remove the visible record. Its owned source/resources remain recoverable. */
  async trash(id: string, expectedUpdatedAt: string, options: KnowledgeOperationOptions = {}): Promise<void> {
    assertId(id)
    await this.withTransitionLock(id, async () => {
      assertActive(options.signal)
      const current = await this.read(id)
      if (current.updatedAt !== expectedUpdatedAt) throw new Error('knowledge revision conflict')
      if (await stat(this.trashPath(id)).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error })) throw new Error('knowledge revision conflict')
      await mkdir(join(this.root, 'trash'), { recursive: true, mode: 0o700 })
      assertActive(options.signal)
      await rename(this.itemPath(id), this.trashPath(id))
    })
  }

  async restore(id: string, options: KnowledgeOperationOptions = {}): Promise<KnowledgeItem> {
    assertId(id)
    return this.withTransitionLock(id, async () => {
      assertActive(options.signal)
      const item = validateKnowledgeItem(JSON.parse(await readFile(this.trashPath(id), 'utf8')))
      if (item.id !== id) throw new Error('knowledge-invalid-request')
      if (await stat(this.itemPath(id)).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error })) throw new Error('knowledge revision conflict')
      await mkdir(this.itemsDirectory(), { recursive: true, mode: 0o700 })
      assertActive(options.signal)
      await rename(this.trashPath(id), this.itemPath(id))
      return item
    })
  }

  private trashPath(id: string): string {
    assertId(id)
    return join(this.root, 'trash', `${id}.json`)
  }

  async update(id: string, input: KnowledgeUpdate, options: KnowledgeOperationOptions = {}): Promise<KnowledgeItem> {
    assertId(id)
    return this.withTransitionLock(id, async () => {
      assertActive(options.signal)
      const current = await this.read(id)
      if (current.status === 'dismissed') throw new Error('dismissed knowledge cannot be edited')
      const next = normalizeKnowledgeUpdate(input, current, revisionNow(current.updatedAt, options.now))
      await this.write(next, options.signal)
      return next
    })
  }

  async readSnapshot(id: string): Promise<string | undefined> {
    assertId(id)
    const file = await open(this.snapshotPath(id), 'r').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined
      throw error
    })
    if (!file) return undefined
    try {
      const bytes = Buffer.alloc(MAX_SNAPSHOT_BYTES + 1)
      let length = 0
      while (length < bytes.length) {
        const result = await file.read(bytes, length, bytes.length - length, null)
        if (result.bytesRead === 0) break
        length += result.bytesRead
      }
      if (length > MAX_SNAPSHOT_BYTES) throw new Error('knowledge snapshot is too large')
      return bytes.subarray(0, length).toString('utf8')
    } finally {
      await file.close()
    }
  }

  async readDetail(id: string): Promise<KnowledgeArticleDetail> {
    const item = await this.read(id)
    const body = await this.readSnapshot(id)
    if (body !== undefined) return { item, body, bodyKind: item.article === undefined ? 'legacy-snapshot' : 'article', ...(await this.readArticleResources(item.id, item.article?.images)) }
    return { item, body: item.content, bodyKind: 'legacy-excerpt' }
  }

  async updateSummary(id: string, input: KnowledgeSummary, expectedUpdatedAt?: string, options: KnowledgeOperationOptions = {}): Promise<KnowledgeItem> {
    assertId(id)
    return this.withTransitionLock(id, async () => {
      assertActive(options.signal)
      const current = await this.read(id)
      if (current.status === 'dismissed') throw new Error('dismissed knowledge cannot be summarized')
      if (expectedUpdatedAt !== undefined && current.updatedAt !== expectedUpdatedAt) throw new Error('knowledge revision conflict')
      const summary = normalizeKnowledgeSummary(input)
      if (summary === undefined) throw new TypeError('knowledge summary is required')
      const next = validateKnowledgeItem({ ...current, summary, updatedAt: revisionNow(current.updatedAt, options.now) })
      await this.write(next, options.signal)
      return next
    })
  }

  async editSummary(id: string, text: string, expectedUpdatedAt: string, options: KnowledgeOperationOptions = {}): Promise<KnowledgeItem> {
    assertId(id)
    return this.withTransitionLock(id, async () => {
      assertActive(options.signal)
      const current = await this.read(id)
      if (current.status === 'dismissed') throw new Error('dismissed knowledge cannot be edited')
      if (current.updatedAt !== expectedUpdatedAt) throw new Error('knowledge revision conflict')
      if (!current.summary) throw new Error('knowledge summary is required')
      const summary = normalizeKnowledgeSummary({ ...current.summary, text, editedByUser: true })
      const next = validateKnowledgeItem({ ...current, summary, updatedAt: revisionNow(current.updatedAt) })
      await this.write(next, options.signal)
      return next
    })
  }

  async moveTag(id: string, move: KnowledgeTagMove, expectedUpdatedAt: string): Promise<KnowledgeItem> {
    assertId(id)
    return this.withTransitionLock(id, async () => {
      const current = await this.read(id)
      if (current.status !== 'confirmed') throw new Error('only confirmed knowledge can be tagged')
      if (current.updatedAt !== expectedUpdatedAt) throw new Error('knowledge revision conflict')
      if (move.from !== null && !current.tags.includes(move.from.trim().normalize('NFC'))) throw new Error('knowledge tag source is not present')
      const tags = moveTags(current.tags, move)
      if (tags.length === current.tags.length && tags.every((tag, index) => tag === current.tags[index])) return current
      const next = validateKnowledgeItem({ ...current, tags, updatedAt: revisionNow(current.updatedAt) })
      await this.write(next)
      return next
    })
  }

  private async transition(id: string, target: 'confirmed' | 'dismissed', options: KnowledgeOperationOptions = {}): Promise<KnowledgeItem> {
    assertId(id)
    return this.withTransitionLock(id, async () => {
      assertActive(options.signal)
      const current = await this.read(id)
      if (current.status === target) return current
      if (current.status !== 'candidate') throw new Error(`knowledge is already in final state: ${current.status}`)
      const now = normalizedNow(options.now)
      const next = validateKnowledgeItem({
        ...current,
        status: target,
        updatedAt: now,
        ...(target === 'confirmed' ? { confirmedAt: now } : { dismissedAt: now }),
      })
      await this.write(next, options.signal)
      return next
    })
  }

  private async write(item: KnowledgeItem, signal?: AbortSignal): Promise<void> {
    assertActive(signal)
    const value = validateKnowledgeItem(item)
    await mkdir(this.itemsDirectory(), { recursive: true, mode: 0o700 })
    const path = this.itemPath(value.id)
    const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`
    try {
      await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
      assertActive(signal)
      await rename(temporary, path)
    } finally {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error })
    }
    const info = await stat(path)
    if (!info.isFile()) throw new Error('knowledge storage did not create a regular file')
  }

  private itemsDirectory(): string {
    return join(this.root, 'items')
  }

  private itemPath(id: string): string {
    assertId(id)
    return join(this.itemsDirectory(), `${id}.json`)
  }

  private snapshotPath(id: string): string {
    assertId(id)
    return join(this.root, 'sources', `${id}.txt`)
  }

  private resourceDirectory(id: string): string {
    assertId(id)
    return join(this.root, 'resources', id)
  }

  private resourcePath(id: string, imageId: string): string {
    if (!/^image_[0-9a-f]{32}$/u.test(imageId)) throw new TypeError('article image id is invalid')
    return join(this.resourceDirectory(id), `${imageId}.bin`)
  }

  private async writeArticleResources(id: string, resources: KnowledgeArticleResource[], signal?: AbortSignal): Promise<void> {
    const directory = this.resourceDirectory(id)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    for (const resource of resources) {
      assertActive(signal)
      const bytes = decodeArticleImageData(resource.data, resource.mimeType, resource.byteLength)
      const path = this.resourcePath(id, resource.id)
      const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`
      try {
        await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 })
        assertActive(signal)
        await rename(temporary, path)
      } finally {
        await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error })
      }
    }
  }

  private async readArticleResources(id: string, metadata?: KnowledgeArticleImageMetadata[]): Promise<{ images?: Array<KnowledgeArticleImageMetadata | KnowledgeArticleResource> }> {
    if (metadata === undefined || metadata.length === 0) return {}
    const images: Array<KnowledgeArticleImageMetadata | KnowledgeArticleResource> = []
    for (const image of metadata) {
      if (image.status === 'unavailable' || image.mimeType === undefined || image.byteLength === undefined) { images.push(image); continue }
      try {
        const file = await open(this.resourcePath(id, image.id), 'r')
        let bytes: Buffer
        try {
          if ((await file.stat()).size !== image.byteLength) throw new Error('knowledge-image-unavailable')
          bytes = Buffer.alloc(image.byteLength)
          let offset = 0
          while (offset < bytes.length) {
            const result = await file.read(bytes, offset, bytes.length - offset, offset)
            if (!result.bytesRead) throw new Error('knowledge-image-unavailable')
            offset += result.bytesRead
          }
        } finally { await file.close() }
        const data = bytes.toString('base64')
        decodeArticleImageData(data, image.mimeType, image.byteLength)
        images.push({ ...image, status: 'ready', data })
      } catch {
        images.push({ id: image.id, alt: image.alt, order: image.order, ...(image.offset === undefined ? {} : { offset: image.offset }), status: 'unavailable', failureReason: 'cache' })
      }
    }
    return { images }
  }

  private async writeSnapshot(id: string, input: string, signal?: AbortSignal): Promise<void> {
    assertActive(signal)
    if (typeof input !== 'string') throw new TypeError('knowledge snapshot must be text')
    const snapshot = input.trim()
    const bytes = Buffer.byteLength(snapshot, 'utf8')
    if (bytes === 0 || bytes > MAX_SNAPSHOT_BYTES) throw new TypeError(`knowledge snapshot must contain 1-${MAX_SNAPSHOT_BYTES} bytes`)
    if (/\u0000/u.test(snapshot)) throw new TypeError('knowledge snapshot contains binary data')
    const directory = join(this.root, 'sources')
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const path = this.snapshotPath(id)
    const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`
    try {
      assertActive(signal)
      await writeFile(temporary, snapshot, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
      assertActive(signal)
      await rename(temporary, path)
    } finally {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error })
    }
  }

  private async withTransitionLock<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.transitions.get(id) ?? Promise.resolve()
    const current = previous.catch(() => undefined).then(operation)
    this.transitions.set(id, current)
    try {
      return await current
    } finally {
      if (this.transitions.get(id) === current) this.transitions.delete(id)
    }
  }
}

function assertArticleResources(article: KnowledgeArticleMetadata | undefined, resources: KnowledgeArticleResource[] | undefined): void {
  if (resources !== undefined && article === undefined) throw new TypeError('article metadata is required for image resources')
  const metadata = article?.images ?? []
  if (resources === undefined) {
    if (metadata.some(image => image.status === 'ready')) throw new TypeError('ready article image resource is missing')
    return
  }
  const byId = new Map(resources.map(resource => [resource.id, resource]))
  if (byId.size !== resources.length || resources.some(resource => resource.status !== 'ready')) throw new TypeError('article image resources are invalid')
  for (const image of metadata) {
    const resource = byId.get(image.id)
    if (image.status === 'ready' && (resource === undefined || resource.alt !== image.alt || resource.order !== image.order || resource.mimeType !== image.mimeType || resource.byteLength !== image.byteLength)) throw new TypeError('article image metadata does not match resource')
    if (image.status === 'unavailable' && resource !== undefined) throw new TypeError('unavailable article image cannot have a resource')
  }
  if (resources.some(resource => !metadata.some(image => image.id === resource.id))) throw new TypeError('article image resource is not declared')
}

function assertId(id: string): void {
  if (!ID_PATTERN.test(id)) throw new TypeError('knowledge id is invalid')
}

function normalizedNow(input: string | undefined): string {
  const value = input ?? new Date().toISOString()
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== value) throw new TypeError('now must be an ISO timestamp')
  return value
}

function revisionNow(previous: string, input?: string): string {
  const now = normalizedNow(input)
  return new Date(Math.max(Date.parse(now), Date.parse(previous) + 1)).toISOString()
}

export type { KnowledgeItem, KnowledgeProposal, KnowledgeStatus, KnowledgeUpdate }
