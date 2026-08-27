// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HarnessDashboardStatus } from '../../src/wire.ts'
import type { HarnessClientApi } from '../../src/client/api.ts'
import { HarnessComposerControls, HarnessSettingsCard } from '../../src/client/HarnessHealthPanel.tsx'
import { cacheRate, dimensionLabel, healthLabel, healthTone, sparklinePoints } from '../../src/client/health-ui.ts'

afterEach(cleanup)

const dimensions = {
  instruction: { score: 96, samples: 2 }, context: { score: 94, samples: 2 }, reasoning: { score: 92, samples: 2 },
  structuredOutput: { score: 100, samples: 2 }, toolPlanning: { score: 90, samples: 2 }, completeness: { score: 95, samples: 2 },
}

const status: HarnessDashboardStatus = {
  initialized: true,
  modelKey: 'deepseek-official/deepseek-v4-flash',
  harness: {
    run: { version: 2, objective: 'test', phase: 'executing', createdAt: '2026-08-21T00:00:00.000Z', updatedAt: '2026-08-21T00:00:00.000Z', orchestration: { mode: 'enhanced', stage: 'executing', cacheHits: 3, cacheMisses: 1 } },
    features: [], progress: '',
  },
  health: { modelKey: 'deepseek-official/deepseek-v4-flash', status: 'healthy', score: 95, baselineScore: 94, delta: 1, sampleCount: 12, dimensions, anomalies: [], trend: [{ timestamp: '2026-08-21T00:00:00.000Z', score: 95, dimension: 'instruction', source: 'probe' }], feedback: { normal: 1, degraded: 0 } },
  observability: {
    period: '7d', tokens: { uncachedInputTokens: 1200, outputTokens: 300, cacheReadTokens: 800, cacheWriteTokens: 20, totalTokens: 2320 }, estimatedEvents: 0,
    models: [{ modelKey: 'deepseek-official/deepseek-v4-flash', uncachedInputTokens: 1200, outputTokens: 300, cacheReadTokens: 800, cacheWriteTokens: 20, totalTokens: 2320, calls: 4 }],
    daily: [{ date: '2026-08-21', totalTokens: 2320 }], traces: [{ timestamp: '2026-08-21T00:00:00.000Z', runId: 'R1', stage: 'planner', status: 'complete', durationMs: 1200, summary: 'Plan ready' }],
    cache: { hits: 3, misses: 1, hitRate: 75, savedMs: 1600, savedTokens: 500 },
  },
  contextQuality: {
    '32K': { totalRuns: 1, passedRuns: 1, passRate: 100, latest: { id: 'CQ1', timestamp: '2026-08-21T00:00:00.000Z', modelKey: 'deepseek-official/deepseek-v4-flash', scale: '32K', requestedInputTokens: 32768, resolvedContextWindow: 131072, sampleCount: 3, status: 'pass', metrics: { criticalRecall: 100, exactLiteralRecall: 100, latestStateAccuracy: 100, staleLeakage: 0, constraintRecall: 100, pendingWorkRecall: 100, toolIntegrity: 100, sectionCompleteness: 100 }, usage: { inputTokens: 96000, outputTokens: 600, cacheReadTokens: 1000 }, durationMs: 12000, hardFailureCount: 0 }, trend: [{ timestamp: '2026-08-21T00:00:00.000Z', score: 100, status: 'pass' }] },
    '128K': { totalRuns: 0, passedRuns: 0, trend: [] },
  },
}

function api(): HarnessClientApi {
  return {
    status: vi.fn(async () => status),
    mode: vi.fn(async () => status),
    probe: vi.fn(async () => ({ cached: false, summary: status.health })),
    feedback: vi.fn(async () => status),
    contextQuality: vi.fn(async () => ({ run: status.contextQuality['32K'].latest!, summary: status.contextQuality['32K'] })),
  } as unknown as HarnessClientApi
}

