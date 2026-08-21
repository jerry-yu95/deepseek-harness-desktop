import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { WorkflowEngine, WorkflowMeta, WorkflowResult } from '@deepseek-ai/dsh-workflow'
import {
  cacheKey,
  cached,
  createRunRecord,
  loadHarness,
  redactSecrets,
  replaceFeatures,
  stableDigest,
  transitionHarness,
  updateFeature,
  updateOrchestration,
  writeRunRecord,
  type HarnessFeature,
  type OrchestrationRunRecord,
} from './core.ts'
import { recordHealthSignals, type HealthDimension, type HealthSignal } from './model-health.ts'

const execFileAsync = promisify(execFile)
const ROLE_CONTRACT = 'orchestration-role-v1'

export type OrchestrationRole = 'planner' | 'reviewer' | 'evaluator'
export interface PlannerResult { summary: string; features: Array<{ id: string; title: string; acceptance: string }>; risks: string[] }
export interface ReviewerResult { summary: string; verdict: 'pass' | 'repair'; findings: string[] }
export interface EvaluatorResult { summary: string; decision: 'complete' | 'repair' | 'blocked'; featureResults: Array<{ id: string; status: 'passed' | 'failed'; evidence: string }> }
export type RoleResult = PlannerResult | ReviewerResult | EvaluatorResult

export interface RoleRunRequest {
  cwd: string
  role: OrchestrationRole
  parent: Agent
  signal: AbortSignal
  workflowEngine: WorkflowEngine
  evidence?: string
  bypassCache?: boolean
}

export interface RoleRunOutcome { ok: boolean; cached: boolean; role: OrchestrationRole; result?: RoleResult; fallback?: 'standard'; error?: string }

const schemas = {
  planner: {
    type: 'object', additionalProperties: false, required: ['summary', 'features', 'risks'],
    properties: {
      summary: { type: 'string' }, risks: { type: 'array', items: { type: 'string' } },
      features: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'title', 'acceptance'], properties: { id: { type: 'string' }, title: { type: 'string' }, acceptance: { type: 'string' } } } },
    },
  },
  reviewer: {
    type: 'object', additionalProperties: false, required: ['summary', 'verdict', 'findings'],
    properties: { summary: { type: 'string' }, verdict: { type: 'string', enum: ['pass', 'repair'] }, findings: { type: 'array', items: { type: 'string' } } },
  },
  evaluator: {
    type: 'object', additionalProperties: false, required: ['summary', 'decision', 'featureResults'],
    properties: {
      summary: { type: 'string' }, decision: { type: 'string', enum: ['complete', 'repair', 'blocked'] },
      featureResults: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'status', 'evidence'], properties: { id: { type: 'string' }, status: { type: 'string', enum: ['passed', 'failed'] }, evidence: { type: 'string' } } } },
    },
  },
} as const

const SCRIPT = `
phase(args.phase);
const result = await agent(args.prompt, { label: args.label, phase: args.phase, schema: args.schema });
if (result === null) throw new Error(args.label + " child failed");
return result;
`

