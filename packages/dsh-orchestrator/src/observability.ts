import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { harnessDir, redactSecrets, stableDigest } from './core.ts'

export interface TokenBuckets {
  uncachedInputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export type ObservabilityPeriod = 'today' | '7d' | '30d' | 'month' | 'all' | 'custom'
export interface ObservabilityQuery { period: ObservabilityPeriod; now?: string; from?: string; to?: string }

interface TokenEvent extends TokenBuckets {
  id: string; timestamp: string; kind: 'tokens'; sessionId: string; modelKey: string; project: string; estimated: boolean
}
export interface StageEvent {
  id: string; timestamp: string; kind: 'stage'; runId: string; stage: string; status: 'running' | 'complete' | 'failed'; durationMs?: number; summary?: string
}
export interface CacheEvent {
  id: string; timestamp: string; kind: 'cache'; runId: string; namespace: string; hit: boolean; savedMs?: number; savedTokens?: number
}
export type RuntimeEvent = TokenEvent | StageEvent | CacheEvent

interface SessionSnapshot extends TokenBuckets { modelKey: string; project: string; estimated: boolean }
interface Ledger { version: 1; events: RuntimeEvent[]; sessions: Record<string, SessionSnapshot> }

export interface ObservabilitySummary {
  period: ObservabilityPeriod
  tokens: TokenBuckets & { totalTokens: number }
  models: Array<TokenBuckets & { modelKey: string; totalTokens: number; calls: number }>
  daily: Array<{ date: string; totalTokens: number }>
  estimatedEvents: number
  traces: Array<Omit<StageEvent, 'kind' | 'id'>>
  cache: { hits: number; misses: number; hitRate?: number; savedMs: number; savedTokens: number }
}

const MAX_EVENTS = 20_000
const zero = (): TokenBuckets => ({ uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })
const ledgerPath = (cwd: string): string => join(harnessDir(cwd), 'observability.json')
const writes = new Map<string, Promise<void>>()

async function load(cwd: string): Promise<Ledger> {
  try {
    const value = JSON.parse(await readFile(ledgerPath(cwd), 'utf8')) as Ledger
    if (value.version !== 1 || !Array.isArray(value.events) || value.sessions === null || typeof value.sessions !== 'object') throw new Error('invalid-observability-ledger')
    return value
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, events: [], sessions: {} }
    return { version: 1, events: [], sessions: {} }
  }
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`
  await writeFile(temp, content, 'utf8')
  await rename(temp, path)
}

async function mutate(cwd: string, operation: (ledger: Ledger) => void): Promise<void> {
  const previous = writes.get(cwd) ?? Promise.resolve()
  const pending = previous.catch(() => undefined).then(async () => {
    const ledger = await load(cwd)
    operation(ledger)
    if (ledger.events.length > MAX_EVENTS) ledger.events = ledger.events.slice(-MAX_EVENTS)
    await atomicWrite(ledgerPath(cwd), `${JSON.stringify(ledger, null, 2)}\n`)
  })
  writes.set(cwd, pending)
  try { await pending } finally { if (writes.get(cwd) === pending) writes.delete(cwd) }
}

export async function recordTokenSnapshot(input: { cwd: string; sessionId: string; modelKey: string; project: string; timestamp: string; estimated: boolean; usage: TokenBuckets }): Promise<void> {
  await mutate(input.cwd, ledger => {
    const usage = normalizeBuckets(input.usage)
    const previous = ledger.sessions[input.sessionId]
    const delta = subtract(usage, previous)
    ledger.sessions[input.sessionId] = { ...usage, modelKey: input.modelKey, project: input.project, estimated: input.estimated }
    if (total(delta) === 0) return
    const event: TokenEvent = {
      id: stableDigest({ sessionId: input.sessionId, usage, modelKey: input.modelKey }), timestamp: validTimestamp(input.timestamp), kind: 'tokens',
      sessionId: input.sessionId, modelKey: redactSecrets(input.modelKey).slice(0, 300), project: redactSecrets(input.project).slice(0, 300), estimated: input.estimated, ...delta,
    }
    if (!ledger.events.some(item => item.id === event.id)) ledger.events.push(event)
  })
}

export async function recordRuntimeEvent(cwd: string, event: StageEvent | CacheEvent): Promise<void> {
  await mutate(cwd, ledger => {
    if (ledger.events.some(item => item.id === event.id)) return
    ledger.events.push(event.kind === 'stage'
      ? { ...event, timestamp: validTimestamp(event.timestamp), stage: event.stage.slice(0, 100), ...(event.summary === undefined ? {} : { summary: redactSecrets(event.summary).slice(0, 1000) }) }
      : { ...event, timestamp: validTimestamp(event.timestamp), namespace: event.namespace.slice(0, 100) })
  })
}

export async function aggregateObservability(cwd: string, query: ObservabilityQuery): Promise<ObservabilitySummary> {
  const ledger = await load(cwd)
  const range = dateRange(query)
  const events = ledger.events.filter(event => inRange(event.timestamp, range))
  const tokenEvents = events.filter((event): event is TokenEvent => event.kind === 'tokens')
  const tokens = sumBuckets(tokenEvents)
  const grouped = new Map<string, TokenEvent[]>()
  for (const event of tokenEvents) grouped.set(event.modelKey, [...(grouped.get(event.modelKey) ?? []), event])
  const models = [...grouped].map(([modelKey, values]) => ({ modelKey, ...sumBuckets(values), totalTokens: total(sumBuckets(values)), calls: values.length })).sort((a, b) => b.totalTokens - a.totalTokens || a.modelKey.localeCompare(b.modelKey))
  const dailyMap = new Map<string, number>()
  for (const event of tokenEvents) dailyMap.set(event.timestamp.slice(0, 10), (dailyMap.get(event.timestamp.slice(0, 10)) ?? 0) + total(event))
  const cacheEvents = events.filter((event): event is CacheEvent => event.kind === 'cache')
  const hits = cacheEvents.filter(event => event.hit).length
  const misses = cacheEvents.length - hits
  return {
    period: query.period, tokens: { ...tokens, totalTokens: total(tokens) }, models,
    daily: [...dailyMap].sort(([a], [b]) => a.localeCompare(b)).map(([date, totalTokens]) => ({ date, totalTokens })),
    estimatedEvents: tokenEvents.filter(event => event.estimated).length,
    traces: events.filter((event): event is StageEvent => event.kind === 'stage').slice(-50).reverse().map(({ id: _id, kind: _kind, ...event }) => event),
    cache: { hits, misses, ...(hits + misses === 0 ? {} : { hitRate: Math.round(hits / (hits + misses) * 100) }), savedMs: cacheEvents.reduce((sum, event) => sum + (event.savedMs ?? 0), 0), savedTokens: cacheEvents.reduce((sum, event) => sum + (event.savedTokens ?? 0), 0) },
  }
}

function normalizeBuckets(value: TokenBuckets): TokenBuckets {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, Number.isSafeInteger(item) && item >= 0 ? item : 0])) as unknown as TokenBuckets
}
function subtract(next: TokenBuckets, previous?: TokenBuckets): TokenBuckets { return Object.fromEntries(Object.entries(next).map(([key, value]) => [key, Math.max(0, value - (previous?.[key as keyof TokenBuckets] ?? 0))])) as unknown as TokenBuckets }
function sumBuckets(values: TokenBuckets[]): TokenBuckets { return values.reduce((sum, value) => ({ uncachedInputTokens: sum.uncachedInputTokens + value.uncachedInputTokens, outputTokens: sum.outputTokens + value.outputTokens, cacheReadTokens: sum.cacheReadTokens + value.cacheReadTokens, cacheWriteTokens: sum.cacheWriteTokens + value.cacheWriteTokens }), zero()) }
function total(value: TokenBuckets): number { return value.uncachedInputTokens + value.outputTokens + value.cacheReadTokens + value.cacheWriteTokens }
function validTimestamp(value: string): string { return Number.isNaN(Date.parse(value)) ? new Date().toISOString() : new Date(value).toISOString() }
function inRange(value: string, range: { from?: number; to?: number }): boolean { const time = Date.parse(value); return (range.from === undefined || time >= range.from) && (range.to === undefined || time <= range.to) }
function dateRange(query: ObservabilityQuery): { from?: number; to?: number } {
  const now = Date.parse(query.now ?? new Date().toISOString())
  if (query.period === 'all') return {}
  if (query.period === 'custom') return { ...(query.from === undefined ? {} : { from: Date.parse(query.from) }), ...(query.to === undefined ? {} : { to: Date.parse(query.to) }) }
  const date = new Date(now)
  if (query.period === 'today') return { from: Date.parse(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`), to: now }
  if (query.period === 'month') return { from: Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1), to: now }
  return { from: now - (query.period === '7d' ? 7 : 30) * 86_400_000, to: now }
}
