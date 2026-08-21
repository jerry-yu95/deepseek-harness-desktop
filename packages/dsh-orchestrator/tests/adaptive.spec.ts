import { describe, expect, it } from 'vitest'
import { assessTask, validateAdaptiveDag } from '../src/adaptive.ts'

describe('adaptive orchestration router', () => {
  it('keeps simple conversational work on one agent', () => {
    const decision = assessTask('解释一下这个错误是什么意思')
    expect(decision.strategy).toBe('direct')
    expect(decision.budget.maxAgents).toBe(1)
    expect(decision.dag.nodes).toHaveLength(1)
  })

  it('adds independent review for risky implementation work', () => {
    const decision = assessTask('修改登录鉴权和 API key 存储，完成后运行安全测试并验证回滚')
    expect(decision.strategy).toBe('plan-review')
    expect(decision.dimensions.risk).toBeGreaterThanOrEqual(2)
    expect(decision.dag.nodes.some(node => node.role === 'verifier')).toBe(true)
  })

  it('uses a bounded parallel DAG only when independent artifacts are explicit', () => {
    const decision = assessTask('并行完成 Windows、macOS Intel、macOS ARM 三个平台构建，分别测试后汇总发布')
    expect(decision.strategy).toBe('parallel-dag')
    expect(decision.budget.maxAgents).toBeLessThanOrEqual(4)
    expect(decision.dag.nodes.filter(node => node.parallelGroup === 'workers')).toHaveLength(3)
    expect(() => validateAdaptiveDag(decision.dag, decision.budget)).not.toThrow()
  })

  it('rejects cyclic and over-budget plans', () => {
    const budget = { maxAgents: 2, maxTotalTokens: 20_000, maxWallTimeMs: 120_000, maxRetries: 1 }
    expect(() => validateAdaptiveDag({ version: 1, nodes: [
      { id: 'a', title: 'A', role: 'worker', dependsOn: ['b'], acceptance: 'done' },
      { id: 'b', title: 'B', role: 'worker', dependsOn: ['a'], acceptance: 'done' },
    ] }, budget)).toThrow(/cycle/)
    expect(() => validateAdaptiveDag({ version: 1, nodes: [
      { id: 'a', title: 'A', role: 'worker', dependsOn: [], acceptance: 'done', parallelGroup: 'workers' },
      { id: 'b', title: 'B', role: 'worker', dependsOn: [], acceptance: 'done', parallelGroup: 'workers' },
      { id: 'c', title: 'C', role: 'worker', dependsOn: [], acceptance: 'done', parallelGroup: 'workers' },
    ] }, budget)).toThrow(/agent-budget/)
  })
})