function standardProps(current: string | undefined) {
  const sessions = { current, byId: current === undefined ? {} : { [current]: { displayTitle: 'Harness test' } } }
  return {
    useSessions: <T,>(selector: (value: typeof sessions) => T): T => selector(sessions),
    useWorkspaces: vi.fn(), useSession: vi.fn(), useProjection: vi.fn(),
  }
}

describe('health presentation', () => {
  it('maps warning states and cache/trend data deterministically', () => {
    expect(healthTone('degraded')).toBe('bad')
    expect(healthLabel('volatile')).toBe('波动')
    expect(dimensionLabel('toolPlanning')).toBe('工具规划')
    expect(cacheRate(status)).toBe(75)
    expect(sparklinePoints(status.health.trend)).toContain(',')
  })

  it('renders an explicit empty state when no session is selected', () => {
    render(<HarnessSettingsCard {...standardProps(undefined) as never} api={api()} />)
    expect(screen.getByText('Agent Harness')).toBeTruthy()
    expect(screen.getByText(/请先打开一个会话/)).toBeTruthy()
  })

  it('shows a clickable health summary from the composer control', async () => {
    render(<HarnessComposerControls {...standardProps('S1') as never} api={api()} sessionId={'S1' as never} session={{} as never} input={{} as never} />)
    const trigger = await screen.findByRole('button', { name: /模型健康/ })
    fireEvent.click(trigger)
    expect(screen.getByText('deepseek-official/deepseek-v4-flash')).toBeTruthy()
    expect(screen.getByText((_text, element) => element?.textContent === '缓存：75% 命中')).toBeTruthy()
  })

  it('uses borderless toolbar controls for orchestration and model health', async () => {
    render(<HarnessComposerControls {...standardProps('S1') as never} api={api()} sessionId={'S1' as never} session={{} as never} input={{} as never} />)
    const orchestration = await screen.findByRole('button', { name: /增强编排/ })
    const health = screen.getByRole('button', { name: /模型健康/ })
    expect(orchestration.className).toContain('toolbarControl')
    expect(health.className).toContain('toolbarControl')
    expect(orchestration.querySelector('svg')).toBeTruthy()
    expect(health.querySelector('svg')).toBeTruthy()
  })

  it('opens an accessible orchestration menu with descriptions and selects one mode', async () => {
    const client = api()
    render(<HarnessComposerControls {...standardProps('S1') as never} api={client} sessionId={'S1' as never} session={{} as never} input={{} as never} />)
    const trigger = await screen.findByRole('button', { name: /增强编排/ })
    fireEvent.click(trigger)
    expect(screen.getByText('自动判断任务复杂度，选择最小够用的编排策略。')).toBeTruthy()
    expect(screen.getByText('显式启用 Planner、Reviewer 与 Evaluator 协作。')).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitemradio', { name: /自适应编排/ }))
    await waitFor(() => { expect(client.mode).toHaveBeenCalledWith('S1', 'adaptive', 'Harness test') })
  })

  it('renders runtime-health tabs, explicit context probes, and period-filtered token details', async () => {
    const client = api()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<HarnessSettingsCard {...standardProps('S1') as never} api={client} />)
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Token 消耗' })).toBeTruthy() })
    expect(screen.getByRole('button', { name: '总览' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '模型健康' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Agent 轨迹' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '上下文质量' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '上下文质量' }))
    expect(screen.getByText(/不会自动运行/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '运行 32K 检测' }))
    await waitFor(() => { expect(client.contextQuality).toHaveBeenCalledWith('S1', '32K', true) })
    fireEvent.click(screen.getByRole('button', { name: 'Token 消耗' }))
    expect(screen.getByText('2,320')).toBeTruthy()
    expect(screen.getAllByText('deepseek-official/deepseek-v4-flash')).toHaveLength(2)
    expect(screen.getByRole('button', { name: '最近 30 天' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Agent 轨迹' }))
    expect(screen.getByText(/planner/)).toBeTruthy()
    expect(screen.getByText(/1.2s/)).toBeTruthy()
    expect(screen.getByText(/节省 500 Token/)).toBeTruthy()
  })
})