export async function workspaceFingerprint(cwd: string): Promise<string> {
  try {
    const options = { cwd, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' as const }
    const [head, status, diff] = await Promise.all([
      execFileAsync('git', ['rev-parse', 'HEAD'], options),
      execFileAsync('git', ['status', '--porcelain=v1', '--untracked-files=no'], options),
      execFileAsync('git', ['diff', '--no-ext-diff', '--binary'], options),
    ])
    return stableDigest({ head: head.stdout.trim(), status: status.stdout, diff: diff.stdout })
  } catch {
    return stableDigest({ cwd: 'non-git-workspace' })
  }
}

export async function runOrchestrationRole(request: RoleRunRequest): Promise<RoleRunOutcome> {
  const snapshot = await loadHarness(request.cwd)
  if (snapshot === undefined) throw new Error('harness-not-initialized')
  if (snapshot.run.orchestration.mode !== 'enhanced') throw new Error('enhanced-orchestration-not-enabled')

  const stage = request.role === 'planner' ? 'planning' : request.role === 'reviewer' ? 'reviewing' : 'evaluating'
  const record = createRunRecord(snapshot.run.objective)
  record.stage = stage
  await updateOrchestration(request.cwd, { stage, latestRunId: record.id, lastFailure: undefined })
  await writeRunRecord(request.cwd, record)

  const fingerprint = await workspaceFingerprint(request.cwd)
  const roleInput = buildRoleInput(request.role, snapshot.run.objective, snapshot.features, request.evidence)
  const key = cacheKey(request.role, { fingerprint, roleInput, contract: ROLE_CONTRACT })
  try {
    const execute = () => executeRole(request.workflowEngine, request.parent, request.signal, request.role, roleInput)
    const outcome = request.bypassCache === true ? { value: await execute(), cached: false } : await cached(request.cwd, request.role, key, ROLE_CONTRACT, execute)
    record.cache[outcome.cached ? 'hits' : 'misses'] += 1
    record.roles[request.role] = { cached: outcome.cached, summary: summarizeResult(outcome.value) }
    record.stage = request.role === 'evaluator' ? 'complete' : request.role === 'planner' ? 'executing' : 'evaluating'
    record.finishedAt = new Date().toISOString()
    await applyRoleResult(request.cwd, request.role, outcome.value)
    if (!outcome.cached) await recordRoleHealthSignals(request, outcome.value)
    const current = await loadHarness(request.cwd)
    await updateOrchestration(request.cwd, {
      stage: record.stage,
      cacheHits: (current?.run.orchestration.cacheHits ?? 0) + (outcome.cached ? 1 : 0),
      cacheMisses: (current?.run.orchestration.cacheMisses ?? 0) + (outcome.cached ? 0 : 1),
    })
    await writeRunRecord(request.cwd, record)
    return { ok: true, cached: outcome.cached, role: request.role, result: outcome.value }
  } catch (error) {
    const message = redactSecrets(error instanceof Error ? error.message : String(error))
    record.stage = request.signal.aborted ? 'cancelled' : 'failed'
    record.failure = message
    record.finishedAt = new Date().toISOString()
    await updateOrchestration(request.cwd, { stage: record.stage, lastFailure: message })
    await writeRunRecord(request.cwd, record)
    return { ok: false, cached: false, role: request.role, ...(request.role === 'planner' ? { fallback: 'standard' as const } : {}), error: message }
  }
}

async function recordRoleHealthSignals(request: RoleRunRequest, result: RoleResult): Promise<void> {
  const parentOptions = (request.parent as Agent & { options?: Agent['options'] }).options
  const modelKey = `${parentOptions?.provider ?? 'default'}/${parentOptions?.model ?? 'default'}`
  const timestamp = new Date().toISOString()
  const signals: HealthSignal[] = [healthSignal('structuredOutput', 100), healthSignal('instruction', result.summary.trim() === '' ? 55 : 92)]
  if (request.role === 'planner') {
    const planner = result as PlannerResult
    signals.push(healthSignal('toolPlanning', planner.features.length > 0 ? 94 : 40), healthSignal('completeness', planner.features.every(item => item.acceptance.trim() !== '') ? 95 : 55))
  } else if (request.role === 'reviewer') {
    const reviewer = result as ReviewerResult
    signals.push(healthSignal('context', 92), healthSignal('reasoning', reviewer.verdict === 'repair' && reviewer.findings.length === 0 ? 55 : 91))
  } else {
    const evaluator = result as EvaluatorResult
    signals.push(healthSignal('context', 93), healthSignal('completeness', evaluator.featureResults.every(item => item.evidence.trim() !== '') ? 96 : 58))
  }
  await recordHealthSignals(request.cwd, signals)

  function healthSignal(dimension: HealthDimension, score: number): HealthSignal {
    return { timestamp, modelKey, dimension, score, source: 'passive' }
  }
}

async function executeRole(engine: WorkflowEngine, parent: Agent, signal: AbortSignal, role: OrchestrationRole, input: string): Promise<RoleResult> {
  const prompt = `${await rolePrompt(role)}\n\nTask context (bounded and redacted):\n${redactSecrets(input).slice(0, 20_000)}`
  const meta: WorkflowMeta = { name: `harness-${role}`, description: `Run the Harness ${role} role with structured output.`, phases: [{ title: role }] }
  const run = engine.start({ script: SCRIPT, meta, args: { phase: role, label: `Harness ${role}`, prompt, schema: schemas[role] }, parent, signal, maxTotalAgents: 1 })
  let result: WorkflowResult | undefined
  try {
    result = await run.result
    if (result.stopReason !== 'completed') throw new Error(result.stopReason === 'error' ? (result.error ?? 'workflow-error') : `workflow-${result.stopReason}`)
    return validateRoleResult(role, result.value)
  } finally {
    await run.dispose()
  }
}

async function rolePrompt(role: OrchestrationRole): Promise<string> {
  return readFile(new URL(`../roles/${role === 'reviewer' ? 'grounding-reviewer' : role === 'evaluator' ? 'completion-evaluator' : 'planner'}.md`, import.meta.url), 'utf8')
}

function buildRoleInput(role: OrchestrationRole, objective: string, features: HarnessFeature[], evidence?: string): string {
  return JSON.stringify({ role, objective, ...(role === 'planner' ? {} : { features }), evidence: redactSecrets(evidence ?? '').slice(0, 12_000) })
}

function validateRoleResult(role: OrchestrationRole, value: unknown): RoleResult {
  if (value === null || typeof value !== 'object') throw new Error(`invalid-${role}-result`)
  const result = value as Record<string, unknown>
  if (typeof result.summary !== 'string') throw new Error(`invalid-${role}-result`)
  if (role === 'planner' && Array.isArray(result.features) && Array.isArray(result.risks)) return value as PlannerResult
  if (role === 'reviewer' && ['pass', 'repair'].includes(String(result.verdict)) && Array.isArray(result.findings)) return value as ReviewerResult
  if (role === 'evaluator' && ['complete', 'repair', 'blocked'].includes(String(result.decision)) && Array.isArray(result.featureResults)) return value as EvaluatorResult
  throw new Error(`invalid-${role}-result`)
}

async function applyRoleResult(cwd: string, role: OrchestrationRole, result: RoleResult): Promise<void> {
  if (role === 'planner') {
    const planner = result as PlannerResult
    if (planner.features.length === 0) throw new Error('planner-returned-no-features')
    await replaceFeatures(cwd, planner.features)
    const snapshot = await loadHarness(cwd)
    if (snapshot?.run.phase === 'planning') await transitionHarness(cwd, 'executing')
    return
  }
  if (role === 'reviewer') {
    const reviewer = result as ReviewerResult
    const snapshot = await loadHarness(cwd)
    if (reviewer.verdict === 'repair' && snapshot?.run.phase === 'evaluating') await transitionHarness(cwd, 'repairing')
    return
  }
  const evaluator = result as EvaluatorResult
  for (const item of evaluator.featureResults) await updateFeature(cwd, item.id, item.status, item.evidence)
  const snapshot = await loadHarness(cwd)
  if (snapshot === undefined) return
  if (evaluator.decision === 'complete' && snapshot.run.phase === 'evaluating') await transitionHarness(cwd, 'complete')
  else if (evaluator.decision === 'repair' && snapshot.run.phase === 'evaluating') await transitionHarness(cwd, 'repairing')
  else if (evaluator.decision === 'blocked' && snapshot.run.phase !== 'complete' && snapshot.run.phase !== 'blocked') await transitionHarness(cwd, 'blocked')
}

function summarizeResult(result: RoleResult): string {
  return redactSecrets(result.summary).slice(0, 4000)
}
