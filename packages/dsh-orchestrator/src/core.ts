import { readFileSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export type HarnessPhase = 'planning' | 'executing' | 'evaluating' | 'repairing' | 'complete' | 'blocked'
export type FeatureStatus = 'pending' | 'in_progress' | 'passed' | 'failed'

export interface HarnessRun { version: 1; objective: string; phase: HarnessPhase; createdAt: string; updatedAt: string }
export interface HarnessFeature { id: string; title: string; acceptance: string; status: FeatureStatus; evidence: string[] }
export interface HarnessSnapshot { run: HarnessRun; features: HarnessFeature[]; progress: string }

const TRANSITIONS: Record<HarnessPhase, readonly HarnessPhase[]> = {
  planning: ['executing', 'blocked'], executing: ['evaluating', 'blocked'], evaluating: ['repairing', 'complete', 'blocked'],
  repairing: ['executing', 'evaluating', 'blocked'], complete: [], blocked: ['planning', 'executing', 'repairing'],
}
export const harnessDir = (cwd: string): string => join(cwd, '.dsh-harness')
const paths = (cwd: string) => ({ root: harnessDir(cwd), run: join(harnessDir(cwd), 'run.json'), features: join(harnessDir(cwd), 'feature-list.json'), progress: join(harnessDir(cwd), 'progress.md') })

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`
  await writeFile(temp, content, 'utf8'); await rename(temp, path)
}
async function readJson<T>(path: string): Promise<T> { return JSON.parse(await readFile(path, 'utf8')) as T }

function validateRun(run: HarnessRun): HarnessRun {
  if (run?.version !== 1 || typeof run.objective !== 'string' || !Object.hasOwn(TRANSITIONS, run.phase)) throw new Error('invalid-harness-run')
  return run
}
function validateFeatures(features: HarnessFeature[]): HarnessFeature[] {
  if (!Array.isArray(features)) throw new Error('invalid-feature-list')
  const ids = new Set<string>()
  for (const item of features) {
    if (typeof item?.id !== 'string' || item.id === '' || ids.has(item.id) || typeof item.title !== 'string' || typeof item.acceptance !== 'string' || !['pending', 'in_progress', 'passed', 'failed'].includes(item.status) || !Array.isArray(item.evidence)) throw new Error('invalid-feature-list')
    ids.add(item.id)
  }
  return features
}

export async function loadHarness(cwd: string): Promise<HarnessSnapshot | undefined> {
  const target = paths(cwd)
  try {
    const [run, features, progress] = await Promise.all([readJson<HarnessRun>(target.run), readJson<HarnessFeature[]>(target.features), readFile(target.progress, 'utf8').catch(() => '')])
    return { run: validateRun(run), features: validateFeatures(features), progress }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

export async function initHarness(cwd: string, objective: string, featureTitles: string[] = []): Promise<HarnessSnapshot> {
  if (objective.trim() === '') throw new Error('objective-required')
  const existing = await loadHarness(cwd); if (existing !== undefined) return existing
  const now = new Date().toISOString()
  const run: HarnessRun = { version: 1, objective: objective.trim(), phase: 'planning', createdAt: now, updatedAt: now }
  const features = featureTitles.map((title, index) => ({ id: `F${index + 1}`, title, acceptance: title, status: 'pending' as const, evidence: [] }))
  const target = paths(cwd); await mkdir(target.root, { recursive: true })
  await atomicWrite(target.run, `${JSON.stringify(run, null, 2)}\n`)
  await atomicWrite(target.features, `${JSON.stringify(features, null, 2)}\n`)
  await atomicWrite(target.progress, `# Harness progress\n\nInitialized ${now}\n`)
  return { run, features, progress: `# Harness progress\n\nInitialized ${now}\n` }
}

export async function transitionHarness(cwd: string, phase: HarnessPhase): Promise<HarnessSnapshot> {
  const snapshot = await loadHarness(cwd); if (snapshot === undefined) throw new Error('harness-not-initialized')
  if (!TRANSITIONS[snapshot.run.phase].includes(phase)) throw new Error(`invalid-transition:${snapshot.run.phase}->${phase}`)
  if (phase === 'complete' && (snapshot.features.length === 0 || snapshot.features.some(item => item.status !== 'passed' || item.evidence.length === 0))) throw new Error('completion-requires-passed-features-with-evidence')
  snapshot.run = { ...snapshot.run, phase, updatedAt: new Date().toISOString() }
  await atomicWrite(paths(cwd).run, `${JSON.stringify(snapshot.run, null, 2)}\n`)
  return snapshot
}

