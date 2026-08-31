import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { KnowledgeItem, KnowledgeProposal, KnowledgeStatus, KnowledgeUpdate } from './types.ts'
import { normalizeKnowledgeUpdate, normalizeProposal, validateKnowledgeItem } from './validate.ts'

const ID_PATTERN = /^knowledge_[0-9a-f]{32}$/u
const MAX_SNAPSHOT_BYTES = 1_048_576

export interface KnowledgeListOptions {
  status?: KnowledgeStatus
}

export interface KnowledgeOperationOptions {
  now?: string
  id?: string
  snapshot?: string
}

export class KnowledgeStore {
  readonly root: string
  private readonly transitions = new Map<string, Promise<unknown>>()

  constructor(root = join(process.env.DSH_HOME?.trim() || join(homedir(), '.dsh'), 'desktop', 'knowledge', 'v1')) {
    this.root = root
  }

  async propose(input: KnowledgeProposal, options: KnowledgeOperationOptions = {}): Promise<KnowledgeItem> {
    let item = normalizeProposal(input, {
      id: options.id ?? `knowledge_${randomUUID().replaceAll('-', '')}`,
      now: options.now ?? new Date().toISOString(),
    })
    if (options.snapshot !== undefined) {
      await this.writeSnapshot(item.id, options.snapshot)
      item = validateKnowledgeItem({ ...item, source: { ...item.source, hasSnapshot: true } })
    }
    await this.write(item)
    return item
  }

  async list(options: KnowledgeListOptions = {}): Promise<KnowledgeItem[]> {
    const directory = this.itemsDirectory()
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
    return this.transition(id, 'confirmed', options.now)
  }

  async dismiss(id: string, options: KnowledgeOperationOptions = {}): Promise<KnowledgeItem> {
    return this.transition(id, 'dismissed', options.now)
  }

  async update(id: string, input: KnowledgeUpdate, options: KnowledgeOperationOptions = {}): Promise<KnowledgeItem> {
    assertId(id)
    return this.withTransitionLock(id, async () => {
      const current = await this.read(id)
      if (current.status === 'dismissed') throw new Error('dismissed knowledge cannot be edited')
      const next = normalizeKnowledgeUpdate(input, current, normalizedNow(options.now))
      await this.write(next)
      return next
    })
  }

  async readSnapshot(id: string): Promise<string | undefined> {
    assertId(id)
    return readFile(this.snapshotPath(id), 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined
      throw error
    })
  }

  private async transition(id: string, target: 'confirmed' | 'dismissed', nowInput?: string): Promise<KnowledgeItem> {
    assertId(id)
    return this.withTransitionLock(id, async () => {
      const current = await this.read(id)
      if (current.status === target) return current
      if (current.status !== 'candidate') throw new Error(`knowledge is already in final state: ${current.status}`)
      const now = normalizedNow(nowInput)
      const next = validateKnowledgeItem({
        ...current,
        status: target,
        updatedAt: now,
        ...(target === 'confirmed' ? { confirmedAt: now } : { dismissedAt: now }),
      })
      await this.write(next)
      return next
    })
  }

  private async write(item: KnowledgeItem): Promise<void> {
    const value = validateKnowledgeItem(item)
    await mkdir(this.itemsDirectory(), { recursive: true, mode: 0o700 })
    const path = this.itemPath(value.id)
    const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    await rename(temporary, path)
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

  private async writeSnapshot(id: string, input: string): Promise<void> {
    if (typeof input !== 'string') throw new TypeError('knowledge snapshot must be text')
    const snapshot = input.trim()
    const bytes = Buffer.byteLength(snapshot, 'utf8')
    if (bytes === 0 || bytes > MAX_SNAPSHOT_BYTES) throw new TypeError(`knowledge snapshot must contain 1-${MAX_SNAPSHOT_BYTES} bytes`)
    if (/\u0000/u.test(snapshot)) throw new TypeError('knowledge snapshot contains binary data')
    const directory = join(this.root, 'sources')
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const path = this.snapshotPath(id)
    const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`
    await writeFile(temporary, snapshot, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    await rename(temporary, path)
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

function assertId(id: string): void {
  if (!ID_PATTERN.test(id)) throw new TypeError('knowledge id is invalid')
}

function normalizedNow(input: string | undefined): string {
  const value = input ?? new Date().toISOString()
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== value) throw new TypeError('now must be an ISO timestamp')
  return value
}

export type { KnowledgeItem, KnowledgeProposal, KnowledgeStatus, KnowledgeUpdate }
