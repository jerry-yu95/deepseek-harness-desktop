import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { WorkflowEngine, WorkflowResult } from '@deepseek-ai/dsh-workflow'
import type { CommandInvocation } from '@deepseek-ai/dsh-commands'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { initHarness, loadHarness, setOrchestrationMode, transitionHarness } from '../src/core.ts'
import { runOrchestrationRole } from '../src/orchestration.ts'
import { getModelHealth } from '../src/model-health.ts'
import { executeHarnessCommand, inject } from '../src/index.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

function engine(value: unknown, stopReason: WorkflowResult['stopReason'] = 'completed') {
  const dispose = vi.fn(async () => undefined)
  const start = vi.fn(() => ({
    id: 'workflow-1', meta: { name: 'test', description: 'test' },
    result: Promise.resolve(stopReason === 'completed' ? { stopReason, value, agentsStarted: 1 } : { stopReason, error: 'provider down', agentsStarted: 0 }),
    cancel: vi.fn(), dispose,
  }))
  return { value: { start } as unknown as WorkflowEngine, start, dispose }
}

async function setup() {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-orchestration-')); roots.push(cwd)
  await initHarness(cwd, 'Ship reliable orchestration')
  await setOrchestrationMode(cwd, 'enhanced')
  return cwd
}

describe('official workflow orchestration adapter', () => {
  it('routes a simple adaptive task directly without starting the workflow engine', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'dsh-adaptive-direct-')); roots.push(cwd)
    await initHarness(cwd, 'Adaptive routing')
    await setOrchestrationMode(cwd, 'adaptive')
    const mock = engine({ summary: 'should not run', risks: [], features: [] })
    const invocation = {
      rawInput: 'route 解释一下这个配置项是什么意思',
      signal: new AbortController().signal,
      agent: { session: { header: { cwd } }, ctx: { get: () => mock.value } },
    } as unknown as CommandInvocation

    expect(await executeHarnessCommand(invocation)).toMatchObject({ kind: 'success', text: expect.stringContaining('direct') })
    expect(mock.start).not.toHaveBeenCalled()
    expect((await loadHarness(cwd))?.run.orchestration.latestDecision?.strategy).toBe('direct')
  })

  it('routes risky adaptive work through the official planner and persists the decision', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'dsh-adaptive-review-')); roots.push(cwd)
    await initHarness(cwd, 'Adaptive routing')
    await setOrchestrationMode(cwd, 'adaptive')
    const mock = engine({ summary: 'Safe plan', risks: ['credential migration'], features: [{ id: 'F1', title: 'Migrate auth', acceptance: 'security and rollback tests pass' }] })
    const invocation = {
      rawInput: 'route 修改登录鉴权和 API key 存储，完成后运行安全测试并验证回滚',
      signal: new AbortController().signal,
      agent: { session: { header: { cwd } }, ctx: { get: () => mock.value } },
    } as unknown as CommandInvocation

    expect(await executeHarnessCommand(invocation)).toMatchObject({ kind: 'success', text: expect.stringContaining('plan-review') })
    expect(mock.start).toHaveBeenCalledTimes(1)
    expect((await loadHarness(cwd))?.run.orchestration.latestDecision).toMatchObject({ strategy: 'plan-review', budget: { maxAgents: 2 } })
  })

  it('resolves the workflow engine from the active agent scope without a host-level dependency', async () => {
    expect(inject).not.toContain('workflowEngine')
    const cwd = await setup()
    const mock = engine({ summary: 'Plan ready', risks: [], features: [{ id: 'F1', title: 'Works', acceptance: 'tests pass' }] })
    const invocation = {
      rawInput: 'run planner',
      signal: new AbortController().signal,
      agent: {
        session: { header: { cwd } },
        ctx: {
          get: vi.fn((name: string) => name === 'workflowEngine' ? mock.value : undefined),
          get workflowEngine() { throw new Error('direct service access requires plugin injection') },
        },
      },
    } as unknown as CommandInvocation

    expect(await executeHarnessCommand(invocation)).toMatchObject({ kind: 'success', text: expect.stringContaining('planner 已完成') })
    expect(mock.start).toHaveBeenCalledTimes(1)
  })

  it('supports the durable /harness fallback command', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'dsh-command-')); roots.push(cwd)
    const invocation = {
      rawInput: 'on',
      signal: new AbortController().signal,
      agent: { session: { header: { cwd } } },
    } as unknown as CommandInvocation
    expect(await executeHarnessCommand(invocation)).toMatchObject({ kind: 'success', text: expect.stringContaining('增强编排') })
    expect((await loadHarness(cwd))?.run.orchestration.mode).toBe('enhanced')
    expect(await executeHarnessCommand({ ...invocation, rawInput: 'status' })).toMatchObject({ kind: 'success', text: expect.stringContaining('缓存命中率') })
    expect(await executeHarnessCommand({ ...invocation, rawInput: 'invalid' })).toMatchObject({ kind: 'error', text: expect.stringContaining('用法') })
  })

  it('runs and caches a structured planner through the official engine', async () => {
    const cwd = await setup()
    const mock = engine({ summary: 'Plan ready', risks: ['compatibility'], features: [{ id: 'F1', title: 'Works', acceptance: 'tests pass' }] })
    const request = { cwd, role: 'planner' as const, parent: {} as Agent, signal: new AbortController().signal, workflowEngine: mock.value }
    const first = await runOrchestrationRole(request)
    const second = await runOrchestrationRole(request)
    expect(first).toMatchObject({ ok: true, cached: false })
    expect(second).toMatchObject({ ok: true, cached: true })
    expect(mock.start).toHaveBeenCalledTimes(1)
    expect(mock.dispose).toHaveBeenCalledTimes(1)
    expect((await loadHarness(cwd))?.features[0]?.acceptance).toBe('tests pass')
    expect((await getModelHealth(cwd, 'default/default')).sampleCount).toBe(4)
  })

  it('falls back to standard execution when planning infrastructure fails', async () => {
    const cwd = await setup()
    const mock = engine(undefined, 'error')
    const outcome = await runOrchestrationRole({ cwd, role: 'planner', parent: {} as Agent, signal: new AbortController().signal, workflowEngine: mock.value })
    expect(outcome).toMatchObject({ ok: false, fallback: 'standard', error: 'provider down' })
    expect(mock.dispose).toHaveBeenCalledTimes(1)
    expect((await loadHarness(cwd))?.run.orchestration.stage).toBe('failed')
  })

  it('requires reviewer repair and lets evaluator complete only with evidence', async () => {
    const cwd = await setup()
    const planner = engine({ summary: 'Plan', risks: [], features: [{ id: 'F1', title: 'Works', acceptance: 'tests pass' }] })
    await runOrchestrationRole({ cwd, role: 'planner', parent: {} as Agent, signal: new AbortController().signal, workflowEngine: planner.value })
    await transitionHarness(cwd, 'evaluating')
    const reviewer = engine({ summary: 'Gap found', verdict: 'repair', findings: ['missing test'] })
    await runOrchestrationRole({ cwd, role: 'reviewer', parent: {} as Agent, signal: new AbortController().signal, workflowEngine: reviewer.value, evidence: 'diff' })
    expect((await loadHarness(cwd))?.run.phase).toBe('repairing')
  })
})