export async function updateFeature(cwd: string, id: string, status: FeatureStatus, evidence?: string): Promise<HarnessSnapshot> {
  const snapshot = await loadHarness(cwd); if (snapshot === undefined) throw new Error('harness-not-initialized')
  const index = snapshot.features.findIndex(item => item.id === id); if (index < 0) throw new Error('feature-not-found')
  const item = snapshot.features[index]
  snapshot.features[index] = { ...item, status, evidence: evidence?.trim() ? [...item.evidence, redactSecrets(evidence.trim())] : item.evidence }
  snapshot.run = { ...snapshot.run, updatedAt: new Date().toISOString() }
  await atomicWrite(paths(cwd).features, `${JSON.stringify(snapshot.features, null, 2)}\n`)
  await atomicWrite(paths(cwd).run, `${JSON.stringify(snapshot.run, null, 2)}\n`)
  return snapshot
}

export async function appendProgress(cwd: string, note: string): Promise<HarnessSnapshot> {
  const snapshot = await loadHarness(cwd); if (snapshot === undefined) throw new Error('harness-not-initialized')
  const line = `\n- ${new Date().toISOString()} ${redactSecrets(note.trim())}\n`
  snapshot.progress += line; await atomicWrite(paths(cwd).progress, snapshot.progress)
  return snapshot
}

export function redactSecrets(text: string): string {
  return text
    .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/\bsk-[a-z0-9_-]{12,}\b/gi, '[REDACTED]')
    .replace(/\bBearer\s+[a-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
}

export interface TrajectoryItem { kind: 'user' | 'assistant' | 'tool' | 'thinking' | 'credential'; text?: string; name?: string; ok?: boolean }
export function sanitizeTrajectory(items: TrajectoryItem[], maxChars = 6000): string {
  const lines: string[] = []
  for (const item of items) {
    if (item.kind === 'thinking' || item.kind === 'credential') continue
    const text = redactSecrets((item.text ?? '').replace(/\s+/g, ' ').trim())
    if (item.kind === 'tool') lines.push(`[tool:${item.name ?? 'unknown'} ${item.ok === false ? 'failed' : 'ok'}] ${text.slice(0, 240)}`)
    else if (text !== '') lines.push(`[${item.kind}] ${text}`)
    if (lines.join('\n').length >= maxChars) break
  }
  return lines.join('\n').slice(0, maxChars)
}

export function retrieveMemory(query: string, memory: string, maxSnippets = 3, maxChars = 800): string[] {
  const terms = new Set(query.toLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter(term => term.length > 1))
  return memory.split(/\n{2,}/).map(text => ({ text: redactSecrets(text.trim()), score: [...terms].reduce((sum, term) => sum + (text.toLowerCase().includes(term) ? 1 : 0), 0) }))
    .filter(item => item.text !== '' && item.score > 0).sort((a, b) => b.score - a.score || a.text.length - b.text.length)
    .slice(0, maxSnippets).map(item => item.text.slice(0, maxChars))
}

export async function harnessContext(cwd: string): Promise<string> {
  const snapshot = await loadHarness(cwd); if (snapshot === undefined) return ''
  const pending = snapshot.features.filter(item => item.status !== 'passed').slice(0, 8)
  return [
    'Harness project state (project-local source of truth):', `Objective: ${snapshot.run.objective}`, `Phase: ${snapshot.run.phase}`,
    `Acceptance: ${snapshot.features.filter(item => item.status === 'passed').length}/${snapshot.features.length} passed`,
    ...pending.map(item => `- ${item.id} [${item.status}] ${item.title}: ${item.acceptance}`),
    'Use harness_state to update evidence and transitions. Do not claim complete until every feature passed with evidence.',
  ].join('\n').slice(0, 2400)
}

export function harnessContextSync(cwd: string): string {
  const target = paths(cwd)
  try {
    const run = validateRun(JSON.parse(readFileSync(target.run, 'utf8')) as HarnessRun)
    const features = validateFeatures(JSON.parse(readFileSync(target.features, 'utf8')) as HarnessFeature[])
    const pending = features.filter(item => item.status !== 'passed').slice(0, 8)
    return ['Harness project state (project-local source of truth):', `Objective: ${run.objective}`, `Phase: ${run.phase}`, `Acceptance: ${features.filter(item => item.status === 'passed').length}/${features.length} passed`, ...pending.map(item => `- ${item.id} [${item.status}] ${item.title}: ${item.acceptance}`), 'Use harness_state to update evidence and transitions. Do not claim complete until every feature passed with evidence.'].join('\n').slice(0, 2400)
  } catch { return '' }
}
